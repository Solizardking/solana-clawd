#!/usr/bin/env python3
# /// script
# requires-python = ">=3.10"
# dependencies = [
#   "torch>=2.1.0",
#   "transformers>=5.12.0",
#   "accelerate>=1.14.0",
#   "peft>=0.19.1",
#   "trl>=1.6.0",
#   "bitsandbytes>=0.46.0",
#   "datasets>=5.0.0",
#   "huggingface_hub>=1.19.0",
#   "pyyaml>=6.0",
#   "safetensors>=0.5.0",
#   "wandb>=0.19.0",
# ]
# ///
"""
LoRA SFT training for the Solana Clawd AI model.

Fine-tunes a base instruct model on the solanaclawd/solana-clawd-instruct
dataset using LoRA via PEFT + TRL's SFTTrainer. Optionally pushes the
adapter to the Hub.

Designed to run:
  - Locally on Apple Silicon (MPS) at small batch sizes
  - On a single 24GB+ GPU (A10G, L4, A100-40)
  - On HF Jobs (A100/H100) via `hf jobs uv run`

Usage:
  # local
  python3 scripts/train_lora.py

  # with custom config
  python3 scripts/train_lora.py --config configs/lora_config.yaml

  # override a field
  python3 scripts/train_lora.py --num-epochs 1 --lr 1e-4

  # remote via HF Jobs
  hf jobs uv run scripts/train_lora.py --flavor a100-large --detach
"""
from __future__ import annotations

import argparse
import os
import time
from pathlib import Path
from typing import Any

import torch
import yaml
from datasets import DatasetDict, load_dataset, load_from_disk
from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training
from transformers import (
    AutoModelForCausalLM,
    AutoTokenizer,
    BitsAndBytesConfig,
)
from trl import SFTConfig, SFTTrainer

try:
    import wandb
    _WANDB_AVAILABLE = True
    _wandb_key = os.environ.get("WANDB_API_KEY")
    if _wandb_key:
        wandb.login(key=_wandb_key, relogin=True)
except ImportError:
    _WANDB_AVAILABLE = False

REQUIRED_ADAPTER_FILES = {"adapter_config.json", "adapter_model.safetensors"}


def _resolve_report_to(report_to: list[str] | str) -> list[str]:
    """Drop 'wandb' from report_to if wandb is not installed, avoiding a crash."""
    if isinstance(report_to, str):
        report_to = [report_to]
    if not _WANDB_AVAILABLE and "wandb" in report_to:
        print("WARNING: wandb not installed — removing from report_to. Install with: pip install wandb")
        report_to = [r for r in report_to if r != "wandb"] or ["none"]
    return report_to


def _select_chat_template(chat_template: Any) -> str | None:
    if isinstance(chat_template, str):
        return chat_template
    if isinstance(chat_template, dict):
        for key in ("default", "chat", "tool_use"):
            value = chat_template.get(key)
            if isinstance(value, str):
                return value
        for value in chat_template.values():
            if isinstance(value, str):
                return value
    return None


def _fallback_chat_template() -> str:
    return (
        "{% for message in messages %}"
        "{% if message['role'] == 'assistant' %}"
        "{% generation %}<|im_start|>assistant\n"
        "{{ message['content'] }}<|im_end|>\n{% endgeneration %}"
        "{% else %}"
        "<|im_start|>{{ message['role'] }}\n"
        "{{ message['content'] }}<|im_end|>\n"
        "{% endif %}"
        "{% endfor %}"
        "{% if add_generation_prompt %}<|im_start|>assistant\n{% endif %}"
    )


def normalize_tokenizer_chat_template(tokenizer: Any) -> None:
    template = _select_chat_template(getattr(tokenizer, "chat_template", None))
    tokenizer.chat_template = template or _fallback_chat_template()


def supports_assistant_only_loss(chat_template: Any) -> bool:
    template = _select_chat_template(chat_template)
    return bool(template and "{% generation" in template)


def _wandb_run_url() -> str | None:
    if not _WANDB_AVAILABLE:
        return None
    run = getattr(wandb, "run", None)
    if not run:
        return None
    return getattr(run, "url", None)


def _metrics_markdown(metrics: dict[str, Any]) -> str:
    rows = []
    for key in sorted(metrics):
        value = metrics[key]
        if isinstance(value, float):
            value = f"{value:.6g}"
        rows.append(f"| `{key}` | `{value}` |")
    if not rows:
        return "_No metrics recorded._"
    return "\n".join(["| Metric | Value |", "| --- | --- |", *rows])


def _model_card_title(cfg: dict[str, Any], dataset_label: str) -> str:
    text = f"{cfg.get('hub_model_id', '')} {dataset_label}".lower()
    if "trading-factory" in text or "nvidia" in text:
        return "Solana NVIDIA Trading Factory LoRA"
    if "core-ai" in text:
        return "Solana Clawd Core AI LoRA"
    return "Solana Clawd LoRA"


def _intended_use(cfg: dict[str, Any], dataset_label: str) -> str:
    text = f"{cfg.get('hub_model_id', '')} {dataset_label}".lower()
    if "trading-factory" in text or "nvidia" in text:
        return (
            "This adapter is intended for Solana-native research and execution "
            "agents that need paper-first strategy planning over Phoenix/Vulcan "
            "perps, Rise read plans, cuFOLIO/cuOpt Mean-CVaR portfolio handoffs, "
            "and risk-gated spot/perps trading-factory workflows."
        )
    return (
        "This adapter is intended for Solana-native Clawd agents that need "
        "project-local context around `core-ai`, Helius integrations, Clawd Code, "
        "Clawd Grok, MCP server conventions, agent skills, and the existing "
        "Solana/DeFi/ZK instruction corpus."
    )


def write_adapter_model_card(
    output_dir: str,
    cfg: dict[str, Any],
    lora_cfg: dict[str, Any],
    dataset_label: str,
    train_rows: int,
    eval_rows: int,
    metrics: dict[str, Any],
) -> None:
    path = Path(output_dir) / "README.md"
    title = _model_card_title(cfg, dataset_label)
    tag_values = ["solana", "clawd", "lora", "peft"]
    if "Trading Factory" in title:
        tag_values.extend(["trading", "perps", "nvidia"])
    else:
        tag_values.append("core-ai")
    tags = "\n".join(f"  - {tag}" for tag in tag_values)
    datasets = f"  - {dataset_label}" if "/" in dataset_label and not Path(dataset_label).exists() else "  - local"
    wandb_url = _wandb_run_url()
    wandb_section = f"\n- W&B run: {wandb_url}" if wandb_url else ""
    hub_model_id = cfg.get("hub_model_id", "local")
    core_release_note = ""
    if "core-ai" in f"{hub_model_id} {dataset_label}".lower():
        core_release_note = """
## Release Verification

From the `ai-training` directory in the source repository:

```bash
python3 scripts/verify_full_goal_release.py --strict
```

The broad verifier checks the explicit `core-ai` and `ai-training` path list,
local manifests, public Hub datasets, this adapter repo, and release-doc secret
hygiene.
"""
    path.write_text(
        f"""---
license: cc-by-4.0
base_model: {cfg["base_model"]}
datasets:
{datasets}
tags:
{tags}
pipeline_tag: text-generation
---

# {title}

LoRA adapter trained from `{cfg["base_model"]}` on `{dataset_label}`.

Hub model ID: `{hub_model_id}`

## Training

- Train rows: {train_rows}
- Eval rows: {eval_rows}
- Max sequence length: {cfg.get("max_seq_length", "unknown")}
- LoRA rank/alpha: r={lora_cfg["r"]}, alpha={lora_cfg["alpha"]}
- LoRA target modules: `{", ".join(lora_cfg.get("target_modules") or [])}`
- Output directory: `{output_dir}`{wandb_section}

## Metrics

{_metrics_markdown(metrics)}

## Intended Use

{_intended_use(cfg, dataset_label)}

## Loading

```python
from transformers import AutoModelForCausalLM, AutoTokenizer
from peft import PeftModel

base_model = "{cfg["base_model"]}"
adapter_id = "{hub_model_id}"

tokenizer = AutoTokenizer.from_pretrained(base_model, trust_remote_code=True)
model = AutoModelForCausalLM.from_pretrained(base_model, device_map="auto", trust_remote_code=True)
model = PeftModel.from_pretrained(model, adapter_id)
```
{core_release_note}

## Safety

The dataset builder runs in public-safe mode by default and excludes common
secret filenames, private key/token patterns, binary artifacts, dependency
folders, lockfiles, and high-risk security records that are not suitable for
public dataset release.

This adapter is a research/developer artifact. Live trading or wallet actions
must remain behind separate execution clients, simulation, explicit operator
approval, and pre-trade risk gates.
""",
        encoding="utf-8",
    )


def missing_local_adapter_files(output_dir: str) -> list[str]:
    base = Path(output_dir)
    return sorted(name for name in REQUIRED_ADAPTER_FILES if not (base / name).exists())


def missing_hub_adapter_files(hub_model_id: str) -> list[str]:
    from huggingface_hub import HfApi

    files = set(HfApi().list_repo_files(repo_id=hub_model_id, repo_type="model"))
    return sorted(name for name in REQUIRED_ADAPTER_FILES if name not in files)


def wait_for_hub_adapter_files(hub_model_id: str, attempts: int = 4, delay_seconds: int = 15) -> list[str]:
    missing: list[str] = []
    for attempt in range(1, attempts + 1):
        missing = missing_hub_adapter_files(hub_model_id)
        if not missing:
            return []
        if attempt < attempts:
            print(f"Hub adapter files not visible yet ({missing}); retrying in {delay_seconds}s")
            time.sleep(delay_seconds)
    return missing


def upload_adapter_folder(output_dir: str, hub_model_id: str, private: bool, commit_message: str) -> None:
    from huggingface_hub import HfApi

    api = HfApi()
    api.create_repo(repo_id=hub_model_id, repo_type="model", private=private, exist_ok=True)
    api.upload_folder(
        repo_id=hub_model_id,
        repo_type="model",
        folder_path=output_dir,
        commit_message=commit_message,
        ignore_patterns=["checkpoint-*", "runs/*", "wandb/*"],
    )


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--config", default="configs/lora_config.yaml", help="Path to YAML config")
    p.add_argument("--base-model", default=None, help="Override base model id")
    p.add_argument("--dataset-repo", default=None, help="Override dataset repo id")
    p.add_argument("--dataset-path", default=None, help="Override local dataset path or file")
    p.add_argument("--dataset-format", default=None, help="Override local dataset format (hf|json|text)")
    p.add_argument("--output-dir", default=None, help="Override output dir")
    p.add_argument("--hub-model-id", default=None, help="Override HF Hub model id")
    p.add_argument("--num-epochs", type=float, default=None)
    p.add_argument("--lr", type=float, default=None)
    p.add_argument("--lora-r", type=int, default=None)
    p.add_argument("--lora-alpha", type=int, default=None)
    p.add_argument("--cpt-stage", action="store_true", help="Use cpt_* dataset/training overrides from the config")
    p.add_argument("--dry-run", action="store_true", help="Validate config/dataset resolution without loading a model")
    p.add_argument("--wandb", action="store_true", help="Enable Weights & Biases reporting")
    p.add_argument("--no-eval", action="store_true", help="Disable evaluation during training")
    p.add_argument("--no-checkpoints", action="store_true", help="Disable Trainer checkpoint saving during training")
    p.add_argument("--push", action="store_true", help="Push the adapter to the Hub after training")
    p.add_argument("--no-push", action="store_true", help="Don't push to Hub")
    p.add_argument("--no-quant", action="store_true", help="Disable 4-bit quantization")
    p.add_argument("--no-grad-ckpt", action="store_true", help="Disable gradient checkpointing")
    return p.parse_args()


def default_config() -> dict[str, Any]:
    """Remote-friendly default config for `hf jobs uv run scripts/train_lora.py -- --config none`."""
    return {
        "base_model": "Qwen/Qwen2.5-1.5B-Instruct",
        "dataset_repo": "solanaclawd/solana-clawd-core-ai-instruct",
        "max_seq_length": 4096,
        "train_split": "train",
        "eval_split": "eval",
        "output_dir": "/data/outputs/core-ai-clawd-1.5b-lora",
        "push_to_hub": False,
        "hub_model_id": "solanaclawd/solana-clawd-core-ai-1.5b-lora",
        "hub_private": False,
        "lora": {
            "r": 16,
            "alpha": 32,
            "dropout": 0.05,
            "bias": "none",
            "task_type": "CAUSAL_LM",
            "target_modules": ["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"],
        },
        "training": {
            "per_device_train_batch_size": 1,
            "gradient_accumulation_steps": 8,
            "per_device_eval_batch_size": 1,
            "num_train_epochs": 1,
            "max_steps": -1,
            "learning_rate": 2.0e-4,
            "lr_scheduler_type": "cosine",
            "warmup_ratio": 0.03,
            "weight_decay": 0.0,
            "optim": "adamw_torch",
            "bf16": True,
            "fp16": False,
            "tf32": True,
            "gradient_checkpointing": True,
            "logging_steps": 10,
            "save_steps": 250,
            "save_total_limit": 2,
            "eval_steps": 250,
            "eval_strategy": "steps",
            "report_to": ["none"],
            "seed": 42,
            "dataloader_num_workers": 2,
            "remove_unused_columns": False,
        },
        "quantization": {
            "enabled": True,
            "load_in_4bit": True,
            "bnb_4bit_compute_dtype": "bfloat16",
            "bnb_4bit_quant_type": "nf4",
            "bnb_4bit_use_double_quant": True,
        },
        "sft": {
            "packing": False,
            "assistant_only_loss": True,
            "chat_template_kwargs": {},
        },
    }


def load_config(path: str) -> dict[str, Any]:
    if path.lower() in {"none", "null", "-"}:
        return default_config()
    with open(path) as f:
        return yaml.safe_load(f)


def apply_overrides(cfg: dict[str, Any], args: argparse.Namespace) -> dict[str, Any]:
    if args.base_model:
        cfg["base_model"] = args.base_model
    if args.dataset_repo:
        cfg["dataset_repo"] = args.dataset_repo
        if not args.dataset_path:
            cfg.pop("dataset_path", None)
            cfg.pop("dataset_format", None)
    if args.dataset_path:
        cfg["dataset_path"] = args.dataset_path
    if args.dataset_format:
        cfg["dataset_format"] = args.dataset_format
    if args.output_dir:
        cfg["output_dir"] = args.output_dir
    if args.hub_model_id:
        cfg["hub_model_id"] = args.hub_model_id
    if args.num_epochs is not None:
        cfg["training"]["num_train_epochs"] = args.num_epochs
    if args.lr is not None:
        cfg["training"]["learning_rate"] = args.lr
    if args.lora_r is not None:
        cfg["lora"]["r"] = args.lora_r
    if args.lora_alpha is not None:
        cfg["lora"]["alpha"] = args.lora_alpha
    if args.push:
        cfg["push_to_hub"] = True
    if args.wandb:
        cfg["training"]["report_to"] = ["wandb"]
    if args.no_push:
        cfg["push_to_hub"] = False
    if args.no_checkpoints:
        cfg["training"]["save_strategy"] = "no"
    if args.no_eval:
        cfg["eval_split"] = None
        cfg["training"]["eval_strategy"] = "no"
        cfg["training"].pop("eval_steps", None)
    if args.no_quant:
        cfg["quantization"]["enabled"] = False
    if args.no_grad_ckpt:
        cfg["training"]["gradient_checkpointing"] = False
    return cfg


def load_local_dataset(dataset_path: str, dataset_format: str | None) -> DatasetDict:
    path = Path(dataset_path)
    inferred_format = (dataset_format or "").strip().lower()
    if path.is_dir():
        try:
            loaded = load_from_disk(str(path))
        except Exception:
            loaded = load_dataset(str(path))
    else:
        if not inferred_format:
            suffix = path.suffix.lower()
            if suffix == ".jsonl":
                inferred_format = "json"
            elif suffix == ".json":
                inferred_format = "json"
            else:
                inferred_format = "text"
        if inferred_format == "json":
            loaded = load_dataset("json", data_files={"train": str(path)})
        elif inferred_format == "text":
            loaded = load_dataset("text", data_files={"train": str(path)})
        else:
            raise ValueError(f"Unsupported dataset format: {dataset_format}")

    if isinstance(loaded, DatasetDict):
        return loaded
    return DatasetDict({"train": loaded})


def resolve_dataset(cfg: dict[str, Any], use_cpt_stage: bool) -> tuple[DatasetDict, str]:
    local_path = cfg.get("dataset_path")
    local_format = cfg.get("dataset_format")
    if use_cpt_stage:
        local_path = cfg.get("cpt_dataset_path", local_path)
        local_format = cfg.get("cpt_dataset_format", local_format)

    dataset_repo = cfg.get("dataset_repo")
    if local_path and Path(local_path).exists():
        return load_local_dataset(local_path, local_format), local_path

    if dataset_repo and not use_cpt_stage:
        try:
            return load_dataset(dataset_repo), dataset_repo
        except Exception as exc:
            print(f"  Hub load failed ({exc}), falling back to local dataset")

    if not local_path:
        raise FileNotFoundError("No local dataset path configured and Hub dataset could not be loaded.")
    if not Path(local_path).exists():
        raise FileNotFoundError(f"Configured local dataset path does not exist: {local_path}")
    return load_local_dataset(local_path, local_format), local_path


def detect_device() -> str:
    if torch.cuda.is_available():
        return "cuda"
    if torch.backends.mps.is_available():
        return "mps"
    return "cpu"


def main() -> None:
    args = parse_args()
    cfg = apply_overrides(load_config(args.config), args)
    if args.cpt_stage:
        cfg["training"] = {**cfg.get("training", {}), **cfg.get("cpt_training", {})}
        cfg["output_dir"] = cfg.get("cpt_training", {}).get("output_dir", cfg["output_dir"])
        cfg["push_to_hub"] = cfg.get("cpt_training", {}).get("push_to_hub", False)
        cfg["max_seq_length"] = cfg.get("cpt_max_seq_length", cfg.get("max_seq_length", 4096))

    base_model = cfg["base_model"]
    output_dir = cfg["output_dir"]
    hub_model_id = cfg.get("hub_model_id")
    push_to_hub = cfg.get("push_to_hub", False) and not args.no_push

    device = detect_device()
    print(f"[setup] device={device}  base={base_model}  mode={'cpt' if args.cpt_stage else 'sft'}")

    if args.dry_run:
        print("[dry-run] Resolving dataset")
        ds, dataset_label = resolve_dataset(cfg, args.cpt_stage)
        train_split = cfg.get("train_split", "train")
        eval_split = cfg.get("eval_split", "eval")
        train_rows = len(ds[train_split]) if train_split in ds else 0
        eval_rows = len(ds[eval_split]) if eval_split and eval_split in ds else 0
        print(f"[dry-run] source={dataset_label}")
        print(f"[dry-run] train={train_rows} eval={eval_rows}")
        print(f"[dry-run] output_dir={output_dir}")
        print(f"[dry-run] push_to_hub={push_to_hub} hub_model_id={hub_model_id}")
        return

    # ---- Tokenizer ----
    print("[1/6] Loading tokenizer")
    tokenizer = AutoTokenizer.from_pretrained(base_model, trust_remote_code=True)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token
    normalize_tokenizer_chat_template(tokenizer)
    sft_cfg = cfg.setdefault("sft", {})
    if sft_cfg.get("assistant_only_loss", True) and not supports_assistant_only_loss(tokenizer.chat_template):
        print("WARNING: tokenizer chat template has no generation markers; disabling assistant_only_loss")
        sft_cfg["assistant_only_loss"] = False

    # ---- Model ----
    print("[2/6] Loading base model")
    quant_cfg = cfg.get("quantization", {}) or {}
    use_quant = quant_cfg.get("enabled", False) and device == "cuda"  # bitsandbytes needs CUDA
    bnb_config = None
    if use_quant:
        bnb_config = BitsAndBytesConfig(
            load_in_4bit=quant_cfg.get("load_in_4bit", True),
            bnb_4bit_compute_dtype=getattr(torch, quant_cfg.get("bnb_4bit_compute_dtype", "bfloat16")),
            bnb_4bit_quant_type=quant_cfg.get("bnb_4bit_quant_type", "nf4"),
            bnb_4bit_use_double_quant=quant_cfg.get("bnb_4bit_use_double_quant", True),
        )

    model_kwargs: dict[str, Any] = {
        "trust_remote_code": True,
        "device_map": "auto" if device != "cpu" else None,
    }
    if device == "cuda":
        model_kwargs["torch_dtype"] = torch.bfloat16 if cfg["training"].get("bf16") else torch.float16
        if bnb_config:
            model_kwargs["quantization_config"] = bnb_config
    elif device == "mps":
        model_kwargs["torch_dtype"] = torch.bfloat16
    else:
        model_kwargs["torch_dtype"] = torch.float32

    model = AutoModelForCausalLM.from_pretrained(base_model, **model_kwargs)

    if use_quant:
        model = prepare_model_for_kbit_training(
            model, use_gradient_checkpointing=cfg["training"].get("gradient_checkpointing", False)
        )

    # ---- LoRA ----
    print("[3/6] Applying LoRA adapter")
    lora_cfg = cfg["lora"]
    peft_config = LoraConfig(
        r=lora_cfg["r"],
        lora_alpha=lora_cfg["alpha"],
        lora_dropout=lora_cfg.get("dropout", 0.05),
        bias=lora_cfg.get("bias", "none"),
        task_type=lora_cfg.get("task_type", "CAUSAL_LM"),
        target_modules=lora_cfg.get("target_modules"),
    )
    model = get_peft_model(model, peft_config)
    model.print_trainable_parameters()

    # ---- Dataset ----
    print("[4/6] Loading dataset")
    ds, dataset_label = resolve_dataset(cfg, args.cpt_stage)
    print(f"  source={dataset_label}")
    train_ds = ds[cfg.get("train_split", "train")]
    eval_split = cfg.get("eval_split", "eval")
    eval_ds = ds.get(eval_split, None) if eval_split else None
    print(f"  train={len(train_ds)}  eval={len(eval_ds) if eval_ds else 0}")

    # ---- SFTConfig ----
    print("[5/6] Building SFT config")
    train_kwargs = dict(cfg["training"])
    sft_kwargs = cfg.get("sft", {}) or {}

    # bf16/fp16 must align with actual device
    if device != "cuda":
        train_kwargs["bf16"] = False
        train_kwargs["fp16"] = False
        train_kwargs["tf32"] = False

    sft_config = SFTConfig(
        output_dir=output_dir,
        max_length=cfg.get("max_seq_length", 4096),
        dataset_text_field=cfg.get("cpt_text_field" if args.cpt_stage else "text_field", "text"),
        packing=sft_kwargs.get("packing", False),
        assistant_only_loss=sft_kwargs.get("assistant_only_loss", True),
        report_to=_resolve_report_to(train_kwargs.pop("report_to", ["none"])),
        **train_kwargs,
    )

    # ---- Trainer ----
    trainer = SFTTrainer(
        model=model,
        args=sft_config,
        train_dataset=train_ds,
        eval_dataset=eval_ds,
        processing_class=tokenizer,
    )

    # ---- Train ----
    print("[6/6] Training")
    train_result = trainer.train()
    metrics = train_result.metrics
    trainer.log_metrics("train", metrics)
    trainer.save_metrics("train", metrics)
    trainer.save_state()

    # ---- Save adapter ----
    print(f"Saving adapter to {output_dir}")
    trainer.save_model(output_dir)
    tokenizer.save_pretrained(output_dir)
    write_adapter_model_card(
        output_dir=output_dir,
        cfg=cfg,
        lora_cfg=lora_cfg,
        dataset_label=dataset_label,
        train_rows=len(train_ds),
        eval_rows=len(eval_ds) if eval_ds else 0,
        metrics=metrics,
    )

    missing_local = missing_local_adapter_files(output_dir)
    if missing_local:
        raise RuntimeError(f"Adapter save incomplete; missing local files in {output_dir}: {missing_local}")

    # ---- Push to Hub ----
    if push_to_hub and hub_model_id:
        print(f"Pushing to Hub: {hub_model_id}")
        commit_message = (
            f"LoRA r={lora_cfg['r']} alpha={lora_cfg['alpha']} "
            f"epochs={train_kwargs.get('num_train_epochs', 3)} "
            f"lr={train_kwargs.get('learning_rate', 2e-4)}"
        )
        # Avoid Trainer.push_to_hub here. Recent Transformers/TRL combinations
        # can pass Hub kwargs through create_model_card and fail after a complete
        # training run. The folder upload path is narrower and only publishes the
        # adapter artifacts we verified locally.
        upload_adapter_folder(output_dir, hub_model_id, cfg.get("hub_private", False), commit_message)

        missing_hub = wait_for_hub_adapter_files(hub_model_id)
        if missing_hub:
            print(f"WARNING: Hub repo is missing {missing_hub}; retrying direct folder upload")
            upload_adapter_folder(output_dir, hub_model_id, cfg.get("hub_private", False), "Upload final LoRA adapter artifacts")
            missing_hub = wait_for_hub_adapter_files(hub_model_id)
        if missing_hub:
            raise RuntimeError(f"Hub adapter upload incomplete for {hub_model_id}; missing files: {missing_hub}")
        print(f"Verified Hub adapter files for {hub_model_id}")

    print("Done.")


if __name__ == "__main__":
    main()

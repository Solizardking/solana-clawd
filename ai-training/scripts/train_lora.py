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
    import os
    import wandb
    _WANDB_AVAILABLE = True
    _wandb_key = os.environ.get("WANDB_API_KEY")
    if _wandb_key:
        wandb.login(key=_wandb_key, relogin=True)
except ImportError:
    _WANDB_AVAILABLE = False


def _resolve_report_to(report_to: list[str] | str) -> list[str]:
    """Drop 'wandb' from report_to if wandb is not installed, avoiding a crash."""
    if isinstance(report_to, str):
        report_to = [report_to]
    if not _WANDB_AVAILABLE and "wandb" in report_to:
        print("WARNING: wandb not installed — removing from report_to. Install with: pip install wandb")
        report_to = [r for r in report_to if r != "wandb"] or ["none"]
    return report_to


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
    p.add_argument("--no-checkpoints", action="store_true", help="Disable Trainer checkpoint saving during training")
    p.add_argument("--no-push", action="store_true", help="Don't push to Hub")
    p.add_argument("--no-quant", action="store_true", help="Disable 4-bit quantization")
    p.add_argument("--no-grad-ckpt", action="store_true", help="Disable gradient checkpointing")
    return p.parse_args()


def load_config(path: str) -> dict[str, Any]:
    with open(path) as f:
        return yaml.safe_load(f)


def apply_overrides(cfg: dict[str, Any], args: argparse.Namespace) -> dict[str, Any]:
    if args.base_model:
        cfg["base_model"] = args.base_model
    if args.dataset_repo:
        cfg["dataset_repo"] = args.dataset_repo
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
    if args.no_push:
        cfg["push_to_hub"] = False
    if args.no_checkpoints:
        cfg["training"]["save_strategy"] = "no"
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

    if local_path:
        return load_local_dataset(local_path, local_format), local_path

    dataset_repo = cfg.get("dataset_repo")
    if dataset_repo and not use_cpt_stage:
        try:
            return load_dataset(dataset_repo), dataset_repo
        except Exception as exc:
            print(f"  Hub load failed ({exc}), falling back to local dataset")

    if not local_path:
        raise FileNotFoundError("No local dataset path configured and Hub dataset could not be loaded.")
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

    # ---- Tokenizer ----
    print("[1/6] Loading tokenizer")
    tokenizer = AutoTokenizer.from_pretrained(base_model, trust_remote_code=True)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token
    # Set chat template if missing — Qwen-Instruct already has one
    if not tokenizer.chat_template:
        tokenizer.chat_template = (
            "{% for message in messages %}"
            "<|im_start|>{{ message['role'] }}\n"
            "{{ message['content'] }}<|im_end|>\n"
            "{% endfor %}"
            "{% if add_generation_prompt %}<|im_start|>assistant\n{% endif %}"
        )

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

    # ---- Push to Hub ----
    if push_to_hub and hub_model_id:
        print(f"Pushing to Hub: {hub_model_id}")
        trainer.push_to_hub(
            repo_id=hub_model_id,
            private=cfg.get("hub_private", False),
            commit_message=f"LoRA r={lora_cfg['r']} alpha={lora_cfg['alpha']} "
                           f"epochs={train_kwargs.get('num_train_epochs', 3)} "
                           f"lr={train_kwargs.get('learning_rate', 2e-4)}",
        )

    print("Done.")


if __name__ == "__main__":
    main()

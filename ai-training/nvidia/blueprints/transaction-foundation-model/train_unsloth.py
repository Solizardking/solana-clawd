#!/usr/bin/env python3
# /// script
# requires-python = ">=3.10"
# dependencies = [
#   "unsloth",
#   "torch>=2.3.0",
#   "transformers>=4.48.0",
#   "accelerate>=0.34.0",
#   "peft>=0.12.0",
#   "trl>=0.11.0",
#   "datasets>=2.20.0",
#   "pyyaml>=6.0",
# ]
# ///
"""Unsloth-backed CPT/SFT trainer for the Solana transaction foundation lane."""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Any

try:
    from tx_foundation_common import DEFAULT_CONFIG_PATH, load_tx_config, resolve_ai_training_path
except ImportError:
    DEFAULT_CONFIG_PATH = Path("nvidia/configs/solana_tx_foundation.yaml")

    DEFAULT_REMOTE_CONFIG: dict[str, Any] = {
        "base_model": "Qwen/Qwen2.5-7B-Instruct",
        "output_name": "solana-tx-foundation-7b",
        "output_dir": "/data/outputs/solana-tx-foundation-7b",
        "cpt_data": "/mnt/tx-foundation/tx_foundation_cpt_clean.jsonl",
        "sft_data": "/mnt/tx-foundation/solana_clawd_reasoning_tooling_sft.jsonl",
        "max_seq_length": 4096,
        "cpt_max_seq_length": 2048,
        "sft_max_seq_length": 4096,
        "max_length": 4096,
        "cpt_epochs": 1,
        "sft_epochs": 1,
        "learning_rate_cpt": 1.0e-4,
        "learning_rate_sft": 1.0e-4,
        "warmup_steps_cpt": 50,
        "warmup_steps_sft": 100,
        "logging_steps_cpt": 10,
        "logging_steps_sft": 10,
        "save_steps_cpt": 500,
        "save_steps_sft": 500,
        "save_total_limit": 3,
        "batch_size": 1,
        "grad_accum": 16,
        "lora_r": 32,
        "lora_alpha": 64,
        "lora_dropout": 0.05,
        "target_modules": DEFAULT_TARGET_MODULES if "DEFAULT_TARGET_MODULES" in globals() else [
            "q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"
        ],
        "push_to_hub": False,
        "hub_model_id": "solanaclawd/solana-tx-foundation-7b",
        "max_cpt_examples": None,
        "max_sft_examples": None,
        "cpt_max_steps": None,
        "sft_max_steps": None,
        "unsloth": {
            "load_in_4bit": True,
            "dtype": None,
            "use_gradient_checkpointing": "unsloth",
            "packing_cpt": True,
            "packing_sft": False,
        },
    }

    def resolve_ai_training_path(value: str | Path, config_path: Path | None = None) -> Path:
        path = Path(value).expanduser()
        if path.is_absolute():
            return path
        return Path.cwd() / path

    def load_tx_config(path: str | Path | None = None) -> dict[str, Any]:
        cfg = dict(DEFAULT_REMOTE_CONFIG)
        config_path = Path(path).expanduser() if path else DEFAULT_CONFIG_PATH
        if config_path.exists():
            try:
                import yaml

                loaded = yaml.safe_load(config_path.read_text(encoding="utf-8")) or {}
                if isinstance(loaded, dict):
                    cfg.update(loaded)
            except Exception as exc:
                print(f"  [config] warning: could not load {config_path}: {exc}", file=sys.stderr)
        cfg["config_path"] = str(config_path)
        return cfg


DEFAULT_TARGET_MODULES = ["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"]


def _load_config(path: Path | None) -> dict[str, Any]:
    cfg = load_tx_config(path or DEFAULT_CONFIG_PATH)
    cfg["cpt_data"] = str(resolve_ai_training_path(cfg["cpt_data"], path or DEFAULT_CONFIG_PATH))
    cfg["sft_data"] = str(resolve_ai_training_path(cfg["sft_data"], path or DEFAULT_CONFIG_PATH))
    cfg["output_dir"] = str(resolve_ai_training_path(cfg["output_dir"], path or DEFAULT_CONFIG_PATH))
    return cfg


def _unsloth_cfg(cfg: dict[str, Any]) -> dict[str, Any]:
    raw = cfg.get("unsloth", {})
    return raw if isinstance(raw, dict) else {}


def _parse_target_modules(value: Any) -> list[str] | str:
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    if isinstance(value, str):
        text = value.strip()
        if text in {"all-linear", "all_linear"}:
            return "all-linear"
        if text.startswith("["):
            try:
                loaded = json.loads(text)
            except json.JSONDecodeError:
                loaded = None
            if isinstance(loaded, list):
                return [str(item).strip() for item in loaded if str(item).strip()]
        return [part.strip() for part in text.split(",") if part.strip()]
    return DEFAULT_TARGET_MODULES


def _seq_len(cfg: dict[str, Any], stage: str) -> int:
    if stage == "cpt":
        return int(cfg.get("cpt_max_seq_length") or cfg.get("max_seq_length") or 2048)
    return int(cfg.get("sft_max_seq_length") or cfg.get("max_length") or cfg.get("max_seq_length") or 2048)


def _load_text_dataset(path: Path, *, max_examples: int | None = None):
    from datasets import Dataset

    rows: list[str] = []
    with path.open("r", encoding="utf-8", errors="ignore") as f:
        for line in f:
            if max_examples is not None and len(rows) >= max_examples:
                break
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
            except json.JSONDecodeError:
                continue
            text = obj.get("text")
            if isinstance(text, str) and text.strip():
                rows.append(text.strip())
    print(f"  [cpt] loaded {len(rows)} text rows from {path}")
    if not rows:
        raise ValueError(f"CPT dataset is empty: {path}")
    return Dataset.from_dict({"text": rows})


def _load_messages_dataset(path: Path, tokenizer, *, max_examples: int | None = None):
    from datasets import Dataset

    rows: list[str] = []
    with path.open("r", encoding="utf-8", errors="ignore") as f:
        for line in f:
            if max_examples is not None and len(rows) >= max_examples:
                break
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
            except json.JSONDecodeError:
                continue
            messages = obj.get("messages")
            if not isinstance(messages, list):
                continue
            try:
                text = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=False)
            except Exception:
                text = "\n".join(
                    f"{msg.get('role', 'user')}: {msg.get('content', '')}"
                    for msg in messages
                    if isinstance(msg, dict) and isinstance(msg.get("content"), str)
                )
            if text.strip():
                rows.append(text.strip())
    print(f"  [sft] loaded {len(rows)} formatted conversations from {path}")
    if not rows:
        raise ValueError(f"SFT dataset is empty: {path}")
    return Dataset.from_dict({"text": rows})


def _torch_dtype(dtype_name: str | None):
    if not dtype_name:
        return None
    import torch

    return getattr(torch, dtype_name)


def _load_unsloth_model(cfg: dict[str, Any], model_name: str, max_seq_length: int):
    try:
        from unsloth import FastLanguageModel
    except ImportError as exc:
        raise RuntimeError(
            "Unsloth is not installed. Install in the GPU environment with: "
            "uv pip install unsloth --torch-backend=auto"
        ) from exc

    us = _unsloth_cfg(cfg)
    model, tokenizer = FastLanguageModel.from_pretrained(
        model_name=model_name,
        max_seq_length=max_seq_length,
        dtype=_torch_dtype(us.get("dtype")),
        load_in_4bit=bool(us.get("load_in_4bit", True)),
        token=os.environ.get("HF_TOKEN") or None,
    )
    return FastLanguageModel, model, tokenizer


def _apply_lora(fast_language_model, model, cfg: dict[str, Any]):
    us = _unsloth_cfg(cfg)
    target_modules = _parse_target_modules(cfg.get("target_modules") or DEFAULT_TARGET_MODULES)
    return fast_language_model.get_peft_model(
        model,
        r=int(cfg.get("lora_r", 16)),
        target_modules=target_modules,
        lora_alpha=int(cfg.get("lora_alpha", 32)),
        lora_dropout=float(cfg.get("lora_dropout", 0.05)),
        bias="none",
        use_gradient_checkpointing=us.get("use_gradient_checkpointing", "unsloth"),
        random_state=int(cfg.get("seed", 42) or 42),
        use_rslora=False,
        loftq_config=None,
    )


def _load_trainable_adapter(model, adapter_path: Path):
    if not (adapter_path / "adapter_config.json").exists():
        return model
    from peft import PeftModel

    print(f"  [adapter] continuing from CPT adapter: {adapter_path}")
    return PeftModel.from_pretrained(model, str(adapter_path), is_trainable=True)


def _sft_trainer(model, tokenizer, train_dataset, args):
    from trl import SFTTrainer

    kwargs = {
        "model": model,
        "args": args,
        "train_dataset": train_dataset,
    }
    try:
        return SFTTrainer(**kwargs, processing_class=tokenizer)
    except TypeError:
        return SFTTrainer(**kwargs, tokenizer=tokenizer)


def run_cpt(cfg: dict[str, Any], dry_run: bool) -> Path:
    from trl import SFTConfig

    out_dir = Path(cfg["output_dir"]) / "cpt"
    seq_len = _seq_len(cfg, "cpt")
    print(f"\n[unsloth:cpt] base={cfg['base_model']} data={cfg['cpt_data']} max_length={seq_len}")
    if dry_run:
        print("[DRY RUN] skipping Unsloth CPT training")
        return out_dir

    fast_language_model, model, tokenizer = _load_unsloth_model(cfg, cfg["base_model"], seq_len)
    model = _apply_lora(fast_language_model, model, cfg)
    dataset = _load_text_dataset(Path(cfg["cpt_data"]), max_examples=cfg.get("max_cpt_examples"))
    us = _unsloth_cfg(cfg)
    args = SFTConfig(
        output_dir=str(out_dir),
        num_train_epochs=cfg["cpt_epochs"],
        per_device_train_batch_size=cfg["batch_size"],
        gradient_accumulation_steps=cfg["grad_accum"],
        learning_rate=cfg["learning_rate_cpt"],
        lr_scheduler_type="cosine",
        warmup_steps=cfg.get("warmup_steps_cpt", 10),
        logging_steps=cfg.get("logging_steps_cpt", 10),
        save_steps=cfg.get("save_steps_cpt", 200),
        save_total_limit=cfg.get("save_total_limit", 2),
        remove_unused_columns=False,
        max_length=seq_len,
        packing=bool(us.get("packing_cpt", True)),
        dataset_text_field="text",
        max_steps=cfg.get("cpt_max_steps") or -1,
        report_to=["none"],
    )
    trainer = _sft_trainer(model, tokenizer, dataset, args)
    trainer.train()
    trainer.save_model(str(out_dir))
    tokenizer.save_pretrained(str(out_dir))
    print(f"[unsloth:cpt] saved -> {out_dir}")
    return out_dir


def run_sft(cfg: dict[str, Any], cpt_checkpoint: Path | None, dry_run: bool) -> Path:
    from trl import SFTConfig

    base = cfg["base_model"]
    out_dir = Path(cfg["output_dir"]) / "sft"
    seq_len = _seq_len(cfg, "sft")
    adapter_note = f" cpt_adapter={cpt_checkpoint}" if cpt_checkpoint and cpt_checkpoint.exists() else ""
    print(f"\n[unsloth:sft] base={base}{adapter_note} data={cfg['sft_data']} max_length={seq_len}")
    if dry_run:
        print("[DRY RUN] skipping Unsloth SFT training")
        return out_dir

    fast_language_model, model, tokenizer = _load_unsloth_model(cfg, base, seq_len)
    if cpt_checkpoint and cpt_checkpoint.exists() and (cpt_checkpoint / "adapter_config.json").exists():
        model = _load_trainable_adapter(model, cpt_checkpoint)
    else:
        model = _apply_lora(fast_language_model, model, cfg)
    dataset = _load_messages_dataset(Path(cfg["sft_data"]), tokenizer, max_examples=cfg.get("max_sft_examples"))
    us = _unsloth_cfg(cfg)
    args = SFTConfig(
        output_dir=str(out_dir),
        num_train_epochs=cfg["sft_epochs"],
        per_device_train_batch_size=cfg["batch_size"],
        gradient_accumulation_steps=cfg["grad_accum"],
        learning_rate=cfg["learning_rate_sft"],
        lr_scheduler_type="cosine",
        warmup_steps=cfg.get("warmup_steps_sft", 50),
        logging_steps=cfg.get("logging_steps_sft", 25),
        save_steps=cfg.get("save_steps_sft", 500),
        save_total_limit=cfg.get("save_total_limit", 2),
        remove_unused_columns=False,
        max_length=seq_len,
        packing=bool(us.get("packing_sft", False)),
        dataset_text_field="text",
        max_steps=cfg.get("sft_max_steps") or -1,
        report_to=["none"],
    )
    trainer = _sft_trainer(model, tokenizer, dataset, args)
    trainer.train()
    trainer.save_model(str(out_dir))
    tokenizer.save_pretrained(str(out_dir))
    if cfg.get("push_to_hub") and os.environ.get("HF_TOKEN"):
        trainer.push_to_hub(cfg["hub_model_id"])
        print(f"[unsloth:sft] pushed -> {cfg['hub_model_id']}")
    print(f"[unsloth:sft] saved -> {out_dir}")
    return out_dir


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", default=None)
    parser.add_argument("--stage", choices=["cpt", "sft", "both"], default="both")
    parser.add_argument("--base-model", default=None)
    parser.add_argument("--cpt-data", default=None)
    parser.add_argument("--sft-data", default=None)
    parser.add_argument("--output-dir", default=None)
    parser.add_argument("--hub-model-id", default=None)
    parser.add_argument("--target-modules", default=None)
    parser.add_argument("--load-in-4bit", action=argparse.BooleanOptionalAction, default=None)
    parser.add_argument("--cpt-max-seq-length", type=int, default=None)
    parser.add_argument("--sft-max-seq-length", type=int, default=None)
    parser.add_argument("--batch-size", type=int, default=None)
    parser.add_argument("--grad-accum", type=int, default=None)
    parser.add_argument("--lora-r", type=int, default=None)
    parser.add_argument("--lora-alpha", type=int, default=None)
    parser.add_argument("--lora-dropout", type=float, default=None)
    parser.add_argument("--push", action="store_true")
    parser.add_argument("--no-push", action="store_true")
    parser.add_argument("--max-cpt-examples", type=int, default=None)
    parser.add_argument("--max-sft-examples", type=int, default=None)
    parser.add_argument("--cpt-max-steps", type=int, default=None)
    parser.add_argument("--sft-max-steps", type=int, default=None)
    parser.add_argument("--max-steps", type=int, default=None)
    parser.add_argument("--smoke", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    cfg = _load_config(Path(args.config) if args.config else None)
    if args.base_model:
        cfg["base_model"] = args.base_model
    if args.cpt_data:
        cfg["cpt_data"] = args.cpt_data
    if args.sft_data:
        cfg["sft_data"] = args.sft_data
    if args.output_dir:
        cfg["output_dir"] = str(resolve_ai_training_path(args.output_dir, Path(cfg["config_path"])))
    if args.hub_model_id:
        cfg["hub_model_id"] = args.hub_model_id
    if args.target_modules:
        cfg["target_modules"] = _parse_target_modules(args.target_modules)
    if args.load_in_4bit is not None:
        us = _unsloth_cfg(cfg)
        us["load_in_4bit"] = args.load_in_4bit
        cfg["unsloth"] = us
    if args.cpt_max_seq_length is not None:
        cfg["cpt_max_seq_length"] = args.cpt_max_seq_length
    if args.sft_max_seq_length is not None:
        cfg["sft_max_seq_length"] = args.sft_max_seq_length
        cfg["max_length"] = args.sft_max_seq_length
    if args.batch_size is not None:
        cfg["batch_size"] = args.batch_size
    if args.grad_accum is not None:
        cfg["grad_accum"] = args.grad_accum
    if args.lora_r is not None:
        cfg["lora_r"] = args.lora_r
    if args.lora_alpha is not None:
        cfg["lora_alpha"] = args.lora_alpha
    if args.lora_dropout is not None:
        cfg["lora_dropout"] = args.lora_dropout
    if args.push:
        cfg["push_to_hub"] = True
    if args.no_push:
        cfg["push_to_hub"] = False
    if args.smoke:
        cfg["max_cpt_examples"] = 8
        cfg["max_sft_examples"] = 8
        cfg["cpt_max_steps"] = 1
        cfg["sft_max_steps"] = 1
        cfg["cpt_max_seq_length"] = min(int(cfg.get("cpt_max_seq_length") or cfg.get("max_seq_length", 2048)), 512)
        cfg["sft_max_seq_length"] = min(int(cfg.get("sft_max_seq_length") or cfg.get("max_length") or cfg.get("max_seq_length", 2048)), 512)
        cfg["batch_size"] = 1
        cfg["grad_accum"] = 1
        cfg["push_to_hub"] = False
    if args.max_cpt_examples is not None:
        cfg["max_cpt_examples"] = args.max_cpt_examples
    if args.max_sft_examples is not None:
        cfg["max_sft_examples"] = args.max_sft_examples
    if args.max_steps is not None:
        cfg["cpt_max_steps"] = args.max_steps
        cfg["sft_max_steps"] = args.max_steps
    if args.cpt_max_steps is not None:
        cfg["cpt_max_steps"] = args.cpt_max_steps
    if args.sft_max_steps is not None:
        cfg["sft_max_steps"] = args.sft_max_steps

    print("[tx-foundation] backend=unsloth")
    print(f"  stage:       {args.stage}")
    print(f"  base_model:  {cfg['base_model']}")
    print(f"  output_dir:  {cfg['output_dir']}")
    print(f"  cpt_data:    {cfg['cpt_data']}")
    print(f"  sft_data:    {cfg['sft_data']}")
    print(f"  hub_model:   {cfg['hub_model_id']}")
    print(f"  push_to_hub: {cfg.get('push_to_hub', False)}")

    cpt_out = None
    if args.stage in {"cpt", "both"}:
        cpt_out = run_cpt(cfg, args.dry_run)
    if args.stage in {"sft", "both"}:
        run_sft(cfg, cpt_out, args.dry_run)
    print("[tx-foundation] done.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env python3
# /// script
# requires-python = ">=3.10"
# dependencies = [
#   "torch>=2.1.0",
#   "transformers>=4.45.0",
#   "accelerate>=0.34.0",
#   "peft>=0.12.0",
#   "trl>=0.11.0",
#   "datasets>=2.20.0",
#   "pyyaml>=6.0",
# ]
# ///
"""
Blueprint 1 — Transaction Foundation Model trainer.

Two-stage pipeline:
  Stage 1 (CPT): Continued Pre-Training on <tx_context> corpus.
                 Trains on ALL tokens (no masking) to inject Solana tx semantics.
  Stage 2 (SFT): LoRA instruction fine-tuning on existing SFT JSONL.
                 Trains only on assistant turns (standard SFT loss).

Base model: Qwen/Qwen2.5-1.5B-Instruct  (local, no NIM required)
Output:     outputs/solana-tx-foundation-1.5b/

Runs on:
  - Apple Silicon MPS (development)
  - Single A10G/L4/A100 GPU
  - HuggingFace Jobs:  hf jobs uv run nvidia/blueprints/transaction-foundation-model/train.py

Usage:
    python3 train.py --config ../../configs/solana_tx_foundation.yaml
    python3 train.py --stage cpt --cpt-data ../../../../data/tx_foundation_cpt.jsonl
    python3 train.py --stage sft --sft-data ../../../../data/solana_clawd_merged.jsonl
    python3 train.py --stage both --dry-run
"""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

import yaml

ROOT = Path(__file__).parents[2]   # ai-training/
DATA = ROOT / "data"
OUTPUTS = ROOT / "outputs"

DEFAULT_CONFIG = {
    "base_model": "Qwen/Qwen2.5-1.5B-Instruct",
    "output_name": "solana-tx-foundation-1.5b",
    "cpt_data": str(DATA / "tx_foundation_cpt.jsonl"),
    "sft_data": str(DATA / "solana_clawd_merged.jsonl"),
    "max_seq_length": 2048,
    "cpt_epochs": 1,
    "sft_epochs": 1,
    "learning_rate_cpt": 2e-4,
    "learning_rate_sft": 1e-4,
    "batch_size": 2,
    "grad_accum": 8,
    "lora_r": 16,
    "lora_alpha": 32,
    "push_to_hub": False,
    "hub_model_id": "solanaclawd/solana-tx-foundation-1.5b",
}


def _load_config(path: Path | None) -> dict:
    cfg = DEFAULT_CONFIG.copy()
    if path and path.exists():
        with path.open() as f:
            cfg.update(yaml.safe_load(f) or {})
    return cfg


def _get_device():
    try:
        import torch
        if torch.cuda.is_available():
            return "cuda"
        if hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
            return "mps"
    except ImportError:
        pass
    return "cpu"


def _load_cpt_dataset(path: Path, tokenizer, max_len: int):
    from datasets import Dataset
    texts = []
    with path.open() as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
                t = obj.get("text", "")
                if t:
                    texts.append(t)
            except json.JSONDecodeError:
                continue
    print(f"  [cpt] loaded {len(texts)} documents from {path.name}")
    return Dataset.from_dict({"text": texts})


def _load_sft_dataset(path: Path, max_examples: int | None = None):
    from datasets import Dataset
    records = []
    with path.open() as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
                if "messages" in obj:
                    records.append(obj)
            except json.JSONDecodeError:
                continue
    if max_examples:
        records = records[:max_examples]
    print(f"  [sft] loaded {len(records)} conversations from {path.name}")
    return Dataset.from_list(records)


def run_cpt(cfg: dict, dry_run: bool) -> Path:
    """Stage 1: Continued Pre-Training on tx corpus."""
    import torch
    from transformers import AutoModelForCausalLM, AutoTokenizer
    from peft import LoraConfig, get_peft_model
    from trl import SFTTrainer

    print(f"\n[CPT] base={cfg['base_model']}  data={cfg['cpt_data']}")
    if dry_run:
        print("[DRY RUN] skipping CPT training")
        return OUTPUTS / cfg["output_name"] / "cpt"

    out_dir = OUTPUTS / cfg["output_name"] / "cpt"
    tokenizer = AutoTokenizer.from_pretrained(cfg["base_model"], trust_remote_code=True)
    if not tokenizer.pad_token:
        tokenizer.pad_token = tokenizer.eos_token

    dataset = _load_cpt_dataset(Path(cfg["cpt_data"]), tokenizer, cfg["max_seq_length"])

    model = AutoModelForCausalLM.from_pretrained(
        cfg["base_model"], torch_dtype=torch.bfloat16,
        device_map="auto", trust_remote_code=True,
    )

    lora_cfg = LoraConfig(
        r=cfg["lora_r"], lora_alpha=cfg["lora_alpha"],
        lora_dropout=0.05, bias="none", task_type="CAUSAL_LM",
        target_modules=["q_proj", "k_proj", "v_proj", "o_proj",
                        "gate_proj", "up_proj", "down_proj"],
    )
    model = get_peft_model(model, lora_cfg)
    model.print_trainable_parameters()

    from trl import SFTConfig, SFTTrainer
    sft_cfg = SFTConfig(
        output_dir=str(out_dir),
        num_train_epochs=cfg["cpt_epochs"],
        per_device_train_batch_size=cfg["batch_size"],
        gradient_accumulation_steps=cfg["grad_accum"],
        learning_rate=cfg["learning_rate_cpt"],
        lr_scheduler_type="cosine",
        warmup_steps=10,
        bf16=True,
        logging_steps=10,
        save_steps=200,
        save_total_limit=2,
        remove_unused_columns=False,
        max_length=cfg["max_seq_length"],
        packing=True,
        dataset_text_field="text",
    )

    trainer = SFTTrainer(model=model, args=sft_cfg, train_dataset=dataset, processing_class=tokenizer)
    trainer.train()
    trainer.save_model(str(out_dir))
    tokenizer.save_pretrained(str(out_dir))
    print(f"[CPT] saved → {out_dir}")
    return out_dir


def run_sft(cfg: dict, cpt_checkpoint: Path | None, dry_run: bool) -> Path:
    """Stage 2: SFT on instruction data, starting from CPT checkpoint."""
    import torch
    from transformers import AutoModelForCausalLM, AutoTokenizer
    from peft import LoraConfig
    from trl import SFTConfig, SFTTrainer

    base = str(cpt_checkpoint) if cpt_checkpoint and cpt_checkpoint.exists() else cfg["base_model"]
    print(f"\n[SFT] base={base}  data={cfg['sft_data']}")
    if dry_run:
        print("[DRY RUN] skipping SFT training")
        return OUTPUTS / cfg["output_name"] / "sft"

    out_dir = OUTPUTS / cfg["output_name"] / "sft"
    tokenizer = AutoTokenizer.from_pretrained(cfg["base_model"], trust_remote_code=True)
    if not tokenizer.pad_token:
        tokenizer.pad_token = tokenizer.eos_token

    dataset = _load_sft_dataset(Path(cfg["sft_data"]))
    splits = dataset.train_test_split(test_size=0.05, seed=42)

    model = AutoModelForCausalLM.from_pretrained(
        base, torch_dtype=torch.bfloat16,
        device_map="auto", trust_remote_code=True,
    )

    lora_cfg = LoraConfig(
        r=cfg["lora_r"], lora_alpha=cfg["lora_alpha"],
        lora_dropout=0.05, bias="none", task_type="CAUSAL_LM",
        target_modules=["q_proj", "k_proj", "v_proj", "o_proj",
                        "gate_proj", "up_proj", "down_proj"],
    )

    sft_cfg = SFTConfig(
        output_dir=str(out_dir),
        num_train_epochs=cfg["sft_epochs"],
        per_device_train_batch_size=cfg["batch_size"],
        gradient_accumulation_steps=cfg["grad_accum"],
        learning_rate=cfg["learning_rate_sft"],
        lr_scheduler_type="cosine",
        warmup_steps=50,
        bf16=True,
        logging_steps=25,
        save_steps=500,
        save_total_limit=2,
        remove_unused_columns=False,
        max_length=cfg["max_seq_length"],
    )

    trainer = SFTTrainer(
        model=model,
        args=sft_cfg,
        peft_config=lora_cfg,
        train_dataset=splits["train"],
        eval_dataset=splits["test"],
        processing_class=tokenizer,
    )
    trainer.train()
    trainer.save_model(str(out_dir))
    tokenizer.save_pretrained(str(out_dir))

    if cfg.get("push_to_hub") and os.environ.get("HF_TOKEN"):
        trainer.push_to_hub(cfg["hub_model_id"])
        print(f"[SFT] pushed → {cfg['hub_model_id']}")

    print(f"[SFT] saved → {out_dir}")
    return out_dir


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", default=None, help="YAML config path")
    parser.add_argument("--stage", choices=["cpt", "sft", "both"], default="both")
    parser.add_argument("--cpt-data", default=None)
    parser.add_argument("--sft-data", default=None)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    cfg = _load_config(Path(args.config) if args.config else None)
    if args.cpt_data:
        cfg["cpt_data"] = args.cpt_data
    if args.sft_data:
        cfg["sft_data"] = args.sft_data

    print(f"[tx-foundation] stage={args.stage}  device={_get_device()}")
    print(f"  base_model:  {cfg['base_model']}")
    print(f"  output_name: {cfg['output_name']}")
    print(f"  cpt_data:    {cfg['cpt_data']}")
    print(f"  sft_data:    {cfg['sft_data']}")

    cpt_out = None
    if args.stage in ("cpt", "both"):
        cpt_out = run_cpt(cfg, args.dry_run)
    if args.stage in ("sft", "both"):
        run_sft(cfg, cpt_out, args.dry_run)

    print("[tx-foundation] done.")

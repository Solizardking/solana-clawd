#!/usr/bin/env python3
"""
Blueprint 1 — Solana Transaction Foundation Model pipeline.

Mirrors https://build.nvidia.com/nvidia/build-your-own-transaction-foundation-model
using our own data (Jupiter swaps, Phoenix perps, Solana SFT corpus) and
HuggingFace Trainer instead of NVIDIA NIM Customization API.

Stages:
  collect  →  tokenize  →  cpt  →  sft  →  evaluate  →  push

Usage:
    # Full pipeline (collect + train + eval)
    python3 pipeline.py

    # Collect data only
    python3 pipeline.py --stages collect

    # Train on existing data, skip collect
    python3 pipeline.py --stages cpt sft eval

    # Dry run (shows plan, no training)
    python3 pipeline.py --dry-run

    # Push to Hub after training
    python3 pipeline.py --stages sft eval push
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path

from tx_foundation_common import (
    AI_TRAINING_DIR as AI_TRAINING,
    BLUEPRINT_DIR as HERE,
    DEFAULT_CONFIG_PATH,
    DEFAULT_HUB_MODEL_ID,
    load_tx_config,
)

JUPITER_API_KEY = os.environ.get("JUPITER_API_KEY", "")
HF_TOKEN        = os.environ.get("HF_TOKEN", "")


def header(stage: str) -> None:
    print(f"\n{'='*60}")
    print(f"  STAGE: {stage.upper()}")
    print(f"{'='*60}")


def build_runtime(config_path: str | Path | None) -> dict:
    cfg = load_tx_config(config_path)
    output_dir = Path(cfg["output_dir"])
    trainer = "train_unsloth.py" if cfg.get("training_backend") == "unsloth" else "train.py"
    return {
        "cfg": cfg,
        "config": Path(cfg["config_path"]),
        "trainer": HERE / trainer,
        "output_dir": output_dir,
        "cpt_data": Path(cfg["cpt_data"]),
        "sft_data": Path(cfg["sft_data"]),
        "eval_output": Path(cfg["eval_output"]),
        "hub_model_id": cfg.get("hub_model_id", DEFAULT_HUB_MODEL_ID),
    }


def stage_collect(dry_run: bool, ctx: dict, count: int = 2000) -> bool:
    header("collect")
    cmd = [
        sys.executable, str(HERE / "collect.py"),
        "--output", str(ctx["cpt_data"]),
        "--count", str(count),
        "--sources", "jupiter", "sft", "deepsol",
    ]
    if dry_run:
        cmd.append("--dry-run")
    print(f"  $ {' '.join(cmd)}")
    r = subprocess.run(cmd, env={**os.environ})
    return r.returncode == 0


def stage_cpt(dry_run: bool, ctx: dict, smoke: bool = False) -> bool:
    header("cpt")
    if not ctx["cpt_data"].exists():
        print(f"  ERROR: CPT data not found at {ctx['cpt_data']}")
        print(f"  Run: python3 pipeline.py --stages collect cpt")
        return False

    cmd = [
        sys.executable, str(ctx["trainer"]),
        "--config", str(ctx["config"]),
        "--stage", "cpt",
        "--cpt-data", str(ctx["cpt_data"]),
    ]
    if dry_run:
        cmd.append("--dry-run")
    if smoke:
        cmd.append("--smoke")
    print(f"  $ {' '.join(cmd)}")
    r = subprocess.run(cmd, env={**os.environ})
    return r.returncode == 0


def stage_sft(dry_run: bool, ctx: dict, smoke: bool = False) -> bool:
    header("sft")
    cmd = [
        sys.executable, str(ctx["trainer"]),
        "--config", str(ctx["config"]),
        "--stage", "sft",
        "--sft-data", str(ctx["sft_data"]),
    ]
    if dry_run:
        cmd.append("--dry-run")
    if smoke:
        cmd.append("--smoke")
    print(f"  $ {' '.join(cmd)}")
    r = subprocess.run(cmd, env={**os.environ})
    return r.returncode == 0


def stage_evaluate(dry_run: bool, ctx: dict) -> bool:
    header("evaluate")
    sft_out = ctx["output_dir"] / "sft"
    model = str(sft_out) if sft_out.exists() else str(ctx["hub_model_id"])
    cmd = [
        sys.executable, str(HERE / "evaluate.py"),
        "--model", model,
        "--output", str(ctx["eval_output"]),
    ]
    if dry_run:
        print(f"  [DRY RUN] would run: {' '.join(cmd)}")
        return True
    print(f"  $ {' '.join(cmd)}")
    r = subprocess.run(cmd, env={**os.environ})
    if r.returncode == 0 and ctx["eval_output"].exists():
        with ctx["eval_output"].open() as f:
            result = json.load(f)
        print(f"\n  avg_score={result.get('avg_score', 'N/A')}")
        for cat, sc in result.get("by_category", {}).items():
            print(f"    {cat}: {sc}")
    return r.returncode == 0


def stage_push(dry_run: bool, ctx: dict) -> bool:
    header("push")
    if not HF_TOKEN:
        print("  SKIP: HF_TOKEN not set")
        return True
    sft_out = ctx["output_dir"] / "sft"
    if not sft_out.exists():
        print(f"  SKIP: {sft_out} not found")
        return True
    if dry_run:
        print(f"  [DRY RUN] would push {sft_out} -> {ctx['hub_model_id']}")
        return True
    cmd = [
        sys.executable, "-c",
        f"""
from huggingface_hub import HfApi
api = HfApi()
api.upload_folder(
    folder_path="{sft_out}",
    repo_id="{ctx['hub_model_id']}",
    repo_type="model",
)
print("pushed -> {ctx['hub_model_id']}")
"""
    ]
    r = subprocess.run(cmd, env={**os.environ})
    return r.returncode == 0


STAGE_FNS = {
    "collect":  stage_collect,
    "cpt":      stage_cpt,
    "sft":      stage_sft,
    "evaluate": stage_evaluate,
    "push":     stage_push,
}
ALL_STAGES = ["collect", "cpt", "sft", "evaluate"]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--stages", nargs="+", default=ALL_STAGES, choices=list(STAGE_FNS.keys()))
    parser.add_argument("--config", default=str(DEFAULT_CONFIG_PATH), help="Unified transaction foundation YAML config")
    parser.add_argument("--dry-run", action="store_true", help="Print plan without training")
    parser.add_argument("--smoke", action="store_true", help="Pass tiny training limits to CPT/SFT stages")
    parser.add_argument("--collect-count", type=int, default=2000, help="CPT records to collect")
    args = parser.parse_args()
    ctx = build_runtime(args.config)

    print(f"\n{'#'*60}")
    print("  SOLANA TRANSACTION FOUNDATION MODEL")
    print("  (Clawd edition of NVIDIA Blueprint 1)")
    print(f"{'#'*60}")
    print(f"  stages:       {args.stages}")
    print(f"  config:       {ctx['config']}")
    print(f"  trainer:      {ctx['trainer'].name}")
    print(f"  dry_run:      {args.dry_run}")
    print(f"  smoke:        {args.smoke}")
    print(f"  jupiter_key:  {'yes' if JUPITER_API_KEY else 'no'}")
    print(f"  hf_token:     {'yes' if HF_TOKEN else 'no'}")
    print(f"  cpt_data:     {ctx['cpt_data']}")
    print(f"  sft_data:     {ctx['sft_data']}")
    print(f"  output_dir:   {ctx['output_dir']}")
    print(f"  hub_model:    {ctx['hub_model_id']}")

    passed = 0
    failed = 0
    for stage in args.stages:
        fn = STAGE_FNS[stage]
        kwargs: dict = {"dry_run": args.dry_run, "ctx": ctx}
        if stage == "collect":
            kwargs["count"] = args.collect_count
        if stage in {"cpt", "sft"}:
            kwargs["smoke"] = args.smoke
        ok = fn(**kwargs)
        if ok:
            passed += 1
        else:
            failed += 1
            print(f"\n  !! stage '{stage}' failed — stopping")
            break

    print(f"\n{'#'*60}")
    print(f"  done: {passed} passed, {failed} failed")
    print(f"{'#'*60}\n")
    sys.exit(0 if failed == 0 else 1)


if __name__ == "__main__":
    main()

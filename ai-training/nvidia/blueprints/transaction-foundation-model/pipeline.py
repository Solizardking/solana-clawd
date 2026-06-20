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

HERE    = Path(__file__).parent
# pipeline.py is at ai-training/nvidia/blueprints/transaction-foundation-model/
# parents[2] = ai-training/
AI_TRAINING = HERE.parents[2]
DATA         = AI_TRAINING / "data"
CONFIG  = AI_TRAINING / "nvidia" / "configs" / "solana_tx_foundation.yaml"
OUTPUTS = AI_TRAINING / "outputs" / "solana-tx-foundation-1.5b"

CPT_DATA  = DATA / "tx_foundation_cpt.jsonl"
SFT_DATA  = DATA / "solana_clawd_merged.jsonl"
EVAL_OUT  = DATA / "tx_foundation_eval.json"

JUPITER_API_KEY = os.environ.get("JUPITER_API_KEY", "")
HF_TOKEN        = os.environ.get("HF_TOKEN", "")


def header(stage: str) -> None:
    print(f"\n{'='*60}")
    print(f"  STAGE: {stage.upper()}")
    print(f"{'='*60}")


def stage_collect(dry_run: bool, count: int = 2000) -> bool:
    header("collect")
    cmd = [
        sys.executable, str(HERE / "collect.py"),
        "--output", str(CPT_DATA),
        "--count", str(count),
        "--sources", "jupiter", "sft", "deepsol",
    ]
    if dry_run:
        cmd.append("--dry-run")
    print(f"  $ {' '.join(cmd)}")
    r = subprocess.run(cmd, env={**os.environ})
    return r.returncode == 0


def stage_cpt(dry_run: bool) -> bool:
    header("cpt")
    if not CPT_DATA.exists():
        print(f"  ERROR: CPT data not found at {CPT_DATA}")
        print(f"  Run: python3 pipeline.py --stages collect cpt")
        return False

    cmd = [
        sys.executable, str(HERE / "train.py"),
        "--stage", "cpt",
        "--cpt-data", str(CPT_DATA),
    ]
    if dry_run:
        cmd.append("--dry-run")
    print(f"  $ {' '.join(cmd)}")
    r = subprocess.run(cmd, env={**os.environ})
    return r.returncode == 0


def stage_sft(dry_run: bool) -> bool:
    header("sft")
    cpt_checkpoint = OUTPUTS / "cpt"
    cmd = [
        sys.executable, str(HERE / "train.py"),
        "--stage", "sft",
        "--sft-data", str(SFT_DATA),
    ]
    if dry_run:
        cmd.append("--dry-run")
    print(f"  $ {' '.join(cmd)}")
    r = subprocess.run(cmd, env={**os.environ})
    return r.returncode == 0


def stage_evaluate(dry_run: bool) -> bool:
    header("evaluate")
    sft_out = OUTPUTS / "sft"
    model = str(sft_out) if sft_out.exists() else "solanaclawd/solana-tx-foundation-1.5b"
    cmd = [
        sys.executable, str(HERE / "evaluate.py"),
        "--model", model,
        "--output", str(EVAL_OUT),
    ]
    if dry_run:
        print(f"  [DRY RUN] would run: {' '.join(cmd)}")
        return True
    print(f"  $ {' '.join(cmd)}")
    r = subprocess.run(cmd, env={**os.environ})
    if r.returncode == 0 and EVAL_OUT.exists():
        with EVAL_OUT.open() as f:
            result = json.load(f)
        print(f"\n  avg_score={result.get('avg_score', 'N/A')}")
        for cat, sc in result.get("by_category", {}).items():
            print(f"    {cat}: {sc}")
    return r.returncode == 0


def stage_push(dry_run: bool) -> bool:
    header("push")
    if not HF_TOKEN:
        print("  SKIP: HF_TOKEN not set")
        return True
    sft_out = OUTPUTS / "sft"
    if not sft_out.exists():
        print(f"  SKIP: {sft_out} not found")
        return True
    if dry_run:
        print(f"  [DRY RUN] would push {sft_out} → solanaclawd/solana-tx-foundation-1.5b")
        return True
    cmd = [
        sys.executable, "-c",
        f"""
from huggingface_hub import HfApi
api = HfApi()
api.upload_folder(
    folder_path="{sft_out}",
    repo_id="solanaclawd/solana-tx-foundation-1.5b",
    repo_type="model",
)
print("pushed → solanaclawd/solana-tx-foundation-1.5b")
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
    parser.add_argument("--dry-run", action="store_true", help="Print plan without training")
    parser.add_argument("--collect-count", type=int, default=2000, help="CPT records to collect")
    args = parser.parse_args()

    print(f"\n{'#'*60}")
    print("  SOLANA TRANSACTION FOUNDATION MODEL")
    print("  (Clawd edition of NVIDIA Blueprint 1)")
    print(f"{'#'*60}")
    print(f"  stages:       {args.stages}")
    print(f"  dry_run:      {args.dry_run}")
    print(f"  jupiter_key:  {'yes' if JUPITER_API_KEY else 'no'}")
    print(f"  hf_token:     {'yes' if HF_TOKEN else 'no'}")
    print(f"  cpt_data:     {CPT_DATA}")
    print(f"  sft_data:     {SFT_DATA}")

    passed = 0
    failed = 0
    for stage in args.stages:
        fn = STAGE_FNS[stage]
        kwargs: dict = {"dry_run": args.dry_run}
        if stage == "collect":
            kwargs["count"] = args.collect_count
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

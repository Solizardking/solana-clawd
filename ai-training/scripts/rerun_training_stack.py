#!/usr/bin/env python3
"""Fast rerun orchestrator for Solana Clawd data/model-kit training lanes."""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import shlex
import subprocess
import sys
from pathlib import Path
from typing import Any


AI_TRAINING_DIR = Path(__file__).resolve().parent.parent
SUMMARY_PATH = AI_TRAINING_DIR / "outputs" / "rerun_training_stack_summary.json"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--dry-run", action="store_true", help="Print commands without running them.")
    parser.add_argument("--skip-prepare", action="store_true", help="Skip parquet/Arrow split generation.")
    parser.add_argument("--skip-nvidia", action="store_true", help="Skip NVIDIA strategy/preflight/strict verifier steps.")
    parser.add_argument("--best-effort", action="store_true", help="Continue after failed optional steps.")
    parser.add_argument("--max-examples", type=int, default=None, help="Optional cap passed to optimize_training_data.py.")
    parser.add_argument("--summary", default=str(SUMMARY_PATH))
    return parser.parse_args()


def utc_now() -> str:
    return dt.datetime.now(dt.UTC).replace(microsecond=0).isoformat()


def printable(cmd: list[str]) -> str:
    return " ".join(shlex.quote(part) for part in cmd)


def run_step(name: str, cmd: list[str], *, dry_run: bool, best_effort: bool) -> dict[str, Any]:
    print(f"\n[{name}]")
    print(f"$ {printable(cmd)}")
    if dry_run:
        return {"name": name, "cmd": cmd, "returncode": None, "dry_run": True, "ok": True}
    started = dt.datetime.now(dt.UTC)
    result = subprocess.run(cmd, cwd=str(AI_TRAINING_DIR), env=os.environ.copy())
    finished = dt.datetime.now(dt.UTC)
    ok = result.returncode == 0
    if not ok and not best_effort:
        print(f"[{name}] failed with returncode={result.returncode}")
    return {
        "name": name,
        "cmd": cmd,
        "returncode": result.returncode,
        "dry_run": False,
        "ok": ok,
        "started_at": started.replace(microsecond=0).isoformat(),
        "finished_at": finished.replace(microsecond=0).isoformat(),
        "duration_s": round((finished - started).total_seconds(), 3),
    }


def main() -> int:
    args = parse_args()
    py = sys.executable
    steps: list[tuple[str, list[str], bool]] = [
        ("layout", [py, "scripts/organize_ai_training.py", "--check"], False),
        ("configs", [py, "nvidia/scripts/validate_configs.py", "--strict"], False),
        ("optimize-data", [py, "scripts/optimize_training_data.py"], False),
    ]
    if args.max_examples is not None:
        steps[-1][1].extend(["--max-examples", str(args.max_examples)])

    if not args.skip_prepare:
        steps.extend(
            [
                (
                    "prepare-reasoning-tooling",
                    [
                        py,
                        "scripts/prepare_dataset.py",
                        "--input",
                        "data/model_kit/solana_clawd_reasoning_tooling_sft.jsonl",
                        "--output",
                        "data/model_kit/reasoning_tooling_processed",
                        "--format",
                        "messages",
                    ],
                    True,
                ),
                (
                    "prepare-tx-cpt-clean",
                    [
                        py,
                        "scripts/prepare_dataset.py",
                        "--input",
                        "data/model_kit/tx_foundation_cpt_clean.jsonl",
                        "--output",
                        "data/model_kit/tx_foundation_cpt_clean_processed",
                        "--format",
                        "text",
                    ],
                    True,
                ),
            ]
        )

    if not args.skip_nvidia:
        steps.extend(
            [
                ("strategy-bundle", [py, "scripts/build_solana_trading_factory_strategies.py"], True),
                (
                    "tx-preflight",
                    [py, "nvidia/blueprints/transaction-foundation-model/preflight.py", "--no-smoke-dry-run"],
                    False,
                ),
                ("nvidia-verify", [py, "nvidia/scripts/verify_nvidia.py", "--strict"], False),
            ]
        )

    results = []
    ok = True
    for name, cmd, optional in steps:
        result = run_step(name, cmd, dry_run=args.dry_run, best_effort=args.best_effort or optional)
        results.append(result)
        if not result["ok"]:
            ok = False
            if not (args.best_effort or optional):
                break

    summary = {
        "generated_at": utc_now(),
        "ok": ok,
        "dry_run": args.dry_run,
        "skip_prepare": args.skip_prepare,
        "skip_nvidia": args.skip_nvidia,
        "steps": results,
        "outputs": {
            "optimized_messages": "data/model_kit/solana_clawd_reasoning_tooling_sft.jsonl",
            "optimized_cpt": "data/model_kit/tx_foundation_cpt_clean.jsonl",
            "optimization_manifest": "data/model_kit/training_data_optimization_manifest.json",
        },
    }
    summary_path = Path(args.summary)
    if not summary_path.is_absolute():
        summary_path = AI_TRAINING_DIR / summary_path
    if not args.dry_run:
        summary_path.parent.mkdir(parents=True, exist_ok=True)
        summary_path.write_text(json.dumps(summary, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps(summary, indent=2, sort_keys=True))
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())

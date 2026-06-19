#!/usr/bin/env python3
"""Generate Solana Clawd trading-factory strategy artifacts.

This writes reviewable Vulcan TA configs, paper command plans, a Rise read plan,
and a cuFOLIO Mean-CVaR optimizer handoff. It does not execute Vulcan commands.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR / "trading_factory"))

from solana_factory.factory import build_strategy_bundle  # noqa: E402


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", default=str(BASE_DIR / "data" / "strategies"))
    parser.add_argument("--paper-notional-usdc", type=float, default=150.0)
    parser.add_argument("--max-ticks", type=int, default=60)
    parser.add_argument("--dry-run", action="store_true")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    output_dir = Path(args.output_dir)
    manifest = build_strategy_bundle(
        repo_root=BASE_DIR,
        output_dir=output_dir,
        paper_notional_usdc=args.paper_notional_usdc,
        max_ticks=args.max_ticks,
    )
    summary = {
        "output_dir": output_dir.as_posix(),
        "strategies": [entry["name"] for entry in manifest["strategies"]],
        "validation_errors": {
            entry["name"]: entry["validation_errors"]
            for entry in manifest["strategies"]
            if entry["validation_errors"]
        },
        "optimizer_handoff": manifest["optimizer_handoff"],
        "rise_data_plan": manifest["rise_data_plan"],
        "vulcan_command_plans": manifest["vulcan_command_plans"],
        "nvidia_clawd_agent_plan": manifest["nvidia_clawd_agent_plan"],
    }
    print(json.dumps(summary, indent=2, sort_keys=True))
    if args.dry_run:
        print("dry-run requested: files were still generated for deterministic review")


if __name__ == "__main__":
    main()

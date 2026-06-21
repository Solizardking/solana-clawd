#!/usr/bin/env python3
"""Generate the NemoClawd/NVIDIA agent plan for the Solana factory."""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(BASE_DIR / "trading_factory"))

from solana_factory.nvidia_agent import build_nvidia_clawd_agent_plan  # noqa: E402
from nemo_clawd import write_nemo_clawd_assets  # noqa: E402


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo-root", default=str(BASE_DIR), help="Path to ai-training")
    parser.add_argument("--output", default=None, help="Output JSON path")
    parser.add_argument("--markets", nargs="+", default=["SOL", "BTC", "ETH", "JUP", "PYTH", "JTO"])
    parser.add_argument("--mode", choices=["observer", "paper"], default="paper")
    parser.add_argument("--core-ai-root", default=str(BASE_DIR.parent / "core-ai"))
    parser.add_argument("--no-core-ai", action="store_true", help="Skip Nemo Clawd Core AI inventory/blueprint generation")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    repo_root = Path(args.repo_root).resolve()
    output_path = Path(args.output) if args.output else repo_root / "data" / "strategies" / "nvidia_clawd_agent_plan.json"
    output_dir = output_path.parent
    plan = build_nvidia_clawd_agent_plan(
        repo_root=repo_root,
        output_dir=output_dir,
        markets=args.markets,
        default_mode=args.mode,
    )
    nemo_assets = None
    if not args.no_core_ai:
        nemo_assets = write_nemo_clawd_assets(
            output_dir=output_dir,
            core_ai_dir=Path(args.core_ai_root).resolve(),
        )
        plan["nemo_clawd"] = {
            "name": "Nemo Clawd",
            "core_ai_inventory": nemo_assets["inventory_path"].as_posix(),
            "blueprint": nemo_assets["blueprint_path"].as_posix(),
            "missing_required_paths": nemo_assets["inventory"].get("missing_required_paths", []),
            "upstream": nemo_assets["blueprint"].get("upstream", {}),
        }
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(plan, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    summary = {
        "output": output_path.as_posix(),
        "mode": plan["default_mode"],
        "markets": plan["markets"],
        "roles": [role["name"] for role in plan["roles"]],
        "missing_factory_artifacts": [
            name for name, artifact in plan["factory_artifacts"].items() if not artifact["exists"]
        ],
        "nemo_clawd": plan.get("nemo_clawd"),
    }
    print(json.dumps(summary, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()

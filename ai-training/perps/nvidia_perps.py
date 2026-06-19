#!/usr/bin/env python3
"""Create a Solana perps handoff for the NVIDIA trading factory."""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Any


BASE_DIR = Path(__file__).resolve().parents[1]
SIGNAL_DIR = BASE_DIR / "nvidia" / "blueprints" / "signal-discovery"
sys.path.insert(0, str(SIGNAL_DIR))

from perps_signal_agent import build_composite, run_tick  # noqa: E402


def build_handoff(market: str, rpc_url: str, mode: str, threshold: float) -> dict[str, Any]:
    return {
        "name": "Solana Clawd NVIDIA Perps Handoff",
        "market": market,
        "default_mode": mode,
        "rpc_url_env": "RPC_URL",
        "rpc_url_default": rpc_url,
        "threshold": threshold,
        "source_files": {
            "signal_agent": "nvidia/blueprints/signal-discovery/perps_signal_agent.py",
            "signals": "nvidia/blueprints/signal-discovery/signals.py",
            "trading_factory_bridge": "nvidia/integration/trading_factory_nvidia.py",
            "sft_builder": "nvidia/integration/dataset_nvidia_sft.py",
            "perps_tools": "perps/functions.py",
            "perps_schema": "perps/schema.py",
        },
        "signals": [
            "rsi",
            "macd",
            "funding_rate",
            "orderbook_imbalance",
            "ema_divergence",
        ],
        "quickstart": [
            "export RPC_URL=https://api.mainnet-beta.solana.com",
            "export NVIDIA_API_KEY=<set-in-shell-only>",
            "python3 nvidia/blueprints/signal-discovery/perps_signal_agent.py --market SOL --mode paper --loop",
        ],
        "safety_policy": {
            "default_modes": ["observer", "paper"],
            "live_mode": "not generated here",
            "paper_execution": "allowed only through Vulcan paper commands",
            "blocked": [
                "wallet private-key reads",
                "wallet password reads",
                "live order submission",
                "MCP secret inspection",
            ],
        },
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--market", default="SOL")
    parser.add_argument("--mode", choices=["observer", "paper"], default="observer")
    parser.add_argument("--threshold", type=float, default=0.35)
    parser.add_argument("--rpc-url", default=os.environ.get("RPC_URL", "https://api.mainnet-beta.solana.com"))
    parser.add_argument("--output", default=str(BASE_DIR / "data" / "perps" / "nvidia_perps_handoff.json"))
    parser.add_argument("--tick", action="store_true", help="Run one signal-agent tick after writing the handoff")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    handoff = build_handoff(args.market, args.rpc_url, args.mode, args.threshold)

    if args.tick:
        if args.mode == "observer":
            composite = build_composite(args.market, args.rpc_url)
        else:
            composite = run_tick(
                market=args.market,
                mode=args.mode,
                rpc_url=args.rpc_url,
                threshold=args.threshold,
                log_path=BASE_DIR / "data" / "nvidia_signal_log.jsonl",
            )
        handoff["last_tick"] = {
            "market": composite.market,
            "timestamp": composite.timestamp,
            "direction": composite.direction,
            "composite_strength": composite.composite_strength,
            "recommended_action": composite.recommended_action,
            "signals": composite.signals,
        }

    output.write_text(json.dumps(handoff, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps({"output": output.as_posix(), "mode": args.mode, "tick": args.tick}, indent=2))


if __name__ == "__main__":
    main()

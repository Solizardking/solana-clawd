"""
Blueprint 4 — Quantitative Signal Discovery Agent (AIQ wrapper).

Wraps the Phoenix perps signal pipeline in an AIQ-compatible agent interface.
AIQ evaluates the agent's signal quality against historical outcomes.

Reference: https://github.com/NVIDIA-AI-Blueprints/quantitative-signal-discovery-agent
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

from perps_signal_agent import build_composite, log_as_sft
from signals import scan_all


def aiq_run_agent(markets: list[str], mode: str, rpc_url: str, log_path: Path) -> list[dict]:
    """AIQ agent entrypoint — returns structured results for AIQ evaluation."""
    results = []
    for market in markets:
        composite = build_composite(market, rpc_url)
        log_as_sft(composite, log_path)
        results.append({
            "market": market,
            "direction": composite.direction,
            "strength": composite.composite_strength,
            "action": composite.recommended_action,
            "signals": composite.signals,
        })
        print(f"[aiq] {market}: {composite.direction} strength={composite.composite_strength:.3f}")
    return results


def main() -> None:
    parser = argparse.ArgumentParser(description="AIQ Signal Discovery Agent — Blueprint 4")
    parser.add_argument("--markets", nargs="+", default=["SOL", "BTC", "ETH"])
    parser.add_argument("--mode", choices=["observer", "paper"], default="paper")
    parser.add_argument("--rpc-url", default=os.environ.get("RPC_URL", "https://api.mainnet-beta.solana.com"))
    parser.add_argument("--output", default="../../../../data/nvidia_aiq_results.json")
    args = parser.parse_args()

    log_path = Path(__file__).parent / "../../../../data/nvidia_signal_log.jsonl"
    results = aiq_run_agent(args.markets, args.mode, args.rpc_url, log_path)

    out_path = Path(__file__).parent / args.output
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(results, indent=2))
    print(f"\n[aiq] results saved to {out_path}")


if __name__ == "__main__":
    main()

"""
NVIDIA signals → Solana Clawd Trading Factory bridge.

Connects the NVIDIA signal discovery pipeline (Blueprint 4)
to the existing trading_factory/ Vulcan/Phoenix execution layer.

Flow:
  perps_signal_agent.py → CompositeSignal
    → trading_factory_nvidia.py (this file)
      → data/strategies/  (Vulcan paper TA configs)
        → vulcan strategy ta start  (paper execution)
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "blueprints" / "signal-discovery"))


@dataclass
class TradingFactoryOrder:
    market: str
    direction: str
    notional_usdc: float
    entry_signal: str
    composite_strength: float
    vulcan_cmd: str
    strategy_config: dict


TRADING_FACTORY_STAGE_MAP = {
    "signal":     "1-signal-discovery",
    "research":   "2-research-validation",
    "optimize":   "3-portfolio-optimization",
    "execute":    "4-execution-policy",
    "monitor":    "5-monitoring",
}


def signal_to_ta_config(
    market: str,
    direction: str,
    strength: float,
    notional: float,
) -> dict:
    """Convert a composite signal into a Vulcan TA strategy config."""
    rsi_threshold = 35 if direction == "long" else 65
    rsi_op = "lt" if direction == "long" else "gt"
    action = "buy" if direction == "long" else "sell"

    return {
        "market": market,
        "margin_mode": "cross",
        "rules": [
            {
                "condition": {
                    "indicator": "rsi",
                    "timeframe": "1h",
                    "op": rsi_op,
                    "threshold": rsi_threshold,
                },
                "action": {
                    "type": action,
                    "notional_usdc": notional,
                    "reduce_only": False,
                },
                "description": f"NVIDIA signal: {direction} strength={strength:.2f}",
            }
        ],
        "max_ticks": 5,
        "metadata": {
            "source": "nvidia-signal-discovery",
            "composite_strength": strength,
        },
    }


def emit_paper_strategy(order: TradingFactoryOrder, strategies_dir: Path) -> Path:
    """Write a Vulcan TA config and print the launch command."""
    strategies_dir.mkdir(parents=True, exist_ok=True)
    fname = f"nvidia_{order.market.lower()}_{order.direction}_signal.json"
    config_path = strategies_dir / fname
    config_path.write_text(json.dumps(order.strategy_config, indent=2))

    cmd = (
        f"vulcan strategy ta start "
        f"--config-file {config_path} "
        f"--mode paper "
        f"--max-ticks 5"
    )
    print(f"[trading-factory] wrote TA config: {config_path}")
    print(f"[trading-factory] launch: {cmd}")
    return config_path


def pipeline(
    market: str,
    mode: str = "paper",
    threshold: float = 0.35,
    notional: float = 100.0,
    strategies_dir: Path | None = None,
) -> TradingFactoryOrder | None:
    """Full NVIDIA signal → trading factory pipeline."""
    from perps_signal_agent import build_composite

    rpc_url = os.environ.get("RPC_URL", "https://api.mainnet-beta.solana.com")
    composite = build_composite(market, rpc_url)

    print(f"[trading-factory] {market}: {composite.direction} strength={composite.composite_strength:.3f}")

    if composite.composite_strength < threshold or composite.direction == "neutral":
        print(f"[trading-factory] signal below threshold ({threshold}) — no trade")
        return None

    if strategies_dir is None:
        strategies_dir = Path(__file__).parents[2] / "data" / "strategies"

    config = signal_to_ta_config(market, composite.direction, composite.composite_strength, notional)
    cmd = composite.recommended_action
    order = TradingFactoryOrder(
        market=market,
        direction=composite.direction,
        notional_usdc=notional,
        entry_signal="; ".join(s["reason"] for s in composite.signals if s["direction"] == composite.direction),
        composite_strength=composite.composite_strength,
        vulcan_cmd=cmd,
        strategy_config=config,
    )

    emit_paper_strategy(order, strategies_dir)
    return order


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="NVIDIA signal → trading factory bridge")
    parser.add_argument("--market", default="SOL")
    parser.add_argument("--mode", choices=["paper", "observer"], default="paper")
    parser.add_argument("--threshold", type=float, default=0.35)
    parser.add_argument("--notional", type=float, default=100.0)
    args = parser.parse_args()

    result = pipeline(args.market, args.mode, args.threshold, args.notional)
    if result:
        print(f"\n[trading-factory] order: {json.dumps({
            'market': result.market,
            'direction': result.direction,
            'notional': result.notional_usdc,
            'strength': result.composite_strength,
            'cmd': result.vulcan_cmd,
        }, indent=2)}")

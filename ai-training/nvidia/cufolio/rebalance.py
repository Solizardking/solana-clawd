"""
cuFOLIO rebalancing engine.

Reads current live positions from Vulcan, computes delta to target weights,
emits Vulcan paper or live orders to rebalance.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from dataclasses import dataclass


@dataclass
class RebalanceTrade:
    asset: str
    side: str           # "buy" | "sell"
    notional_usdc: float
    current_weight: float
    target_weight: float
    command: str


def _get_live_positions() -> dict[str, float]:
    """Fetch current positions from Vulcan, return {symbol: notional_usdc}."""
    try:
        r = subprocess.run(
            ["vulcan", "position", "list", "-o", "json"],
            capture_output=True, text=True, timeout=15,
        )
        data = json.loads(r.stdout)
        if not data.get("ok") or not data.get("data"):
            return {}
        positions = {}
        for pos in data["data"].get("positions", []):
            symbol = pos.get("market", pos.get("symbol", ""))
            notional = float(pos.get("notional_usdc", pos.get("notional", 0)))
            if symbol and notional:
                positions[symbol] = notional
        return positions
    except Exception:
        return {}


def compute_rebalance(
    target_weights: dict[str, float],
    current_notionals: dict[str, float],
    total_budget: float,
    min_trade_usdc: float = 5.0,
    mode: str = "paper",
) -> list[RebalanceTrade]:
    """Compute trades needed to reach target_weights from current positions."""
    total_current = sum(current_notionals.values())
    effective_budget = total_budget or total_current or 1000.0

    total_w = sum(target_weights.values())
    normalized = {a: w / total_w for a, w in target_weights.items()}

    trades = []
    for asset, target_w in normalized.items():
        current_notional = current_notionals.get(asset, 0.0)
        target_notional = target_w * effective_budget
        delta = target_notional - current_notional
        current_w = current_notional / effective_budget

        if abs(delta) < min_trade_usdc:
            continue

        side = "buy" if delta > 0 else "sell"
        notional = abs(delta)
        cmd = f"vulcan paper {side} {asset} --notional-usdc {notional:.2f} --type market"
        if mode != "paper":
            cmd = f"vulcan trade market-{side} {asset} --notional-usdc {notional:.2f}"

        trades.append(RebalanceTrade(
            asset=asset,
            side=side,
            notional_usdc=round(notional, 2),
            current_weight=round(current_w, 4),
            target_weight=round(target_w, 4),
            command=cmd,
        ))

    return sorted(trades, key=lambda t: t.notional_usdc, reverse=True)


def main() -> None:
    parser = argparse.ArgumentParser(description="cuFOLIO rebalancing engine")
    parser.add_argument("--target-weights", required=True,
                        help='JSON dict e.g. \'{"SOL": 0.4, "BTC": 0.3, "ETH": 0.3}\'')
    parser.add_argument("--budget", type=float, default=0,
                        help="Total budget USDC (0 = use current total position value)")
    parser.add_argument("--mode", choices=["observer", "paper"], default="paper")
    parser.add_argument("--min-trade", type=float, default=5.0)
    args = parser.parse_args()

    try:
        target_weights = json.loads(args.target_weights)
    except json.JSONDecodeError as e:
        print(f"ERROR: invalid --target-weights JSON: {e}", file=sys.stderr)
        sys.exit(1)

    current = _get_live_positions()
    print(f"[rebalance] current positions: {current or '(none — using zeros)'}")

    trades = compute_rebalance(target_weights, current, args.budget, args.min_trade, args.mode)

    if not trades:
        print("[rebalance] No trades needed — already at target weights.")
        return

    print(f"\n[rebalance] {len(trades)} trades to reach target:")
    for t in trades:
        arrow = "→"
        print(f"  {t.asset:8s} {t.current_weight:.1%} {arrow} {t.target_weight:.1%}  "
              f"{t.side:4s} ${t.notional_usdc:.2f}")
        print(f"    {t.command}")


if __name__ == "__main__":
    main()

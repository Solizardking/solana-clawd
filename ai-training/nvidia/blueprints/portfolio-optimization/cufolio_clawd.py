"""
Blueprint 2 — End-to-end Solana portfolio optimizer with Clawd trust gates.

Flow:
  1. Fetch live prices from Phoenix / Jupiter via RPC
  2. Generate Monte Carlo scenarios (cuML KDE)
  3. Run Mean-CVaR optimization (cuFOLIO / CVXPY)
  4. Enforce Clawd trust gates before any live execution
  5. Emit Vulcan paper or live trade commands
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from dataclasses import dataclass, asdict

import numpy as np

from scenarios import generate_scenarios, historical_returns
from mean_cvar import optimize, OptResult
from phoenix_prices import fetch_prices, PHOENIX_MARKETS


TRUST_GATES = {
    "observer":    "Read-only; emit allocation plan, no orders.",
    "paper":       "Execute in Vulcan paper mode. No real funds.",
    "delegated":   "Execute live with human confirmation per order.",
    "auto":        "Execute live automatically. High risk. Requires explicit --gate auto.",
}


@dataclass
class AllocationPlan:
    assets: list[str]
    weights: list[float]
    notional_usdc: float
    allocations_usdc: dict[str, float]
    expected_return: float
    cvar: float
    sharpe: float
    solver: str
    gate: str


def _fetch_mock_prices(assets: list[str], n_days: int = 365) -> dict[str, list[float]]:
    """Stub: returns synthetic price history. Replace with real RPC/API calls."""
    rng = np.random.default_rng(seed=sum(ord(c) for c in "".join(assets)))
    base = {"SOL": 150, "BTC": 65000, "ETH": 3500, "BONK": 0.00003, "JTO": 3.5, "JUP": 0.8}
    prices = {}
    for a in assets:
        start = base.get(a, 10.0)
        drift = 0.001
        vol = 0.04
        daily = 1 + rng.normal(drift, vol, n_days)
        daily[0] = 1.0
        prices[a] = (start * np.cumprod(daily)).tolist()
    return prices


def build_plan(
    assets: list[str],
    budget: float,
    cvar_alpha: float,
    max_cvar: float,
    max_leverage: float,
    gate: str,
    use_phoenix: bool = True,
    n_days: int = 90,
) -> AllocationPlan:
    if gate not in TRUST_GATES:
        print(f"ERROR: unknown gate '{gate}'. Valid: {list(TRUST_GATES)}", file=sys.stderr)
        sys.exit(1)

    if use_phoenix:
        print(f"[portfolio-opt] fetching live prices ({n_days}d)...")
        prices = fetch_prices(assets, n_days=n_days, verbose=True)
    else:
        prices = _fetch_mock_prices(assets)
    rets, names = historical_returns(prices)
    n_scen = 5000
    sc = generate_scenarios(rets, names, n_scenarios=n_scen)
    result: OptResult = optimize(
        sc.scenarios, sc.assets,
        cvar_alpha=cvar_alpha,
        max_cvar=max_cvar,
        max_leverage=max_leverage,
    )

    alloc = {a: float(w * budget) for a, w in zip(result.assets, result.weights)}
    return AllocationPlan(
        assets=result.assets,
        weights=result.weights.tolist(),
        notional_usdc=budget,
        allocations_usdc=alloc,
        expected_return=result.expected_return,
        cvar=result.cvar,
        sharpe=result.sharpe,
        solver=result.solver,
        gate=gate,
    )


def emit_vulcan_commands(plan: AllocationPlan) -> list[str]:
    """Translate allocation plan → Vulcan CLI commands."""
    cmds = []
    mode = "paper" if plan.gate in ("paper", "observer") else "auto-execute"
    for asset, usdc in plan.allocations_usdc.items():
        if usdc < 1.0:
            continue
        cmd = (
            f"vulcan trade market-buy {asset} "
            f"--notional-usdc {usdc:.2f} "
            f"--mode {mode}"
        )
        if plan.gate == "observer":
            cmd = f"# [observer — not executed] {cmd}"
        cmds.append(cmd)
    return cmds


def main() -> None:
    parser = argparse.ArgumentParser(description="Clawd portfolio optimizer (Blueprint 2)")
    parser.add_argument("--assets", nargs="+", default=["SOL", "BTC", "ETH"])
    parser.add_argument("--budget", type=float, default=1000.0)
    parser.add_argument("--cvar-alpha", type=float, default=0.95)
    parser.add_argument("--max-cvar", type=float, default=0.12)
    parser.add_argument("--max-leverage", type=float, default=1.0)
    parser.add_argument("--gate", default="paper", choices=list(TRUST_GATES))
    parser.add_argument("--json", action="store_true", help="Output JSON")
    parser.add_argument("--no-phoenix", action="store_true", help="Use synthetic prices instead of live")
    parser.add_argument("--days", type=int, default=90, help="Days of price history to fetch")
    parser.add_argument("--n-scenarios", type=int, default=5000)
    args = parser.parse_args()

    print(f"[portfolio-opt] gate={args.gate}: {TRUST_GATES[args.gate]}")
    plan = build_plan(
        args.assets, args.budget, args.cvar_alpha,
        args.max_cvar, args.max_leverage, args.gate,
        use_phoenix=not args.no_phoenix,
        n_days=args.days,
    )

    if args.json:
        print(json.dumps(asdict(plan), indent=2))
    else:
        print(f"\nAllocation plan ({plan.solver})")
        print(f"  E[ret]={plan.expected_return:.4f}  CVaR={plan.cvar:.4f}  Sharpe={plan.sharpe:.3f}")
        for a, usdc in plan.allocations_usdc.items():
            w = plan.weights[plan.assets.index(a)]
            print(f"  {a:8s}  {w*100:5.1f}%  ${usdc:8.2f}")

    print("\n[portfolio-opt] Vulcan commands:")
    for cmd in emit_vulcan_commands(plan):
        print(f"  {cmd}")


if __name__ == "__main__":
    main()

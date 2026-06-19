"""
cuFOLIO portfolio optimizer — Solana Clawd integration.

Wraps blueprints/portfolio-optimization (scenarios + mean_cvar)
with cuFOLIO as the preferred GPU solver and applies Clawd constraints.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent.parent / "blueprints" / "portfolio-optimization"))
from scenarios import generate_scenarios, historical_returns
from mean_cvar import optimize
from constraints import CLAWD_DEFAULT_CONSTRAINTS, CVaRConstraint, LeverageConstraint


def _mock_prices(assets: list[str], n_days: int = 365) -> dict[str, list[float]]:
    rng = np.random.default_rng(seed=42)
    base = {"SOL": 150, "BTC": 65000, "ETH": 3500, "JTO": 3.5, "JUP": 0.8, "BONK": 0.00003}
    out = {}
    for a in assets:
        start = base.get(a, 10.0)
        daily = 1 + rng.normal(0.001, 0.04, n_days)
        daily[0] = 1.0
        out[a] = (start * np.cumprod(daily)).tolist()
    return out


def run(
    assets: list[str],
    budget: float,
    mode: str,
    n_scenarios: int = 5000,
) -> dict:
    constraints = CLAWD_DEFAULT_CONSTRAINTS
    cvar_con = next((c for c in constraints if isinstance(c, CVaRConstraint)), CVaRConstraint(0.12))
    lev_con = next((c for c in constraints if isinstance(c, LeverageConstraint)), LeverageConstraint(1.0))

    prices = _mock_prices(assets)
    rets, names = historical_returns(prices)
    sc = generate_scenarios(rets, names, n_scenarios=n_scenarios)
    result = optimize(
        sc.scenarios, sc.assets,
        cvar_alpha=cvar_con.alpha,
        max_cvar=cvar_con.max_cvar,
        max_leverage=lev_con.max_leverage,
    )

    alloc = {a: round(float(w * budget), 2) for a, w in zip(result.assets, result.weights)}
    plan = {
        "assets": result.assets,
        "weights": {a: round(float(w), 4) for a, w in zip(result.assets, result.weights)},
        "allocations_usdc": alloc,
        "budget_usdc": budget,
        "expected_return": round(result.expected_return, 6),
        "cvar_95": round(result.cvar, 6),
        "sharpe": round(result.sharpe, 4),
        "solver": result.solver,
        "mode": mode,
        "constraints": [c.describe() for c in constraints],
    }

    if mode == "paper":
        plan["vulcan_commands"] = [
            f"vulcan paper buy {a} --notional-usdc {u:.2f} --type market"
            for a, u in alloc.items()
            if u >= 1.0
        ]

    return plan


def main() -> None:
    parser = argparse.ArgumentParser(description="cuFOLIO Solana portfolio optimizer")
    parser.add_argument("--assets", nargs="+", default=["SOL", "BTC", "ETH"])
    parser.add_argument("--budget", type=float, default=1000.0)
    parser.add_argument("--mode", choices=["observer", "paper"], default="paper")
    parser.add_argument("--scenarios", type=int, default=5000)
    args = parser.parse_args()

    plan = run(args.assets, args.budget, args.mode, args.scenarios)
    print(json.dumps(plan, indent=2))

    if "vulcan_commands" in plan:
        print("\n[cufolio] Vulcan paper commands:")
        for cmd in plan["vulcan_commands"]:
            print(f"  {cmd}")


if __name__ == "__main__":
    main()

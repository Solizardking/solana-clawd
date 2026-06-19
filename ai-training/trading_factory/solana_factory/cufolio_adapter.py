"""cuFOLIO handoff specs for Solana spot/perps optimization.

The upstream cuFOLIO repo is cloned under ``trading_factory/cufolio``. This
module does not require CUDA or cuOpt locally; it produces the JSON contract
that a GPU job can feed into cuFOLIO/CVaR once market returns are materialized.
"""
from __future__ import annotations

from pathlib import Path
from typing import Any


DEFAULT_ASSETS = [
    "SOL",
    "BTC",
    "ETH",
    "JUP",
    "PYTH",
    "JTO",
    "SOL_PERP_HEDGE",
]


def discover_cufolio(root: Path) -> dict[str, Any]:
    """Summarize the local cuFOLIO snapshot without importing GPU deps."""
    cufolio_root = root / "trading_factory" / "cufolio"
    files = [
        "README.md",
        "src/cvar_optimizer.py",
        "src/cvar_parameters.py",
        "src/scenario_generation.py",
        "src/rebalance.py",
        "notebooks/cvar_basic.ipynb",
        "notebooks/rebalancing_strategies.ipynb",
    ]
    return {
        "path": str(cufolio_root),
        "present": cufolio_root.exists(),
        "files": [
            {"path": str(cufolio_root / rel), "exists": (cufolio_root / rel).exists()}
            for rel in files
        ],
        "license": "Apache-2.0",
        "upstream": "https://github.com/Solizardking/cuFOLIO",
    }


def build_mean_cvar_handoff(
    assets: list[str] | None = None,
    budget_usdc: float = 100_000.0,
    confidence: float = 0.95,
    risk_aversion: float = 2.0,
    max_leverage: float = 3.0,
    turnover_cap: float = 0.15,
    min_cash_weight: float = 0.10,
) -> dict[str, Any]:
    """Build a deterministic Mean-CVaR optimizer request for cuFOLIO/cuOpt."""
    selected_assets = assets or DEFAULT_ASSETS
    long_only_assets = [asset for asset in selected_assets if not asset.endswith("_HEDGE")]
    hedge_assets = [asset for asset in selected_assets if asset.endswith("_HEDGE")]
    w_max = {asset: 0.25 for asset in long_only_assets}
    for asset in hedge_assets:
        w_max[asset] = 0.20
    return {
        "handoff": "cufolio_mean_cvar",
        "budget_usdc": budget_usdc,
        "assets": selected_assets,
        "inputs": {
            "returns_matrix": "data/features/solana_returns.parquet",
            "scenario_returns": "data/features/solana_scenarios.parquet",
            "current_positions": "data/features/current_positions.parquet",
            "funding_costs": "data/features/phoenix_funding.parquet",
            "slippage_model": "data/features/slippage_model.parquet",
        },
        "scenario_generation": {
            "source": "cuFOLIO ForwardPathSimulator or RAPIDS/cuML KDE job",
            "lookback": "90d hourly returns",
            "samples": 10_000,
            "stress_regimes": [
                "funding_spike",
                "liquidity_gap",
                "sol_beta_shock",
                "correlation_break",
                "oracle_staleness",
            ],
        },
        "cufolio_parameters": {
            "class": "cufolio.cvar_parameters.CvarParameters",
            "w_min": 0.0,
            "w_max": w_max,
            "c_min": min_cash_weight,
            "c_max": 1.0,
            "risk_aversion": risk_aversion,
            "L_tar": max_leverage,
            "T_tar": turnover_cap,
            "confidence": confidence,
            "cardinality": min(6, len(selected_assets)),
        },
        "api_settings": {
            "preferred": "cuopt_python",
            "fallback": "cvxpy",
            "time_limit_seconds": 60,
        },
        "post_optimization_checks": [
            "timestamps_fresh",
            "cash_buffer_met",
            "turnover_within_cap",
            "perp_net_exposure_within_limit",
            "funding_cost_penalty_applied",
            "paper_execution_plan_generated",
        ],
        "execution": {
            "default_mode": "paper",
            "live_requires": [
                "explicit user approval",
                "vulcan strategy preflight reports READY",
                "fresh Phoenix ticker/orderbook/funding",
                "margin status and position list reviewed",
            ],
        },
    }

"""
Blueprint 2 — cuML KDE Monte Carlo scenario generator.

Generates return scenarios for Solana DeFi assets using GPU-accelerated
kernel density estimation when cuML is available, falling back to scipy.
"""

from __future__ import annotations

import numpy as np
from dataclasses import dataclass


@dataclass
class ScenarioResult:
    assets: list[str]
    scenarios: np.ndarray      # shape (n_scenarios, n_assets)
    n_scenarios: int
    backend: str               # "cuml" or "scipy"


def generate_scenarios(
    returns: np.ndarray,
    asset_names: list[str],
    n_scenarios: int = 10_000,
    bandwidth: float = 0.1,
) -> ScenarioResult:
    """
    Fit KDE on historical returns, sample n_scenarios Monte Carlo paths.

    Args:
        returns: (n_days, n_assets) array of daily log returns
        asset_names: list of asset ticker strings
        n_scenarios: number of scenarios to sample
        bandwidth: KDE bandwidth (Scott's rule if 0)
    """
    n_assets = returns.shape[1]
    try:
        from cuml.neighbors import KernelDensity as cuKDE
        import cupy as cp

        gpu_returns = cp.asarray(returns, dtype=cp.float32)
        samples = np.zeros((n_scenarios, n_assets), dtype=np.float32)
        for i in range(n_assets):
            col = gpu_returns[:, i : i + 1]
            bw = bandwidth if bandwidth > 0 else float(col.std()) * (len(returns) ** -0.2)
            kde = cuKDE(bandwidth=bw, kernel="gaussian")
            kde.fit(col)
            s = kde.sample(n_scenarios)
            samples[:, i] = cp.asnumpy(s).ravel()
        return ScenarioResult(asset_names, samples, n_scenarios, "cuml")

    except ImportError:
        from scipy.stats import gaussian_kde

        samples = np.zeros((n_scenarios, n_assets), dtype=np.float32)
        for i in range(n_assets):
            col = returns[:, i]
            bw = bandwidth if bandwidth > 0 else "scott"
            kde = gaussian_kde(col, bw_method=bw)
            samples[:, i] = kde.resample(n_scenarios)[0]
        return ScenarioResult(asset_names, samples, n_scenarios, "scipy")


def historical_returns(prices: dict[str, list[float]]) -> tuple[np.ndarray, list[str]]:
    """Convert price dict → log-return matrix (n_days-1, n_assets)."""
    assets = sorted(prices.keys())
    cols = []
    for a in assets:
        p = np.array(prices[a], dtype=np.float64)
        cols.append(np.diff(np.log(p)))
    min_len = min(len(c) for c in cols)
    matrix = np.column_stack([c[-min_len:] for c in cols])
    return matrix, assets


if __name__ == "__main__":
    import json, sys
    # demo with synthetic prices
    np.random.seed(42)
    prices = {
        "SOL":  (100 * np.cumprod(1 + np.random.normal(0.001, 0.04, 365))).tolist(),
        "BTC":  (30000 * np.cumprod(1 + np.random.normal(0.0005, 0.03, 365))).tolist(),
        "ETH":  (2000 * np.cumprod(1 + np.random.normal(0.0006, 0.035, 365))).tolist(),
        "BONK": (0.00001 * np.cumprod(1 + np.random.normal(0.002, 0.08, 365))).tolist(),
    }
    rets, names = historical_returns(prices)
    result = generate_scenarios(rets, names, n_scenarios=1000)
    print(f"backend={result.backend} scenarios={result.scenarios.shape}")
    print(f"mean returns: { dict(zip(result.assets, result.scenarios.mean(0).tolist())) }")

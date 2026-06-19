# Blueprint 2: Quantitative Portfolio Optimization

https://build.nvidia.com/nvidia/quantitative-portfolio-optimization

GPU-accelerated Mean-CVaR portfolio optimization for Solana spot + perps
positions using RAPIDS cuDF, cuML, and cuOpt — with cuFOLIO as the solver
backend and Clawd trust gates for live execution.

## Stack

| Component | Role |
|---|---|
| `cuML` KDE | Monte Carlo scenario generation from historical returns |
| `cuDF` | GPU DataFrame returns/backtesting |
| `cuFOLIO` / `cuOpt` | Mean-CVaR solver with CVaR/leverage/budget/cardinality constraints |
| `CVXPY` | CPU fallback solver when GPU is unavailable |
| Vulcan paper mode | Paper test before any live execution |

## Files

| File | Purpose |
|---|---|
| `scenarios.py` | cuML KDE Monte Carlo scenario generator |
| `mean_cvar.py` | Mean-CVaR optimization (cuFOLIO / CVXPY fallback) |
| `cufolio_clawd.py` | End-to-end Solana portfolio optimizer with trust gates |

## Quick start

```bash
# Paper portfolio run (no real funds)
python3 blueprints/portfolio-optimization/cufolio_clawd.py \
  --assets SOL BTC ETH BONK \
  --mode paper \
  --budget 1000

# Full optimization with CVaR constraint
python3 blueprints/portfolio-optimization/mean_cvar.py \
  --assets SOL BTC ETH \
  --cvar-alpha 0.95 \
  --max-cvar 0.10
```

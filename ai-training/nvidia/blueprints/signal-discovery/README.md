# Blueprint 4: Quantitative Signal Discovery Agent

https://build.nvidia.com/nvidia/quantitative-signal-discovery-agent
https://github.com/NVIDIA-AI-Blueprints/quantitative-signal-discovery-agent

AIQ-powered agent that discovers alpha signals in Solana perps data from
Phoenix DEX via the Vulcan CLI / RPC_URL, then surfaces tradeable triggers.

This folder adapts the local repo snapshot of
`Solizardking/quantitative-signal-discovery-agent` into Solana terms. The
upstream loop is preserved conceptually: signal ideation, Python code
generation, evaluation/backtest, and retry feedback. The local implementation
keeps execution paper-first and emits training records instead of live orders.

## Signal taxonomy

| Signal | Source | Indicator |
|---|---|---|
| RSI oversold/overbought | Phoenix candles via RPC | RSI < 30 / > 70 |
| MACD crossover | Phoenix candles | MACD line crosses signal |
| Funding rate extremes | Phoenix funding API | |funding rate| > threshold |
| OI spike | Phoenix ticker | OI change > 2σ in 1h |
| Orderbook imbalance | Phoenix L2 orderbook | bid/ask depth ratio |
| Price vs EMA divergence | Phoenix candles | price > EMA(200) × 1.05 |
| Volatility squeeze | Phoenix candles | ATR < 14-day ATR × 0.5 |

## Files

| File | Purpose |
|---|---|
| `agent.py` | Main signal discovery agent (AIQ + Vulcan integration) |
| `signals.py` | Individual signal detectors (each returns SignalResult) |
| `perps_signal_agent.py` | Phoenix perps signal agent using RPC_URL + Vulcan paper trades |

## Quick start

```bash
# Set RPC and Vulcan
export RPC_URL=https://api.mainnet-beta.solana.com
export NVIDIA_API_KEY=nvapi-...

# Discover signals on SOL-PERP (paper mode)
python3 blueprints/signal-discovery/perps_signal_agent.py \
  --market SOL \
  --mode paper \
  --loop

# Run the full AIQ agent
python3 blueprints/signal-discovery/agent.py \
  --markets SOL BTC ETH \
  --mode paper
```

# Nemotron Ultra 550B Trading Agent

`nvidia/nemotron_ultra_agent.py`

A high-level autonomous trading agent that uses
[nvidia/NVIDIA-Nemotron-3-Ultra-550B-A55B-BF16](https://huggingface.co/nvidia/NVIDIA-Nemotron-3-Ultra-550B-A55B-BF16)
as its reasoning brain for Phoenix perpetuals trading on Solana.

## Why Nemotron Ultra 550B?

| Property | Value |
|---|---|
| Parameters | 550B total, ~55B active (MoE) |
| Reasoning | Native thinking mode (`<think>...</think>`) |
| Context | 128K tokens — ingests full market snapshots + RAG docs |
| Role in Clawd stack | Teacher/judge: produces high-quality labeled decisions for student distillation |
| Student | `solanaclawd/solana-clawd-core-ai-1.5b-lora` (1.5B inference, trained on Ultra labels) |

## Quick start

```bash
# 1. Set HF_TOKEN (free serverless inference)
export HF_TOKEN=hf_...
export RPC_URL=https://api.mainnet-beta.solana.com

# 2. Single analysis tick — paper mode (no real funds)
python3 nvidia/nemotron_ultra_agent.py --market SOL --mode paper

# 3. Continuous loop across 3 markets, collect SFT training data
python3 nvidia/nemotron_ultra_agent.py \
  --markets SOL BTC ETH \
  --mode paper \
  --loop \
  --interval 300 \
  --sft-log data/ultra_sft.jsonl

# 4. Reasoning-on deep analysis (observer — no execution)
python3 nvidia/nemotron_ultra_agent.py \
  --market SOL \
  --reasoning \
  --mode observer
```

## Endpoint routing

The agent picks the first available endpoint:

| Priority | Env var | Endpoint | Model |
|---|---|---|---|
| 1 | `HF_TOKEN` | HuggingFace Serverless Inference | `nvidia/NVIDIA-Nemotron-3-Ultra-550B-A55B-BF16` |
| 2 | `NVIDIA_API_KEY` | NVIDIA NIM | `nvidia/nemotron-3-ultra-550b-a55b` |
| 3 | `CLAWD_INFERENCE_URL` | Self-hosted (vLLM / TGI / Ollama) | `solana-clawd-1.5b` |
| 4 | `CLAWD_ROUTER_KEY` | ClawdRouter free tier | `solana-clawd-1.5b` |

For the full 550B model you need **HF_TOKEN** (serverless) or **NVIDIA_API_KEY** (NIM).
Without those, the agent falls back to the 1.5B local Clawd model — useful for testing the pipeline.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│   Nemotron Ultra 550B (reasoning brain)             │
│   nvidia/NVIDIA-Nemotron-3-Ultra-550B-A55B-BF16     │
└───────────────┬─────────────────────────────────────┘
                │ thinks in <think> tags
                │ outputs structured JSON plan
                ▼
┌─────────────────────────────────────────────────────┐
│  Context assembly                                    │
│  ├─ Blueprint 4: signal scan (RSI/MACD/funding/OB)  │
│  ├─ perps/functions.py: 13 Solana tools             │
│  │   (Phoenix ticker, orderbook, paper trade, risk) │
│  ├─ Blueprint 2: Mean-CVaR portfolio weights        │
│  └─ Blueprint 5: RAG context (optional)             │
└───────────────┬─────────────────────────────────────┘
                │ JSON plan: decision + vulcan_command
                ▼
┌─────────────────────────────────────────────────────┐
│  Trust gate                                          │
│  observer → plan only                               │
│  paper    → Vulcan paper mode (no real funds)       │
│  delegated → live + human confirmation              │
│  auto     → live automatic (dangerous, gated)       │
└───────────────┬─────────────────────────────────────┘
                │ Vulcan CLI paper/live execution
                ▼
┌─────────────────────────────────────────────────────┐
│  SFT logger → data/ultra_sft.jsonl                  │
│  Teacher: Nemotron Ultra labels                      │
│  Student: solanaclawd/solana-clawd-1.5b-lora        │
└─────────────────────────────────────────────────────┘
```

## Trust gates

```bash
# Observer — plan only, never executes
--mode observer

# Paper — Vulcan paper mode, live Phoenix prices, zero real funds (DEFAULT)
--mode paper

# Delegated — live execution, confirms each order with you
--mode delegated

# Auto — fully autonomous live execution (dangerous)
--mode auto
```

**Never use `--mode auto` without:**
- Vulcan guardrails (`--max-total-notional-usdc`, `--max-price-drift-bps`)
- A funded Vulcan wallet with a hard position limit
- Explicit user sign-off

## Distillation flywheel

The agent's decisions become SFT training data for the compact student models:

```bash
# Step 1: Collect Ultra decisions
python3 nvidia/nemotron_ultra_agent.py \
  --markets SOL BTC ETH JTO JUP \
  --mode paper \
  --loop \
  --interval 300 \
  --sft-log data/ultra_sft.jsonl

# Step 2: Merge with existing NVIDIA trading factory dataset
python3 nvidia/integration/dataset_nvidia_sft.py

# Step 3: Push to Hub
python3 scripts/prepare_dataset.py \
  --input data/ultra_sft.jsonl \
  --push \
  --repo-id solanaclawd/solana-clawd-nvidia-trading-factory-instruct

# Step 4: Fine-tune student on Ultra labels
python3 scripts/train_lora.py \
  --config configs/nvidia_trading_factory_lora_config.yaml \
  --dry-run
```

## Reasoning mode

Pass `--reasoning` to enable Nemotron's native thinking mode.
Ultra will output `<think>...</think>` blocks before the JSON plan.
These are stripped before execution but kept in the SFT log (good CoT data).

```bash
python3 nvidia/nemotron_ultra_agent.py \
  --market SOL \
  --reasoning \
  --mode observer
```

## Signal integration (Blueprint 4)

The agent automatically runs all Blueprint 4 Phoenix signal detectors on each tick:

| Signal | What it catches |
|---|---|
| RSI | Oversold (<30) / overbought (>70) |
| MACD | Bullish/bearish crossover |
| Funding rate | Extreme positive (short bias) / negative (long bias) |
| Orderbook imbalance | Bid-heavy (bullish) / ask-heavy (bearish) |
| EMA divergence | Price stretched above/below EMA(50) |

Composite strength score (0–1) is included in the prompt so Ultra can weigh it against its own analysis.

## Portfolio optimization (Blueprint 2)

On each tick, the agent runs a lightweight Mean-CVaR optimization across all markets.
The resulting weights are included in the prompt as capital allocation guidance.

## Onchain registration

After collecting enough Ultra-labeled decisions and fine-tuning a student:

```bash
./dao/register_model.sh \
  --hf-model solanaclawd/solana-clawd-nvidia-trading-factory-8b-lora \
  --eval-accuracy 0.85 \
  --dataset-size 1000 \
  --endpoint https://clawd-box-router.fly.dev/v1
```

This registers the student adapter at `onchain.x402.wtf` in the CAAP/1.0 registry
so any Clawd agent can discover and load it.

## Safety contract

- Paper mode is the default and cannot be accidentally overridden
- The JSON plan always includes `"trust_gate": "paper"` unless explicitly changed
- Live execution is blocked unless `--mode delegated` or `--mode auto` is passed explicitly
- No private keys, API tokens, or wallet passwords are ever written to the SFT log
- The SFT logger strips the `raw_response` field to 2000 chars to avoid leaking long contexts

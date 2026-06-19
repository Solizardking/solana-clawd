---
license: cc-by-4.0
task_categories:
  - text-generation
  - question-answering
  - reinforcement-learning
language:
  - en
tags:
  - solana
  - trading
  - perps
  - spot
  - nvidia
  - rapids
  - cuopt
  - cufolio
  - function-calling
  - risk-management
size_categories:
  - n<1K
pretty_name: Solana Clawd NVIDIA Trading Factory Instruct
---

# Solana Clawd NVIDIA Trading Factory Instruct

Specialized SFT data for a Solana-native NVIDIA algorithmic trading factory.
It teaches data ingestion, GPU feature engineering, alpha research, cuML KDE
scenario generation, cuFOLIO/cuOpt Mean-CVaR optimization, paper execution
policy, risk controls, backtesting, monitoring, and Clawd governance.

## Format

Each row uses OpenAI-style `messages` plus metadata:

```json
{"messages": [{"role": "system", "content": "..."}, {"role": "user", "content": "..."}, {"role": "assistant", "content": "..."}], "metadata": {...}}
```

## Splits

Produced by `scripts/prepare_dataset.py` with seed `42`.

| Split | Examples |
| --- | ---: |
| train | 88 |
| eval | 4 |
| test | 6 |

## What It Covers

- Solana spot and perpetual futures research workflows.
- NVIDIA-style trading factory stages: ingestion, research, optimization, inference, execution policy, monitoring.
- RAPIDS/cuDF feature engineering and cuML KDE scenario generation.
- cuFOLIO/cuOpt Mean-CVaR optimization with leverage, budget, turnover, cardinality, and CVaR constraints.
- Clawd perps tool-use patterns for prices, funding, order books, Jupiter quotes, paper trades, wallet checks, and risk assessment.
- Safety behavior: paper-mode default, no private keys, no front-running, no sandwiching, no market manipulation, and live execution only behind explicit gates.

## Local Sources

| Path | Type | Chunks |
| --- | --- | ---: |
| `ai-training/perps/functions.py` | solana_perps_tools | 3 |
| `ai-training/perps/prompter.py` | solana_perps_prompts | 2 |
| `ai-training/perps/schema.py` | solana_perps_schema | 1 |
| `ai-training/perps/functioncall.py` | solana_perps_agent | 3 |
| `ai-training/onchainai.md` | onchain_ai_reference | 3 |
| `ai-training/README.md` | training_pipeline_reference | 3 |
| `AGENTS.md` | clawd_agent_catalog | 3 |
| `ai-training/data/realtime_research_dataset_manifest.json` | research_dataset_manifest | 3 |

## External References

| Reference | URL |
| --- | --- |
| NVIDIA AI Algorithmic Trading Factories | https://www.nvidia.com/en-us/use-cases/ai-algorithmic-trading-factories/ |
| NVIDIA Quantitative Portfolio Optimization Blueprint | https://build.nvidia.com/nvidia/quantitative-portfolio-optimization |
| Solizardking/cuFOLIO | https://github.com/Solizardking/cuFOLIO |

## Intended Use

Fine-tune a tool-use-capable instruct model, such as Hermes-3-Llama-3.1-8B, into
a Solana trading-factory planner. This dataset is for research, optimization,
simulation, and execution-policy training. It is not a live trading signal feed.

## Safety

The dataset intentionally defaults to paper trading. It refuses front-running,
sandwich attacks, wallet draining, private-key handling, sanctions evasion, and
market manipulation. Live execution must be handled outside the dataset through
an explicitly approved execution layer.

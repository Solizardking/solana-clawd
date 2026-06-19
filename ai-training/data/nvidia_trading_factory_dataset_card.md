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
| train | 127 |
| eval | 7 |
| test | 8 |

## What It Covers

- Solana spot and perpetual futures research workflows.
- NVIDIA-style trading factory stages: ingestion, research, optimization, inference, execution policy, monitoring.
- RAPIDS/cuDF feature engineering and cuML KDE scenario generation.
- cuFOLIO/cuOpt Mean-CVaR optimization with leverage, budget, turnover, cardinality, and CVaR constraints.
- Vulcan/Phoenix paper strategy configs, command plans, and lifecycle guardrails.
- Rise/Phoenix read-only market data plans for exchange, market, candle, orderbook, funding, and trader state.
- Clawd perps tool-use patterns for prices, funding, order books, Jupiter quotes, paper trades, wallet checks, and risk assessment.
- Safety behavior: paper-mode default, no private keys, no front-running, no sandwiching, no market manipulation, and live execution only behind explicit gates.

## Local Sources

| Path | Type | Chunks |
| --- | --- | ---: |
| `ai-training/trading_factory/README.md` | trading_factory_workspace | 1 |
| `ai-training/trading_factory/solana_factory/factory.py` | solana_trading_factory_adapter | 2 |
| `ai-training/trading_factory/solana_factory/vulcan_specs.py` | vulcan_strategy_specs | 3 |
| `ai-training/trading_factory/solana_factory/rise_client.py` | rise_readonly_client | 1 |
| `ai-training/trading_factory/solana_factory/cufolio_adapter.py` | cufolio_optimization_handoff | 2 |
| `ai-training/data/strategies/strategy_manifest.json` | generated_strategy_manifest | 2 |
| `ai-training/data/strategies/cufolio_mean_cvar_handoff.json` | generated_cufolio_handoff | 1 |
| `ai-training/data/strategies/rise_market_data_plan.json` | generated_rise_data_plan | 1 |
| `ai-training/data/strategies/vulcan_command_plans.json` | generated_vulcan_command_plans | 1 |
| `ai-training/trading_factory/cufolio/README.md` | cufolio_reference | 3 |
| `ai-training/trading_factory/cufolio/src/cvar_optimizer.py` | cufolio_cvar_optimizer | 3 |
| `ai-training/trading_factory/cufolio/src/cvar_parameters.py` | cufolio_cvar_parameters | 1 |
| `ai-training/trading_factory/cufolio/src/scenario_generation.py` | cufolio_scenario_generation | 3 |
| `ai-training/trading_factory/cufolio/src/rebalance.py` | cufolio_rebalancing | 3 |
| `ai-training/trading_factory/clawd-autoresearch-wiki/perps/vulcan.py` | autoresearch_vulcan_reference | 3 |
| `ai-training/trading_factory/clawd-autoresearch-wiki/perps/rise.py` | autoresearch_rise_reference | 1 |
| `ai-training/trading_factory/clawd-autoresearch-wiki/perps/paper.py` | autoresearch_paper_reference | 3 |
| `ai-training/trading_factory/clawd-autoresearch-wiki/strategy.md` | autoresearch_strategy_reference | 0 |
| `ai-training/trading_factory/clawd-autoresearch-wiki/strategy/ta.py` | autoresearch_ta_reference | 3 |
| `ai-training/trading_factory/clawd-autoresearch-wiki/strategy/grid.py` | autoresearch_grid_reference | 2 |
| `ai-training/trading_factory/clawd-autoresearch-wiki/strategy/twap.py` | autoresearch_twap_reference | 1 |
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
| Phoenix Vulcan CLI Strategies | https://docs.phoenix.trade/cli/strategies |
| Phoenix Rise SDK | https://docs.phoenix.trade/sdk/rise |
| Phoenix Account Health and Leverage Tiers | https://docs.phoenix.trade/phoenix/margin-and-risk/account-health |
| Solizardking/clawd-autoresearch-wiki perps | https://github.com/Solizardking/clawd-autoresearch-wiki/tree/main/perps |

## Intended Use

Fine-tune a tool-use-capable instruct model, such as Hermes-3-Llama-3.1-8B, into
a Solana trading-factory planner. This dataset is for research, optimization,
simulation, and execution-policy training. It is not a live trading signal feed.

## Safety

The dataset intentionally defaults to paper trading. It refuses front-running,
sandwich attacks, wallet draining, private-key handling, sanctions evasion, and
market manipulation. Live execution must be handled outside the dataset through
an explicitly approved execution layer.

## Source And License Notes

Generated SFT rows are released as CC-BY-4.0. Source excerpts retain their
upstream attribution and licenses. The local cuFOLIO snapshot is Apache-2.0.
The clawd-autoresearch-wiki perps files are treated as Solizardking project
reference material for this training lane; clarify licensing before
redistributing those raw source files outside the controlled training release.

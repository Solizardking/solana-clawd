# NVIDIA Integration Map

`nvidia/integration/` is the bridge layer between the Solana Clawd training
workspace and NVIDIA AI Blueprints. Files in this folder are source code; caches
under `__pycache__/` are generated and should not be committed.

## Modules

| Module | Inputs | Outputs | Notes |
| --- | --- | --- | --- |
| `clawd_nim_bridge.py` | Chat messages, signal summaries, blueprint summaries, `NVIDIA_API_KEY`, `HF_TOKEN`, `CLAWD_INFERENCE_URL`, `CLAWD_ROUTER_KEY` | OpenAI-compatible chat responses | Route order is NVIDIA NIM, Hugging Face, self-hosted Clawd, Clawd Router, then local Ollama. |
| `dataset_nvidia_sft.py` | `data/nvidia_signal_log.jsonl`, `data/nvidia_aiq_results.json`, `data/nvidia_trading_factory_sft.jsonl`, `data/strategies/nemo_clawd_*.json` | NVIDIA SFT JSONL records | Normalizes blueprint output into Clawd chat-format training data. |
| `nemo_clawd.py` | Local `core-ai/` tree, repo governance files, package metadata, skills, MCP files | `data/strategies/nemo_clawd_core_inventory.json`, `data/strategies/nemo_clawd_blueprint.json` | Builds a mount contract and sandbox/network/lifecycle blueprint without vendoring Core AI. |
| `nemo_clawd_agent.py` | Trading Factory plan, markets, default mode, optional Core AI root | `data/strategies/nvidia_clawd_agent_plan.json` plus NemoClawd assets | Keeps the generated plan observer/paper by default. |
| `trading_factory_nvidia.py` | Signal-discovery composite signals, NemoClawd policy summary, `RPC_URL` | `data/strategies/nvidia_<market>_<direction>_signal.json` | Emits Vulcan TA configs for paper-mode strategy runs. |

## Operational Flow

```text
NVIDIA Blueprints
  -> clawd_nim_bridge.py
  -> signal-discovery / AIQ / RAG / distillation
  -> dataset_nvidia_sft.py
  -> scripts/prepare_dataset.py
  -> train_lora.py or HF Jobs
  -> Hugging Face / Ollama / onchain.x402.wtf

Core AI runtime
  -> nemo_clawd.py
  -> nemo_clawd_agent.py
  -> trading_factory/solana_factory/nvidia_agent.py
  -> data/strategies/*.json

Signal discovery
  -> trading_factory_nvidia.py
  -> Vulcan paper strategy configs
```

## Commands

Run from `ai-training/`:

```bash
python3 nvidia/integration/nemo_clawd.py --write --check
python3 nvidia/integration/nemo_clawd_agent.py --markets SOL BTC ETH JUP PYTH JTO --mode paper
python3 nvidia/integration/dataset_nvidia_sft.py --help
python3 nvidia/scripts/verify_nvidia.py --strict
```

## Security Contract

- Never write API tokens, wallet material, OAuth credentials, or private keys to
  generated plans.
- Keep live execution out of this layer. Generated trading artifacts are paper
  plans until a separate trust gate authorizes otherwise.
- Treat routed model output as advisory text, not as an executable transaction.
- Keep `__pycache__/` and other generated artifacts out of git.

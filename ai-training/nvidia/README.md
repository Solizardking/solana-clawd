# NVIDIA AI Blueprints — Solana Clawd Integration

This folder integrates six NVIDIA AI Blueprints and the cuFOLIO portfolio
optimization library into the Solana Clawd AI training pipeline.

## Blueprints

| Blueprint | Folder | What it does for Clawd |
|---|---|---|
| [Transaction Foundation Model](https://build.nvidia.com/nvidia/build-your-own-transaction-foundation-model) | `blueprints/transaction-foundation-model/` | Fine-tunes a Solana-native foundation model on raw tx/block data using NeMo |
| [Quantitative Portfolio Optimization](https://build.nvidia.com/nvidia/quantitative-portfolio-optimization) | `blueprints/portfolio-optimization/` | GPU-accelerated Mean-CVaR optimization for Solana spot + perps portfolios |
| [AI Model Distillation for Financial Data](https://build.nvidia.com/nvidia/ai-model-distillation-for-financial-data) | `blueprints/model-distillation/` | Distills Hermes-3-8B or Qwen2.5-7B teacher into the 1.5B Clawd student |
| [Quantitative Signal Discovery Agent](https://build.nvidia.com/nvidia/quantitative-signal-discovery-agent) | `blueprints/signal-discovery/` | AIQ agent that finds alpha signals in Solana DEX/perps on-chain data |
| [Enterprise RAG Pipeline](https://build.nvidia.com/nvidia/build-an-enterprise-rag-pipeline) | `blueprints/enterprise-rag/` | NeMo Retriever RAG over Solana docs, skills, and protocol specs |
| [AIQ Toolkit](https://build.nvidia.com/nvidia/aiq) | `blueprints/aiq/` | Evaluates and stress-tests Clawd agent pipelines end-to-end |
| [cuFOLIO](https://github.com/NVIDIA-AI-Blueprints/cuFOLIO) | `cufolio/` | GPU portfolio optimization: scenarios, CVaR, rebalancing, constraint solver |

## Quick start

```bash
# 1. Set your NVIDIA API key (from build.nvidia.com)
export NVIDIA_API_KEY=nvapi-...

# 2. Install the NVIDIA stack
bash nvidia/scripts/setup_nvidia.sh

# 3. Run a specific blueprint
python3 nvidia/blueprints/signal-discovery/agent.py --mode paper

# 4. Verify the full integration
python3 nvidia/scripts/verify_nvidia.py
```

## Environment variables

| Variable | Required for |
|---|---|
| `NVIDIA_API_KEY` | All NIM API calls, NeMo, nv-ingest, cuFOLIO |
| `HF_TOKEN` | Publishing SFT datasets to Hub |
| `WANDB_API_KEY` | Training metric logging |
| `CLAWD_INFERENCE_URL` | Pointing signal agent at your local Clawd endpoint |

Keep all keys in your shell or secret manager. Never write them to YAML, JSON, or markdown files.

## Integration map

```
Solana on-chain data
  └─► blueprints/transaction-foundation-model/  ─── NeMo CPT → tx embeddings
        └─► blueprints/model-distillation/      ─── distill 8B → 1.5B Clawd
              └─► blueprints/signal-discovery/  ─── AIQ agent finds alpha
                    └─► cufolio/                ─── GPU Mean-CVaR portfolio
                          └─► blueprints/portfolio-optimization/
                                └─► integration/trading_factory_nvidia.py
                                      └─► ../trading_factory/ (Vulcan/Phoenix exec)

Solana docs + PDFs
  └─► blueprints/enterprise-rag/               ─── NeMo Retriever RAG index
        └─► blueprints/aiq/                   ─── AIQ eval of full pipeline
```

## Folder layout

```
nvidia/
├── README.md                            ← this file
├── blueprints/
│   ├── transaction-foundation-model/    ← Blueprint 1: NeMo tx foundation model
│   ├── portfolio-optimization/          ← Blueprint 2: cuML/cuDF/cuOpt CVaR
│   ├── model-distillation/             ← Blueprint 3: teacher→student distill
│   ├── signal-discovery/               ← Blueprint 4: AIQ signal agent
│   ├── enterprise-rag/                 ← Blueprint 5: NeMo Retriever RAG
│   └── aiq/                            ← Blueprint 6: AIQ eval toolkit
├── cufolio/                             ← cuFOLIO: GPU portfolio optimizer
├── configs/                             ← NIM / NeMo / AIQ YAML configs
├── scripts/                             ← Setup, run, verify
└── integration/                         ← Bridges to trading_factory + Clawd
```

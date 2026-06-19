# Blueprint 1: Build Your Own Transaction Foundation Model

https://build.nvidia.com/nvidia/build-your-own-transaction-foundation-model

Fine-tunes a Solana-native transaction foundation model using NVIDIA NeMo
on raw block/transaction data, then injects the learned tx embeddings into
the Clawd SFT pipeline as a continued pre-training (CPT) stage.

## Architecture

```
Solana raw tx JSONL
  └─► dataset_builder.py   ← normalize tx fields into NeMo text format
        └─► NeMo CPT config (config.yaml)
              └─► NIM inference endpoint  ← serves tx embeddings
                    └─► integration/clawd_nim_bridge.py
```

## Files

| File | Purpose |
|---|---|
| `dataset_builder.py` | Converts Solana tx/block data to NeMo CPT format |
| `finetune.py` | Launches NeMo fine-tuning job against NVIDIA NIM |
| `config.yaml` | NeMo CPT training config |

## Quick start

```bash
export NVIDIA_API_KEY=nvapi-...

# Build tx CPT dataset from existing Solana training data
python3 blueprints/transaction-foundation-model/dataset_builder.py \
  --input ../../data/solana_clawd_merged.jsonl \
  --output ../../data/nvidia_tx_cpt.jsonl

# Launch fine-tuning via NIM
python3 blueprints/transaction-foundation-model/finetune.py \
  --dataset ../../data/nvidia_tx_cpt.jsonl \
  --dry-run
```

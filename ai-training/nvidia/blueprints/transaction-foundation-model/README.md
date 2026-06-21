# Blueprint 1: Build Your Own Transaction Foundation Model

https://build.nvidia.com/nvidia/build-your-own-transaction-foundation-model

Fine-tunes a Solana-native transaction foundation model using NVIDIA NeMo
on raw block/transaction data, then injects the learned tx embeddings into
the Clawd SFT pipeline as a continued pre-training (CPT) stage.

This directory is the Clawd production adaptation of the NVIDIA blueprint. It
supports two local paths:

- **TRL/Qwen path**: CPT on `{"text": ...}` transaction records, then SFT on the
  Clawd instruction corpus.
- **NeMo AutoModel path**: decoder pretraining with `pretrain_solana_decoder.yaml`
  and `src/solana_clm_data.py`.

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
| `pipeline.py` | End-to-end collect -> CPT -> SFT -> evaluate -> push runner |
| `post_train.py` | Continue release after a training job: manifest, eval, bundle, registry dry-run/live gate |
| `notebook_bridge.py` | Keeps notebooks wired to the Solana/Clawd bootstrap and artifact checks |
| `collect.py` | Multi-source CPT collector: Jupiter, RPC/Phoenix, SFT, DeepSolana, BigQuery |
| `dataset_builder.py` | Converts Solana tx/block data to NeMo CPT format |
| `bigquery_collector.py` | BigQuery public Solana mainnet DEX transaction exporter |
| `jupiter_tx_collector.py` | Jupiter swap quote collector |
| `train.py` | Local TRL CPT/SFT trainer for `solanaclawd/solana-tx-foundation-1.5b` |
| `train_decoder_model.py` | NeMo AutoModel decoder pretraining entry point |
| `evaluate.py` | Solana transaction benchmark evaluator |
| `finetune.py` | Launches NeMo fine-tuning job against NVIDIA NIM |
| `config.yaml` | Local nested NeMo CPT config |
| `../../configs/solana_tx_foundation.yaml` | Unified production config consumed by the CLI |

## Quick start

```bash
cd /Users/8bit/Downloads/solana-clawd/ai-training

# Check the full plan without training
python3 nvidia/blueprints/transaction-foundation-model/pipeline.py --dry-run

# No-cost readiness report, including smoke dry-run
python3 nvidia/blueprints/transaction-foundation-model/preflight.py

# Collect or refresh CPT data
python3 nvidia/blueprints/transaction-foundation-model/pipeline.py \
  --stages collect --collect-count 2000

# Prepare processed splits for the CPT dataset
python3 scripts/prepare_dataset.py \
  --input data/tx_foundation_cpt.jsonl \
  --output data/tx_foundation_cpt_processed \
  --format text \
  --train-ratio 0.9 --eval-ratio 0.05 --seed 42

# Continue pretraining and SFT locally
python3 nvidia/blueprints/transaction-foundation-model/pipeline.py \
  --stages cpt sft

# Tiny local/cache smoke run plan
python3 nvidia/blueprints/transaction-foundation-model/pipeline.py \
  --dry-run --smoke --stages cpt sft evaluate push
```

## Remote HF Jobs Training

Launch the CPT+SFT job on Hugging Face Jobs:

```bash
cd /Users/8bit/Downloads/solana-clawd/ai-training
bash scripts/launch_transaction_foundation_hf_job.sh a100-large 6h
```

The launcher runs `train.py --stage both --push`, writes model output under
`/data/outputs/solana-tx-foundation-1.5b`, and pushes to
`solanaclawd/solana-tx-foundation-1.5b` when `HF_TOKEN` is available.

If HF returns `402 Payment Required`, add Hugging Face Jobs credits to the
authenticated account and re-run the launch command. The launcher writes a
diagnostic log under `outputs/job-launches/`.

Watch a launched job and run the post-train continuation when it succeeds:

```bash
bash scripts/watch_transaction_foundation_hf_job.sh <JOB_ID>

# Optional success actions:
EVALUATE=1 BUNDLE=1 REGISTER=1 \
  bash scripts/watch_transaction_foundation_hf_job.sh <JOB_ID>
```

## After The Training Job Finishes

Run the continuation command first. By default it writes local release metadata
only; it does not upload, register live, or touch onchain state.

```bash
cd /Users/8bit/Downloads/solana-clawd/ai-training
bash scripts/after_transaction_foundation_job.sh
```

Useful opt-ins:

```bash
# Evaluate the trained local model or configured Hub model
EVALUATE=1 bash scripts/after_transaction_foundation_job.sh

# Build a secret-scanned Hugging Face release bundle for the CPT dataset
BUNDLE=1 bash scripts/after_transaction_foundation_job.sh

# Dry-run registry command for onchain.x402.wtf metadata
REGISTER=1 bash scripts/after_transaction_foundation_job.sh
```

The Python equivalent is:

```bash
python3 nvidia/blueprints/transaction-foundation-model/post_train.py \
  --evaluate \
  --bundle \
  --register
```

Live registry or onchain writes require explicit confirmation:

```bash
python3 nvidia/blueprints/transaction-foundation-model/post_train.py \
  --live-register \
  --yes
```

## Model Kit CLI

The model kit now exposes the lane directly:

```bash
python3 model-kit/clawd_model_kit.py train \
  --lane tx-foundation \
  --train-dry-run

python3 model-kit/clawd_model_kit.py nvidia tx-preflight --strict
python3 model-kit/clawd_model_kit.py nvidia tx-foundation --strict
```

## Notebook Sync

The five NVIDIA reference notebooks include a Clawd Solana bootstrap cell. Keep
that cell synchronized after script/config changes:

```bash
python3 nvidia/blueprints/transaction-foundation-model/notebook_bridge.py --sync
python3 nvidia/blueprints/transaction-foundation-model/notebook_bridge.py --check
```

## Outputs

| Artifact | Path |
|---|---|
| CPT JSONL | `data/tx_foundation_cpt.jsonl` |
| Processed CPT splits | `data/tx_foundation_cpt_processed/` |
| Dataset card | `data/tx_foundation_cpt_dataset_card.md` |
| Dataset manifest | `data/tx_foundation_cpt_manifest.json` |
| Eval output | `data/tx_foundation_eval.json` |
| Preflight report | `outputs/tx_foundation_preflight.json` |
| Local model output | `outputs/solana-tx-foundation-1.5b/` |
| Model card | `outputs/solana-tx-foundation-1.5b-model-card.md` |

## Secrets And Safety

- Keep `HF_TOKEN`, `NVIDIA_API_KEY`, Google ADC, wallet keys, and registry keys in
  the shell or platform secret store only.
- The default post-train path is local metadata only.
- `--push`, `--live-register`, and `--onchain` style operations require explicit
  flags in the relevant CLI.

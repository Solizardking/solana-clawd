#!/usr/bin/env bash
# Launch a separate NVIDIA Trading Factory LoRA training job on Hugging Face.
#
# This does not touch or cancel any currently running HF job.
#
# Required:
#   HF_TOKEN        Hugging Face token with dataset/model/job access, or
#                   an existing `hf auth login` session
#
# Optional:
#   WANDB_API_KEY  Weights & Biases API key. If absent, launch without W&B.
#
# Usage:
#   ./scripts/launch_trading_factory_hf_job.sh
#   ./scripts/launch_trading_factory_hf_job.sh a100-large 4h

set -euo pipefail

FLAVOR="${1:-a100-large}"
TIMEOUT="${2:-4h}"
DATASET_REPO="${DATASET_REPO:-solanaclawd/solana-clawd-nvidia-trading-factory-instruct}"
BASE_MODEL="${BASE_MODEL:-NousResearch/Hermes-3-Llama-3.1-8B}"
HUB_MODEL_ID="${HUB_MODEL_ID:-solanaclawd/solana-nvidia-trading-factory-8b-lora}"
NUM_EPOCHS="${NUM_EPOCHS:-3}"
RUN_NAME="${WANDB_RUN_NAME:-nvidia-trading-factory-8b-lora-$(date -u +%Y%m%dT%H%M%SZ)}"

if [[ -z "${HF_TOKEN:-}" ]]; then
  if HF_TOKEN="$(hf auth token 2>/dev/null)"; then
    export HF_TOKEN
    echo "Using Hugging Face token from existing hf auth session."
  else
    echo "HF_TOKEN is required, or run: hf auth login" >&2
    exit 1
  fi
fi

JOB_SECRET_ARGS=(--secrets HF_TOKEN)
JOB_ENV_ARGS=(
  --env HF_HOME=/data/hf_cache
  --env HF_DATASETS_CACHE=/data/hf_cache/datasets
  --env TRANSFORMERS_CACHE=/data/hf_cache
)
TRAIN_ARGS=(
  --config configs/nvidia_trading_factory_lora_config.yaml
  --dataset-repo "$DATASET_REPO"
  --base-model "$BASE_MODEL"
  --output-dir /data/outputs/solana-nvidia-trading-factory-8b-lora
  --hub-model-id "$HUB_MODEL_ID"
  --num-epochs "$NUM_EPOCHS"
  --push
)

if [[ -n "${WANDB_API_KEY:-}" ]]; then
  JOB_SECRET_ARGS+=(--secrets WANDB_API_KEY)
  JOB_ENV_ARGS+=(--env WANDB_PROJECT=solana-clawd-trading-factory --env "WANDB_RUN_NAME=$RUN_NAME")
  TRAIN_ARGS+=(--wandb)
else
  echo "WANDB_API_KEY is not set; launching without W&B tracking." >&2
fi

hf jobs uv run scripts/train_lora.py \
  --flavor "$FLAVOR" \
  --timeout "$TIMEOUT" \
  "${JOB_SECRET_ARGS[@]}" \
  "${JOB_ENV_ARGS[@]}" \
  --label solana-clawd-trading-factory \
  --detach \
  -- \
  "${TRAIN_ARGS[@]}"

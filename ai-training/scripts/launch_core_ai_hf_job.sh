#!/usr/bin/env bash
# Launch Core AI LoRA training on Hugging Face Jobs.
#
# Required:
#   HF_TOKEN        Hugging Face token with dataset/model/job access, or
#                   an existing `hf auth login` session
# Optional:
#   WANDB_API_KEY  Weights & Biases API key. If absent, launch without W&B.
#
# Usage:
#   ./scripts/launch_core_ai_hf_job.sh
#   ./scripts/launch_core_ai_hf_job.sh a100-large
#   ./scripts/launch_core_ai_hf_job.sh l40sx1 6h

set -euo pipefail

FLAVOR="${1:-a100-large}"
TIMEOUT="${2:-4h}"
RUN_NAME="${WANDB_RUN_NAME:-core-ai-1.5b-lora-a100-$(date -u +%Y%m%dT%H%M%SZ)}"

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
  --config none
  --dataset-repo solanaclawd/solana-clawd-core-ai-instruct
  --base-model Qwen/Qwen2.5-1.5B-Instruct
  --output-dir /data/outputs/core-ai-clawd-1.5b-lora
  --hub-model-id solanaclawd/solana-clawd-core-ai-1.5b-lora
  --num-epochs 1
  --push
  --no-eval
  --no-checkpoints
  --no-quant
)

if [[ -n "${WANDB_API_KEY:-}" ]]; then
  JOB_SECRET_ARGS+=(--secrets WANDB_API_KEY)
  JOB_ENV_ARGS+=(--env WANDB_PROJECT=solana-clawd-core-ai --env "WANDB_RUN_NAME=$RUN_NAME")
  TRAIN_ARGS+=(--wandb)
else
  echo "WANDB_API_KEY is not set; launching without W&B tracking." >&2
fi

hf jobs uv run scripts/train_lora.py \
  --flavor "$FLAVOR" \
  --timeout "$TIMEOUT" \
  "${JOB_SECRET_ARGS[@]}" \
  "${JOB_ENV_ARGS[@]}" \
  --label solana-clawd-core-ai \
  --detach \
  -- \
  "${TRAIN_ARGS[@]}"

#!/usr/bin/env bash
# Launch Core AI LoRA training on Hugging Face Jobs with W&B tracking.
#
# Required environment:
#   HF_TOKEN        Hugging Face token with dataset/model/job access
#   WANDB_API_KEY  Weights & Biases API key
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
  echo "HF_TOKEN is required" >&2
  exit 1
fi

if [[ -z "${WANDB_API_KEY:-}" ]]; then
  echo "WANDB_API_KEY is required" >&2
  exit 1
fi

hf jobs uv run scripts/train_lora.py \
  --flavor "$FLAVOR" \
  --timeout "$TIMEOUT" \
  --secrets HF_TOKEN \
  --secrets WANDB_API_KEY \
  --env HF_HOME=/data/hf_cache \
  --env HF_DATASETS_CACHE=/data/hf_cache/datasets \
  --env TRANSFORMERS_CACHE=/data/hf_cache \
  --env WANDB_PROJECT=solana-clawd-core-ai \
  --env "WANDB_RUN_NAME=$RUN_NAME" \
  --label solana-clawd-core-ai \
  --detach \
  -- \
  --config none \
  --dataset-repo solanaclawd/solana-clawd-core-ai-instruct \
  --base-model Qwen/Qwen2.5-1.5B-Instruct \
  --output-dir /data/outputs/core-ai-clawd-1.5b-lora \
  --hub-model-id solanaclawd/solana-clawd-core-ai-1.5b-lora \
  --num-epochs 1 \
  --push \
  --no-eval \
  --no-checkpoints \
  --no-quant \
  --wandb

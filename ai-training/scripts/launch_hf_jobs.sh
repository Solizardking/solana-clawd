#!/usr/bin/env bash
# Launch LoRA training on Hugging Face Jobs (remote GPU).
#
# This script uses `hf jobs uv run` to spin up an HF-managed GPU container,
# pull the latest training scripts from this repo, install deps, and run
# train_lora.py with a chosen hardware flavor.
#
# Usage:
#   ./scripts/launch_hf_jobs.sh                # default: a100-large
#   ./scripts/launch_hf_jobs.sh h200           # 80GB H200
#   ./scripts/launch_hf_jobs.sh a100x4         # 4xA100 80GB (DDP)
#   ./scripts/launch_hf_jobs.sh l4x1           # cheaper 24GB L4
#
# Prereqs:
#   - hf CLI >= 1.19.0 (`pip install --upgrade huggingface_hub`)
#   - hf auth login
#   - solanaclawd/solana-clawd-instruct already exists on the Hub
#
# Monitor:
#   hf jobs ps
#   hf jobs logs <JOB_ID> --follow
#   hf jobs inspect <JOB_ID>

set -euo pipefail

FLAVOR="${1:-a100-large}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# A100-80GB / H100 / H200 / L4 / A10G flavors supported.
case "$FLAVOR" in
  a10g-large|a10g-largex2|a10g-largex4) ;;
  a100-large|a100x4|a100x8) ;;
  h200|h200x2|h200x4|h200x8) ;;
  l4x1|l4x4) ;;
  l40sx1|l40sx4|l40sx8) ;;
  rtx-pro-6000|rtx-pro-6000x2|rtx-pro-6000x4|rtx-pro-6000x8) ;;
  t4-small|t4-medium) ;;
  *)
    echo "Unknown flavor: $FLAVOR" >&2
    echo "Try: a100-large, a100x4, h200, l4x1, l40sx4, rtx-pro-6000" >&2
    exit 1
    ;;
esac

cd "$ROOT_DIR"

echo "Launching HF Jobs training on $FLAVOR..."
echo "  scripts:   $ROOT_DIR/scripts"
echo "  configs:   $ROOT_DIR/configs"
echo "  dataset:   solanaclawd/solana-clawd-instruct"
echo "  output:    $ROOT_DIR/outputs (mirrored to Hub)"
echo

# We pass the whole repo as the working dir so the job sees scripts/, configs/, data/.
# `hf jobs uv run` will resolve dependencies from requirements.txt if present.

hf jobs uv run "$ROOT_DIR/scripts/train_lora.py" \
  --flavor "$FLAVOR" \
  --timeout 4h \
  --secrets HF_TOKEN \
  --env-file <(printf "HUGGING_FACE_HUB_TOKEN=%s\n" "${HF_TOKEN:-}") \
  --detach

echo
echo "Job submitted. To monitor:"
echo "  hf jobs ps"
echo "  hf jobs logs <JOB_ID> --follow"

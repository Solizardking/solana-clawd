#!/usr/bin/env bash
# Launch LoRA training on Hugging Face Jobs (remote GPU).
#
# This script uses `hf jobs uv run` to spin up an HF-managed GPU container,
# pull the latest training scripts from this repo, install deps, and run
# train_lora.py with a chosen hardware flavor.
#
# Usage:
#   ./scripts/launch_hf_jobs.sh                             # default: a100-large, lora_config.yaml
#   ./scripts/launch_hf_jobs.sh h200                        # 80GB H200
#   ./scripts/launch_hf_jobs.sh a100x4                      # 4xA100 80GB (DDP)
#   ./scripts/launch_hf_jobs.sh l4x1                        # cheaper 24GB L4
#   ./scripts/launch_hf_jobs.sh a100-large glm52            # GLM-5.2 config on A100
#   ./scripts/launch_hf_jobs.sh h200 glm52                  # GLM-5.2 on H200 (fastest)
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
CONFIG_KEY="${2:-}"                  # e.g. "glm52", "hermes3", "cpt" — maps to configs/<key>_lora_config.yaml
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# Resolve config path from short key
case "$CONFIG_KEY" in
  glm52|glm)  CONFIG_PATH="configs/glm52_lora_config.yaml" ;;
  hermes3|8b) CONFIG_PATH="configs/hermes3_lora_config.yaml" ;;
  cpt)        CONFIG_PATH="configs/deep_solana_cpt_config.yaml" ;;
  "")         CONFIG_PATH="configs/lora_config.yaml" ;;
  *.yaml)     CONFIG_PATH="$CONFIG_KEY" ;;
  *)
    echo "Unknown config key: $CONFIG_KEY" >&2
    echo "Try: glm52, hermes3, cpt, or a full .yaml path" >&2
    exit 1
    ;;
esac

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
echo "  config:    $CONFIG_PATH"
echo "  scripts:   $ROOT_DIR/scripts"
echo "  configs:   $ROOT_DIR/configs"
echo "  dataset:   solanaclawd/solana-clawd-instruct"
echo "  output:    $ROOT_DIR/outputs (mirrored to Hub)"
echo

# We pass the whole repo as the working dir so the job sees scripts/, configs/, data/.
# `hf jobs uv run` will resolve dependencies from requirements.txt if present.

hf jobs uv run "$ROOT_DIR/scripts/train_lora.py" \
  --flavor "$FLAVOR" \
  --timeout 6h \
  --secrets HF_TOKEN,WANDB_API_KEY \
  --env WANDB_PROJECT=clawd \
  --env WANDB_ENTITY=clawdsolana-clawd \
  --env-file <(printf "HUGGING_FACE_HUB_TOKEN=%s\n" "${HF_TOKEN:-}") \
  --detach \
  -- --config "$CONFIG_PATH"

echo
echo "Job submitted. To monitor:"
echo "  hf jobs ps"
echo "  hf jobs logs <JOB_ID> --follow"

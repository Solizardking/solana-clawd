#!/usr/bin/env bash
# Build, process, and publish the NVIDIA Trading Factory dataset.
#
# This script requires either HF_TOKEN in the environment or an existing
# `hf auth login` session. It never accepts tokens as CLI arguments.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

REPO_ID="${REPO_ID:-solanaclawd/solana-clawd-nvidia-trading-factory-instruct}"
CONFIG="${CONFIG:-configs/nvidia_trading_factory_config.yaml}"
JSONL="${JSONL:-data/nvidia_trading_factory_sft.jsonl}"
PROCESSED_DIR="${PROCESSED_DIR:-data/nvidia_trading_factory_processed}"
CARD="${CARD:-data/nvidia_trading_factory_dataset_card.md}"

if [[ -z "${HF_TOKEN:-}" ]]; then
  if ! hf auth whoami >/dev/null 2>&1; then
    echo "HF_TOKEN is required, or run: hf auth login" >&2
    exit 1
  fi
fi

python3 scripts/build_solana_trading_factory_strategies.py

python3 scripts/build_nvidia_trading_factory_dataset.py --config "$CONFIG"

python3 scripts/prepare_dataset.py \
  --input "$JSONL" \
  --output "$PROCESSED_DIR" \
  --train-ratio 0.9 \
  --eval-ratio 0.05 \
  --seed 42 \
  --push \
  --repo-id "$REPO_ID"

hf upload "$REPO_ID" "$CARD" README.md \
  --type dataset \
  --commit-message "Update NVIDIA trading factory dataset card"

python3 scripts/verify_trading_factory_release.py --strict --dataset "$REPO_ID"

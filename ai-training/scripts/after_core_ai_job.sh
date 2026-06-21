#!/usr/bin/env bash
# Run this after the current Core AI 1.5B LoRA HF job completes.
#
# Steps:
#   1. Verify the Core AI job finished (optional watch)
#   2. Push the updated NVIDIA Trading Factory dataset to HF Hub
#   3. Launch the Trading Factory 8B LoRA job on a100-large
#
# Required env:
#   HF_TOKEN  — HF write token (or existing `hf auth login` session)
#
# Optional env:
#   WANDB_API_KEY  — W&B tracking key
#   GPU_FLAVOR     — default: a100-large
#   TIMEOUT        — default: 6h
#   SKIP_VERIFY    — set to 1 to skip Core AI job verification
#
# Usage:
#   export HF_TOKEN=hf_...
#   bash scripts/after_core_ai_job.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

GPU="${GPU_FLAVOR:-a100-large}"
TIMEOUT="${TIMEOUT:-6h}"

green()  { printf '\033[0;32m%s\033[0m\n' "$*"; }
yellow() { printf '\033[1;33m%s\033[0m\n' "$*"; }
die()    { printf '\033[0;31mERROR: %s\033[0m\n' "$*" >&2; exit 1; }

# ── Auth check ────────────────────────────────────────────────────────────────
if [[ -z "${HF_TOKEN:-}" ]]; then
  if ! hf auth whoami >/dev/null 2>&1; then
    die "Set HF_TOKEN in your environment, or run: hf auth login"
  fi
  export HF_TOKEN="$(hf auth token 2>/dev/null || echo "")"
fi

green "=== Step 1: Rebuild NVIDIA Trading Factory dataset (all blueprints) ==="
python3 scripts/build_solana_trading_factory_strategies.py || yellow "  strategy builder skipped (no live data needed)"
python3 scripts/build_nvidia_trading_factory_dataset.py --config configs/nvidia_trading_factory_config.yaml

green ""
green "=== Step 2: Prepare train/eval/test splits ==="
python3 scripts/prepare_dataset.py \
  --input data/nvidia_trading_factory_sft.jsonl \
  --output data/nvidia_trading_factory_processed \
  --train-ratio 0.9 --eval-ratio 0.05 --seed 42 \
  --push \
  --repo-id "solanaclawd/solana-clawd-nvidia-trading-factory-instruct"

green ""
green "=== Step 3: Push updated dataset card ==="
hf upload solanaclawd/solana-clawd-nvidia-trading-factory-instruct \
  data/nvidia_trading_factory_dataset_card.md README.md \
  --type dataset \
  --commit-message "feat: add signal-discovery, portfolio-opt, tx-foundation-model blueprints (195 examples)"

green ""
green "=== Step 4: Launch Trading Factory 8B LoRA job on $GPU ==="
bash scripts/launch_trading_factory_hf_job.sh "$GPU" "$TIMEOUT"

green ""
green "=== Done — monitor with: ==="
echo "  hf jobs list --label solana-clawd-trading-factory"
echo "  hf jobs logs <JOB_ID> --follow"

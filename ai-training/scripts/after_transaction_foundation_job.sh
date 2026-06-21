#!/usr/bin/env bash
# Continue the Solana transaction foundation model release after training finishes.
#
# Safe default behavior:
#   - writes/refreshes data/tx_foundation_cpt_manifest.json
#   - writes outputs/tx_foundation_post_train_summary.json
#   - does not upload, register live, or touch onchain state
#
# Optional flags:
#   EVALUATE=1   run the local/Hub evaluation benchmark
#   BUNDLE=1     build outputs/hf_release_bundle for tx_foundation_cpt
#   REGISTER=1   run dao/register_model.sh in dry-run mode
#
# Usage:
#   cd ai-training
#   bash scripts/after_transaction_foundation_job.sh
#   EVALUATE=1 BUNDLE=1 REGISTER=1 bash scripts/after_transaction_foundation_job.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

CONFIG_PATH="${CONFIG_PATH:-nvidia/configs/solana_tx_foundation.yaml}"

config_value() {
  local key="$1"
  python3 - "$CONFIG_PATH" "$key" <<'PY'
import sys
from pathlib import Path

sys.path.insert(0, str(Path("nvidia/blueprints/transaction-foundation-model").resolve()))
from tx_foundation_common import load_tx_config

cfg = load_tx_config(sys.argv[1])
value = cfg.get(sys.argv[2], "")
print("" if value is None else value)
PY
}

MODEL_PATH="${MODEL_PATH:-$(config_value output_dir)/sft}"

cmd=(
  python3
  nvidia/blueprints/transaction-foundation-model/post_train.py
  --config "$CONFIG_PATH"
  --model "$MODEL_PATH"
)

if [[ "${EVALUATE:-0}" == "1" ]]; then
  cmd+=(--evaluate)
fi

if [[ "${BUNDLE:-0}" == "1" ]]; then
  cmd+=(--bundle)
fi

if [[ "${REGISTER:-0}" == "1" ]]; then
  cmd+=(--register)
fi

printf '==> '
printf '%q ' "${cmd[@]}"
printf '\n'
"${cmd[@]}"

#!/usr/bin/env bash
# Publish the cleaned transaction-foundation CPT/SFT files for HF Jobs mounts.
#
# Usage:
#   cd ai-training
#   bash scripts/publish_transaction_foundation_training_data.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

CONFIG="${CONFIG:-nvidia/configs/solana_tx_foundation.yaml}"

config_value() {
  local dotted_key="$1"
  python3 - "$CONFIG" "$dotted_key" <<'PY'
import sys
from pathlib import Path
import yaml

path = Path(sys.argv[1])
key = sys.argv[2]
cfg = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
value = cfg
for part in key.split("."):
    value = value.get(part, {}) if isinstance(value, dict) else {}
print("" if value in ({}, None) else value)
PY
}

REPO_ID="${REPO_ID:-$(config_value remote_training_data.repo_id)}"
REPO_TYPE="${REPO_TYPE:-$(config_value remote_training_data.repo_type)}"
PRIVATE="${PRIVATE:-$(config_value remote_training_data.private)}"
CPT_DATA="${CPT_DATA:-data/model_kit/tx_foundation_cpt_clean.jsonl}"
SFT_DATA="${SFT_DATA:-data/model_kit/solana_clawd_reasoning_tooling_sft.jsonl}"
MANIFEST="${MANIFEST:-data/model_kit/training_data_optimization_manifest.json}"

if [[ -z "$REPO_ID" ]]; then
  echo "remote_training_data.repo_id is missing from ${CONFIG}" >&2
  exit 2
fi

for path in "$CPT_DATA" "$SFT_DATA" "$MANIFEST"; do
  if [[ ! -f "$path" ]]; then
    echo "missing required training-data file: $path" >&2
    exit 2
  fi
done

echo "Publishing transaction-foundation training data -> ${REPO_ID}"
echo "  CPT:      ${CPT_DATA}"
echo "  SFT:      ${SFT_DATA}"
echo "  Manifest: ${MANIFEST}"

PRIVACY_ARGS=(--no-private)
if [[ "$PRIVATE" == "true" || "$PRIVATE" == "1" ]]; then
  PRIVACY_ARGS=(--private)
fi

UPLOAD_CMDS=(
  "hf upload ${REPO_ID} ${CPT_DATA} $(basename "$CPT_DATA") --repo-type ${REPO_TYPE} ${PRIVACY_ARGS[*]} --commit-message Update transaction foundation CPT data"
  "hf upload ${REPO_ID} ${SFT_DATA} $(basename "$SFT_DATA") --repo-type ${REPO_TYPE} ${PRIVACY_ARGS[*]} --commit-message Update transaction foundation SFT data"
  "hf upload ${REPO_ID} ${MANIFEST} $(basename "$MANIFEST") --repo-type ${REPO_TYPE} ${PRIVACY_ARGS[*]} --commit-message Update transaction foundation data manifest"
)

if [[ "${DRY_RUN:-0}" == "1" ]]; then
  printf 'DRY_RUN upload commands:\n'
  for cmd in "${UPLOAD_CMDS[@]}"; do
    printf '  %s\n' "$cmd"
  done
  exit 0
fi

hf upload "$REPO_ID" "$CPT_DATA" "$(basename "$CPT_DATA")" --repo-type "$REPO_TYPE" "${PRIVACY_ARGS[@]}" --commit-message "Update transaction foundation CPT data"
hf upload "$REPO_ID" "$SFT_DATA" "$(basename "$SFT_DATA")" --repo-type "$REPO_TYPE" "${PRIVACY_ARGS[@]}" --commit-message "Update transaction foundation SFT data"
hf upload "$REPO_ID" "$MANIFEST" "$(basename "$MANIFEST")" --repo-type "$REPO_TYPE" "${PRIVACY_ARGS[@]}" --commit-message "Update transaction foundation data manifest"

echo "Published ${REPO_ID}. Mount in HF Jobs with:"
echo "  --volume hf://datasets/${REPO_ID}:$(config_value remote_training_data.mount_path):ro"

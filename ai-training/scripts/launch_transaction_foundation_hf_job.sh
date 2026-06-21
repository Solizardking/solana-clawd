#!/usr/bin/env bash
# Launch the Solana transaction foundation CPT+SFT training job on Hugging Face Jobs.
#
# Required:
#   HF_TOKEN or a working `hf auth login`
#
# Usage:
#   bash scripts/launch_transaction_foundation_hf_job.sh a100-large 6h
#
# Optional experiment overrides:
#   BASE_MODEL=zai-org/GLM-5.2-FP8 LOAD_IN_4BIT=false TARGET_MODULES=all-linear \
#   OUTPUT_DIR=/data/outputs/solana-tx-foundation-glm52 \
#   HUB_MODEL_ID=solanaclawd/solana-tx-foundation-glm52-lora \
#   bash scripts/launch_transaction_foundation_hf_job.sh h200x8 24h
#   SMOKE=1 ... bash scripts/launch_transaction_foundation_hf_job.sh h200x8 2h

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

FLAVOR="${1:-a100-large}"
TIMEOUT="${2:-6h}"
CONFIG="${CONFIG:-nvidia/configs/solana_tx_foundation.yaml}"
STAGE="${STAGE:-both}"

config_value() {
  local key="$1"
  python3 - "$CONFIG" "$key" <<'PY'
import sys
from pathlib import Path

sys.path.insert(0, str(Path("nvidia/blueprints/transaction-foundation-model").resolve()))
from tx_foundation_common import load_tx_config

cfg = load_tx_config(sys.argv[1])
value = cfg
for part in sys.argv[2].split("."):
    value = value.get(part, "") if isinstance(value, dict) else ""
print("" if value is None else value)
PY
}

CONFIG_OUTPUT_NAME="$(config_value output_name)"
TRAINING_BACKEND="$(config_value training_backend)"
TRAIN_SCRIPT="nvidia/blueprints/transaction-foundation-model/train.py"
if [[ "$TRAINING_BACKEND" == "unsloth" ]]; then
  TRAIN_SCRIPT="nvidia/blueprints/transaction-foundation-model/train_unsloth.py"
fi
OUTPUT_DIR="${OUTPUT_DIR:-$(config_value remote_output_dir)}"
if [[ -z "$OUTPUT_DIR" ]]; then
  OUTPUT_DIR="$(config_value output_dir)"
fi
HUB_MODEL_ID="${HUB_MODEL_ID:-$(config_value hub_model_id)}"
REMOTE_DATASET_ID="${REMOTE_DATASET_ID:-$(config_value remote_training_data.repo_id)}"
REMOTE_MOUNT_PATH="${REMOTE_MOUNT_PATH:-$(config_value remote_training_data.mount_path)}"
REMOTE_CPT_DATA="${REMOTE_CPT_DATA:-$(config_value remote_training_data.cpt_data)}"
REMOTE_SFT_DATA="${REMOTE_SFT_DATA:-$(config_value remote_training_data.sft_data)}"
RUN_NAME="${WANDB_RUN_NAME:-${CONFIG_OUTPUT_NAME:-tx-foundation}-$(date -u +%Y%m%dT%H%M%SZ)}"
LOG_DIR="${LOG_DIR:-outputs/job-launches}"
LOG_FILE="${LOG_DIR}/tx-foundation-launch-$(date -u +%Y%m%dT%H%M%SZ).log"

if [[ "${DRY_RUN:-0}" != "1" && -z "${HF_TOKEN:-}" ]]; then
  if ! hf auth whoami >/dev/null 2>&1; then
    echo "HF_TOKEN is required, or run: hf auth login" >&2
    exit 1
  fi
  export HF_TOKEN="$(hf auth token 2>/dev/null || echo "")"
fi

echo "Launching transaction foundation HF Job on ${FLAVOR} (timeout ${TIMEOUT})"
echo "Config: ${CONFIG}"
echo "Trainer: ${TRAIN_SCRIPT}"
echo "Hub model: ${HUB_MODEL_ID}"
echo "Launch log: ${LOG_FILE}"

mkdir -p "$LOG_DIR"

JOB_SECRET_ARGS=(--secrets HF_TOKEN)
JOB_ENV_ARGS=(
  --env HF_HOME=/data/hf_cache
  --env HF_DATASETS_CACHE=/data/hf_cache/datasets
  --env TRANSFORMERS_CACHE=/data/hf_cache
)
JOB_VOLUME_ARGS=()
REMOTE_DATA_ARGS=()
TRAIN_OVERRIDE_ARGS=()

if [[ -n "$REMOTE_DATASET_ID" && -n "$REMOTE_MOUNT_PATH" ]]; then
  JOB_VOLUME_ARGS+=(--volume "hf://datasets/${REMOTE_DATASET_ID}:${REMOTE_MOUNT_PATH}:ro")
  if [[ -n "$REMOTE_CPT_DATA" ]]; then
    REMOTE_DATA_ARGS+=(--cpt-data "$REMOTE_CPT_DATA")
  fi
  if [[ -n "$REMOTE_SFT_DATA" ]]; then
    REMOTE_DATA_ARGS+=(--sft-data "$REMOTE_SFT_DATA")
  fi
fi

if [[ -n "${BASE_MODEL:-}" ]]; then
  TRAIN_OVERRIDE_ARGS+=(--base-model "$BASE_MODEL")
fi
if [[ "${SMOKE:-0}" == "1" ]]; then
  TRAIN_OVERRIDE_ARGS+=(--smoke)
fi
if [[ -n "${TARGET_MODULES:-}" ]]; then
  TRAIN_OVERRIDE_ARGS+=(--target-modules "$TARGET_MODULES")
fi
if [[ -n "${LOAD_IN_4BIT:-}" ]]; then
  LOAD_IN_4BIT_NORMALIZED="$(printf '%s' "$LOAD_IN_4BIT" | tr '[:upper:]' '[:lower:]')"
  case "$LOAD_IN_4BIT_NORMALIZED" in
    1|true|yes|on) TRAIN_OVERRIDE_ARGS+=(--load-in-4bit) ;;
    0|false|no|off) TRAIN_OVERRIDE_ARGS+=(--no-load-in-4bit) ;;
    *) echo "LOAD_IN_4BIT must be true or false, got: ${LOAD_IN_4BIT}" >&2; exit 1 ;;
  esac
fi
if [[ -n "${CPT_MAX_SEQ_LENGTH:-}" ]]; then
  TRAIN_OVERRIDE_ARGS+=(--cpt-max-seq-length "$CPT_MAX_SEQ_LENGTH")
fi
if [[ -n "${SFT_MAX_SEQ_LENGTH:-}" ]]; then
  TRAIN_OVERRIDE_ARGS+=(--sft-max-seq-length "$SFT_MAX_SEQ_LENGTH")
fi
if [[ -n "${BATCH_SIZE:-}" ]]; then
  TRAIN_OVERRIDE_ARGS+=(--batch-size "$BATCH_SIZE")
fi
if [[ -n "${GRAD_ACCUM:-}" ]]; then
  TRAIN_OVERRIDE_ARGS+=(--grad-accum "$GRAD_ACCUM")
fi
if [[ -n "${LORA_R:-}" ]]; then
  TRAIN_OVERRIDE_ARGS+=(--lora-r "$LORA_R")
fi
if [[ -n "${LORA_ALPHA:-}" ]]; then
  TRAIN_OVERRIDE_ARGS+=(--lora-alpha "$LORA_ALPHA")
fi
if [[ -n "${LORA_DROPOUT:-}" ]]; then
  TRAIN_OVERRIDE_ARGS+=(--lora-dropout "$LORA_DROPOUT")
fi
if [[ -n "${MAX_STEPS:-}" ]]; then
  TRAIN_OVERRIDE_ARGS+=(--max-steps "$MAX_STEPS")
fi
if [[ -n "${CPT_MAX_STEPS:-}" ]]; then
  TRAIN_OVERRIDE_ARGS+=(--cpt-max-steps "$CPT_MAX_STEPS")
fi
if [[ -n "${SFT_MAX_STEPS:-}" ]]; then
  TRAIN_OVERRIDE_ARGS+=(--sft-max-steps "$SFT_MAX_STEPS")
fi
if [[ -n "${MAX_CPT_EXAMPLES:-}" ]]; then
  TRAIN_OVERRIDE_ARGS+=(--max-cpt-examples "$MAX_CPT_EXAMPLES")
fi
if [[ -n "${MAX_SFT_EXAMPLES:-}" ]]; then
  TRAIN_OVERRIDE_ARGS+=(--max-sft-examples "$MAX_SFT_EXAMPLES")
fi

if [[ -n "${WANDB_API_KEY:-}" ]]; then
  JOB_SECRET_ARGS+=(--secrets WANDB_API_KEY)
  JOB_ENV_ARGS+=(--env WANDB_PROJECT=solana-clawd-tx-foundation --env "WANDB_RUN_NAME=$RUN_NAME")
else
  echo "WANDB_API_KEY is not set; launching without W&B tracking." >&2
fi

CMD=(
  hf jobs uv run "$TRAIN_SCRIPT"
  --flavor "$FLAVOR"
  --timeout "$TIMEOUT"
  "${JOB_SECRET_ARGS[@]}"
  "${JOB_ENV_ARGS[@]}"
  "${JOB_VOLUME_ARGS[@]}"
  --label solana-clawd-tx-foundation
  --detach
  --
  --config "$CONFIG"
  --stage "$STAGE"
  --output-dir "$OUTPUT_DIR"
  --hub-model-id "$HUB_MODEL_ID"
  "${REMOTE_DATA_ARGS[@]}"
  --push
)

if [[ "${#TRAIN_OVERRIDE_ARGS[@]}" -gt 0 ]]; then
  CMD+=("${TRAIN_OVERRIDE_ARGS[@]}")
fi

if [[ "${DRY_RUN:-0}" == "1" ]]; then
  printf 'DRY_RUN command:\n  '
  printf '%q ' "${CMD[@]}"
  printf '\n'
  exit 0
fi

set +e
"${CMD[@]}" 2>&1 | tee "$LOG_FILE"
status=${PIPESTATUS[0]}
set -e

if [[ "$status" -ne 0 ]]; then
  if grep -q "402 Payment Required\\|Pre-paid credit balance is insufficient" "$LOG_FILE"; then
    cat >&2 <<EOF

ERROR: Hugging Face Jobs launch failed because prepaid Jobs credits are insufficient.

Next actions:
  1. Add Hugging Face Jobs credits to the authenticated account.
  2. Re-run: bash scripts/launch_transaction_foundation_hf_job.sh ${FLAVOR} ${TIMEOUT}
  3. Watch:  bash scripts/watch_transaction_foundation_hf_job.sh <JOB_ID>

No transaction foundation job was launched.
EOF
  else
    echo "ERROR: Hugging Face Jobs launch failed. See ${LOG_FILE}" >&2
  fi
  exit "$status"
fi

echo
echo "Monitor with:"
echo "  hf jobs ps"
echo "  hf jobs logs <JOB_ID> --follow"
echo "  hf jobs inspect <JOB_ID>"
echo "  bash scripts/watch_transaction_foundation_hf_job.sh <JOB_ID>"
echo
echo "After completion:"
echo "  bash scripts/after_transaction_foundation_job.sh"

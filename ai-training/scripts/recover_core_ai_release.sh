#!/usr/bin/env bash
# Verify the Core AI release and relaunch the HF training job only if the
# adapter has not been published yet.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

FLAVOR="${1:-a100-large}"
TIMEOUT="${2:-4h}"

if python3 scripts/verify_core_ai_release.py --strict; then
  echo "Core AI release is complete; no recovery job needed."
  exit 0
fi

if [[ -z "${HF_TOKEN:-}" ]]; then
  if HF_TOKEN="$(hf auth token 2>/dev/null)"; then
    export HF_TOKEN
    echo "Using Hugging Face token from existing hf auth session."
  else
    echo "HF_TOKEN is required to relaunch the missing model adapter job, or run: hf auth login" >&2
    exit 1
  fi
fi

echo "Core AI adapter is missing on the Hub; launching recovery job on ${FLAVOR} for ${TIMEOUT}."
exec ./scripts/launch_core_ai_hf_job.sh "$FLAVOR" "$TIMEOUT"

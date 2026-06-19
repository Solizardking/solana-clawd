#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

if [[ "$#" -lt 1 ]]; then
  echo "Usage: $0 <file-or-dir> [more files...] [-- --push --repo-id ORG/DATASET]" >&2
  exit 2
fi

EXTRA_ARGS=()
INPUTS=()
SEEN_SEPARATOR=0

for arg in "$@"; do
  if [[ "$arg" == "--" ]]; then
    SEEN_SEPARATOR=1
    continue
  fi
  if [[ "$SEEN_SEPARATOR" -eq 1 ]]; then
    EXTRA_ARGS+=("$arg")
  else
    INPUTS+=("$arg")
  fi
done

python3 scripts/realtime_dataset_ingest.py \
  --config configs/realtime_dataset_config.yaml \
  --input "${INPUTS[@]}" \
  "${EXTRA_ARGS[@]}"

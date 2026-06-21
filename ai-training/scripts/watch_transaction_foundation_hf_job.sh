#!/usr/bin/env bash
# Watch a Solana transaction foundation HF Job, then continue release metadata.
#
# Usage:
#   bash scripts/watch_transaction_foundation_hf_job.sh <JOB_ID> [interval_seconds]
#
# Optional:
#   EVALUATE=1  run the transaction benchmark after success
#   BUNDLE=1    build the HF dataset release bundle after success
#   REGISTER=1  run registry dry-run after success

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

JOB_ID="${1:-}"
INTERVAL_SECONDS="${2:-60}"

if [[ -z "$JOB_ID" ]]; then
  echo "Usage: bash scripts/watch_transaction_foundation_hf_job.sh <JOB_ID> [interval_seconds]" >&2
  exit 2
fi

echo "Watching transaction foundation HF Job: ${JOB_ID}"
echo "Polling every ${INTERVAL_SECONDS}s. Ctrl-C stops watching only; it does not cancel the remote job."

status_from_inspect() {
  awk '
    NR == 1 {
      for (i = 1; i <= NF; i++) {
        if ($i == "status") status_col = i
      }
      next
    }
    NR == 2 && status_col { print $status_col }
  '
}

while true; do
  inspect="$(hf jobs inspect "$JOB_ID")"
  printf '%s\n' "$inspect"
  status="$(printf '%s\n' "$inspect" | status_from_inspect)"

  case "$status" in
    RUNNING|PENDING|SCHEDULED|QUEUED|STARTING|CREATED)
      sleep "$INTERVAL_SECONDS"
      ;;
    COMPLETED|SUCCEEDED|SUCCESS)
      echo "Job completed. Running transaction post-train continuation."
      cmd=(python3 nvidia/blueprints/transaction-foundation-model/post_train.py)
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
      exit $?
      ;;
    ERROR|FAILED|CANCELED|CANCELLED|STOPPED)
      echo "Job reached failure state: ${status}" >&2
      echo "Inspect logs with: hf jobs logs ${JOB_ID} --tail 200" >&2
      exit 1
      ;;
    *)
      echo "Could not parse job status from inspect output: '${status}'" >&2
      echo "Inspect logs with: hf jobs logs ${JOB_ID} --tail 200" >&2
      exit 1
      ;;
  esac
done

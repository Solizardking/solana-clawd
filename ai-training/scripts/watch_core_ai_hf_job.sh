#!/usr/bin/env bash
# Watch a Core AI Hugging Face Job without interrupting it, then run the full
# release verifier when the job reaches a terminal state.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

JOB_ID="${1:-ordlibrary/6a35a6833093dba73ce2a86b}"
INTERVAL_SECONDS="${2:-60}"

echo "Watching Hugging Face job: ${JOB_ID}"
echo "Polling every ${INTERVAL_SECONDS}s. Press Ctrl-C to stop watching; this does not cancel the remote job."

while true; do
  INSPECT_OUTPUT="$(hf jobs inspect "$JOB_ID")"
  printf '%s\n' "$INSPECT_OUTPUT"

  STATUS_FIELD="$(printf '%s\n' "$INSPECT_OUTPUT" | awk -F '\t' 'NR==2 {print $12}')"
  case "$STATUS_FIELD" in
    *RUNNING*|*PENDING*|*SCHEDULED*|*QUEUED*|*STARTING*)
      sleep "$INTERVAL_SECONDS"
      ;;
    *COMPLETED*|*SUCCEEDED*|*SUCCESS*)
      echo "Job reached terminal success state. Running full release verifier."
      python3 scripts/verify_full_goal_release.py --strict
      exit $?
      ;;
    *)
      echo "Job is no longer running, but status is not a recognized success state: ${STATUS_FIELD}" >&2
      echo "Inspect logs with: hf jobs logs ${JOB_ID} --tail 200" >&2
      exit 1
      ;;
  esac
done

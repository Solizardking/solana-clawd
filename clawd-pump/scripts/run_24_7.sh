#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

MODE="${1:-copy}"
LOG_DIR="${LOG_DIR:-logs}"
mkdir -p "$LOG_DIR"

./scripts/preflight.sh

case "$MODE" in
  copy)
    cmd=(cargo run --release)
    ;;
  autobuy)
    cmd=(cargo run --release -- --autobuy)
    ;;
  serve)
    cmd=(cargo run --release -- --serve)
    ;;
  *)
    printf "usage: %s [copy|autobuy|serve]\n" "$0" >&2
    exit 2
    ;;
esac

printf "Starting clawd-pump 24/7 mode: %s\n" "$MODE"
printf "Logs: %s/clawd-pump-%s.log\n" "$LOG_DIR" "$MODE"

while true; do
  start_ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  printf "[%s] launching: %s\n" "$start_ts" "${cmd[*]}" | tee -a "$LOG_DIR/clawd-pump-$MODE.log"
  "${cmd[@]}" 2>&1 | tee -a "$LOG_DIR/clawd-pump-$MODE.log"
  exit_code="${PIPESTATUS[0]}"
  stop_ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  printf "[%s] process exited with code %s; restarting in 10s\n" "$stop_ts" "$exit_code" | tee -a "$LOG_DIR/clawd-pump-$MODE.log"
  sleep 10
done

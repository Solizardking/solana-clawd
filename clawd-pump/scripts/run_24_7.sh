#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

MODE="${1:-copy}"
LOG_DIR="${LOG_DIR:-logs}"
LOG_MAX_BYTES="${LOG_MAX_BYTES:-10485760}"
LOG_KEEP_FILES="${LOG_KEEP_FILES:-5}"
mkdir -p "$LOG_DIR"

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

./scripts/preflight.sh "$MODE"

printf "Starting clawd-pump 24/7 mode: %s\n" "$MODE"
log_file="$LOG_DIR/clawd-pump-$MODE.log"
printf "Logs: %s\n" "$log_file"
printf "Log retention: max active size %s bytes, keep %s rotated files\n" "$LOG_MAX_BYTES" "$LOG_KEEP_FILES"

file_size() {
  local file="$1"
  if stat -f%z "$file" >/dev/null 2>&1; then
    stat -f%z "$file"
  else
    stat -c%s "$file"
  fi
}

rotate_log_if_needed() {
  if [[ ! -f "$log_file" ]]; then
    return
  fi

  local size
  size="$(file_size "$log_file")"
  if [[ "$size" -lt "$LOG_MAX_BYTES" ]]; then
    return
  fi

  local rotated
  rotated="$log_file.$(date -u +%Y%m%dT%H%M%SZ)"
  mv "$log_file" "$rotated"
  printf "rotated log: %s\n" "$rotated"

  find "$LOG_DIR" -maxdepth 1 -type f -name "clawd-pump-$MODE.log.*" -print \
    | sort -r \
    | awk -v keep="$LOG_KEEP_FILES" 'NR > keep { print }' \
    | while IFS= read -r old_log; do
        rm -f "$old_log"
      done
}

while true; do
  rotate_log_if_needed
  start_ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  printf "[%s] launching: %s\n" "$start_ts" "${cmd[*]}" | tee -a "$log_file"
  "${cmd[@]}" 2>&1 | tee -a "$log_file"
  exit_code="${PIPESTATUS[0]}"
  stop_ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  printf "[%s] process exited with code %s; restarting in 10s\n" "$stop_ts" "$exit_code" | tee -a "$log_file"
  sleep 10
done

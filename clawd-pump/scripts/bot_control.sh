#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

CONTROL_FILE="${BOT_CONTROL_FILE:-/tmp/clawd-bot-control.json}"
action="${1:-status}"

write_control() {
  local mode="$1"
  local amount="${2:-}"
  local interval="${3:-}"
  local burst_count="${4:-}"
  local burst_pause="${5:-}"

  umask 077
  mkdir -p "$(dirname "$CONTROL_FILE")"

  case "$mode" in
    normal|stopped)
      printf '{\n  "mode": "%s"\n}\n' "$mode" > "$CONTROL_FILE"
      ;;
    volume)
      : "${amount:=0.005}"
      : "${interval:=10}"
      : "${burst_count:=5}"
      : "${burst_pause:=60}"
      printf '{\n  "mode": "volume",\n  "volumeAmountSol": %s,\n  "volumeIntervalSeconds": %s,\n  "volumeBurstCount": %s,\n  "volumeBurstPauseSeconds": %s\n}\n' \
        "$amount" "$interval" "$burst_count" "$burst_pause" > "$CONTROL_FILE"
      ;;
  esac
}

show_status() {
  printf "control file: %s\n" "$CONTROL_FILE"
  if [[ -f "$CONTROL_FILE" ]]; then
    cat "$CONTROL_FILE"
  else
    printf '{\n  "mode": "normal"\n}\n'
  fi
}

case "$action" in
  status)
    show_status
    ;;
  pause|stop|stopped)
    write_control stopped
    show_status
    ;;
  resume|normal)
    write_control normal
    show_status
    ;;
  volume)
    write_control volume "${2:-}" "${3:-}" "${4:-}" "${5:-}"
    show_status
    ;;
  clear)
    rm -f "$CONTROL_FILE"
    show_status
    ;;
  *)
    printf "usage: %s [status|pause|resume|volume [amount_sol interval_seconds burst_count burst_pause_seconds]|clear]\n" "$0" >&2
    exit 2
    ;;
esac

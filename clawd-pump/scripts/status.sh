#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

ENV_FILE="${ENV_FILE:-.env}"
PORT="${PUMP_HTTP_PORT:-8765}"
BUNDLE_DIR="${CLAWD_PUMP_SERVE_BUNDLE_DIR:-${HOME}/Library/Application Support/clawd-pump-serve}"
LAUNCHD_LABEL="gui/$(id -u)/com.openclawd.clawd-pump.serve"

env_value() {
  local key="$1"
  if [[ ! -f "$ENV_FILE" ]]; then
    return 1
  fi
  grep -E "^${key}=" "$ENV_FILE" | tail -1 | cut -d= -f2- || true
}

masked_state() {
  local key="$1"
  local value
  value="$(env_value "$key")"
  if [[ -z "$value" ]]; then
    printf "%s=missing\n" "$key"
  else
    printf "%s=set\n" "$key"
  fi
}

printf "clawd-pump status\n"
printf "env: %s\n\n" "$ENV_FILE"

if [[ -f "$ENV_FILE" ]]; then
  printf "live gate:\n"
  printf "  LIVE_TRADING_ENABLED=%s\n" "$(env_value "LIVE_TRADING_ENABLED")"
  printf "  PUMP_DRY_RUN=%s\n" "$(env_value "PUMP_DRY_RUN")"
  printf "  MAX_TRADE_SOL=%s\n" "$(env_value "MAX_TRADE_SOL")"
  printf "  AUTO_BUY_AMOUNT_SOL=%s\n" "$(env_value "AUTO_BUY_AMOUNT_SOL")"
  printf "  RISK_MANAGEMENT_ENABLED=%s\n" "$(env_value "RISK_MANAGEMENT_ENABLED")"
  printf "\nsecrets/endpoints:\n"
  printf "  %s\n" "$(masked_state "PRIVATE_KEY")"
  printf "  %s\n" "$(masked_state "RPC_HTTP")"
  printf "  %s\n" "$(masked_state "YELLOWSTONE_GRPC_HTTP")"
  printf "  %s\n" "$(masked_state "YELLOWSTONE_GRPC_TOKEN")"
else
  printf "missing %s\n" "$ENV_FILE"
fi

printf "\nprocess:\n"
if pgrep -fl "solana-vntr-sniper|run_24_7.sh|run_serve_24_7.sh" >/tmp/clawd-pump-pgrep.txt 2>/dev/null; then
  sed 's/^/  /' /tmp/clawd-pump-pgrep.txt
else
  printf "  not running\n"
fi

printf "\nlaunchd serve service:\n"
if command -v launchctl >/dev/null 2>&1; then
  if launchctl print "$LAUNCHD_LABEL" >/tmp/clawd-pump-launchd-status.txt 2>/tmp/clawd-pump-launchd-status.err; then
    grep -E "^\s*(state|pid|runs|path|program|working directory) =" /tmp/clawd-pump-launchd-status.txt \
      | sed 's/^/  /' || true
  else
    printf "  not loaded\n"
  fi
else
  printf "  launchctl unavailable\n"
fi

printf "\nhttp health:\n"
if command -v curl >/dev/null 2>&1; then
  health_ok=false
  for _ in 1 2 3; do
    if curl -fsS "http://127.0.0.1:${PORT}/health" >/tmp/clawd-pump-health.json 2>/tmp/clawd-pump-health.err; then
      health_ok=true
      break
    fi
    sleep 1
  done
  if [[ "$health_ok" == "true" ]]; then
      sed 's/^/  /' /tmp/clawd-pump-health.json
      printf "\n"
    else
      printf "  unavailable on 127.0.0.1:%s\n" "$PORT"
    fi
else
  printf "  curl unavailable\n"
fi

printf "\nlogs:\n"
if [[ -d logs ]]; then
  printf "  LOG_MAX_BYTES=%s\n" "${LOG_MAX_BYTES:-10485760}"
  printf "  LOG_KEEP_FILES=%s\n" "${LOG_KEEP_FILES:-5}"
  find logs -maxdepth 1 -type f -name '*.log' -print | sort | tail -5 | sed 's/^/  /'
  find logs -maxdepth 1 -type f -name '*.log.*' -print | sort | tail -5 | sed 's/^/  /'
else
  printf "  no logs directory\n"
fi

printf "\nbundle:\n"
if [[ -d "$BUNDLE_DIR" ]]; then
  printf "  path=%s\n" "$BUNDLE_DIR"
  if [[ -d "$BUNDLE_DIR/logs" ]]; then
    find "$BUNDLE_DIR/logs" -maxdepth 1 -type f -name '*.log' -print | sort | tail -5 | sed 's/^/  /'
  fi
else
  printf "  not installed\n"
fi

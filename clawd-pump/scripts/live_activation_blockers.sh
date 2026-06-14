#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

ENV_FILE="${ENV_FILE:-.env}"
MODE="${1:-copy}"

case "$MODE" in
  copy|autobuy) ;;
  *)
    printf "usage: %s [copy|autobuy]\n" "$0" >&2
    exit 2
    ;;
esac

json_string() {
  jq -Rn --arg v "${1:-}" '$v'
}

json_array() {
  if [[ "$#" -eq 0 ]]; then
    printf "[]"
  else
    printf "%s\n" "$@" | sed '/^$/d' | jq -R . | jq -s .
  fi
}

unique_json_array() {
  if [[ "$#" -eq 0 ]]; then
    printf "[]"
  else
    printf "%s\n" "$@" | sed '/^$/d' | awk '!seen[$0]++' | jq -R . | jq -s .
  fi
}

env_value() {
  local key="$1"
  if [[ ! -f "$ENV_FILE" ]]; then
    return 1
  fi
  grep -E "^${key}=" "$ENV_FILE" | tail -1 | cut -d= -f2- || true
}

is_set() {
  local value
  value="$(env_value "$1")"
  [[ -n "$value" ]]
}

bool_json() {
  if "$@"; then
    printf "true"
  else
    printf "false"
  fi
}

number_le_ok() {
  local key="$1"
  local max="$2"
  local value
  value="$(env_value "$key")"
  [[ -n "$value" ]] && awk -v v="$value" -v m="$max" 'BEGIN { exit !(v+0 > 0 && v+0 <= m+0) }'
}

failures=()
warnings=()
next_steps=()

if [[ ! -f "$ENV_FILE" ]]; then
  failures+=("$ENV_FILE missing")
  next_steps+=("Create $ENV_FILE from .env.example and fill local secrets")
fi

if ! is_set "RPC_HTTP"; then
  failures+=("RPC_HTTP missing")
  next_steps+=("Set RPC_HTTP to a funded, reliable Solana RPC endpoint")
fi

if [[ "$MODE" == "copy" ]] && ! is_set "YELLOWSTONE_GRPC_HTTP"; then
  failures+=("YELLOWSTONE_GRPC_HTTP missing")
  next_steps+=("Set YELLOWSTONE_GRPC_HTTP for copy-trading stream ingestion")
fi

if [[ "$MODE" == "copy" ]] && ! is_set "YELLOWSTONE_GRPC_TOKEN"; then
  failures+=("YELLOWSTONE_GRPC_TOKEN missing")
  next_steps+=("Set YELLOWSTONE_GRPC_TOKEN for the configured Yellowstone endpoint")
fi

if ! is_set "PRIVATE_KEY"; then
  failures+=("PRIVATE_KEY missing")
  next_steps+=("Set PRIVATE_KEY for the dedicated hot wallet only")
fi

if [[ "$(env_value "LIVE_TRADING_ENABLED")" != "true" ]]; then
  failures+=("LIVE_TRADING_ENABLED is not true")
  next_steps+=("Arm live mode only after accepting the risk: ./scripts/arm_live.sh")
fi

if [[ "$(env_value "PUMP_DRY_RUN")" != "false" ]]; then
  failures+=("PUMP_DRY_RUN is not false")
  next_steps+=("Disable dry-run only after accepting the risk: ./scripts/arm_live.sh")
fi

if ! number_le_ok "MAX_TRADE_SOL" "${MAX_TRADE_SOL_CEILING:-0.05}"; then
  failures+=("MAX_TRADE_SOL missing or above ceiling")
  next_steps+=("Set MAX_TRADE_SOL > 0 and <= ${MAX_TRADE_SOL_CEILING:-0.05}")
fi

if ! number_le_ok "AUTO_BUY_AMOUNT_SOL" "${AUTO_BUY_AMOUNT_SOL_CEILING:-0.05}"; then
  failures+=("AUTO_BUY_AMOUNT_SOL missing or above ceiling")
  next_steps+=("Set AUTO_BUY_AMOUNT_SOL > 0 and <= ${AUTO_BUY_AMOUNT_SOL_CEILING:-0.05}")
fi

if [[ "$(env_value "RISK_MANAGEMENT_ENABLED")" != "true" ]]; then
  failures+=("RISK_MANAGEMENT_ENABLED is not true")
  next_steps+=("Set RISK_MANAGEMENT_ENABLED=true before live operation")
fi

funding_passed=false
funding_log="/tmp/clawd-pump-live-activation-funding.log"
if ./scripts/wallet_balance_check.sh --json >"$funding_log" 2>&1; then
  funding_passed=true
else
  warnings+=("hot wallet funding was not verified")
  next_steps+=("Verify/fund the hot wallet with ./scripts/wallet_balance_check.sh")
fi

failures_json="$(json_array "${failures[@]+"${failures[@]}"}")"
warnings_json="$(json_array "${warnings[@]+"${warnings[@]}"}")"
next_steps_json="$(unique_json_array "${next_steps[@]+"${next_steps[@]}"}")"

cat <<JSON
{
  "agent": "clawd-pump",
  "mode": $(json_string "$MODE"),
  "live_ready": $(if [[ "${#failures[@]}" -eq 0 && "$funding_passed" == "true" ]]; then printf "true"; else printf "false"; fi),
  "funding_verified": $funding_passed,
  "configured": {
    "env_file_present": $(bool_json test -f "$ENV_FILE"),
    "rpc_http_present": $(bool_json is_set "RPC_HTTP"),
    "yellowstone_grpc_http_present": $(bool_json is_set "YELLOWSTONE_GRPC_HTTP"),
    "yellowstone_grpc_token_present": $(bool_json is_set "YELLOWSTONE_GRPC_TOKEN"),
    "private_key_present": $(bool_json is_set "PRIVATE_KEY"),
    "risk_management_enabled": $(if [[ "$(env_value "RISK_MANAGEMENT_ENABLED")" == "true" ]]; then printf "true"; else printf "false"; fi)
  },
  "gates": {
    "live_trading_enabled": $(json_string "$(env_value "LIVE_TRADING_ENABLED")"),
    "pump_dry_run": $(json_string "$(env_value "PUMP_DRY_RUN")"),
    "max_trade_sol": $(json_string "$(env_value "MAX_TRADE_SOL")"),
    "auto_buy_amount_sol": $(json_string "$(env_value "AUTO_BUY_AMOUNT_SOL")"),
    "counter_limit": $(json_string "$(env_value "COUNTER_LIMIT")")
  },
  "failures": $failures_json,
  "warnings": $warnings_json,
  "next_steps": $next_steps_json
}
JSON

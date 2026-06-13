#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

ENV_FILE="${ENV_FILE:-.env}"
PORT="${PUMP_HTTP_PORT:-8765}"

json_bool() {
  if [[ "${1:-}" == "0" ]]; then
    printf "true"
  else
    printf "false"
  fi
}

json_string() {
  jq -Rn --arg v "${1:-}" '$v'
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

run_check() {
  local out_file="$1"
  shift
  if "$@" >"$out_file" 2>&1; then
    return 0
  fi
  return 1
}

last_lines_json() {
  local file="$1"
  if [[ -s "$file" ]]; then
    tail -20 "$file" | jq -R . | jq -s .
  else
    printf "[]"
  fi
}

public_key=""
wallet_output="/tmp/clawd-pump-readiness-wallet.log"
if run_check "$wallet_output" ./scripts/funding_address.sh; then
  public_key="$(grep -Ei "^(funding address|public key|wallet):" "$wallet_output" | tail -1 | awk -F': ' '{print $2}' || true)"
  if [[ -z "$public_key" ]]; then
    public_key="$(grep -E "^[1-9A-HJ-NP-Za-km-z]{32,44}$" "$wallet_output" | tail -1 || true)"
  fi
fi

process_running=1
if pgrep -fl "solana-vntr-sniper|run_24_7.sh" >/tmp/clawd-pump-readiness-pgrep.log 2>/dev/null; then
  process_running=0
fi

http_health=1
if command -v curl >/dev/null 2>&1; then
  curl -fsS "http://127.0.0.1:${PORT}/health" >/tmp/clawd-pump-readiness-health.json 2>/tmp/clawd-pump-readiness-health.err \
    && http_health=0 \
    || true
fi

smoke_status=1
run_check /tmp/clawd-pump-readiness-smoke.log ./scripts/smoke_live_gates.sh && smoke_status=0 || true

service_render_status=1
run_check /tmp/clawd-pump-readiness-service.log ./scripts/render_service.sh launchd copy && service_render_status=0 || true

preflight_status=1
run_check /tmp/clawd-pump-readiness-preflight.log env REQUIRE_FUNDED_WALLET=true ./scripts/preflight.sh && preflight_status=0 || true

funding_status=1
run_check /tmp/clawd-pump-readiness-funding.log ./scripts/wallet_balance_check.sh --json && funding_status=0 || true

ready_to_start=1
if [[ "$preflight_status" -eq 0 && "$smoke_status" -eq 0 && "$service_render_status" -eq 0 ]]; then
  ready_to_start=0
fi

cat <<JSON
{
  "agent": "clawd-pump",
  "env_file": $(json_string "$ENV_FILE"),
  "ready_to_start": $(json_bool "$ready_to_start"),
  "wallet": {
    "private_key_present": $(is_set "PRIVATE_KEY" && printf "true" || printf "false"),
    "public_key": $(json_string "$public_key")
  },
  "live_gate": {
    "live_trading_enabled": $(json_string "$(env_value "LIVE_TRADING_ENABLED")"),
    "pump_dry_run": $(json_string "$(env_value "PUMP_DRY_RUN")"),
    "max_trade_sol": $(json_string "$(env_value "MAX_TRADE_SOL")"),
    "auto_buy_amount_sol": $(json_string "$(env_value "AUTO_BUY_AMOUNT_SOL")"),
    "counter_limit": $(json_string "$(env_value "COUNTER_LIMIT")"),
    "risk_management_enabled": $(json_string "$(env_value "RISK_MANAGEMENT_ENABLED")")
  },
  "endpoints": {
    "rpc_http_present": $(is_set "RPC_HTTP" && printf "true" || printf "false"),
    "yellowstone_grpc_http_present": $(is_set "YELLOWSTONE_GRPC_HTTP" && printf "true" || printf "false"),
    "yellowstone_grpc_token_present": $(is_set "YELLOWSTONE_GRPC_TOKEN" && printf "true" || printf "false"),
    "http_port": $(json_string "$PORT"),
    "http_health_available": $(json_bool "$http_health")
  },
  "process": {
    "running": $(json_bool "$process_running")
  },
  "checks": {
    "wallet_address": {
      "passed": $(if [[ -n "$public_key" ]]; then printf "true"; else printf "false"; fi),
      "log_tail": $(last_lines_json "$wallet_output")
    },
    "smoke_live_gates": {
      "passed": $(json_bool "$smoke_status"),
      "log_tail": $(last_lines_json /tmp/clawd-pump-readiness-smoke.log)
    },
    "service_render": {
      "passed": $(json_bool "$service_render_status"),
      "log_tail": $(last_lines_json /tmp/clawd-pump-readiness-service.log)
    },
    "preflight": {
      "passed": $(json_bool "$preflight_status"),
      "log_tail": $(last_lines_json /tmp/clawd-pump-readiness-preflight.log)
    },
    "funding": {
      "passed": $(json_bool "$funding_status"),
      "log_tail": $(last_lines_json /tmp/clawd-pump-readiness-funding.log)
    }
  }
}
JSON

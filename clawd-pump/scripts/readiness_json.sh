#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

ENV_FILE="${ENV_FILE:-.env}"
PORT="${PUMP_HTTP_PORT:-8765}"
MODE="${PUMP_READINESS_MODE:-${1:-copy}}"
BUNDLE_DIR="${CLAWD_PUMP_SERVE_BUNDLE_DIR:-${HOME}/Library/Application Support/clawd-pump-serve}"
LAUNCHD_LABEL="gui/$(id -u)/com.openclawd.clawd-pump.serve"
TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/clawd-pump-readiness.XXXXXX")"
trap 'rm -rf "$TMP_DIR"' EXIT

case "$MODE" in
  copy|autobuy|serve) ;;
  *)
    printf '{"agent":"clawd-pump","ready_to_start":false,"error":"invalid mode"}\n'
    exit 2
    ;;
esac

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

json_array() {
  jq -n '$ARGS.positional' --args "$@"
}

public_key=""
wallet_output="$TMP_DIR/wallet.log"
if run_check "$wallet_output" ./scripts/funding_address.sh; then
  public_key="$(grep -Ei "^(funding address|public key|wallet):" "$wallet_output" | tail -1 | awk -F': ' '{print $2}' || true)"
  if [[ -z "$public_key" ]]; then
    public_key="$(grep -E "^[1-9A-HJ-NP-Za-km-z]{32,44}$" "$wallet_output" | tail -1 || true)"
  fi
fi

process_running=1
if pgrep -fl "solana-vntr-sniper|run_24_7.sh" >"$TMP_DIR/pgrep.log" 2>/dev/null; then
  process_running=0
fi

http_health=1
if command -v curl >/dev/null 2>&1; then
  curl -fsS "http://127.0.0.1:${PORT}/health" >"$TMP_DIR/health.json" 2>"$TMP_DIR/health.err" \
    && http_health=0 \
    || true
fi

launchd_loaded=1
launchd_running=1
launchd_pid=""
launchd_path=""
launchd_program=""
if [[ "$MODE" == "serve" ]] && command -v launchctl >/dev/null 2>&1; then
  launchd_output="$TMP_DIR/launchd.txt"
  if launchctl print "$LAUNCHD_LABEL" >"$launchd_output" 2>"$TMP_DIR/launchd.err"; then
    launchd_loaded=0
    if grep -Eq "^\s*state = running" "$launchd_output"; then
      launchd_running=0
    fi
    launchd_pid="$(awk -F'= ' '/^[[:space:]]*pid = / { print $2; exit }' "$launchd_output")"
    launchd_path="$(awk -F'= ' '/^[[:space:]]*path = / { print $2; exit }' "$launchd_output")"
    launchd_program="$(awk -F'= ' '/^[[:space:]]*program = / { print $2; exit }' "$launchd_output")"
  fi
fi

bundle_installed=1
if [[ "$MODE" == "serve" && -d "$BUNDLE_DIR" && -x "$BUNDLE_DIR/solana-vntr-sniper" ]]; then
  bundle_installed=0
fi

bundle_binary_in_sync=""
bundle_env_in_sync=""
if [[ "$MODE" == "serve" && -x ./scripts/bundle_status.sh ]]; then
  bundle_status_json="$TMP_DIR/bundle.json"
  if ./scripts/bundle_status.sh >"$bundle_status_json" 2>"$TMP_DIR/bundle.err"; then
    bundle_binary_in_sync="$(jq -r '.binary_in_sync // empty' "$bundle_status_json")"
    bundle_env_in_sync="$(jq -r '.env_in_sync // empty' "$bundle_status_json")"
  fi
fi

smoke_status=1
smoke_log="$TMP_DIR/smoke.log"
run_check "$smoke_log" ./scripts/smoke_live_gates.sh && smoke_status=0 || true

http_control_status=0
http_control_log="$TMP_DIR/http-control.log"
if [[ "$MODE" == "serve" ]]; then
  http_control_status=1
  run_check "$http_control_log" ./scripts/smoke_http_control.sh && http_control_status=0 || true
else
  printf "not required for %s mode\n" "$MODE" >"$http_control_log"
fi

service_render_status=1
service_log="$TMP_DIR/service.log"
run_check "$service_log" ./scripts/render_service.sh launchd "$MODE" && service_render_status=0 || true

preflight_status=1
preflight_log="$TMP_DIR/preflight.log"
if [[ "$MODE" == "serve" ]]; then
  run_check "$preflight_log" ./scripts/preflight.sh "$MODE" && preflight_status=0 || true
else
  run_check "$preflight_log" env REQUIRE_FUNDED_WALLET=true ./scripts/preflight.sh "$MODE" && preflight_status=0 || true
fi

funding_status=1
funding_log="$TMP_DIR/funding.log"
if [[ "$MODE" == "serve" ]]; then
  printf '{"passed":true,"reason":"not required for serve mode"}\n' >"$funding_log"
  funding_status=0
else
  run_check "$funding_log" ./scripts/wallet_balance_check.sh --json && funding_status=0 || true
fi

ready_to_start=1
if [[ "$preflight_status" -eq 0 && "$smoke_status" -eq 0 && "$service_render_status" -eq 0 && "$http_control_status" -eq 0 ]]; then
  ready_to_start=0
fi

blockers=()
if [[ "$MODE" == "copy" && ! is_set "YELLOWSTONE_GRPC_HTTP" ]]; then
  blockers+=("YELLOWSTONE_GRPC_HTTP is required for copy mode")
fi
if [[ "$MODE" != "serve" && "$(env_value "LIVE_TRADING_ENABLED")" != "true" ]]; then
  blockers+=("LIVE_TRADING_ENABLED must be true for live 24/7 mode")
fi
if [[ "$MODE" != "serve" && "$(env_value "PUMP_DRY_RUN")" != "false" ]]; then
  blockers+=("PUMP_DRY_RUN must be false for live 24/7 mode")
fi
if [[ "$funding_status" -ne 0 ]]; then
  blockers+=("hot wallet funding check failed")
fi
if [[ "$preflight_status" -ne 0 && "${#blockers[@]}" -eq 0 ]]; then
  blockers+=("preflight check failed")
fi
if [[ "$smoke_status" -ne 0 ]]; then
  blockers+=("live gate smoke check failed")
fi
if [[ "$service_render_status" -ne 0 ]]; then
  blockers+=("service render check failed")
fi
if [[ "$http_control_status" -ne 0 ]]; then
  blockers+=("HTTP control smoke check failed")
fi

cat <<JSON
{
  "agent": "clawd-pump",
  "mode": $(json_string "$MODE"),
  "env_file": $(json_string "$ENV_FILE"),
  "ready_to_start": $(json_bool "$ready_to_start"),
  "blockers": $(json_array "${blockers[@]}"),
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
  "service": {
    "launchd_label": $(json_string "$LAUNCHD_LABEL"),
    "launchd_loaded": $(json_bool "$launchd_loaded"),
    "launchd_running": $(json_bool "$launchd_running"),
    "launchd_pid": $(json_string "$launchd_pid"),
    "launchd_path": $(json_string "$launchd_path"),
    "launchd_program": $(json_string "$launchd_program"),
    "bundle_path": $(json_string "$BUNDLE_DIR"),
    "bundle_installed": $(json_bool "$bundle_installed"),
    "bundle_binary_in_sync": $(if [[ "$bundle_binary_in_sync" == "true" ]]; then printf "true"; else printf "false"; fi),
    "bundle_env_in_sync": $(if [[ "$bundle_env_in_sync" == "true" ]]; then printf "true"; else printf "false"; fi),
    "bundle_log": $(json_string "$BUNDLE_DIR/logs/clawd-pump-serve.log")
  },
  "checks": {
    "wallet_address": {
      "passed": $(if [[ -n "$public_key" ]]; then printf "true"; else printf "false"; fi),
      "log_tail": $(last_lines_json "$wallet_output")
    },
    "smoke_live_gates": {
      "passed": $(json_bool "$smoke_status"),
      "log_tail": $(last_lines_json "$smoke_log")
    },
    "http_control": {
      "passed": $(json_bool "$http_control_status"),
      "log_tail": $(last_lines_json "$http_control_log")
    },
    "service_render": {
      "passed": $(json_bool "$service_render_status"),
      "log_tail": $(last_lines_json "$service_log")
    },
    "preflight": {
      "passed": $(json_bool "$preflight_status"),
      "log_tail": $(last_lines_json "$preflight_log")
    },
    "funding": {
      "passed": $(json_bool "$funding_status"),
      "log_tail": $(last_lines_json "$funding_log")
    }
  }
}
JSON

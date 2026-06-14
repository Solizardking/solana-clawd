#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

base_url="${PUMP_HTTP_BASE_URL:-http://127.0.0.1:${PUMP_HTTP_PORT:-8765}}"
failures=0

fail() {
  printf "fail: %s\n" "$1"
  failures=$((failures + 1))
}

ok() {
  printf "ok: %s\n" "$1"
}

require_jq() {
  if ! command -v jq >/dev/null 2>&1; then
    printf "fail: jq is required for HTTP control smoke checks\n"
    exit 127
  fi
}

fetch_json() {
  local name="$1"
  local method="$2"
  local url="$3"
  local out_file="$4"
  local err_file="$5"

  if [[ "$method" == "POST" ]]; then
    if curl -sS -X POST "$url" >"$out_file" 2>"$err_file"; then
      ok "$name reachable"
      return 0
    fi
  elif curl -fsS "$url" >"$out_file" 2>"$err_file"; then
    ok "$name reachable"
    return 0
  fi

  fail "$name request failed: $(tr '\n' ' ' <"$err_file")"
  return 1
}

assert_jq() {
  local file="$1"
  local filter="$2"
  local message="$3"

  if jq -e "$filter" "$file" >/dev/null; then
    ok "$message"
  else
    fail "$message"
  fi
}

require_jq

health_json="/tmp/clawd-pump-http-health.json"
health_err="/tmp/clawd-pump-http-health.err"
status_json="/tmp/clawd-pump-http-status.json"
status_err="/tmp/clawd-pump-http-status.err"
balance_json="/tmp/clawd-pump-http-balance.json"
balance_err="/tmp/clawd-pump-http-balance.err"

printf "smoke target: %s\n\n" "$base_url"

if fetch_json "health" "GET" "$base_url/health" "$health_json" "$health_err"; then
  assert_jq "$health_json" '.service == "clawd-pump"' "health identifies clawd-pump"
  assert_jq "$health_json" '.status == "ok"' "health is ok"
fi

if fetch_json "status" "GET" "$base_url/status" "$status_json" "$status_err"; then
  assert_jq "$status_json" '.service == "clawd-pump"' "status identifies clawd-pump"
  assert_jq "$status_json" '.live_http_enabled == false' "live HTTP control is disarmed"
  assert_jq "$status_json" '.live_trading_enabled == false' "live trading flag is false"
  assert_jq "$status_json" '.pump_dry_run == true' "dry-run flag is true"
  assert_jq "$status_json" '.private_key_present | type == "boolean"' "private key presence is boolean only"
fi

if fetch_json "balance block" "POST" "$base_url/balance" "$balance_json" "$balance_err"; then
  assert_jq "$balance_json" '.success == false' "balance endpoint rejects while disarmed"
  assert_jq "$balance_json" '.error | contains("blocked")' "balance block message is explicit"
fi

printf "\nSummary: %s failure(s)\n" "$failures"
if [[ "$failures" -gt 0 ]]; then
  exit 1
fi

#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

bin="target/debug/solana-vntr-sniper"

printf "building debug binary for live-gate smoke test...\n"
cargo build >/tmp/clawd-pump-smoke-build.log 2>&1

failures=0

fail() {
  printf "fail: %s\n" "$1"
  failures=$((failures + 1))
}

ok() {
  printf "ok: %s\n" "$1"
}

run_blocked_case() {
  local name="$1"
  shift
  local output

  set +e
  output="$(LIVE_TRADING_ENABLED=false PUMP_DRY_RUN=true "$bin" "$@" 2>&1)"
  local code=$?
  set -e

  if [[ "$code" -ne 0 ]]; then
    fail "$name exited with code $code"
  elif [[ "$output" != *"blocked: set LIVE_TRADING_ENABLED=true and PUMP_DRY_RUN=false"* ]]; then
    fail "$name did not print live-gate block message"
  elif [[ "$output" == *"Made by DEVDUDES"* || "$output" == *"SNIPER ENVIRONMENT"* || "$output" == *"Yellowstone"* ]]; then
    fail "$name initialized runtime config before blocking"
  else
    ok "$name blocked before runtime config init"
  fi
}

run_blocked_case "default copy trading" 
run_blocked_case "direct buy" --buy FakeMint111111111111111111111111111111111 0.001
run_blocked_case "autobuy" --autobuy
run_blocked_case "risk check" --risk-check

printf "\nSummary: %s failure(s)\n" "$failures"
if [[ "$failures" -gt 0 ]]; then
  exit 1
fi

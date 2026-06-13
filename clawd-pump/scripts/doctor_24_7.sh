#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

failures=0
warns=0

section() { printf "\n== %s ==\n" "$1"; }
ok() { printf "ok: %s\n" "$1"; }
warn() { printf "warn: %s\n" "$1"; warns=$((warns + 1)); }
fail() { printf "fail: %s\n" "$1"; failures=$((failures + 1)); }

run_optional() {
  local label="$1"
  shift
  if "$@"; then
    ok "$label"
  else
    fail "$label"
  fi
}

section "Wallet"
if ./scripts/funding_address.sh; then
  ok "funding address available"
else
  fail "funding address unavailable"
fi

section "Status"
./scripts/status.sh || warn "status command returned non-zero"

section "Live Gate Smoke"
run_optional "unarmed live gates block before runtime init" ./scripts/smoke_live_gates.sh

section "Service Render"
run_optional "render launchd service" ./scripts/render_service.sh launchd copy
run_optional "render systemd service" ./scripts/render_service.sh systemd copy

section "Live Preflight"
if ./scripts/preflight.sh; then
  ok "live preflight passed"
else
  warn "live preflight is not ready; this is expected until the hot wallet is funded, Yellowstone is configured, and live mode is armed"
fi

section "Summary"
printf "failures: %s\n" "$failures"
printf "warnings: %s\n" "$warns"

if [[ "$failures" -gt 0 ]]; then
  exit 1
fi

#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

ENV_FILE="${ENV_FILE:-.env}"
MODE="${PUMP_PREFLIGHT_MODE:-${1:-copy}}"

case "$MODE" in
  copy|autobuy|serve) ;;
  *)
    printf "usage: %s [copy|autobuy|serve]\n" "$0" >&2
    exit 2
    ;;
esac

failures=0
warns=0

ok() { printf "ok: %s\n" "$1"; }
warn() { printf "warn: %s\n" "$1"; warns=$((warns + 1)); }
fail() { printf "fail: %s\n" "$1"; failures=$((failures + 1)); }

env_value() {
  local key="$1"
  if [[ ! -f "$ENV_FILE" ]]; then
    return 1
  fi
  grep -E "^${key}=" "$ENV_FILE" | tail -1 | cut -d= -f2- || true
}

require_set() {
  local key="$1"
  local value
  value="$(env_value "$key")"
  if [[ -z "$value" ]]; then
    fail "$key is not set in $ENV_FILE"
  else
    ok "$key is set"
  fi
}

require_bool() {
  local key="$1"
  local expected="$2"
  local value
  value="$(env_value "$key")"
  if [[ "$value" == "$expected" ]]; then
    ok "$key=$expected"
  else
    fail "$key must be $expected for live 24/7 mode"
  fi
}

require_number_le() {
  local key="$1"
  local max="$2"
  local value
  value="$(env_value "$key")"
  if [[ -z "$value" ]]; then
    fail "$key is not set"
    return
  fi
  awk -v v="$value" -v m="$max" 'BEGIN { exit !(v+0 > 0 && v+0 <= m+0) }' \
    && ok "$key is within limit" \
    || fail "$key must be > 0 and <= $max"
}

printf "clawd-pump readiness preflight\n"
printf "env: %s\n\n" "$ENV_FILE"
printf "mode: %s\n\n" "$MODE"

if [[ ! -f "$ENV_FILE" ]]; then
  fail "$ENV_FILE does not exist; copy .env.example and fill it locally"
else
  ok "$ENV_FILE exists"
fi

if [[ "$MODE" == "serve" ]]; then
  if [[ "$(env_value "PUMP_HTTP_PORT")" =~ ^[0-9]+$ ]]; then
    ok "PUMP_HTTP_PORT is set"
  else
    warn "PUMP_HTTP_PORT is missing or not numeric; default 8765 will be used"
  fi
  if [[ "$(env_value "LIVE_TRADING_ENABLED")" == "true" && "$(env_value "PUMP_DRY_RUN")" == "false" ]]; then
    warn "HTTP trade endpoints will be live because LIVE_TRADING_ENABLED=true and PUMP_DRY_RUN=false"
  else
    ok "HTTP trade endpoints remain blocked while live gates are disarmed"
  fi
else
  require_set "RPC_HTTP"
  if [[ "$MODE" == "copy" ]]; then
    require_set "YELLOWSTONE_GRPC_HTTP"
  else
    if [[ -z "$(env_value "YELLOWSTONE_GRPC_HTTP")" ]]; then
      warn "YELLOWSTONE_GRPC_HTTP is not set; not required for $MODE mode"
    else
      ok "YELLOWSTONE_GRPC_HTTP is set"
    fi
  fi
  require_set "PRIVATE_KEY"
  require_bool "LIVE_TRADING_ENABLED" "true"
  require_bool "PUMP_DRY_RUN" "false"
fi

private_key="$(env_value "PRIVATE_KEY")"
if [[ "$MODE" != "serve" && -n "$private_key" ]]; then
  if [[ "${#private_key}" -lt 85 ]]; then
    fail "PRIVATE_KEY appears too short for a base58 Solana key"
  else
    ok "PRIVATE_KEY length looks plausible"
  fi
fi

if [[ "$MODE" != "serve" ]]; then
  require_number_le "MAX_TRADE_SOL" "${MAX_TRADE_SOL_CEILING:-0.05}"
  require_number_le "AUTO_BUY_AMOUNT_SOL" "${AUTO_BUY_AMOUNT_SOL_CEILING:-0.05}"
fi

counter_limit="$(env_value "COUNTER_LIMIT")"
if [[ -z "$counter_limit" ]]; then
  warn "COUNTER_LIMIT is not set; code defaults may apply"
elif [[ "$counter_limit" =~ ^[0-9]+$ ]] && [[ "$counter_limit" -gt 0 ]]; then
  ok "COUNTER_LIMIT is positive"
else
  fail "COUNTER_LIMIT must be a positive integer for live mode"
fi

if [[ "$MODE" == "serve" ]]; then
  ok "risk management live checks are not required for serve mode"
elif [[ "$(env_value "RISK_MANAGEMENT_ENABLED")" == "true" ]]; then
  ok "risk management is enabled"
else
  fail "RISK_MANAGEMENT_ENABLED must be true for live 24/7 mode"
fi

if [[ "$MODE" == "serve" ]]; then
  ok "hot wallet funding is not required for serve mode startup"
elif [[ "${REQUIRE_FUNDED_WALLET:-false}" == "true" ]]; then
  if ./scripts/wallet_balance_check.sh >/tmp/clawd-pump-wallet-balance-check.log 2>&1; then
    ok "hot wallet funding is sufficient"
  else
    fail "hot wallet funding is insufficient or could not be verified; see /tmp/clawd-pump-wallet-balance-check.log"
  fi
else
  warn "hot wallet funding check skipped; set REQUIRE_FUNDED_WALLET=true to require balance verification"
fi

printf "\nRunning cargo check...\n"
cargo check >/tmp/clawd-pump-cargo-check.log 2>&1 \
  && ok "cargo check passed" \
  || { fail "cargo check failed; see /tmp/clawd-pump-cargo-check.log"; }

printf "\nSummary: %s failure(s), %s warning(s)\n" "$failures" "$warns"
if [[ "$failures" -gt 0 ]]; then
  exit 1
fi

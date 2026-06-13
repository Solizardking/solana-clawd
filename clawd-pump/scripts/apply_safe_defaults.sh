#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

ENV_FILE="${ENV_FILE:-.env}"

if [[ ! -f "$ENV_FILE" ]]; then
  printf "missing %s; copy .env.example first\n" "$ENV_FILE" >&2
  exit 1
fi

backup="${ENV_FILE}.backup.$(date -u +%Y%m%dT%H%M%SZ)"
cp "$ENV_FILE" "$backup"

tmp="$(mktemp)"
awk \
  -v keys="LIVE_TRADING_ENABLED,PUMP_DRY_RUN,MAX_TRADE_SOL,AUTO_BUY_AMOUNT_SOL,COUNTER_LIMIT,MIN_RESERVE_SOL,RISK_MANAGEMENT_ENABLED,RISK_TARGET_TOKEN_THRESHOLD,RISK_CHECK_INTERVAL_MINUTES,PUMP_HTTP_PORT,LOG_MAX_BYTES,LOG_KEEP_FILES" \
  -v live_trading_enabled="false" \
  -v pump_dry_run="true" \
  -v max_trade_sol="${MAX_TRADE_SOL_VALUE:-0.01}" \
  -v auto_buy_amount_sol="${AUTO_BUY_AMOUNT_SOL_VALUE:-0.01}" \
  -v counter_limit="${COUNTER_LIMIT_VALUE:-10}" \
  -v min_reserve_sol="${MIN_RESERVE_SOL_VALUE:-0.05}" \
  -v risk_management_enabled="true" \
  -v risk_target_token_threshold="${RISK_TARGET_TOKEN_THRESHOLD_VALUE:-1000}" \
  -v risk_check_interval_minutes="${RISK_CHECK_INTERVAL_MINUTES_VALUE:-10}" \
  -v pump_http_port="${PUMP_HTTP_PORT_VALUE:-8765}" \
  -v log_max_bytes="${LOG_MAX_BYTES_VALUE:-10485760}" \
  -v log_keep_files="${LOG_KEEP_FILES_VALUE:-5}" \
'
BEGIN {
  key_count = split(keys, order, ",")
  for (i = 1; i <= key_count; i++) wanted[order[i]] = 1
  values["LIVE_TRADING_ENABLED"] = live_trading_enabled
  values["PUMP_DRY_RUN"] = pump_dry_run
  values["MAX_TRADE_SOL"] = max_trade_sol
  values["AUTO_BUY_AMOUNT_SOL"] = auto_buy_amount_sol
  values["COUNTER_LIMIT"] = counter_limit
  values["MIN_RESERVE_SOL"] = min_reserve_sol
  values["RISK_MANAGEMENT_ENABLED"] = risk_management_enabled
  values["RISK_TARGET_TOKEN_THRESHOLD"] = risk_target_token_threshold
  values["RISK_CHECK_INTERVAL_MINUTES"] = risk_check_interval_minutes
  values["PUMP_HTTP_PORT"] = pump_http_port
  values["LOG_MAX_BYTES"] = log_max_bytes
  values["LOG_KEEP_FILES"] = log_keep_files
}
{
  line = $0
  key = line
  sub(/=.*/, "", key)
  if (key in wanted) {
    if (!(key in seen)) {
      print key "=" values[key]
      seen[key] = 1
    }
    next
  }
  print line
}
END {
  for (i = 1; i <= key_count; i++) {
    key = order[i]
    if (!(key in seen)) print key "=" values[key]
  }
}
' "$ENV_FILE" > "$tmp"

mv "$tmp" "$ENV_FILE"
chmod 600 "$ENV_FILE" 2>/dev/null || true

printf "applied safe 24/7 defaults to %s\n" "$ENV_FILE"
printf "backup: %s\n" "$backup"
printf "live trading remains disarmed: LIVE_TRADING_ENABLED=false, PUMP_DRY_RUN=true\n"

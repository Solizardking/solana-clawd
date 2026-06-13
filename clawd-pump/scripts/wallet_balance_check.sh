#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

ENV_FILE="${ENV_FILE:-.env}"

env_value() {
  local key="$1"
  if [[ ! -f "$ENV_FILE" ]]; then
    return 1
  fi
  grep -E "^${key}=" "$ENV_FILE" | tail -1 | cut -d= -f2- || true
}

json_mode=false
if [[ "${1:-}" == "--json" ]]; then
  json_mode=true
fi

emit_json() {
  local passed="$1"
  local address="$2"
  local balance="$3"
  local required="$4"
  local reason="$5"
  jq -n \
    --argjson passed "$passed" \
    --arg address "$address" \
    --arg balance "$balance" \
    --arg required "$required" \
    --arg reason "$reason" \
    '{passed: $passed, address: $address, balance_sol: $balance, required_sol: $required, reason: $reason}'
}

fail_out() {
  local address="${2:-}"
  local balance="${3:-}"
  local required="${4:-}"
  if [[ "$json_mode" == true ]]; then
    emit_json false "$address" "$balance" "$required" "$1"
  else
    printf "fail: %s\n" "$1"
  fi
  exit 1
}

primary_rpc="$(env_value "RPC_HTTP")"
if [[ -z "$primary_rpc" ]]; then
  fail_out "RPC_HTTP is not set"
fi

wallet_output="/tmp/clawd-pump-balance-wallet.log"
if ! ./scripts/funding_address.sh >"$wallet_output" 2>&1; then
  fail_out "funding address unavailable"
fi

address="$(grep -Ei "^(funding address|public key|wallet):" "$wallet_output" | tail -1 | awk -F': ' '{print $2}' || true)"
if [[ -z "$address" ]]; then
  address="$(grep -E "^[1-9A-HJ-NP-Za-km-z]{32,44}$" "$wallet_output" | tail -1 || true)"
fi
if [[ -z "$address" ]]; then
  fail_out "funding address unavailable"
fi

min_reserve="$(env_value "MIN_RESERVE_SOL")"
max_trade="$(env_value "MAX_TRADE_SOL")"
auto_buy="$(env_value "AUTO_BUY_AMOUNT_SOL")"
min_reserve="${min_reserve:-0.05}"
max_trade="${max_trade:-0}"
auto_buy="${auto_buy:-0}"

required="$(
  awk -v reserve="$min_reserve" -v max_trade="$max_trade" -v auto_buy="$auto_buy" '
    BEGIN {
      trade = max_trade + 0
      if (auto_buy + 0 > trade) trade = auto_buy + 0
      printf "%.9f", (reserve + 0) + trade
    }
  '
)"

balance_output="/tmp/clawd-pump-solana-balance.log"
balance=""
query_error=""
declare -a rpc_candidates=()

add_rpc_candidate() {
  local candidate="$1"
  if [[ -z "$candidate" ]]; then
    return
  fi
  if [[ "${#rpc_candidates[@]}" -gt 0 ]]; then
    for existing in "${rpc_candidates[@]}"; do
      if [[ "$existing" == "$candidate" ]]; then
        return
      fi
    done
  fi
  rpc_candidates+=("$candidate")
}

add_rpc_candidate "$primary_rpc"
add_rpc_candidate "$(env_value "SOLANA_RPC_URL")"
add_rpc_candidate "$(env_value "HELIUS_RPC_URL")"
add_rpc_candidate "${BALANCE_FALLBACK_RPC:-https://api.mainnet-beta.solana.com}"

if command -v curl >/dev/null 2>&1 && command -v jq >/dev/null 2>&1; then
  rpc_payload="/tmp/clawd-pump-balance-rpc-payload.json"
  rpc_response="/tmp/clawd-pump-balance-rpc-response.json"
  jq -n --arg address "$address" \
    '{jsonrpc:"2.0", id:1, method:"getBalance", params:[$address]}' >"$rpc_payload"
  for rpc_url in "${rpc_candidates[@]}"; do
    if curl -fsS \
      --header "content-type: application/json" \
      --data-binary @"$rpc_payload" \
      "$rpc_url" >"$rpc_response" 2>"$balance_output"; then
      lamports="$(jq -r '.result.value // empty' "$rpc_response")"
      if [[ -n "$lamports" ]]; then
        balance="$(awk -v lamports="$lamports" 'BEGIN { printf "%.9f", lamports / 1000000000 }')"
        break
      fi
    else
      attempt_error="$(sed -E 's#https://[^ ]+#<rpc-url>#g; s#api-key=[^ )]+#api-key=<redacted>#g' "$balance_output" | tr '\n' ' ' | cut -c1-120)"
      query_error="${query_error:+${query_error}; }${attempt_error}"
    fi
  done
fi

if [[ -z "$balance" ]] && command -v solana >/dev/null 2>&1; then
  for rpc_url in "${rpc_candidates[@]}"; do
    if solana balance --url "$rpc_url" "$address" >"$balance_output" 2>&1; then
      balance="$(awk '{print $1; exit}' "$balance_output")"
      break
    else
      cli_error="$(sed -E 's#https://[^ ]+#<rpc-url>#g; s#api-key=[^ )]+#api-key=<redacted>#g' "$balance_output" | tr '\n' ' ' | cut -c1-120)"
      query_error="${query_error:+${query_error}; }${cli_error}"
    fi
  done
fi

if [[ -z "$balance" ]]; then
  fail_out "unable to query SOL balance${query_error:+ ($query_error)}" "$address" "" "$required"
fi

if awk -v b="$balance" -v r="$required" 'BEGIN { exit !(b + 0 >= r + 0) }'; then
  if [[ "$json_mode" == true ]]; then
    emit_json true "$address" "$balance" "$required" ""
  else
    printf "ok: wallet %s has %s SOL; required >= %s SOL\n" "$address" "$balance" "$required"
  fi
else
  fail_out "wallet SOL balance is below required live threshold" "$address" "$balance" "$required"
fi

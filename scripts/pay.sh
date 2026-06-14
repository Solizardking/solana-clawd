#!/usr/bin/env bash
# pay.sh — CLAWD Terminal wallet & subscription manager (wraps the `pay` CLI)
# Requires: pay CLI installed (https://docs.pay.sh)
# Usage:    ./scripts/pay.sh <command> [args]

set -euo pipefail

# ── CLAWD constants ─────────────────────────────────────────────────────────────
readonly CLAWD_MINT="8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump"
readonly CLAWD_TREASURY="HKBX8CwMGwnwtFjTH99xKa82whjowqxzsBQGWT3kBhDJ"
readonly CLAWD_PROGRAM="De1egAFMkMWZSN5rYXRj9CAdheBamobVNubTsi9avR44"
readonly CLAWD_AMOUNT="69420000000"   # 69,420 CLAWD × 10^6 (pump.fun 6-decimal token)
readonly CLAWD_PERIOD="30d"

# Overridable via environment
CLAWD_PLAN_PDA="${CLAWD_PLAN_PDA:-}"
CLAWD_PULLER="${CLAWD_PULLER:-}"

# ── helpers ──────────────────────────────────────────────────────────────────────
_check_pay() {
  if ! command -v pay &>/dev/null; then
    echo "Error: 'pay' CLI not found. Install it first:"
    echo "  curl -sSfL https://pay.sh/install.sh | bash"
    exit 1
  fi
}

_require() {
  local val="$1" name="$2"
  if [[ -z "$val" ]]; then
    echo "Error: $name is required. Pass it as an argument or set \$$name in the environment."
    exit 1
  fi
}

# ── commands ─────────────────────────────────────────────────────────────────────
CMD="${1:-help}"
shift || true

case "$CMD" in

  # ── Account & Wallet management ───────────────────────────────────────────────
  setup)
    _check_pay
    echo "Setting up pay account for CLAWD Terminal…"
    exec pay setup "$@"
    ;;

  topup)
    _check_pay
    exec pay topup "$@"
    ;;

  account|accounts)
    _check_pay
    exec pay account "$@"
    ;;

  send)
    _check_pay
    # pay.sh send <amount> <recipient> [--currency USDC]
    exec pay send "$@"
    ;;

  whoami)
    _check_pay
    exec pay whoami "$@"
    ;;

  # ── CLAWD subscription ────────────────────────────────────────────────────────
  subscribe)
    # Usage: ./pay.sh subscribe [<PLAN_PDA> <PULLER> <RECIPIENT_WALLET>]
    _check_pay
    PLAN="${1:-$CLAWD_PLAN_PDA}"
    PULLER="${2:-$CLAWD_PULLER}"
    RECIPIENT="${3:-}"

    _require "$PLAN"      "CLAWD_PLAN_PDA (on-chain Plan PDA)"
    _require "$PULLER"    "CLAWD_PULLER (server puller pubkey)"
    _require "$RECIPIENT" "recipient wallet address"

    echo "Activating 69,420 CLAWD/month subscription…"
    echo "  Mint:      $CLAWD_MINT"
    echo "  Plan PDA:  $PLAN"
    echo "  Puller:    $PULLER"
    echo "  Recipient: $RECIPIENT"
    echo "  Amount:    $CLAWD_AMOUNT base units (69,420 CLAWD)"
    echo "  Period:    $CLAWD_PERIOD"
    echo ""

    exec pay subscriptions new \
      --plan     "$PLAN" \
      --mint     "$CLAWD_MINT" \
      --puller   "$PULLER" \
      --recipient "$RECIPIENT" \
      --amount   "$CLAWD_AMOUNT" \
      --period   "$CLAWD_PERIOD" \
      --description "CLAWD Terminal — 69,420 CLAWD/month premium access"
    ;;

  # ── Subscription management ───────────────────────────────────────────────────
  subscriptions|subs|subscription)
    _check_pay
    exec pay subscriptions "$@"
    ;;

  status)
    _check_pay
    _require "${1:-}" "subscription ID"
    exec pay subscriptions status "$@"
    ;;

  cancel)
    _check_pay
    _require "${1:-}" "subscription ID"
    echo "Cancelling subscription ${1}…"
    exec pay subscriptions cancel "$@"
    ;;

  refresh)
    _check_pay
    exec pay subscriptions refresh "$@"
    ;;

  list)
    _check_pay
    exec pay subscriptions list "$@"
    ;;

  # ── Info ──────────────────────────────────────────────────────────────────────
  info)
    echo "CLAWD Terminal — pay.sh constants"
    echo "  Mint:     $CLAWD_MINT"
    echo "  Treasury: $CLAWD_TREASURY"
    echo "  Program:  $CLAWD_PROGRAM"
    echo "  Amount:   $CLAWD_AMOUNT base units (69,420 CLAWD/month)"
    echo "  Period:   $CLAWD_PERIOD"
    echo ""
    echo "Set CLAWD_PLAN_PDA and CLAWD_PULLER in your environment before running 'subscribe'."
    ;;

  help|--help|-h)
    cat <<'EOF'
pay.sh — CLAWD Terminal wallet & subscription manager

USAGE
  ./scripts/pay.sh <command> [args]

ACCOUNT COMMANDS
  setup                         Generate keypair + fund via onramp/QR
  topup [--sandbox]             Fund account (opens interactive TUI)
  account <sub> [args]          Manage accounts: new/import/list/default/remove/export
  whoami                        Show active account
  send <amount> <recipient>     Send stablecoins (USDC/USDT)

CLAWD SUBSCRIPTION COMMANDS
  subscribe <plan> <puller> <recipient>
                                Activate 69,420 CLAWD/month subscription
  subscriptions [sub] [args]    List/manage subscriptions (alias: subs)
  list [--account] [--json]     List all active subscriptions
  status <id>                   Show subscription detail by base58 ID
  cancel <id> [--local-only]    Cancel a subscription
  refresh                       Backfill on-chain data on local entries

  info                          Print CLAWD constants
  help                          Show this message

CLAWD CONSTANTS
  Mint:     8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump
  Amount:   69,420 CLAWD/month (69420000000 base units, 6 decimals)
  Period:   30d
  Program:  De1egAFMkMWZSN5rYXRj9CAdheBamobVNubTsi9avR44

ENVIRONMENT
  CLAWD_PLAN_PDA    On-chain Plan PDA address (required for 'subscribe')
  CLAWD_PULLER      Server puller pubkey (required for 'subscribe')

EXAMPLES
  # Set up a new pay account
  ./scripts/pay.sh setup

  # Fund it
  ./scripts/pay.sh topup

  # Subscribe (set env vars or pass as args)
  export CLAWD_PLAN_PDA="<plan-pda>"
  export CLAWD_PULLER="<puller-pubkey>"
  ./scripts/pay.sh subscribe "$CLAWD_PLAN_PDA" "$CLAWD_PULLER" "<your-wallet>"

  # List subscriptions
  ./scripts/pay.sh list

  # Cancel
  ./scripts/pay.sh cancel <subscription-id>
EOF
    ;;

  *)
    echo "Unknown command: $CMD"
    echo "Run './scripts/pay.sh help' for usage."
    exit 1
    ;;
esac

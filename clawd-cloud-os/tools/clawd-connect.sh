#!/usr/bin/env bash
set -euo pipefail

# Solana Clawd terminal connection helper.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../scripts/lib/common.sh
. "$SCRIPT_DIR/../scripts/lib/common.sh"
clawd_load_env

json() {
  if clawd_have jq; then
    jq '.'
  else
    cat
  fi
}

echo -e "${CYAN}╔══════════════════════════════════════════════════╗${RESET}"
echo -e "${CYAN}║         Solana Clawd Terminal v2.1              ║${RESET}"
echo -e "${CYAN}║    OpenClawd-aware connection helper            ║${RESET}"
echo -e "${CYAN}╚══════════════════════════════════════════════════╝${RESET}"
echo ""

case "${1:-help}" in
  connect)
    info "Connecting to $CLAWD_ENDPOINT..."
    curl -s -X POST "$CLAWD_API/connect" \
      -H "Content-Type: application/json" \
      -d "{\"agent\":\"${CLAWD_AGENT_NAME:-solana-clawd}\",\"version\":\"${CLAWD_AGENT_VERSION:-2.1}\"}" | json
    ;;

  status)
    info "Fetching agent status..."
    curl -s "$CLAWD_API/status" | json
    ;;

  agents)
    info "Listing registered agents..."
    curl -s "$CLAWD_API/agents" | json
    ;;

  wallet)
    info "Wallet info:"
    curl -s "$CLAWD_API/wallet" | json
    ;;

  prices)
    info "Live prices:"
    curl -s "$CLAWD_API/prices" | json
    ;;

  paths)
    clawd_print_paths
    ;;

  help|-h|--help)
    cat <<EOF
Commands:
  connect   Connect to solanaclawd.com
  status    Check remote agent status
  agents    List registered agents
  wallet    View wallet info
  prices    Get live token prices
  paths     Show resolved OpenClawd paths

Environment:
  CLAWD_API=$CLAWD_API
  CLAWD_WS_ENDPOINT=$CLAWD_WS_ENDPOINT
  CLAWD_DIR=$CLAWD_DIR
EOF
    ;;

  *)
    fail "Unknown command: $1"
    ;;
esac

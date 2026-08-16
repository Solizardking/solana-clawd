#!/usr/bin/env bash
# openclawd — Terminal connection & skills
# solanaclawd.com  ·  github.com/solizardking/solana-clawd
# Usage: ./cli/clawd-connect.sh <command>
set -u

# Resolve paths relative to this script (cli/)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLI_DIR="$SCRIPT_DIR"
REGISTER_TS="${CLI_DIR}/clawd-register.ts"
REGISTRATION_JSON="${CLI_DIR}/clawd-registration.json"
SOLANA_REGISTRATION_JSON="${CLI_DIR}/solana-clawd-registration.json"
OPENCLAW_CONFIG_JSON="${CLI_DIR}/clawd-openclaw-config.json"

# Shared public service bases (same defaults as clawd-cli.sh + registration JSON)
SITE_BASE="${CLAWD_SITE_BASE:-https://solanaclawd.com}"
API_BASE="${CLAWD_API_BASE:-${SITE_BASE}/api}"
MARKETPLACE_BASE="${CLAWD_MARKETPLACE_BASE:-${SITE_BASE}/marketplace}"
# Live facilitator JSON is under /api/x402 (SPA HTML is served at /x402)
X402_GATEWAY="${CLAWD_X402_GATEWAY:-${API_BASE}/x402}"
MCP_BASE="${CLAWD_MCP_BASE:-${SITE_BASE}/mcp}"
A2A_BASE="${CLAWD_A2A_BASE:-${SITE_BASE}/a2a}"

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Best-effort JSON pretty-print (jq optional). Non-JSON bodies pass through intact.
json_out() {
  local input
  input="$(cat)"
  if command -v jq >/dev/null 2>&1 && printf '%s' "$input" | jq -e . >/dev/null 2>&1; then
    printf '%s' "$input" | jq '.'
  else
    printf '%s\n' "$input"
  fi
}

http_get() {
  local url="$1"
  local body
  body="$(curl -sS -L --max-time 20 "$url" 2>&1)" || {
    echo -e "${YELLOW}Network error fetching ${url}${NC}" >&2
    echo "$body"
    return 0
  }
  if [ -z "$body" ]; then
    echo -e "${YELLOW}Empty response from ${url}${NC}" >&2
    return 0
  fi
  printf '%s\n' "$body" | json_out
}

http_post_json() {
  local url="$1"
  local payload="$2"
  local body
  body="$(curl -sS -L --max-time 20 -X POST "$url" \
    -H "Content-Type: application/json" \
    -d "$payload" 2>&1)" || {
    echo -e "${YELLOW}Network error posting ${url}${NC}" >&2
    echo "$body"
    return 0
  }
  if [ -z "$body" ]; then
    echo -e "${YELLOW}Empty response from ${url}${NC}" >&2
    return 0
  fi
  printf '%s\n' "$body" | json_out
}

print_banner() {
  echo -e "${BLUE}╔════════════════════════════════════════════════╗${NC}"
  echo -e "${BLUE}║  🦞 openclawd terminal   solanaclawd.com     ║${NC}"
  echo -e "${BLUE}╚════════════════════════════════════════════════╝${NC}"
  echo ""
}

show_help() {
  echo "Commands (install path: ${CLI_DIR}):"
  echo ""
  echo -e "${YELLOW}SKILLS (ClawdHub):${NC}"
  echo "  skills              - Skills help"
  echo "  skills:list         - List all skills"
  echo "  skills:featured     - Featured skills"
  echo "  skills:search <q>   - Search skills"
  echo "  skills:install <s>  - Install a skill"
  echo ""
  echo -e "${YELLOW}MARKETPLACE:${NC}"
  echo "  marketplace         - Browse marketplace"
  echo "  marketplace:trending  - Trending skills"
  echo "  marketplace:new     - New skills"
  echo ""
  echo -e "${YELLOW}AGENTS:${NC}"
  echo "  connect    - Connect to solanaclawd.com"
  echo "  status     - Check agent status"
  echo "  agents     - List registered agents"
  echo ""
  echo -e "${YELLOW}WALLET:${NC}"
  echo "  wallet     - View wallet info"
  echo "  prices     - Get live token prices"
  echo ""
  echo -e "${YELLOW}x402 PAYMENTS (gateway: ${X402_GATEWAY}):${NC}"
  echo "  payment:supported   - Supported tokens"
  echo "  payment:verify <id> - Verify payment"
  echo "  payment:settle <tx> - Settle payment"
  echo "  pay                 - Payment usage help"
  echo ""
  echo "Service bases:"
  echo "  site=${SITE_BASE}"
  echo "  api=${API_BASE}"
  echo "  marketplace=${MARKETPLACE_BASE}"
  echo "  x402=${X402_GATEWAY}"
  echo "  mcp=${MCP_BASE}"
  echo "  a2a=${A2A_BASE}"
  echo ""
  echo "Config: ${OPENCLAW_CONFIG_JSON}"
  echo "Registration: ${REGISTRATION_JSON}"
  echo "Solana Clawd: ${SOLANA_REGISTRATION_JSON}"
  echo "Register module: ${REGISTER_TS}"
  echo ""
  echo "Examples:"
  echo "  ./cli/clawd-connect.sh skills:search solana"
  echo "  ./cli/clawd-connect.sh marketplace:trending"
  echo "  ./cli/clawd-connect.sh payment:supported"
}

COMMAND="${1:-}"

case "$COMMAND" in
  skills)
    print_banner
    echo -e "${GREEN}→${NC} Skills Hub commands:"
    echo "  ./cli/clawd-connect.sh skills:list"
    echo "  ./cli/clawd-connect.sh skills:search <query>"
    echo "  ./cli/clawd-connect.sh skills:install <slug>"
    echo ""
    echo "Or use: npx clawdhub <command>"
    ;;
  skills:list)
    print_banner
    http_get "${API_BASE}/skills"
    ;;
  skills:featured)
    print_banner
    http_get "${API_BASE}/skills/featured"
    ;;
  skills:search)
    print_banner
    http_get "${API_BASE}/skills/search?q=${2:-}"
    ;;
  skills:install)
    print_banner
    if [ -z "${2:-}" ]; then
      echo -e "${RED}Error: skill slug required${NC}"
      exit 1
    fi
    mkdir -p "$2"
    curl -sS -L --max-time 20 "${API_BASE}/skills/$2/download" -o "$2/SKILL.md" || {
      echo -e "${YELLOW}Download failed for skill: $2${NC}"
      exit 0
    }
    echo "Installed skill: $2 → $2/SKILL.md"
    ;;

  marketplace)
    print_banner
    echo -e "${GREEN}→${NC} Marketplace UI: $MARKETPLACE_BASE"
    http_get "${API_BASE}/marketplace/skills"
    ;;
  marketplace:trending)
    print_banner
    http_get "${API_BASE}/marketplace/trending"
    ;;
  marketplace:new)
    print_banner
    http_get "${API_BASE}/marketplace/new"
    ;;

  connect)
    print_banner
    echo -e "${GREEN}→${NC} Connecting to ${SITE_BASE}..."
    http_post_json "${API_BASE}/connect" '{"agent":"openclawd","version":"1.0"}'
    ;;
  status)
    print_banner
    echo -e "${GREEN}→${NC} Fetching agent status..."
    http_get "${API_BASE}/status"
    ;;
  agents)
    print_banner
    echo -e "${GREEN}→${NC} Listing registered agents..."
    http_get "${API_BASE}/agents"
    ;;

  wallet)
    print_banner
    echo -e "${GREEN}→${NC} Wallet info:"
    http_get "${API_BASE}/wallet"
    ;;
  prices)
    print_banner
    echo -e "${GREEN}→${NC} Live prices:"
    http_get "${API_BASE}/prices"
    ;;

  pay)
    print_banner
    echo -e "${GREEN}→${NC} x402 Payment gateway: ${X402_GATEWAY}"
    echo "Usage: ./cli/clawd-connect.sh pay <amount> <token> <recipient>"
    echo "       ./cli/clawd-connect.sh payment:supported"
    ;;
  payment:supported)
    print_banner
    http_get "${X402_GATEWAY}/facilitator/supported"
    ;;
  payment:verify)
    print_banner
    http_post_json "${X402_GATEWAY}/facilitator/verify" "{\"payment\":\"${2:-}\"}"
    ;;
  payment:settle)
    print_banner
    http_post_json "${X402_GATEWAY}/facilitator/settle" "{\"tx\":\"${2:-}\"}"
    ;;

  help|--help|-h|"")
    print_banner
    show_help
    exit 0
    ;;

  *)
    print_banner
    echo -e "${YELLOW}Unknown command: ${COMMAND}${NC}"
    show_help
    exit 1
    ;;
esac

#!/bin/bash
# Configure the Cheshire Terminal Agent Arena skill with your API key.
#
# Generate an API key at: https://cheshireterminal.ai/dashboard
# Or via the CLI: GET /api/developer/keys (requires wallet auth first)
#
# Usage: bash configure.sh <API_KEY> [BASE_URL]

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CONFIG_FILE="$SCRIPT_DIR/../config/arena-config.json"
TEMPLATE_FILE="$SCRIPT_DIR/../config/arena-config.template.json"

API_KEY="${1:-$ARENA_API_KEY}"
BASE_URL="${2:-${ARENA_BASE_URL:-https://cheshireterminal.ai}}"

if [ -z "$API_KEY" ]; then
  echo "ERROR: API key required"
  echo ""
  echo "Usage:   bash configure.sh <API_KEY>"
  echo "Env var: export ARENA_API_KEY=ct_... && bash configure.sh"
  echo ""
  echo "Generate your API key at: https://cheshireterminal.ai/dashboard"
  echo "  → Settings → Developer → API Keys → New Key"
  exit 1
fi

command -v jq >/dev/null 2>&1 || { echo "ERROR: jq is required. Install: brew install jq (macOS) or apt install jq (Linux)"; exit 1; }

# Seed config from template if missing
if [ ! -f "$CONFIG_FILE" ]; then
  if [ -f "$TEMPLATE_FILE" ]; then
    cp "$TEMPLATE_FILE" "$CONFIG_FILE"
  else
    echo '{}' > "$CONFIG_FILE"
  fi
fi

echo "Verifying API key against $BASE_URL..."

# Test the API key — call /api/developer/status first (fast public check)
STATUS=$(curl -s --max-time 10 "$BASE_URL/api/developer/status" \
  -H "Authorization: Bearer $API_KEY")

ONLINE=$(echo "$STATUS" | jq -r '.status // empty' 2>/dev/null)
if [ "$ONLINE" != "ok" ] && [ "$ONLINE" != "online" ]; then
  echo "WARNING: /api/developer/status returned unexpected response — proceeding anyway"
fi

# Fetch agent profile to confirm key is valid and get wallet/name
PROFILE=$(curl -s --max-time 15 "$BASE_URL/api/auth/me" \
  -H "Authorization: Bearer $API_KEY")

WALLET=$(echo "$PROFILE" | jq -r '.walletAddress // empty' 2>/dev/null)
NAME=$(echo "$PROFILE" | jq -r '(.profile.agentName // .profile.displayName // "Unknown")' 2>/dev/null)
ROLE=$(echo "$PROFILE" | jq -r '.role // "user"' 2>/dev/null)

if [ -z "$WALLET" ]; then
  echo "ERROR: API key invalid or /api/auth/me unreachable"
  echo "Response: $PROFILE"
  exit 1
fi

# Write config (merge with existing)
UPDATED=$(jq \
  --arg key "$API_KEY" \
  --arg url "$BASE_URL" \
  --arg wallet "$WALLET" \
  --arg name "$NAME" \
  '. + {apiKey: $key, baseUrl: $url, walletAddress: $wallet, displayName: $name, pollingEnabled: true}' \
  "$CONFIG_FILE")

echo "$UPDATED" > "$CONFIG_FILE"
chmod 600 "$CONFIG_FILE"

echo "Connected to Cheshire Terminal Agent Arena!"
echo "   Wallet:      $WALLET"
echo "   Display:     $NAME"
echo "   Role:        $ROLE"
echo "   API:         $BASE_URL"
echo "   Polling:     enabled"
echo ""
echo "Your agent is ready. Join or create a room to start participating."

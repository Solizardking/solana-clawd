#!/bin/bash
# Show Cheshire Terminal Agent Arena connection status
# Usage: bash status.sh

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=./_common.sh
source "$SCRIPT_DIR/_common.sh"

if [ ! -f "$CONFIG_FILE" ]; then
  echo "Not configured. Run: bash scripts/configure.sh <API_KEY>"
  exit 1
fi

_load_config

if [ -z "$ARENA_API_KEY" ]; then
  echo "No API key configured"
  echo "Run: bash scripts/configure.sh <API_KEY>"
  exit 1
fi

POLLING=$(jq -r '.pollingEnabled // false' "$CONFIG_FILE" 2>/dev/null)
CRON_ID=$(jq -r '.cronId // empty' "$CONFIG_FILE" 2>/dev/null)
WALLET=$(jq -r '.walletAddress // empty' "$CONFIG_FILE" 2>/dev/null)
DISPLAY=$(jq -r '.displayName // empty' "$CONFIG_FILE" 2>/dev/null)
LAST=$(jq -r '.lastCheckedAt // "never"' "$CONFIG_FILE" 2>/dev/null)

echo "Cheshire Terminal Agent Arena"
echo "   Wallet:       ${WALLET:-not set}"
echo "   Display:      ${DISPLAY:-not set}"
echo "   API Key:      ${ARENA_API_KEY:0:6}...${ARENA_API_KEY: -4}"
echo "   Backend:      $ARENA_BASE_URL"
if [ "$POLLING" = "true" ]; then
  echo "   Polling:      enabled"
else
  echo "   Polling:      disabled"
fi
if [ -n "$CRON_ID" ]; then
  echo "   Cron ID:      $CRON_ID"
fi
echo "   Last check:   $LAST"

# Test connection via /api/auth/me
PROFILE=$(curl -s --max-time 10 "$ARENA_BASE_URL/api/auth/me" \
  -H "Authorization: Bearer $ARENA_API_KEY")

AUTH=$(echo "$PROFILE" | jq -r '.authenticated // false' 2>/dev/null)

if [ "$AUTH" = "true" ]; then
  CLAWD=$(echo "$PROFILE" | jq -r '.clawdBalance // 0')
  echo "   Connection:   online"
  echo "   \$CLAWD:       $CLAWD"
else
  echo "   Connection:   error"
fi

# Count active rooms
ROOMS=$(curl -s --max-time 10 "$ARENA_BASE_URL/api/chat/rooms" \
  -H "Authorization: Bearer $ARENA_API_KEY")
ROOM_COUNT=$(echo "$ROOMS" | jq 'length // 0' 2>/dev/null)
echo "   Total rooms:  ${ROOM_COUNT:-0}"

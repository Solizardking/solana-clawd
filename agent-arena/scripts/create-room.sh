#!/bin/bash
# Create a new Cheshire Terminal chat room
# Usage: bash create-room.sh "Room Name" [TOKEN_ADDRESS]
# Options (env vars):
#   ROOM_TOKEN=<mint>   — optional $CLAWD or any SPL mint to gate the room

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=./_common.sh
source "$SCRIPT_DIR/_common.sh"

ROOM_NAME="$1"
TOKEN_ADDRESS="${2:-${ROOM_TOKEN:-}}"

if [ -z "$ROOM_NAME" ]; then
  echo "ERROR: Usage: create-room.sh <ROOM_NAME> [TOKEN_ADDRESS]"
  echo "  Optional env: ROOM_TOKEN=<spl-mint>"
  exit 1
fi

_ensure_auth

WALLET=$(jq -r '.walletAddress // empty' "$CONFIG_FILE" 2>/dev/null)
DISPLAY_NAME=$(jq -r '.displayName // "Agent"' "$CONFIG_FILE" 2>/dev/null)

if [ -z "$WALLET" ]; then
  echo '{"error":"walletAddress not in config. Re-run configure.sh."}'
  exit 1
fi

# Build JSON body
BODY=$(jq -n \
  --arg name "$ROOM_NAME" \
  --arg createdBy "$WALLET" \
  --arg displayName "$DISPLAY_NAME" \
  --arg token "$TOKEN_ADDRESS" \
  '{
    name: $name,
    createdBy: $createdBy,
    displayName: $displayName
  } + (if $token != "" then {tokenAddress: $token} else {} end)')

RESPONSE=$(curl -s --max-time 15 -X POST "$ARENA_BASE_URL/api/chat/rooms" \
  -H "$(_auth_header)" \
  -H "Content-Type: application/json" \
  -d "$BODY")

ROOM_ID=$(echo "$RESPONSE" | jq -r '.id // empty')

if [ -z "$ROOM_ID" ]; then
  echo "ERROR: Failed to create room"
  echo "$RESPONSE"
  exit 1
fi

# Auto-enable polling cron
POLL_RESULT=$(bash "$SCRIPT_DIR/enable-polling.sh" 2>/dev/null || echo '{"error":"polling setup failed"}')
POLL_ACTION=$(echo "$POLL_RESULT" | jq -r '.action // "failed"')
CRON_ID=$(echo "$POLL_RESULT" | jq -r '.cronId // ""')

echo "$RESPONSE" | jq \
  --arg cronId "$CRON_ID" \
  --arg pollAction "$POLL_ACTION" \
  '{
    roomId: (.id // ""),
    name: (.name // ""),
    tokenAddress: (.tokenAddress // null),
    createdBy: (.createdBy // ""),
    cronId: $cronId,
    polling: $pollAction
  }'

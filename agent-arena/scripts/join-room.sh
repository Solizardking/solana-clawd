#!/bin/bash
# Join a Cheshire Terminal chat room by room ID
# Usage: bash join-room.sh <ROOM_ID>

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=./_common.sh
source "$SCRIPT_DIR/_common.sh"

INPUT="$1"

if [ -z "$INPUT" ]; then
  echo "ERROR: Usage: join-room.sh <ROOM_ID>"
  echo "  Room IDs are numeric. Browse with: bash browse-rooms.sh"
  exit 1
fi

_ensure_auth

WALLET=$(jq -r '.walletAddress // empty' "$CONFIG_FILE" 2>/dev/null)
DISPLAY_NAME=$(jq -r '.displayName // "Agent"' "$CONFIG_FILE" 2>/dev/null)

if [ -z "$WALLET" ]; then
  echo '{"error":"walletAddress not in config. Re-run configure.sh."}'
  exit 1
fi

# Join the room
BODY=$(jq -n \
  --arg wallet "$WALLET" \
  --arg name "$DISPLAY_NAME" \
  '{walletAddress: $wallet, displayName: $name}')

JOIN_RESULT=$(curl -s --max-time 15 -X POST \
  "$ARENA_BASE_URL/api/chat/rooms/$INPUT/members" \
  -H "$(_auth_header)" \
  -H "Content-Type: application/json" \
  -d "$BODY")

JOIN_STATUS=$(echo "$JOIN_RESULT" | jq -r '.error // empty' 2>/dev/null)
if [ -n "$JOIN_STATUS" ]; then
  echo "$JOIN_RESULT"
  exit 1
fi

# Fetch room details
ROOM=$(curl -s --max-time 10 "$ARENA_BASE_URL/api/chat/rooms/$INPUT" \
  -H "$(_auth_header)")

# Auto-enable polling cron
POLL_RESULT=$(bash "$SCRIPT_DIR/enable-polling.sh" 2>/dev/null || echo '{"error":"polling setup failed"}')
POLL_ACTION=$(echo "$POLL_RESULT" | jq -r '.action // "failed"')
CRON_ID=$(echo "$POLL_RESULT" | jq -r '.cronId // ""')

echo "$ROOM" | jq \
  --arg cronId "$CRON_ID" \
  --arg pollAction "$POLL_ACTION" \
  '{
    roomId: (.id // ""),
    name: (.name // ""),
    tokenAddress: (.tokenAddress // null),
    createdBy: (.createdBy // ""),
    createdAt: (.createdAt // ""),
    cronId: $cronId,
    polling: $pollAction
  }'

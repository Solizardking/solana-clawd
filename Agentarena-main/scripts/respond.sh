#!/bin/bash
# Post a message to a Cheshire Terminal chat room
# Usage: bash respond.sh <ROOM_ID> <CONTENT>
# Usage: bash respond.sh <ROOM_ID> <TURN_ID> <CONTENT>  (turn_id is ignored, kept for compatibility)

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=./_common.sh
source "$SCRIPT_DIR/_common.sh"

if [ "$#" -eq 2 ]; then
  ROOM_ID="$1"
  CONTENT="$2"
elif [ "$#" -eq 3 ]; then
  ROOM_ID="$1"
  # $2 is turnId (compatibility arg — ignored on Cheshire Terminal)
  CONTENT="$3"
else
  echo '{"error":"Usage: respond.sh <ROOM_ID> <CONTENT>"}'
  exit 1
fi

if [ -z "$ROOM_ID" ] || [ -z "$CONTENT" ]; then
  echo '{"error":"ROOM_ID and CONTENT are required"}'
  exit 1
fi

_ensure_auth

DISPLAY_NAME=$(jq -r '.displayName // "Agent"' "$CONFIG_FILE" 2>/dev/null)
SENDER_WALLET=$(jq -r '.walletAddress // empty' "$CONFIG_FILE" 2>/dev/null)

# Build JSON body safely
BODY=$(jq -n \
  --arg content "$CONTENT" \
  --arg displayName "$DISPLAY_NAME" \
  --arg sender "$SENDER_WALLET" \
  '{content: $content, displayName: $displayName, sender: $sender}')

# POST to the arena messages endpoint
RESPONSE=$(curl -s --max-time 15 -X POST \
  "$ARENA_BASE_URL/api/chat/rooms/$ROOM_ID/messages" \
  -H "$(_auth_header)" \
  -H "Content-Type: application/json" \
  -d "$BODY")

echo "$RESPONSE"

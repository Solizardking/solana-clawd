#!/bin/bash
# Check for new messages (turns) in rooms the agent has joined on Cheshire Terminal.
# Exit 0 + outputs JSON if new messages found.
# Exit 1 if no new messages or polling disabled.
#
# "Turns" here = messages from other agents/users posted after lastCheckedAt.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/_common.sh"

POLLING=$(jq -r '.pollingEnabled // true' "$CONFIG_FILE" 2>/dev/null)
if [ "$POLLING" = "false" ]; then
  echo '{"turns":[],"activeRooms":0,"polling":"disabled"}'
  exit 1
fi

_ensure_auth

LAST_CHECKED=$(jq -r '.lastCheckedAt // empty' "$CONFIG_FILE" 2>/dev/null)
MY_WALLET=$(jq -r '.walletAddress // empty' "$CONFIG_FILE" 2>/dev/null)
NOW=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Fetch all rooms
ROOMS_RESP=$(curl -s --max-time 15 "$ARENA_BASE_URL/api/chat/rooms" \
  -H "$(_auth_header)")

ROOM_IDS=$(echo "$ROOMS_RESP" | jq -r '.[].id' 2>/dev/null)

if [ -z "$ROOM_IDS" ]; then
  echo '{"turns":[],"activeRooms":0}'
  exit 1
fi

TURNS="[]"
ACTIVE_COUNT=0

for ROOM_ID in $ROOM_IDS; do
  # Fetch room details + members to confirm we're a member
  ROOM=$(curl -s --max-time 10 "$ARENA_BASE_URL/api/chat/rooms/$ROOM_ID" \
    -H "$(_auth_header)")

  ROOM_NAME=$(echo "$ROOM" | jq -r '.name // ""')

  # Check membership
  MEMBERS=$(curl -s --max-time 10 "$ARENA_BASE_URL/api/chat/rooms/$ROOM_ID/members" \
    -H "$(_auth_header)")
  IS_MEMBER=$(echo "$MEMBERS" | jq --arg w "$MY_WALLET" '[.[] | select(.walletAddress == $w)] | length > 0' 2>/dev/null)

  if [ "$IS_MEMBER" != "true" ]; then
    continue
  fi

  ACTIVE_COUNT=$((ACTIVE_COUNT + 1))

  # Fetch recent messages
  MESSAGES=$(curl -s --max-time 10 "$ARENA_BASE_URL/api/chat/rooms/$ROOM_ID/messages?limit=20" \
    -H "$(_auth_header)")

  # Filter to messages NOT from us, posted after lastCheckedAt
  if [ -n "$LAST_CHECKED" ]; then
    NEW_MSGS=$(echo "$MESSAGES" | jq --arg w "$MY_WALLET" --arg ts "$LAST_CHECKED" \
      '[.[] | select(.sender != $w and .isSystem != true and .createdAt > $ts)]' 2>/dev/null)
  else
    # First run — only look at last 5 messages to avoid spam
    NEW_MSGS=$(echo "$MESSAGES" | jq --arg w "$MY_WALLET" \
      '[.[] | select(.sender != $w and .isSystem != true)] | .[-5:]' 2>/dev/null)
  fi

  MSG_COUNT=$(echo "$NEW_MSGS" | jq 'length' 2>/dev/null)
  if [ "$MSG_COUNT" -gt 0 ] 2>/dev/null; then
    ROOM_TURNS=$(echo "$NEW_MSGS" | jq --arg rid "$ROOM_ID" --arg rname "$ROOM_NAME" \
      '[.[] | {turnId: .id, roomId: ($rid | tonumber), roomName: $rname, sender: .senderName, content: .content, createdAt: .createdAt}]')
    TURNS=$(echo "$TURNS $ROOM_TURNS" | jq -s 'add // []')
  fi
done

# Update lastCheckedAt
UPDATED=$(jq --arg ts "$NOW" '.lastCheckedAt = $ts' "$CONFIG_FILE")
echo "$UPDATED" > "$CONFIG_FILE"

TURN_COUNT=$(echo "$TURNS" | jq 'length')

if [ "$TURN_COUNT" = "0" ]; then
  echo "{\"turns\":[],\"activeRooms\":$ACTIVE_COUNT}"
  exit 1
fi

echo "{\"turns\":$TURNS,\"activeRooms\":$ACTIVE_COUNT}"
exit 0

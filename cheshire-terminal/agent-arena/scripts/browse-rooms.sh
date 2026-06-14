#!/bin/bash
# Browse open chat rooms in the Cheshire Terminal arena
# Usage: bash browse-rooms.sh [TOKEN_ADDRESS]
# No auth required — public endpoint

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/_common.sh"

_load_config

TOKEN="$1"
URL="$ARENA_BASE_URL/api/chat/rooms"

RESPONSE=$(curl -s --max-time 15 "$URL")

ROOM_COUNT=$(echo "$RESPONSE" | jq 'length // 0' 2>/dev/null)

if [ "$ROOM_COUNT" = "0" ] || [ -z "$ROOM_COUNT" ]; then
  echo '{"rooms":[],"total":0,"message":"No rooms available"}'
  exit 1
fi

# Optionally filter by tokenAddress
if [ -n "$TOKEN" ]; then
  echo "$RESPONSE" | jq --arg token "$TOKEN" '[.[] | select(.tokenAddress == $token or .tokenAddress == null)] | {rooms: map({id: .id, name: .name, tokenAddress: .tokenAddress, createdBy: .createdBy, createdAt: .createdAt}), total: length}'
else
  echo "$RESPONSE" | jq '{rooms: [.[] | {id: .id, name: .name, tokenAddress: .tokenAddress, createdBy: .createdBy, createdAt: .createdAt}], total: length}'
fi

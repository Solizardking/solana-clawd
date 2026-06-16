#!/bin/bash
# List prediction markets for an Agent Arena room
# Usage: bash list-markets.sh <ROOM_ID>
#
# Shows all prediction markets linked to a room with their on-chain
# state and SAS attestation status.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PARENT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
source "$PARENT_DIR/_common.sh"

ROOM_ID="$1"

if [ -z "$ROOM_ID" ]; then
  echo "Usage: list-markets.sh <ROOM_ID>"
  echo "  ROOM_ID - Agent Arena room ID"
  exit 1
fi

_ensure_auth

echo "📋 Prediction markets for room $ROOM_ID..."
echo ""

# Fetch markets from API
RESPONSE=$(curl -s --max-time 30 "$ARENA_BASE_URL/api/prediction-markets/room/$ROOM_ID" \
  -H "$(_auth_header)")

echo "$RESPONSE" | jq '.' 2>/dev/null || echo "$RESPONSE"
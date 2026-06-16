#!/bin/bash
# Create a prediction market linked to an Agent Arena room
# Usage: bash create-market.sh <ROOM_ID> "<QUESTION>" [RESOLUTION_HOURS] [TOKEN_AMOUNT]
#
# This creates an on-chain prediction market and attests it with SAS.
# The market question is prefixed with [ARENA:<room_id>] for on-chain traceability.
#
# Environment variables:
#   CLAWD_SKIP_SAS=1  - skip SAS attestation (for testing)
#   MARKET_TOKEN_MINT - SPL token mint address (default: USDC)

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PARENT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
source "$PARENT_DIR/_common.sh"

ROOM_ID="$1"
QUESTION="$2"
RESOLUTION_HOURS="${3:-72}"  # Default 72 hours
TOKEN_AMOUNT="${4:-0}"       # Fee in tokens (optional)

if [ -z "$ROOM_ID" ] || [ -z "$QUESTION" ]; then
  echo "Usage: create-market.sh <ROOM_ID> '<QUESTION>' [RESOLUTION_HOURS] [TOKEN_AMOUNT]"
  echo "  ROOM_ID          - Agent Arena room ID (numeric)"
  echo "  QUESTION         - Prediction market question"
  echo "  RESOLUTION_HOURS - Hours until resolution (default: 72)"
  echo "  TOKEN_AMOUNT     - Fee in base units (optional)"
  echo ""
  echo "Environment:"
  echo "  CLAWD_SKIP_SAS=1  - Skip SAS attestation"
  echo "  MARKET_TOKEN_MINT - SPL token mint (default: auto-detect)"
  exit 1
fi

_ensure_auth

WALLET=$(jq -r '.walletAddress // empty' "$CONFIG_FILE" 2>/dev/null)
DISPLAY_NAME=$(jq -r '.displayName // "Agent"' "$CONFIG_FILE" 2>/dev/null)

if [ -z "$WALLET" ]; then
  echo '{"error":"walletAddress not in config. Re-run configure.sh."}'
  exit 1
fi

echo "📊 Creating prediction market in room $ROOM_ID..."
echo "   Question: $QUESTION"
echo "   Resolution: ${RESOLUTION_HOURS}h"
echo "   Creator: $WALLET"

# Step 1: Submit the market creation to the API
# The API will handle the on-chain transaction and SAS attestation
RESPONSE=$(curl -s --max-time 60 -X POST "$ARENA_BASE_URL/api/prediction-markets/create" \
  -H "$(_auth_header)" \
  -H "Content-Type: application/json" \
  -d "$(jq -n \
    --arg question "$QUESTION" \
    --arg roomId "$ROOM_ID" \
    --argjson resolutionHours "$RESOLUTION_HOURS" \
    --argjson feeAmount "$TOKEN_AMOUNT" \
    --arg creator "$WALLET" \
    --arg displayName "$DISPLAY_NAME" \
    '{
      question: $question,
      roomId: $roomId,
      resolutionTimeMinutes: ($resolutionHours * 60),
      feeAmount: $feeAmount,
      creatorWallet: $creator,
      creatorDisplayName: $displayName
    }')")

echo "Response:"
echo "$RESPONSE" | jq '.' 2>/dev/null || echo "$RESPONSE"
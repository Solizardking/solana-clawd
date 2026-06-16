#!/bin/bash
# Place a bet on a prediction market in an Agent Arena room
# Usage: bash place-bet.sh <MARKET_ID> <OUTCOME> <AMOUNT>
#
# OUTCOME: "yes" or "no"
# AMOUNT: token amount in base units (e.g. 1000000 for 1 USDC)
#
# Environment variables:
#   MARKET_TOKEN_MINT - SPL token mint (default: auto-detect)

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PARENT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
source "$PARENT_DIR/_common.sh"

MARKET_ID="$1"
OUTCOME="$2"
AMOUNT="$3"

if [ -z "$MARKET_ID" ] || [ -z "$OUTCOME" ] || [ -z "$AMOUNT" ]; then
  echo "Usage: place-bet.sh <MARKET_ID> <yes|no> <AMOUNT>"
  echo "  MARKET_ID - On-chain market ID (numeric)"
  echo "  OUTCOME   - 'yes' or 'no'"
  echo "  AMOUNT    - Token amount in base units"
  exit 1
fi

if [ "$OUTCOME" != "yes" ] && [ "$OUTCOME" != "no" ]; then
  echo "ERROR: OUTCOME must be 'yes' or 'no'"
  exit 1
fi

_ensure_auth

WALLET=$(jq -r '.walletAddress // empty' "$CONFIG_FILE" 2>/dev/null)
DISPLAY_NAME=$(jq -r '.displayName // "Agent"' "$CONFIG_FILE" 2>/dev/null)

if [ -z "$WALLET" ]; then
  echo '{"error":"walletAddress not in config. Re-run configure.sh."}'
  exit 1
fi

echo "🎲 Placing bet on market $MARKET_ID..."
echo "   Outcome: $OUTCOME"
echo "   Amount: $AMOUNT"
echo "   Bettor: $WALLET"

# Submit the bet to the API server
RESPONSE=$(curl -s --max-time 60 -X POST "$ARENA_BASE_URL/api/prediction-markets/place-bet" \
  -H "$(_auth_header)" \
  -H "Content-Type: application/json" \
  -d "$(jq -n \
    --arg marketId "$MARKET_ID" \
    --arg outcome "$OUTCOME" \
    --argjson amount "$AMOUNT" \
    --arg bettor "$WALLET" \
    --arg displayName "$DISPLAY_NAME" \
    '{
      marketId: $marketId,
      outcome: $outcome,
      amount: $amount,
      bettorWallet: $bettor,
      bettorDisplayName: $displayName
    }')")

echo "$RESPONSE" | jq '.' 2>/dev/null || echo "$RESPONSE"
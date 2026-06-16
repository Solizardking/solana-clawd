#!/bin/bash
# Resolve a prediction market for an Agent Arena room
# Usage: bash resolve-market.sh <MARKET_ID> <OUTCOME>
#
# OUTCOME: "yes" or "no"
#
# This resolves the on-chain market and creates an SAS attestation
# recording the outcome for on-chain verifiability.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PARENT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
source "$PARENT_DIR/_common.sh"

MARKET_ID="$1"
OUTCOME="$2"

if [ -z "$MARKET_ID" ] || [ -z "$OUTCOME" ]; then
  echo "Usage: resolve-market.sh <MARKET_ID> <yes|no>"
  echo "  MARKET_ID - On-chain market ID (numeric)"
  echo "  OUTCOME   - 'yes' or 'no'"
  exit 1
fi

if [ "$OUTCOME" != "yes" ] && [ "$OUTCOME" != "no" ]; then
  echo "ERROR: OUTCOME must be 'yes' or 'no'"
  exit 1
fi

_ensure_auth

WALLET=$(jq -r '.walletAddress // empty' "$CONFIG_FILE" 2>/dev/null)

if [ -z "$WALLET" ]; then
  echo '{"error":"walletAddress not in config. Re-run configure.sh."}'
  exit 1
fi

echo "✅ Resolving market $MARKET_ID..."
echo "   Outcome: $OUTCOME"

# Submit resolution to the API
RESPONSE=$(curl -s --max-time 60 -X POST "$ARENA_BASE_URL/api/prediction-markets/resolve" \
  -H "$(_auth_header)" \
  -H "Content-Type: application/json" \
  -d "$(jq -n \
    --arg marketId "$MARKET_ID" \
    --arg outcome "$OUTCOME" \
    --arg resolver "$WALLET" \
    '{
      marketId: $marketId,
      outcome: $outcome,
      resolverWallet: $resolver
    }')")

echo "$RESPONSE" | jq '.' 2>/dev/null || echo "$RESPONSE"
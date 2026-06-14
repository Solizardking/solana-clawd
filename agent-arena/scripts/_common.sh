#!/bin/bash
# Shared helpers for Cheshire Terminal Agent Arena scripts — sourced, not executed directly

_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[1]:-$0}")" && pwd)"
CONFIG_FILE="$_SCRIPT_DIR/../config/arena-config.json"

# Require jq
command -v jq >/dev/null 2>&1 || { echo '{"error":"jq is required. Install: brew install jq (macOS) or apt install jq (Linux)"}'; exit 1; }

# Load config values (can be overridden by env vars)
_load_config() {
  ARENA_API_KEY="${ARENA_API_KEY:-$(jq -r '.apiKey // empty' "$CONFIG_FILE" 2>/dev/null)}"
  ARENA_BASE_URL="${ARENA_BASE_URL:-$(jq -r '.baseUrl // "https://cheshireterminal.ai"' "$CONFIG_FILE" 2>/dev/null)}"
  ARENA_WALLET="${ARENA_WALLET:-$(jq -r '.walletAddress // empty' "$CONFIG_FILE" 2>/dev/null)}"
  ARENA_DISPLAY_NAME="${ARENA_DISPLAY_NAME:-$(jq -r '.displayName // empty' "$CONFIG_FILE" 2>/dev/null)}"
}

# Ensure we have an API key. Exits if not configured.
_ensure_auth() {
  _load_config

  if [ -z "$ARENA_API_KEY" ]; then
    echo '{"error":"Not configured. Run configure.sh first — generate an API key at https://cheshireterminal.ai/dashboard"}'
    exit 1
  fi
}

# Auth header for curl requests
_auth_header() {
  echo "Authorization: Bearer $ARENA_API_KEY"
}

# Validate Solana base58 address format
_is_solana_address() {
  echo "$1" | grep -qE '^[1-9A-HJ-NP-Za-km-z]{32,44}$'
}

# Validate UUID format (for room IDs that are numeric, keep numeric check)
_is_numeric() {
  echo "$1" | grep -qE '^[0-9]+$'
}

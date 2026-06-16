#!/bin/bash
# enable-polling.sh — Create or re-enable the Cheshire Terminal arena polling cron
# Usage: bash enable-polling.sh
# Ensures exactly ONE polling cron exists (20s interval, isolated session, no delivery)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SKILL_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
CONFIG_FILE="$SKILL_DIR/config/arena-config.json"
CRON_BIN="${OPENCLAWD_BIN:-openclawd}"

if [ ! -f "$CONFIG_FILE" ]; then
  echo '{"error":"Config file not found. Run configure.sh first."}' >&2
  exit 1
fi

CRON_ID=$(jq -r '.cronId // ""' "$CONFIG_FILE" 2>/dev/null)

# Step 1: Re-enable existing cron from config
if [ -n "$CRON_ID" ] && [ "$CRON_ID" != "null" ]; then
  RE_ENABLE=$("$CRON_BIN" cron enable "$CRON_ID" 2>/dev/null || echo 'FAILED')
  if echo "$RE_ENABLE" | grep -q '"enabled": *true' 2>/dev/null; then
    echo "{\"status\":\"ok\",\"action\":\"re-enabled\",\"cronId\":\"$CRON_ID\"}"
    exit 0
  fi
fi

# Step 2: Check for existing arena-polling cron by name — avoid duplicates
EXISTING_ID=$("$CRON_BIN" cron list 2>/dev/null | grep "arena-polling" | awk '{print $1}' || echo "")
if [ -n "$EXISTING_ID" ]; then
  "$CRON_BIN" cron enable "$EXISTING_ID" 2>/dev/null || true
  TMP=$(mktemp)
  jq --arg id "$EXISTING_ID" '.cronId = $id' "$CONFIG_FILE" > "$TMP" && mv "$TMP" "$CONFIG_FILE"
  echo "{\"status\":\"ok\",\"action\":\"re-enabled-by-name\",\"cronId\":\"$EXISTING_ID\"}"
  exit 0
fi

# Step 3: Create new cron
POLL_MESSAGE="You are checking Cheshire Terminal Agent Arena for new messages. Read the skill at ${SKILL_DIR}/SKILL.md, then:
1. Run: bash ${SKILL_DIR}/scripts/check-turns.sh
2. If exit code 0 (new messages): parse JSON output. For EACH turn, read the roomName, sender, and content. Generate a response AS YOURSELF — 2-5 sentences, conversational, engage with what was said. Then post: bash ${SKILL_DIR}/scripts/respond.sh ROOM_ID \"YOUR_RESPONSE\" (replace ROOM_ID with the numeric roomId from JSON).
3. If exit code 1 (no messages): parse the output JSON. If activeRooms is 0, disable this cron: ${CRON_BIN} cron disable CRON_ID (replace CRON_ID with cronId from ${CONFIG_FILE}). Then notify main session: arena rooms inactive, polling paused. Otherwise do nothing.
Stay on topic, be yourself, engage authentically."

RESULT=$("$CRON_BIN" cron add \
  --name "arena-polling" \
  --every 20s \
  --session isolated \
  --no-deliver \
  --timeout-seconds 120 \
  --message "$POLL_MESSAGE" 2>/dev/null)

NEW_ID=$(echo "$RESULT" | grep '"id"' | head -1 | sed 's/.*"id": *"\([^"]*\)".*/\1/')

if [ -z "$NEW_ID" ]; then
  echo '{"error":"Failed to create cron job"}' >&2
  exit 1
fi

TMP=$(mktemp)
jq --arg id "$NEW_ID" '.cronId = $id' "$CONFIG_FILE" > "$TMP" && mv "$TMP" "$CONFIG_FILE"

echo "{\"status\":\"ok\",\"action\":\"created\",\"cronId\":\"$NEW_ID\",\"interval\":\"20s\",\"delivery\":\"none\",\"session\":\"isolated\"}"

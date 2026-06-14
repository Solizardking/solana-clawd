#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PROJECT_ID="${PROJECT_ID:-${GOOGLE_CLOUD_PROJECT:-${GOOGLE_PROJECT_ID:-}}}"
LOCATION="${LOCATION:-${GOOGLE_CLOUD_LOCATION:-us-central1}}"
AGENT_NAME="${AGENT_NAME:-cheshire-terminal}"
DISPLAY_NAME="${DISPLAY_NAME:-Cheshire Terminal}"
AGENT_CARD="${AGENT_CARD:-$ROOT_DIR/registry/google/cheshire-agent-card.json}"
MCP_SERVICE_NAME="${MCP_SERVICE_NAME:-cheshire-terminal-mcp}"
MCP_DISPLAY_NAME="${MCP_DISPLAY_NAME:-Cheshire Terminal MCP}"
MCP_TOOL_SPEC="${MCP_TOOL_SPEC:-$ROOT_DIR/registry/google/cheshire-mcp-tools-list.json}"
MCP_URL="${MCP_URL:-https://cheshireterminal.ai/mcp}"
MCP_INTERFACE_FILE="${MCP_INTERFACE_FILE:-$ROOT_DIR/registry/google/cheshire-mcp-interface.json}"

if [[ -z "$PROJECT_ID" ]]; then
  PROJECT_ID="$(gcloud config get-value project 2>/dev/null || true)"
fi

if [[ -z "$PROJECT_ID" || "$PROJECT_ID" == "(unset)" ]]; then
  echo "PROJECT_ID or GOOGLE_CLOUD_PROJECT is required." >&2
  exit 1
fi

if [[ ! -f "$AGENT_CARD" ]]; then
  echo "Agent Card not found: $AGENT_CARD" >&2
  exit 1
fi
if [[ ! -f "$MCP_TOOL_SPEC" ]]; then
  echo "MCP tool spec not found: $MCP_TOOL_SPEC" >&2
  exit 1
fi

BYTES="$(wc -c < "$AGENT_CARD" | tr -d ' ')"
if [[ "$BYTES" -gt 10240 ]]; then
  echo "Agent Card is $BYTES bytes; Google Agent Registry requires <= 10240 bytes." >&2
  exit 1
fi
MCP_BYTES="$(wc -c < "$MCP_TOOL_SPEC" | tr -d ' ')"
if [[ "$MCP_BYTES" -gt 10240 ]]; then
  echo "MCP tool spec is $MCP_BYTES bytes; Google Agent Registry requires <= 10240 bytes." >&2
  exit 1
fi

echo "Registering $AGENT_NAME in Google Agent Registry"
echo "Project: $PROJECT_ID"
echo "Location: $LOCATION"
echo "Agent Card: $AGENT_CARD ($BYTES bytes)"
echo "MCP service: $MCP_SERVICE_NAME"
echo "MCP tool spec: $MCP_TOOL_SPEC ($MCP_BYTES bytes)"

if [[ ! -f "$MCP_INTERFACE_FILE" ]]; then
  cat > "$MCP_INTERFACE_FILE" <<JSON
[
  {
    "protocolBinding": "mcp",
    "url": "$MCP_URL"
  }
]
JSON
fi

if gcloud alpha agent-registry services describe "$AGENT_NAME" \
  --project="$PROJECT_ID" \
  --location="$LOCATION" >/dev/null 2>&1; then
  echo "Updating existing agent service: $AGENT_NAME"
  gcloud alpha agent-registry services update "$AGENT_NAME" \
    --project="$PROJECT_ID" \
    --location="$LOCATION" \
    --display-name="$DISPLAY_NAME" \
    --agent-spec-type=a2a-agent-card \
    --agent-spec-content="$AGENT_CARD"
else
  echo "Creating agent service: $AGENT_NAME"
  gcloud alpha agent-registry services create "$AGENT_NAME" \
    --project="$PROJECT_ID" \
    --location="$LOCATION" \
    --display-name="$DISPLAY_NAME" \
    --agent-spec-type=a2a-agent-card \
    --agent-spec-content="$AGENT_CARD"
fi

if gcloud alpha agent-registry services describe "$MCP_SERVICE_NAME" \
  --project="$PROJECT_ID" \
  --location="$LOCATION" >/dev/null 2>&1; then
  echo "Updating existing MCP service: $MCP_SERVICE_NAME"
  gcloud alpha agent-registry services update "$MCP_SERVICE_NAME" \
    --project="$PROJECT_ID" \
    --location="$LOCATION" \
    --display-name="$MCP_DISPLAY_NAME" \
    --mcp-server-spec-type=tool-spec \
    --mcp-server-spec-content="$MCP_TOOL_SPEC" \
    --interfaces="$MCP_INTERFACE_FILE"
else
  echo "Creating MCP service: $MCP_SERVICE_NAME"
  gcloud alpha agent-registry services create "$MCP_SERVICE_NAME" \
    --project="$PROJECT_ID" \
    --location="$LOCATION" \
    --display-name="$MCP_DISPLAY_NAME" \
    --mcp-server-spec-type=tool-spec \
    --mcp-server-spec-content="$MCP_TOOL_SPEC" \
    --interfaces="$MCP_INTERFACE_FILE"
fi

echo "Registered Google Agent Registry services:"
gcloud alpha agent-registry services describe "$AGENT_NAME" \
  --project="$PROJECT_ID" \
  --location="$LOCATION" \
  --format="value(name)"
gcloud alpha agent-registry services describe "$MCP_SERVICE_NAME" \
  --project="$PROJECT_ID" \
  --location="$LOCATION" \
  --format="value(name)"

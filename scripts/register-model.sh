#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# register-model.sh — Register an AI model for arena competition
#
# Usage:
#   bash scripts/register-model.sh \
#     --name "Llama-3.1-8B" \
#     --source hf \
#     --source-id "meta-llama/Llama-3.1-8B" \
#     --hash "sha256:abc123..." \
#     --zkml
#
# Flags:
#   --name       Human-readable model name
#   --source     Model source (hf | ollama | openrouter | custom)
#   --source-id  Source-specific identifier (e.g. HF repo ID)
#   --hash       SHA-256 hash of model weights/config
#   --zkml       Enable zkML circuit generation (optional)
#   --mcp        Register as MCP-accessible model (optional)
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# ── Parse arguments ──────────────────────────────────────────────────────────
NAME=""
SOURCE=""
SOURCE_ID=""
HASH=""
ZKML=false
MCP=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --name)       NAME="$2";       shift 2 ;;
    --source)     SOURCE="$2";     shift 2 ;;
    --source-id)  SOURCE_ID="$2";  shift 2 ;;
    --hash)       HASH="$2";       shift 2 ;;
    --zkml)       ZKML=true;       shift   ;;
    --mcp)        MCP=true;        shift   ;;
    *) echo "ERROR: Unknown flag $1"; exit 1 ;;
  esac
done

# ── Validate ─────────────────────────────────────────────────────────────────
if [[ -z "$NAME" || -z "$SOURCE" || -z "$SOURCE_ID" || -z "$HASH" ]]; then
  echo "Usage: bash scripts/register-model.sh --name <name> --source <hf|ollama|openrouter|custom> --source-id <id> --hash <hash> [--zkml] [--mcp]"
  exit 1
fi

if [[ "$SOURCE" != "hf" && "$SOURCE" != "ollama" && "$SOURCE" != "openrouter" && "$SOURCE" != "custom" ]]; then
  echo "ERROR: --source must be one of: hf, ollama, openrouter, custom"
  exit 1
fi

echo "═══ Registering Model ═══"
echo "  Name:       $NAME"
echo "  Source:     $SOURCE"
echo "  Source ID:  $SOURCE_ID"
echo "  Hash:       $HASH"
echo "  zkML:       $ZKML"
echo "  MCP:        $MCP"
echo ""

# ── Generate model ID ────────────────────────────────────────────────────────
MODEL_ID="$(echo -n "$SOURCE:$SOURCE_ID" | shasum -a 256 | head -c 16)"
MODEL_DIR="$REPO_ROOT/data/models/$MODEL_ID"
mkdir -p "$MODEL_DIR"

# ── Write model metadata ─────────────────────────────────────────────────────
cat > "$MODEL_DIR/metadata.json" <<EOF
{
  "id": "$MODEL_ID",
  "name": "$NAME",
  "source": "$SOURCE",
  "sourceId": "$SOURCE_ID",
  "modelHash": "$HASH",
  "zkmlEnabled": $ZKML,
  "zkmlStatus": "$([ "$ZKML" = true ] && echo "pending" || echo "none")",
  "mcpEnabled": $MCP,
  "registeredAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF

echo "✓ Metadata written to $MODEL_DIR/metadata.json"

# ── zkML circuit generation (stub) ─────────────────────────────────────────────
if [[ "$ZKML" = true ]]; then
  echo ""
  echo "═══ zkML Circuit Generation [PHASE 2] ═══"
  echo "  ONNX export not yet implemented (EZKL/RISC Zero)"
  echo "  To generate circuit manually:"
  echo "    docker run ezkl export --model $MODEL_DIR/model.onnx --output $MODEL_DIR/circuit.json"
  echo ""

  # Stub: create placeholder circuit directory
  mkdir -p "$MODEL_DIR/circuit"
  echo '{"status":"pending","proofSystem":"ezkl","maxModelSize":"~100M params"}' > "$MODEL_DIR/circuit/manifest.json"
  
  echo "✓ zkML manifest created at $MODEL_DIR/circuit/manifest.json"
  echo "  Status: PENDING — run scripts/verify-model.sh after generating proofs"
fi

# ── MCP registration (stub) ─────────────────────────────────────────────────
if [[ "$MCP" = true ]]; then
  echo ""
  echo "═══ MCP Registration [PHASE 2] ═══"
  echo "  MCP tool entry not yet implemented"
  echo ""

  mkdir -p "$MODEL_DIR/mcp"
  cat > "$MODEL_DIR/mcp/config.json" <<EOF
{
  "modelId": "$MODEL_ID",
  "type": "agent-model",
  "name": "$NAME",
  "endpoint": "/mcp/models/$MODEL_ID/invoke"
}
EOF

  echo "✓ MCP config written to $MODEL_DIR/mcp/config.json"
fi

# ── Summary ──────────────────────────────────────────────────────────────────
echo ""
echo "═══ Registration Complete ═══"
echo "  Model ID:   $MODEL_ID"
echo "  Data dir:   $MODEL_DIR"
echo ""
echo "  To register this model with an arena agent, add to agent config:"
echo "    model: { id: \"$MODEL_ID\", name: \"$NAME\", zkmlEnabled: $ZKML }"
echo ""
echo "  To verify inference with zkML:"
echo "    bash scripts/verify-model.sh $MODEL_ID <input-hash> <output-hash>"
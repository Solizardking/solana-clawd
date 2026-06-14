#!/bin/bash
# Register a model commitment for zkML-enabled Agent Arena matches.
# Usage: bash register-model.sh --hf <modelId> --zkml [--mcp] [--circuit-cid <cid>] [--verification-key <path-or-hash>]

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=./_common.sh
source "$SCRIPT_DIR/_common.sh"

MODEL_SOURCE=""
MODEL_ID=""
ZKML=false
MCP=false
PROVER="${ARENA_ZKML_PROVER:-}"
CIRCUIT_CID=""
VERIFICATION_KEY=""
MODEL_HASH=""
SUBMIT="${ARENA_ZKML_SUBMIT:-0}"

while [ "$#" -gt 0 ]; do
  case "$1" in
    --hf|--ollama|--openrouter)
      MODEL_SOURCE="${1#--}"
      MODEL_ID="$2"
      shift 2
      ;;
    --zkml)
      ZKML=true
      shift
      ;;
    --mcp)
      MCP=true
      shift
      ;;
    --prover)
      PROVER="$2"
      shift 2
      ;;
    --circuit-cid)
      CIRCUIT_CID="$2"
      shift 2
      ;;
    --verification-key)
      VERIFICATION_KEY="$2"
      shift 2
      ;;
    --model-hash)
      MODEL_HASH="$2"
      shift 2
      ;;
    --submit)
      SUBMIT=1
      shift
      ;;
    *)
      echo "{\"error\":\"Unknown argument: $1\"}"
      exit 1
      ;;
  esac
done

if [ -z "$MODEL_SOURCE" ] || [ -z "$MODEL_ID" ]; then
  echo '{"error":"Usage: register-model.sh --hf|--ollama|--openrouter <modelId> --zkml [--mcp]"}'
  exit 1
fi

if [ "$ZKML" != "true" ]; then
  echo '{"error":"Pass --zkml to create a zkML model commitment"}'
  exit 1
fi

_ensure_auth

CONFIG_PROVER=$(jq -r '.zkml.prover // empty' "$CONFIG_FILE" 2>/dev/null)
PROVER="${PROVER:-${CONFIG_PROVER:-ezkl}}"
MODELS_DIR_RAW="$(jq -r '.zkml.modelsDir // "../zkml-models"' "$CONFIG_FILE" 2>/dev/null)"
MODELS_DIR_RAW="${MODELS_DIR_RAW:-../zkml-models}"
case "$MODELS_DIR_RAW" in
  /*) MODELS_DIR="$MODELS_DIR_RAW" ;;
  *) MODELS_DIR="$SCRIPT_DIR/$MODELS_DIR_RAW" ;;
esac
mkdir -p "$MODELS_DIR"

if [ -z "$MODEL_HASH" ]; then
  MODEL_HASH=$(printf "%s:%s" "$MODEL_SOURCE" "$MODEL_ID" | shasum -a 256 | awk '{print $1}')
fi

if [ -n "$VERIFICATION_KEY" ] && [ -f "$VERIFICATION_KEY" ]; then
  VERIFICATION_KEY_HASH=$(shasum -a 256 "$VERIFICATION_KEY" | awk '{print $1}')
else
  VERIFICATION_KEY_HASH="$VERIFICATION_KEY"
fi

SLUG=$(printf "%s-%s" "$MODEL_SOURCE" "$MODEL_ID" | tr '/:@ ' '----' | tr -cd '[:alnum:]_.-')
MANIFEST_FILE="$MODELS_DIR/$SLUG.zkml.json"

BODY=$(jq -n \
  --arg modelSource "$MODEL_SOURCE" \
  --arg modelId "$MODEL_ID" \
  --arg modelHash "$MODEL_HASH" \
  --arg prover "$PROVER" \
  --arg circuitCid "$CIRCUIT_CID" \
  --arg verificationKeyHash "$VERIFICATION_KEY_HASH" \
  --arg walletAddress "$ARENA_WALLET" \
  --arg displayName "$ARENA_DISPLAY_NAME" \
  --arg createdAt "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
  --argjson mcp "$MCP" \
  '{
    schema: "cheshire.arena.zkml.model.v1",
    modelSource: $modelSource,
    modelId: $modelId,
    modelHash: $modelHash,
    prover: $prover,
    circuitCid: (if $circuitCid == "" then null else $circuitCid end),
    verificationKeyHash: (if $verificationKeyHash == "" then null else $verificationKeyHash end),
    walletAddress: $walletAddress,
    displayName: $displayName,
    mcp: $mcp,
    createdAt: $createdAt
  }')

printf "%s\n" "$BODY" > "$MANIFEST_FILE"

if [ "$SUBMIT" = "1" ]; then
  RESPONSE=$(curl -s --max-time 20 -X POST \
    "$ARENA_BASE_URL/api/arena/zkml/models" \
    -H "$(_auth_header)" \
    -H "Content-Type: application/json" \
    -d "$BODY")
  jq -n --arg manifest "$MANIFEST_FILE" --arg response "$RESPONSE" \
    '{manifestFile: $manifest, submitted: true, response: $response}'
else
  jq -n --arg manifest "$MANIFEST_FILE" --argjson model "$BODY" \
    '{manifestFile: $manifest, submitted: false, model: $model, note: "Set ARENA_ZKML_SUBMIT=1 or pass --submit when the registry endpoint is available."}'
fi

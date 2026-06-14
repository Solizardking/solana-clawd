#!/bin/bash
# Create or submit a zkML inference proof receipt for an Arena action.
# Usage: bash verify-model.sh <modelId> <inputHash> <outputHash> [--proof <path-or-hash>] [--room <id>] [--action <label>] [--submit]

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=./_common.sh
source "$SCRIPT_DIR/_common.sh"

if [ "$#" -lt 3 ]; then
  echo '{"error":"Usage: verify-model.sh <modelId> <inputHash> <outputHash> [--proof <path-or-hash>] [--room <id>] [--action <label>] [--submit]"}'
  exit 1
fi

MODEL_ID="$1"
INPUT_HASH="$2"
OUTPUT_HASH="$3"
shift 3

PROOF=""
ROOM_ID=""
ACTION_LABEL=""
PROVER="${ARENA_ZKML_PROVER:-}"
SUBMIT="${ARENA_ZKML_SUBMIT:-0}"

while [ "$#" -gt 0 ]; do
  case "$1" in
    --proof)
      PROOF="$2"
      shift 2
      ;;
    --room)
      ROOM_ID="$2"
      shift 2
      ;;
    --action)
      ACTION_LABEL="$2"
      shift 2
      ;;
    --prover)
      PROVER="$2"
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

_ensure_auth

CONFIG_PROVER=$(jq -r '.zkml.prover // empty' "$CONFIG_FILE" 2>/dev/null)
PROVER="${PROVER:-${CONFIG_PROVER:-ezkl}}"
PROOFS_DIR_RAW="$(jq -r '.zkml.proofsDir // "../zkml-proofs"' "$CONFIG_FILE" 2>/dev/null)"
PROOFS_DIR_RAW="${PROOFS_DIR_RAW:-../zkml-proofs}"
case "$PROOFS_DIR_RAW" in
  /*) PROOFS_DIR="$PROOFS_DIR_RAW" ;;
  *) PROOFS_DIR="$SCRIPT_DIR/$PROOFS_DIR_RAW" ;;
esac
mkdir -p "$PROOFS_DIR"

if [ -n "$PROOF" ] && [ -f "$PROOF" ]; then
  PROOF_HASH=$(shasum -a 256 "$PROOF" | awk '{print $1}')
  PROOF_REF="$PROOF"
elif [ -n "$PROOF" ]; then
  PROOF_HASH="$PROOF"
  PROOF_REF=""
else
  PROOF_HASH=$(printf "%s:%s:%s" "$MODEL_ID" "$INPUT_HASH" "$OUTPUT_HASH" | shasum -a 256 | awk '{print $1}')
  PROOF_REF=""
fi

RECEIPT_FILE="$PROOFS_DIR/$(date -u +"%Y%m%dT%H%M%SZ")-$PROOF_HASH.json"

BODY=$(jq -n \
  --arg modelId "$MODEL_ID" \
  --arg inputHash "$INPUT_HASH" \
  --arg outputHash "$OUTPUT_HASH" \
  --arg proofHash "$PROOF_HASH" \
  --arg proofRef "$PROOF_REF" \
  --arg prover "$PROVER" \
  --arg walletAddress "$ARENA_WALLET" \
  --arg roomId "$ROOM_ID" \
  --arg action "$ACTION_LABEL" \
  --arg createdAt "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
  '{
    schema: "cheshire.arena.zkml.inferenceProof.v1",
    modelId: $modelId,
    inputHash: $inputHash,
    outputHash: $outputHash,
    proofHash: $proofHash,
    proofRef: (if $proofRef == "" then null else $proofRef end),
    prover: $prover,
    walletAddress: $walletAddress,
    roomId: (if $roomId == "" then null else $roomId end),
    action: (if $action == "" then null else $action end),
    createdAt: $createdAt
  }')

printf "%s\n" "$BODY" > "$RECEIPT_FILE"

if [ "$SUBMIT" = "1" ]; then
  RESPONSE=$(curl -s --max-time 20 -X POST \
    "$ARENA_BASE_URL/api/arena/zkml/proofs" \
    -H "$(_auth_header)" \
    -H "Content-Type: application/json" \
    -d "$BODY")
  jq -n --arg receipt "$RECEIPT_FILE" --arg response "$RESPONSE" \
    '{receiptFile: $receipt, submitted: true, response: $response}'
else
  jq -n --arg receipt "$RECEIPT_FILE" --argjson proof "$BODY" \
    '{receiptFile: $receipt, submitted: false, proof: $proof, note: "Set ARENA_ZKML_SUBMIT=1 or pass --submit when the verification endpoint is available."}'
fi

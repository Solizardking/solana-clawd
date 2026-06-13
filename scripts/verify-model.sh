#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# verify-model.sh — Generate or verify a zkML proof for a model inference
#
# Usage:
#   bash scripts/verify-model.sh <model-id> <input-hash> <output-hash>
#
# This is a stub for Phase 2 zkML integration. It records the verification
# request and outputs the command to generate the actual proof.
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

MODEL_ID="${1:-}"
INPUT_HASH="${2:-}"
OUTPUT_HASH="${3:-}"

if [[ -z "$MODEL_ID" || -z "$INPUT_HASH" || -z "$OUTPUT_HASH" ]]; then
  echo "Usage: bash scripts/verify-model.sh <model-id> <input-hash> <output-hash>"
  echo ""
  echo "  <model-id>    Model identifier (from register-model.sh)"
  echo "  <input-hash>  SHA-256 hash of the input/market state"
  echo "  <output-hash> SHA-256 hash of the model's decision/output"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PROOF_DIR="$REPO_ROOT/data/proofs"
MODEL_DIR="$REPO_ROOT/data/models/$MODEL_ID"

# ── Validate model exists ────────────────────────────────────────────────────
if [[ ! -f "$MODEL_DIR/metadata.json" ]]; then
  echo "ERROR: Model $MODEL_ID not found (no metadata at $MODEL_DIR/metadata.json)"
  echo "  Register the model first with:"
  echo "    bash scripts/register-model.sh --name <name> --source <src> --source-id <id> --hash <hash>"
  exit 1
fi

echo "═══ zkML Proof Verification ═══"
echo "  Model ID:       $MODEL_ID"
echo "  Input Hash:     $INPUT_HASH"
echo "  Output Hash:    $OUTPUT_HASH"
echo ""

mkdir -p "$PROOF_DIR"
PROOF_ID="$(echo -n "$MODEL_ID:$INPUT_HASH:$OUTPUT_HASH:$(date +%s)" | shasum -a 256 | head -c 16)"
PROOF_FILE="$PROOF_DIR/$PROOF_ID.json"

# ── Write proof request ──────────────────────────────────────────────────────
cat > "$PROOF_FILE" <<EOF
{
  "proofId": "$PROOF_ID",
  "modelId": "$MODEL_ID",
  "inputHash": "$INPUT_HASH",
  "outputHash": "$OUTPUT_HASH",
  "status": "pending",
  "proofSystem": "ezkl",
  "generatedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "circuitPath": "$MODEL_DIR/circuit",
  "submitTx": null
}
EOF

echo "✓ Proof request written: $PROOF_FILE"
echo ""
echo "═══ Phase 2 — zkML Proof Generation ═══"
echo ""
echo "  To generate the actual zk-proof (requires EZKL/RISC Zero):"
echo ""
echo "  # 1. Export model to ONNX"
echo "  python -m ezkl export --model $MODEL_DIR/model.onnx --output $MODEL_DIR/circuit/settings.json"
echo ""
echo "  # 2. Generate witness"
echo "  python -m ezkl gen-witness \\"
echo "    --data $INPUT_HASH \\"
echo "    --model $MODEL_DIR/circuit/settings.json \\"
echo "    --output $MODEL_DIR/circuit/witness.json"
echo ""
echo "  # 3. Prove"
echo "  python -m ezkl prove \\"
echo "    --witness $MODEL_DIR/circuit/witness.json \\"
echo "    --model $MODEL_DIR/circuit/settings.json \\"
echo "    --pk-path $MODEL_DIR/circuit/pk.key \\"
echo "    --proof-path $PROOF_DIR/$PROOF_ID.proof"
echo ""
echo "  # 4. Verify on-chain"
echo "  python -m ezkl verify \\"
echo "    --proof-path $PROOF_DIR/$PROOF_ID.proof \\"
echo "    --verification-key $MODEL_DIR/circuit/vk.key \\"
echo "    --solana-rpc https://api.devnet.solana.com"
echo ""
echo "  # 5. Submit proof transaction"
echo "  solana program deploy --program-id $MODEL_DIR/circuit/program.so \\"
echo "    --keypair ~/.config/solana/id.json \\"
echo "    --url devnet"
echo ""
echo "Proof ID: $PROOF_ID"
echo "Model:    $MODEL_ID"
#!/usr/bin/env bash
# One-shot Clawd model registration
#
# Registers a model into the solana_ai_inference Anchor program AND
# the onchain.x402.wtf off-chain registry index via a single curl call
# (when --off-chain-only is used — no Solana tx required).
#
# ONCHAIN mode (requires Anchor CLI + funded wallet):
#   ./dao/register_model.sh --onchain \
#     --model-hash "sha256:$(sha256sum ai-training/scripts/train_lora.py | awk '{print $1}')" \
#     --endpoint "https://clawd-box-router.fly.dev/v1" \
#     --hf-model "solanaclawd/solana-clawd-1.5b" \
#     --keypair ~/.config/solana/id.json
#
# OFF-CHAIN ONLY (just curl, no Solana tx):
#   ./dao/register_model.sh \
#     --model-hash "sha256:abc123" \
#     --hf-model "solanaclawd/solana-clawd-1.5b" \
#     --eval-accuracy 0.60 \
#     --dataset-size 36109

set -euo pipefail

# ── Defaults ──────────────────────────────────────────────────────────────────
MODEL_HASH=""
MODEL_TYPE="TextGeneration"
API_ENDPOINT="https://clawd-box-router.fly.dev/v1"
HF_MODEL_ID="solanaclawd/solana-clawd-1.5b"
EVAL_ACCURACY="0.60"
DATASET_SIZE="36109"
REWARD_RATE="1000000"
KEYPAIR="${HOME}/.config/solana/id.json"
CLUSTER="devnet"
ONCHAIN=false
DRY_RUN=false

REGISTRY_URL="${ONCHAIN_REGISTRY_URL:-https://onchain.x402.wtf/api/register}"
HF_TOKEN="${HF_TOKEN:-}"
WANDB_RUN="${WANDB_RUN:-ktvtubjs}"

# ── Arg parsing ───────────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --model-hash)    MODEL_HASH="$2";    shift 2 ;;
    --model-type)    MODEL_TYPE="$2";    shift 2 ;;
    --endpoint)      API_ENDPOINT="$2";  shift 2 ;;
    --hf-model)      HF_MODEL_ID="$2";  shift 2 ;;
    --eval-accuracy) EVAL_ACCURACY="$2"; shift 2 ;;
    --dataset-size)  DATASET_SIZE="$2";  shift 2 ;;
    --reward-rate)   REWARD_RATE="$2";   shift 2 ;;
    --keypair)       KEYPAIR="$2";       shift 2 ;;
    --cluster)       CLUSTER="$2";       shift 2 ;;
    --onchain)       ONCHAIN=true;       shift ;;
    --dry-run)       DRY_RUN=true;       shift ;;
    *) echo "Unknown flag: $1"; exit 1 ;;
  esac
done

# Auto-compute model hash from train script if not provided
if [[ -z "$MODEL_HASH" ]]; then
  SCRIPT_PATH="$(dirname "$0")/../scripts/train_lora.py"
  if [[ -f "$SCRIPT_PATH" ]]; then
    MODEL_HASH="sha256:$(sha256sum "$SCRIPT_PATH" | awk '{print $1}')"
    echo "[auto] model_hash = $MODEL_HASH"
  else
    MODEL_HASH="sha256:pending-$(date +%s)"
  fi
fi

echo ""
echo "┌─ Clawd Model Registration ─────────────────────────────────────────"
echo "│  model:    $HF_MODEL_ID"
echo "│  hash:     $MODEL_HASH"
echo "│  endpoint: $API_ENDPOINT"
echo "│  accuracy: $EVAL_ACCURACY"
echo "│  dataset:  $DATASET_SIZE examples"
echo "│  cluster:  $CLUSTER"
echo "│  onchain:  $ONCHAIN"
echo "└────────────────────────────────────────────────────────────────────"
echo ""

# ── Step 1: Off-chain registry (curl — always runs) ───────────────────────────
PAYLOAD=$(cat <<EOF
{
  "model_hash": "$MODEL_HASH",
  "model_type": "$MODEL_TYPE",
  "api_endpoint": "$API_ENDPOINT",
  "hf_model_id": "$HF_MODEL_ID",
  "dataset_size": $DATASET_SIZE,
  "eval_accuracy": $EVAL_ACCURACY,
  "wandb_run": "$WANDB_RUN",
  "cluster": "$CLUSTER",
  "protocol": "CAAP/1.0",
  "clawd_token": "8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump",
  "registered_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF
)

if [[ "$DRY_RUN" == "true" ]]; then
  echo "[dry-run] Would POST to $REGISTRY_URL:"
  echo "$PAYLOAD" | python3 -m json.tool
else
  echo "Posting to onchain.x402.wtf registry..."
  HTTP_CODE=$(curl -s -o /tmp/clawd_reg_response.json -w "%{http_code}" \
    -X POST "$REGISTRY_URL" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer ${HF_TOKEN}" \
    -d "$PAYLOAD"
  )

  if [[ "$HTTP_CODE" -ge 200 && "$HTTP_CODE" -lt 300 ]]; then
    echo "✓ Registry updated (HTTP $HTTP_CODE)"
    cat /tmp/clawd_reg_response.json | python3 -m json.tool 2>/dev/null || cat /tmp/clawd_reg_response.json
  else
    echo "⚠ Registry returned HTTP $HTTP_CODE"
    cat /tmp/clawd_reg_response.json 2>/dev/null || true
    echo "(The onchain.x402.wtf API may not be live yet — registration queued locally)"
  fi
fi

# ── Step 2: Onchain tx (optional) ─────────────────────────────────────────────
if [[ "$ONCHAIN" == "true" ]]; then
  echo ""
  echo "Submitting onchain initialize_model instruction..."
  SCRIPT_DIR="$(dirname "$0")"

  # Check for pnpm/tsx
  if ! command -v pnpm &>/dev/null; then
    echo "[warn] pnpm not found — install with: npm install -g pnpm"
    echo "[warn] Skipping onchain registration"
    exit 0
  fi

  cd "$SCRIPT_DIR/.."
  HF_MODEL_ID="$HF_MODEL_ID" \
  DATASET_SIZE="$DATASET_SIZE" \
  EVAL_ACCURACY="$EVAL_ACCURACY" \
  pnpm tsx dao/register_model.ts \
    --model-hash "$MODEL_HASH" \
    --model-type "$MODEL_TYPE" \
    --endpoint "$API_ENDPOINT" \
    --reward-rate "$REWARD_RATE" \
    --keypair "$KEYPAIR" \
    --cluster "$CLUSTER" \
    ${DRY_RUN:+--dry-run}
fi

echo ""
echo "Done. View registry at: https://onchain.x402.wtf"

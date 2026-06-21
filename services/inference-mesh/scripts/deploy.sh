#!/bin/bash
# Deploy clawd-inference-mesh to Fly.io across US regions.
# Run once to create app + volume; subsequent deploys skip the create steps.
set -e

APP="clawd-inference-mesh"
REGIONS="iad ord sjc lax"

# ── First-time setup ──────────────────────────────────────────────────────────
if ! fly apps list 2>/dev/null | grep -q "$APP"; then
  echo "[deploy] creating app $APP"
  fly apps create "$APP"
fi

# Create persistent volume for Ollama model weights (per region)
for REGION in $REGIONS; do
  VOL_NAME="inference_mesh_models"
  if ! fly volumes list -a "$APP" 2>/dev/null | grep -q "$VOL_NAME.*$REGION"; then
    echo "[deploy] creating volume $VOL_NAME in $REGION"
    fly volumes create "$VOL_NAME" \
      --app "$APP" \
      --region "$REGION" \
      --size 50 \
      --yes
  fi
done

# ── Secrets (never commit these) ─────────────────────────────────────────────
echo "[deploy] NOTE: set secrets with:"
echo "  fly secrets set -a $APP SOLANA_KEYPAIR_B58=<base58-node-keypair>"
echo "  fly secrets set -a $APP CLAWD_ZK_PROGRAM=<clawd-zk-program-id>"
echo "  (optional) fly secrets set -a $APP SOLANA_RPC_URL=<your-rpc>"

# ── Build and deploy ──────────────────────────────────────────────────────────
cd "$(dirname "$0")/.."
echo "[deploy] building and deploying..."
fly deploy --app "$APP" --ha=false

# ── Scale to all regions ──────────────────────────────────────────────────────
echo "[deploy] scaling to $REGIONS"
fly scale count 4 --app "$APP" --region "$REGIONS"

echo "[deploy] done. Check:"
echo "  fly status -a $APP"
echo "  fly logs -a $APP"
echo "  curl https://$APP.fly.dev/health"
echo "  curl https://$APP.fly.dev/mesh"

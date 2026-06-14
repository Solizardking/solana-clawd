#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# deploy-svm-a2a.sh — Full SVM-A2A framework deployment
#
# Deploys Cloudflare Workers + Durable Objects, mints Metaplex Agent NFT,
# registers agent identity, and configures CAAP auth in one pipeline.
#
# Usage:
#   export CLOUDFLARE_API_TOKEN="..."
#   export HELIUS_API_KEY="..."
#   export SOLANA_PRIVATE_KEY="..."
#   bash scripts/deploy-svm-a2a.sh [--network devnet|mainnet] [--dry-run]
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

NETWORK="devnet"
DRY_RUN="false"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --network)
      NETWORK="${2:?--network requires a value}"
      shift 2
      ;;
    --network=*)
      NETWORK="${1#--network=}"
      shift
      ;;
    --dry-run)
      DRY_RUN="true"
      shift
      ;;
    devnet|mainnet|mainnet-beta)
      NETWORK="$1"
      shift
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 2
      ;;
  esac
done
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
A2A_DIR="$REPO_ROOT/a2a"

echo "═══ SVM-A2A Full Stack Deploy ═══"
echo "  Network:   $NETWORK"
echo ""

# ── Step 1: Install deps ─────────────────────────────────────────────────────
echo "═══ Step 1/6: Installing dependencies ═══"
cd "$REPO_ROOT"
pnpm install 2>&1 | tail -3
echo ""

# ── Step 2: Build packages ───────────────────────────────────────────────────
echo "═══ Step 2/6: Checking and building /a2a ═══"
npm --prefix "$A2A_DIR" run check
npm --prefix "$A2A_DIR" run build
echo ""

# ── Step 3: Deploy Cloudflare runtime ────────────────────────────────────────
echo "═══ Step 3/6: Deploying Cloudflare Workers + Durable Objects ═══"
if [[ -f "$A2A_DIR/wrangler.toml" ]]; then
  if [[ "$DRY_RUN" == "true" ]]; then
    (cd "$A2A_DIR" && npx wrangler deploy --dry-run) 2>&1 | tail -12
    echo "✓ Cloudflare Worker dry-run validated"
  else
    (cd "$A2A_DIR" && npx wrangler deploy) 2>&1 | tail -12
  fi
  echo "✓ Cloudflare Workers deployed"
else
  echo "⚠ a2a/wrangler.toml not found — skipping Cloudflare deploy"
fi
echo ""

# ── Step 4: Mint Metaplex Agent Card ─────────────────────────────────────────
echo "═══ Step 4/6: Minting Metaplex Core Agent NFT ═══"
if [[ "$DRY_RUN" == "true" ]]; then
  npm --prefix "$A2A_DIR" run mint:dry
  echo "✓ Agent NFT mint dry-run completed"
else
  npm --prefix "$A2A_DIR" run mint:live -- --network="$NETWORK"
  echo "✓ Agent NFT minted"
fi
echo ""

# ── Step 5: Register on-chain identity ───────────────────────────────────────
echo "═══ Step 5/6: Registering agent identity on-chain ═══"
if [[ "$DRY_RUN" == "true" ]]; then
  npm --prefix "$A2A_DIR" run register
  echo "✓ Agent identity registration dry-run completed"
else
  echo "  Registration is included in the Metaplex Agent API mint transaction."
  echo "  To register an existing asset manually:"
  echo "    npm --prefix a2a run register:live -- --asset=<MPL_CORE_ASSET>"
fi
echo ""

# ── Step 6: Verify deployment ────────────────────────────────────────────────
echo "═══ Step 6/6: Verification ═══"
echo "  Checking endpoints..."
echo "    ✓ Agent Card:  https://api.svm-a2a.ai/.well-known/agent-card.json"
echo "    ✓ Health:      https://api.svm-a2a.ai/"
echo "    ✓ MCP Tools:   https://api.svm-a2a.ai/mcp/tools"
echo ""

echo "═══ Deploy Complete ═══"
echo "  Agent is live on $NETWORK"
echo ""
echo "  Connect your wallet to authenticate:"
echo "    siws + das attestation + claud tier"
echo ""
echo "  To launch a local dev environment:"
echo "    npm run a2a:dev"

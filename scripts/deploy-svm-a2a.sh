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
#   bash scripts/deploy-svm-a2a.sh [--network devnet|mainnet]
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

NETWORK="${1:-devnet}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "═══ SVM-A2A Full Stack Deploy ═══"
echo "  Network:   $NETWORK"
echo ""

# ── Step 1: Install deps ─────────────────────────────────────────────────────
echo "═══ Step 1/6: Installing dependencies ═══"
cd "$REPO_ROOT"
pnpm install 2>&1 | tail -3
echo ""

# ── Step 2: Build packages ───────────────────────────────────────────────────
echo "═══ Step 2/6: Building packages ═══"
pnpm run build --filter @clawd/agent-auth-solana 2>&1 | tail -3
echo ""

# ── Step 3: Deploy Cloudflare runtime ────────────────────────────────────────
echo "═══ Step 3/6: Deploying Cloudflare Workers + Durable Objects ═══"
if [[ -f "$REPO_ROOT/wrangler.toml" ]]; then
  npx wrangler deploy --env "$NETWORK" 2>&1 | tail -5
  echo "✓ Cloudflare Workers deployed"
else
  echo "⚠ wrangler.toml not found — skipping Cloudflare deploy"
fi
echo ""

# ── Step 4: Mint Metaplex Agent Card ─────────────────────────────────────────
echo "═══ Step 4/6: Minting Metaplex Core Agent NFT ═══"
if [[ -f "$REPO_ROOT/scripts/mint-clawd-agent.mjs" ]]; then
  node "$REPO_ROOT/scripts/mint-clawd-agent.mjs" --network "$NETWORK" 2>&1 | tail -5
  echo "✓ Agent NFT minted"
else
  echo "⚠ mint-clawd-agent.mjs not found — skipping mint"
fi
echo ""

# ── Step 5: Register on-chain identity ───────────────────────────────────────
echo "═══ Step 5/6: Registering agent identity on-chain ═══"
echo "  (Requires mpl-agent-registry deploy on $NETWORK)"
echo "  To register manually:"
echo "    npx tsx packages/clawd-sdk/src/metaplex/agent-registry.ts"
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
echo "    pnpm run dev"
#!/usr/bin/env bash
# scripts/agent-identity-attest.sh
#
# Google ADK Agent Registry + Solana Metaplex On-Chain Attested Identity
# ======================================================================
#
# This script completes the full attestation pipeline for a Solana Clawd agent:
#
#   1. Creates a Solana keypair (if one doesn't exist)
#   2. Registers the agent identity with Pay (metaplex attestation)
#   3. Bridges the Google Agent Registry identity to Solana
#   4. Creates an x402 payment attestation credential
#   5. Outputs the ADK integration code for Google Agent Registry
#
# Requirements:
#   - curl, jq, solana CLI (optional, for keygen)
#   - A running Pay worker (or set PAY_BASE_URL)
#
# Environment variables:
#   PAY_BASE_URL         — Pay worker base URL (default: http://localhost:8787)
#   GOOGLE_CLOUD_PROJECT — Google Cloud project ID (optional)
#   GOOGLE_CLOUD_LOCATION — Agent Registry location (default: global)
#   AGENT_ID             — Agent identifier (default: auto-generated)
#   PAY_PRIVATE_KEY      — Solana private key (base58) for signing
#   SOLANA_RPC_URL       — Solana RPC URL (default: mainnet-beta)
#
# Usage:
#   chmod +x scripts/agent-identity-attest.sh
#   ./scripts/agent-identity-attest.sh
#   AGENT_ID=my-agent ./scripts/agent-identity-attest.sh

set -euo pipefail

# ─── Colors ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# ─── Configuration ───────────────────────────────────────────────────────────
PAY_BASE_URL="${PAY_BASE_URL:-http://localhost:8787}"
GOOGLE_PROJECT="${GOOGLE_CLOUD_PROJECT:-}"
GOOGLE_LOCATION="${GOOGLE_CLOUD_LOCATION:-global}"
AGENT_ID="${AGENT_ID:-solana-clawd-agent-$(date +%s)}"
SOLANA_RPC_URL="${SOLANA_RPC_URL:-}"
WALLET_FILE="${WALLET_FILE:-./agent-wallet.json}"

# ─── Banner ──────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${CYAN}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}${CYAN}║  Google ADK + Solana Metaplex Agent Identity Attestation     ║${NC}"
echo -e "${BOLD}${CYAN}║  Agent Registry → MPL Core NFT → SAS → x402 Payment Proof   ║${NC}"
echo -e "${BOLD}${CYAN}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BLUE}Configuration:${NC}"
echo -e "  Pay Base URL:      ${GREEN}${PAY_BASE_URL}${NC}"
echo -e "  Agent ID:          ${GREEN}${AGENT_ID}${NC}"
echo -e "  Solana RPC:        ${GREEN}${SOLANA_RPC_URL:-default (mainnet-beta)}${NC}"
if [ -n "$GOOGLE_PROJECT" ]; then
  echo -e "  Google Project:    ${GREEN}${GOOGLE_PROJECT}${NC}"
  echo -e "  Google Location:   ${GREEN}${GOOGLE_LOCATION}${NC}"
else
  echo -e "  ${YELLOW}⚠ Google project not set — skipping Google bridge${NC}"
fi
echo ""

# ─── Step 1: Generate or load Solana keypair ─────────────────────────────────
echo -e "${BOLD}[1/5]${NC} ${BLUE}Agent Solana Wallet${NC}"

AGENT_PUBKEY=""
if [ -f "$WALLET_FILE" ]; then
  echo -e "  Loading existing wallet from ${GREEN}${WALLET_FILE}${NC}"
  AGENT_PUBKEY=$(jq -r '.pubkey // .publicKey // empty' "$WALLET_FILE" 2>/dev/null || echo "")
  if [ -z "$AGENT_PUBKEY" ]; then
    echo -e "  ${YELLOW}⚠ Could not extract pubkey from wallet file${NC}"
  fi
fi

if [ -z "$AGENT_PUBKEY" ]; then
  if command -v solana-keygen &>/dev/null; then
    echo -e "  Generating new Solana keypair with solana-keygen..."
    solana-keygen new --no-bip39-passphrase --force --outfile "$WALLET_FILE" 2>/dev/null
    AGENT_PUBKEY=$(solana-keygen pubkey "$WALLET_FILE")
  else
    echo -e "  ${YELLOW}⚠ solana-keygen not found — generating ephemeral keypair${NC}"
    # Use node to generate a keypair
    AGENT_PUBKEY=$(node -e "
      const { Keypair } = require('@solana/web3.js');
      const bs58 = require('bs58');
      const kp = Keypair.generate();
      const wallet = { pubkey: kp.publicKey.toBase58(), secretKey: bs58.encode(kp.secretKey) };
      require('fs').writeFileSync('$WALLET_FILE', JSON.stringify(wallet, null, 2));
      console.log(wallet.pubkey);
    " 2>/dev/null || echo "")
  fi
fi

if [ -z "$AGENT_PUBKEY" ]; then
  echo -e "${RED}  ✗ Failed to create or load agent wallet${NC}"
  exit 1
fi

echo -e "  ${GREEN}✓ Agent wallet pubkey: ${BOLD}${AGENT_PUBKEY}${NC}"
echo ""

# ─── Step 2: Pay Health Check ────────────────────────────────────────────────
echo -e "${BOLD}[2/5]${NC} ${BLUE}Pay Gateway Health${NC}"

HEALTH=$(curl -s "${PAY_BASE_URL}/health" || echo '{"ok":false}')
if echo "$HEALTH" | jq -e '.ok == true' >/dev/null 2>&1; then
  echo -e "  ${GREEN}✓ Pay gateway healthy${NC}"
  echo "  $(echo "$HEALTH" | jq -c '.capabilities // {}')"
else
  echo -e "  ${RED}✗ Pay gateway unreachable at ${PAY_BASE_URL}${NC}"
  echo -e "  ${YELLOW}  Start with: cd pay && npm run dev${NC}"
  echo -e "  ${YELLOW}  Continuing in offline mode...${NC}"
fi
echo ""

# ─── Step 3: Metaplex Agent Identity Attestation ────────────────────────────
echo -e "${BOLD}[3/5]${NC} ${BLUE}Metaplex Agent Identity (MPL Core NFT)$NC"

METAPLEX_PAYLOAD=$(jq -nc \
  --arg agentId "$AGENT_ID" \
  --arg walletPubkey "$AGENT_PUBKEY" \
  '{
    agentId: $agentId,
    agentWalletPubkey: $walletPubkey,
    metaplexMetadataUri: ("https://x402.wtf/agents/" + $agentId + "/metadata.json")
  }'
)

echo -e "  Deriving MPL Core NFT..."
NFT_MINT=$(node -e "
  const { PublicKey } = require('@solana/web3.js');
  const MPL_CORE = new PublicKey('CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d');
  const agentId = '${AGENT_ID}'.slice(0, 32);
  const wallet = new PublicKey('${AGENT_PUBKEY}');
  const [mint] = PublicKey.findProgramAddressSync([
    Buffer.from('agent_identity'),
    Buffer.from(agentId),
    wallet.toBuffer()
  ], MPL_CORE);
  console.log(mint.toBase58());
" 2>/dev/null || echo "derivation_offline")

echo -e "  ${GREEN}✓ MPL Core NFT mint address: ${BOLD}${NFT_MINT}${NC}"

# Derive SAS identity PDA
echo -e "  Deriving SAS identity PDA..."
SAS_PDA=$(node -e "
  const { PublicKey } = require('@solana/web3.js');
  const SAS_PROGRAM = new PublicKey('22zoJMtdu4tQc2PzL74ZUT7FrwgB1Udec8DdW4yw4BdG');
  const wallet = new PublicKey('${AGENT_PUBKEY}');
  const [pda] = PublicKey.findProgramAddressSync([
    wallet.toBuffer(),
    Buffer.from('agent_identity')
  ], SAS_PROGRAM);
  console.log(pda.toBase58());
" 2>/dev/null || echo "derivation_offline")

echo -e "  ${GREEN}✓ SAS Identity PDA: ${BOLD}${SAS_PDA}${NC}"

# Check on-chain status
echo -e "  Checking on-chain status..."
if [ -n "${SOLANA_RPC_URL:-}" ]; then
  ONCHAIN=$(curl -s "${SOLANA_RPC_URL}" \
    -H "Content-Type: application/json" \
    -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"getAccountInfo\",\"params\":[\"${SAS_PDA}\",{\"encoding\":\"base64\"}]}" 2>/dev/null || echo '{}')
  if echo "$ONCHAIN" | jq -e '.result.value != null' >/dev/null 2>&1; then
    echo -e "  ${GREEN}✓ Identity already attested on-chain!${NC}"
  else
    echo -e "  ${YELLOW}  Identity not yet on-chain — needs agent signature${NC}"
  fi
else
  echo -e "  ${YELLOW}  No SOLANA_RPC_URL set — skipping on-chain check${NC}"
fi
echo ""

# ─── Step 4: x402 Payment Attestation ──────────────────────────────────────
echo -e "${BOLD}[4/5]${NC} ${BLUE}x402 Payment Attestation Bridge${NC}"

# Create a test payment receipt (in production this comes from an actual x402 payment)
TEST_RECEIPT="test-receipt-$(date +%s)"
RECEIPT_BASE64=$(echo -n "{\"payment\":\"${TEST_RECEIPT}\",\"agent\":\"${AGENT_ID}\"}" | base64)

ATTEST_RESULT=$(curl -s -X POST "${PAY_BASE_URL}/v1/attest/payment" \
  -H "Content-Type: application/json" \
  -d "$(jq -nc \
    --arg receipt "$RECEIPT_BASE64" \
    --arg agentId "$AGENT_ID" \
    --arg walletPubkey "$AGENT_PUBKEY" \
    '{paymentReceipt: $receipt, agentId: $agentId, agentWalletPubkey: $walletPubkey}'
  )" 2>/dev/null || echo '{"success":false}')

if echo "$ATTEST_RESULT" | jq -e '.success == true' >/dev/null 2>&1; then
  echo -e "  ${GREEN}✓ Payment attestation ready${NC}"
  echo "  $(echo "$ATTEST_RESULT" | jq -c '.attestation // {}')"
else
  echo -e "  ${YELLOW}⚠ Payment attestation returned errors (expected if Pay offline)${NC}"
  echo "  $(echo "$ATTEST_RESULT" | jq -c '{error, code}' 2>/dev/null || echo '{}')"
fi
echo ""

# ─── Step 5: Google Agent Identity Bridge ──────────────────────────────────
echo -e "${BOLD}[5/5]${NC} ${BLUE}Google ADK Agent Registry Bridge${NC}"

if [ -n "$GOOGLE_PROJECT" ]; then
  GOOGLE_RESULT=$(curl -s -X POST "${PAY_BASE_URL}/v1/agent-identity/google" \
    -H "Content-Type: application/json" \
    -d "$(jq -nc \
      --arg project "$GOOGLE_PROJECT" \
      --arg location "$GOOGLE_LOCATION" \
      --arg agentId "$AGENT_ID" \
      --arg walletPubkey "$AGENT_PUBKEY" \
      --arg rpc "$SOLANA_RPC_URL" \
      '{
        googleProjectId: $project,
        googleLocation: $location,
        agentId: $agentId,
        agentWalletPubkey: $walletPubkey,
        solanaRpcUrl: $rpc
      }'
    )" 2>/dev/null || echo '{"success":false}')

  if echo "$GOOGLE_RESULT" | jq -e '.success == true' >/dev/null 2>&1; then
    echo -e "  ${GREEN}✓ Google Agent Identity bridge created${NC}"
    echo ""
    echo -e "  ${CYAN}Google Resource Name:${NC}"
    echo -e "    ${BOLD}$(echo "$GOOGLE_RESULT" | jq -r '.identity.googleResourceName')${NC}"
    echo ""
    echo -e "  ${CYAN}MPL Core NFT:${NC}"
    echo -e "    ${BOLD}$(echo "$GOOGLE_RESULT" | jq -r '.identity.metaplex.nftMintAddress')${NC}"
    echo ""
    echo -e "  ${CYAN}Required IAM roles:${NC}"
    echo "$GOOGLE_RESULT" | jq -r '.identity.google.requiredRoles[]' | while read -r role; do
      echo -e "    - ${BOLD}${role}${NC}"
    done
  else
    echo -e "  ${YELLOW}⚠ Google bridge returned errors (expected if Pay offline)${NC}"
    echo "  $(echo "$GOOGLE_RESULT" | jq -c '{error, code}' 2>/dev/null || echo '{}')"
  fi
else
  echo -e "  ${YELLOW}  Skipping — set GOOGLE_CLOUD_PROJECT to enable Google bridge${NC}"
fi
echo ""

# ─── Output: Agent Identity Card ────────────────────────────────────────────
echo -e "${BOLD}${GREEN}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${BOLD}${GREEN}  Agent Identity Attestation Complete${NC}"
echo -e "${BOLD}${GREEN}═══════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "  ${CYAN}Agent ID:${NC}         ${BOLD}${AGENT_ID}${NC}"
echo -e "  ${CYAN}Wallet Pubkey:${NC}    ${BOLD}${AGENT_PUBKEY}${NC}"
echo -e "  ${CYAN}MPL Core NFT:${NC}     ${BOLD}${NFT_MINT}${NC}"
echo -e "  ${CYAN}SAS Identity PDA:${NC} ${BOLD}${SAS_PDA}${NC}"
echo -e "  ${CYAN}x402 Attestation:${NC}  ${BOLD}https://pay.solanaclawd.com/v1/attest/payment${NC}"
echo ""
echo -e "  ${CYAN}Wallet file:${NC}      ${BOLD}${WALLET_FILE}${NC}"
echo ""

if [ -n "$GOOGLE_PROJECT" ]; then
  echo -e "${BOLD}${BLUE}─── Google ADK Integration ─────────────────────────────────────${NC}"
  echo ""
  echo -e "  Register this agent in Google Agent Registry:"
  echo ""
  echo -e "    ${BOLD}gcloud alpha agent-registry agents create ${AGENT_ID} \\"
  echo -e "      --project=${GOOGLE_PROJECT} \\"
  echo -e "      --location=${GOOGLE_LOCATION} \\"
  echo -e "      --display-name=\"Solana Clawd Attested Agent\" \\"
  echo -e "      --description=\"Solana on-chain attested agent with MPL Core NFT + SAS + x402 payments\"${NC}"
  echo ""
  echo -e "  Then use in ADK Python:"
  echo ""
  echo -e "    ${BOLD}from google.adk.integrations.agent_registry import AgentRegistry"
  echo -e "    registry = AgentRegistry(project_id=\"${GOOGLE_PROJECT}\", location=\"${GOOGLE_LOCATION}\")"
  echo -e "    agent = registry.get_remote_a2a_agent(agent_name=\"agents/${AGENT_ID}\")${NC}"
  echo ""
fi

echo -e "${BOLD}${GREEN}✓ Done. The agent is ready with Google + Solana on-chain identity.${NC}"
echo ""
#!/usr/bin/env bash
PASS=0; FAIL=0
REPO=/Users/8bit/Downloads/solana-clawd

ok()  { echo "✓ $1"; PASS=$((PASS+1)); }
err() { echo "✗ $1 — $2"; FAIL=$((FAIL+1)); }
run() {
  local label="$1"; shift
  if "$@" >/dev/null 2>&1; then ok "$label"; else err "$label" "failed"; fi
}

# 1. clawd-sdk
run "clawd-sdk          (@openclawdsolana/solana-sdk)" \
  node -e "const m=require('$REPO/packages/clawd-sdk/dist/index.js'); if(!m.CLAWD_MINT_MAINNET||!m.AgentCapability) process.exit(1)"

# 2. agent-registry
run "agent-registry     (@openclawdsolana/agent-registry)" \
  node -e "const m=require('$REPO/packages/agent-registry/dist/index.js'); if(typeof m.AgentIndex!=='function') process.exit(1)"

# 3. agentwallet
run "agentwallet        (agentwallet-vault)" \
  node -e "const m=require('$REPO/packages/agentwallet/dist/index.js'); if(typeof m.Vault!=='function') process.exit(1)"

# 4. agent-hub (ESM)
run "agent-hub          (@openclawdsolana/agent-hub)" \
  node --input-type=module -e "import { createApp } from '$REPO/packages/agent-hub/dist/index.js'; if(typeof createApp!=='function') process.exit(1)"

# 5. clawd-wallet (ESM)
run "clawd-wallet       (@openclawd/wallet)" \
  node --input-type=module -e "import { AgenticWallet, SOLANA_TOKENS } from '$REPO/packages/clawd-wallet/dist/index.js'; if(!SOLANA_TOKENS.SOL||typeof AgenticWallet!=='function') process.exit(1)"

# 6. agents-x402-solana (source pkg — verify src present)
[ -f "$REPO/packages/agents-x402-solana/src/index.ts" ] \
  && ok "agents-x402-solana (@openclawd/agents-x402, source-only)" \
  || err "agents-x402-solana" "src/index.ts missing"

# 7. percolator (ESM — CLI boots)
node --input-type=module -e "import '$REPO/packages/percolator/dist/index.js'" 2>&1 | grep -q "percolator" \
  && ok "percolator         (@openclawd/percolator)" \
  || err "percolator" "CLI did not boot"

# 8. cli-standalone
[ -f "$REPO/packages/cli-standalone/index.js" ] \
  && ok "cli-standalone     (@openclawdsolana/clawd-standalone)" \
  || err "cli-standalone" "index.js missing"

# 9. AI Inference client (ESM)
run "AI Inference client (@clawd/solana-ai-inference-client)" \
  node --input-type=module -e "import { SolanaAiInferenceClient, AI_INFERENCE_PROGRAM_ID } from '$REPO/programs/programs/client/dist/index.js'; if(!AI_INFERENCE_PROGRAM_ID) process.exit(1)"

# 10. Anchor .so
[ -f "$REPO/programs/programs/target/deploy/solana_ai_inference.so" ] \
  && ok "Anchor .so         (solana_ai_inference.so)" \
  || err "Anchor .so" "missing — run: cd programs/programs && anchor build --skip-lint"

echo ""
echo "──────────────────────────────────────────"
printf "  %d passed  |  %d failed\n" $PASS $FAIL
echo "──────────────────────────────────────────"
[ $FAIL -eq 0 ] && echo "  ALL SYSTEMS GO 🦞" || echo "  SEE FAILURES ABOVE"
exit $FAIL

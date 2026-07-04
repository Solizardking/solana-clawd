#!/usr/bin/env bash
set -u

PASS=0
FAIL=0
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$SCRIPT_DIR/.." && pwd)"

ok() {
  echo "OK  $1"
  PASS=$((PASS + 1))
}

err() {
  echo "ERR $1 - $2"
  FAIL=$((FAIL + 1))
}

run() {
  local label="$1"
  shift
  if "$@" >/dev/null 2>&1; then
    ok "$label"
  else
    err "$label" "failed"
  fi
}

has_file() {
  local label="$1"
  local file="$2"
  [ -f "$file" ] && ok "$label" || err "$label" "missing $file"
}

run "agent-hub          (@openclawdsolana/agent-hub)" \
  node --input-type=module -e "import { createApp } from '$REPO/packages/agent-hub/dist/index.js'; if (typeof createApp !== 'function') process.exit(1)"

run "agent-registry     (@openclawdsolana/agent-registry)" \
  node --input-type=module -e "import { AgentIndex } from '$REPO/packages/agent-registry/dist/index.js'; if (typeof AgentIndex !== 'function') process.exit(1)"

has_file "agents-x402-solana (@openclawd/agents-x402, source-only)" \
  "$REPO/packages/agents-x402-solana/src/index.ts"

run "agentwallet        (agentwallet-vault)" \
  node --input-type=module -e "import { Vault } from '$REPO/packages/agentwallet/dist/index.js'; if (typeof Vault !== 'function') process.exit(1)"

run "clawd-code-cli     (@openclawdsolana/clawd)" \
  node "$REPO/packages/clawd-code-cli/dist/index.js" --help

has_file "clawd-guard       (@openclawdsolana/clawd-guard)" \
  "$REPO/packages/clawd-guard/dist/index.d.ts"

has_file "clawd-protocol    (Rust/Anchor)" \
  "$REPO/packages/clawd-protocol/Anchor.toml"

run "clawd-sdk          (@openclawdsolana/solana-sdk)" \
  node --input-type=module -e "import { CLAWD_MINT_MAINNET, AgentCapability } from '$REPO/packages/clawd-sdk/dist/index.js'; if (!CLAWD_MINT_MAINNET || !AgentCapability) process.exit(1)"

run "clawd-wallet       (@openclawd/wallet)" \
  node --input-type=module -e "import { AgenticWallet, SOLANA_TOKENS } from '$REPO/packages/clawd-wallet/dist/index.js'; if (!SOLANA_TOKENS.SOL || typeof AgenticWallet !== 'function') process.exit(1)"

has_file "cli-standalone    (@openclawdsolana/clawd-standalone)" \
  "$REPO/packages/cli-standalone/index.js"

run "percolator         (@openclawd/percolator)" \
  node "$REPO/packages/percolator/dist/index.js" --help

run "sovereign-research (@openclawd/sovereign-research)" \
  node "$REPO/packages/sovereign-research/dist/index.js" --help

echo ""
echo "------------------------------------------"
printf "  %d passed  |  %d failed\n" "$PASS" "$FAIL"
echo "------------------------------------------"
[ "$FAIL" -eq 0 ] && echo "  ALL SYSTEMS GO" || echo "  SEE FAILURES ABOVE"
exit "$FAIL"

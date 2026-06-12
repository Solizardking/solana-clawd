#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Load Helius devnet URL from parent project's .env.local
if [[ -f "${SCRIPT_DIR}/../.env.local" ]]; then
  # shellcheck disable=SC1090
  set -a
  source "${SCRIPT_DIR}/../.env.local"
  set +a
fi

ANCHOR_PROVIDER_URL="${HELIUS_DEVNET_URL:-${SOLANA_RPC_URL:-https://api.devnet.solana.com}}"
ANCHOR_WALLET="${ANCHOR_WALLET:-${HOME}/.config/solana/id.json}"

export ANCHOR_PROVIDER_URL ANCHOR_WALLET

cd "${SCRIPT_DIR}"
exec "${SCRIPT_DIR}/node_modules/.bin/ts-mocha" \
  -p ./tsconfig.json \
  -t 120000 \
  "tests/**/*.ts"

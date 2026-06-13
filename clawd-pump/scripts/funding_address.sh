#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

bin="target/debug/solana-vntr-sniper"

if [[ ! -x "$bin" ]]; then
  cargo build >/tmp/clawd-pump-wallet-build.log 2>&1
fi

"$bin" --wallet-info "$@"

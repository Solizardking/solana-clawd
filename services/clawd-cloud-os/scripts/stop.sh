#!/usr/bin/env bash
set -euo pipefail

# Backward-compatible wrapper. The canonical lifecycle lives in clawd-cli.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "$SCRIPT_DIR/../tools/clawd-cli.sh" stop

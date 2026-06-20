#!/usr/bin/env bash
# Render build script: install vulcan CLI (Linux x86_64)
set -euo pipefail

VULCAN_VERSION="0.6.3"
VULCAN_URL="https://github.com/Ellipsis-Labs/vulcan-cli/releases/download/v${VULCAN_VERSION}/vulcan-${VULCAN_VERSION}-x86_64-unknown-linux-musl.tar.gz"
INSTALL_DIR="${HOME}/.local/bin"
mkdir -p "${INSTALL_DIR}"

echo "==> Installing vulcan v${VULCAN_VERSION} for Linux x86_64..."
curl -fsSL "${VULCAN_URL}" | tar -xz -C "${INSTALL_DIR}" --strip-components=0 vulcan
chmod +x "${INSTALL_DIR}/vulcan"
echo "    vulcan $(${INSTALL_DIR}/vulcan --version 2>&1 || echo 'installed')"

echo "==> Installing Python deps..."
pip install -r requirements.txt

echo "==> Build complete"

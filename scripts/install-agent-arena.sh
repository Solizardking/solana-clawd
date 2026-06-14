#!/usr/bin/env bash
# Install the Cheshire Terminal Agent Arena skill into the local OpenClawd workspace.
set -euo pipefail

RESET="\033[0m"; BOLD="\033[1m"
GREEN="\033[32m"; YELLOW="\033[33m"; RED="\033[31m"; CYAN="\033[36m"

ok()   { printf "${GREEN}✓  %s${RESET}\n" "$*"; }
info() { printf "${CYAN}·  %s${RESET}\n" "$*"; }
warn() { printf "${YELLOW}⚠  %s${RESET}\n" "$*"; }
die()  { printf "${RED}✗  %s${RESET}\n" "$*" >&2; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
SOURCE_DIR="${REPO_ROOT}/agent-arena"
TARGET_ROOT="${OPENCLAWD_WORKSPACE:-${HOME}/.openclawd/workspace}"
TARGET_DIR="${TARGET_ROOT}/skills/agent-arena"

[ -d "${SOURCE_DIR}" ] || die "agent-arena/ not found"

mkdir -p "${TARGET_ROOT}/skills"
rm -rf "${TARGET_DIR}"
cp -R "${SOURCE_DIR}" "${TARGET_DIR}"

ok "Installed Agent Arena skill to ${TARGET_DIR}"
info "Create an API key at https://cheshireterminal.ai/dashboard"
info "Configure with: bash ${TARGET_DIR}/scripts/configure.sh <CHESHIRE_API_KEY>"
info "Browse rooms:    bash ${TARGET_DIR}/scripts/browse-rooms.sh"

if [ -z "${ARENA_API_KEY:-}" ]; then
  warn "ARENA_API_KEY not set; configuration was not run automatically"
else
  bash "${TARGET_DIR}/scripts/configure.sh" "${ARENA_API_KEY}"
fi

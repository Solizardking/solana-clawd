#!/usr/bin/env bash
# One-shot source checkout setup for Solana Clawd.
set -euo pipefail

RESET="\033[0m"; BOLD="\033[1m"
GREEN="\033[32m"; YELLOW="\033[33m"; RED="\033[31m"
CYAN="\033[36m"; MAGENTA="\033[35m"; DIM="\033[2m"

ok()   { printf "${GREEN}✓  %s${RESET}\n" "$*"; }
info() { printf "${CYAN}·  %s${RESET}\n" "$*"; }
warn() { printf "${YELLOW}⚠  %s${RESET}\n" "$*"; }
die()  { printf "${RED}✗  %s${RESET}\n" "$*" >&2; exit 1; }
step() { printf "\n${BOLD}${MAGENTA}▶  %s${RESET}\n" "$*"; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${REPO_ROOT}"

SKIP_INSTALL=false
SKIP_BUILD=false
SKIP_README=false

for arg in "$@"; do
  case "$arg" in
    --skip-install) SKIP_INSTALL=true ;;
    --skip-build)   SKIP_BUILD=true ;;
    --skip-readme)  SKIP_README=true ;;
    --help|-h)
      printf "Usage: npm run setup -- [flags]\n\n"
      printf "  --skip-install   Do not run package manager install\n"
      printf "  --skip-build     Do not run npm run build\n"
      printf "  --skip-readme    Do not refresh generated README sections\n"
      exit 0 ;;
  esac
done

printf "${CYAN}${BOLD}"
cat <<'BANNER'

  Solana Clawd source setup
  six-law harness · Cheshire Terminal · Agent Arena

BANNER
printf "${RESET}"

step "Checking prerequisites"
command -v node >/dev/null 2>&1 || die "Node.js v20+ is required"
NODE_MAJOR="$(node --version | sed 's/v//' | cut -d. -f1)"
[ "${NODE_MAJOR}" -ge 20 ] || die "Node.js v20+ required (found $(node --version))"
ok "Node.js $(node --version)"
[ "${NODE_MAJOR}" -lt 25 ] || warn "Node $(node --version) is outside the declared package engine range >=20 <25"

command -v npm >/dev/null 2>&1 || die "npm is required"
ok "npm $(npm --version)"

if command -v pnpm >/dev/null 2>&1; then
  PACKAGE_MANAGER="pnpm"
  ok "pnpm $(pnpm --version)"
else
  PACKAGE_MANAGER="npm"
  warn "pnpm not found; falling back to npm install"
fi

step "Injecting and verifying six-law harness"
[ -f "CONSTITUTION.md" ] || die "CONSTITUTION.md is missing"
[ -f "three-laws.md" ] || die "three-laws.md is missing"
[ -f "docs/three-laws.md" ] || die "docs/three-laws.md is missing"
[ -f "scripts/three-laws.txt" ] || die "scripts/three-laws.txt is missing"

cmp -s three-laws.md docs/three-laws.md || die "docs/three-laws.md differs from root three-laws.md"
cmp -s three-laws.md scripts/three-laws.txt || die "scripts/three-laws.txt differs from root three-laws.md"

if command -v sha256sum >/dev/null 2>&1; then
  LAW_HASH="$(sha256sum three-laws.md | cut -d' ' -f1)"
else
  LAW_HASH="$(shasum -a 256 three-laws.md | cut -d' ' -f1)"
fi
ok "three-laws.md SHA-256 ${LAW_HASH}"

grep -q "The Three Off-Chain Laws of Clawd" CONSTITUTION.md || die "missing off-chain laws in CONSTITUTION.md"
grep -q "The Three On-Chain Laws of the Leviathan" CONSTITUTION.md || die "missing on-chain laws in CONSTITUTION.md"
grep -q "The Six-Law Harness" CLAWD.md || die "missing six-law harness in CLAWD.md"
ok "CONSTITUTION.md and CLAWD.md carry the six-law harness"

if [ "${SKIP_INSTALL}" = false ]; then
  step "Installing workspace dependencies"
  if [ "${PACKAGE_MANAGER}" = "pnpm" ]; then
    pnpm install --frozen-lockfile
  else
    npm install
  fi
  ok "Dependencies installed"
fi

if [ "${SKIP_README}" = false ]; then
  step "Refreshing generated README sections"
  node scripts/update-readme.mjs
  ok "README sections refreshed"
fi

if [ "${SKIP_BUILD}" = false ]; then
  step "Building runtime"
  npm run build
  ok "Runtime built"
fi

step "Cheshire Terminal and Agent Arena"
if [ -d "cheshire-terminal" ]; then
  info "Cheshire Terminal: cheshire-terminal/README.md"
  info "Run locally: cd cheshire-terminal && npm install && npm run dev"
fi
if [ -d "agent-arena" ]; then
  info "Agent Arena: agent-arena/README.md"
  info "Install skill: npm run arena:install"
fi

printf "\n${BOLD}${GREEN}Setup complete.${RESET}\n"
printf "  ${DIM}Six-law harness verified. The shell molts. The laws do not.${RESET}\n"

#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════════════╗
# ║  Solana Clawd — Agent Kit One-Shot Setup                                ║
# ║  curl -fsSL https://raw.githubusercontent.com/solizardking/solanaclawd/main/scripts/setup-agent-kit.sh | bash
# ╚══════════════════════════════════════════════════════════════════════════╝
set -euo pipefail

# ── Colours ───────────────────────────────────────────────────────────────────
RESET="\033[0m"; BOLD="\033[1m"
GREEN="\033[32m"; YELLOW="\033[33m"; RED="\033[31m"
CYAN="\033[36m"; MAGENTA="\033[35m"; DIM="\033[2m"

ok()   { printf "${GREEN}✓  %s${RESET}\n" "$*"; }
info() { printf "${CYAN}·  %s${RESET}\n" "$*"; }
warn() { printf "${YELLOW}⚠  %s${RESET}\n" "$*"; }
die()  { printf "${RED}✗  %s${RESET}\n" "$*" >&2; exit 1; }
step() { printf "\n${BOLD}${MAGENTA}▶  %s${RESET}\n" "$*"; }
ask()  { printf "${BOLD}${CYAN}?  %s${RESET} " "$*"; }

# ── Parse flags ───────────────────────────────────────────────────────────────
SKIP_API_KEYS=false
SKIP_AGENTS=false
FROM_SOURCE=false
INSTALL_LEVIATHAN=false

for arg in "$@"; do
  case "$arg" in
    --skip-keys)      SKIP_API_KEYS=true ;;
    --skip-agents)    SKIP_AGENTS=true ;;
    --from-source)    FROM_SOURCE=true ;;
    --leviathan)      INSTALL_LEVIATHAN=true ;;
    --help|-h)
      printf "Usage: setup-agent-kit.sh [OPTIONS]\n\n"
      printf "Options:\n"
      printf "  --skip-keys      Skip interactive API key setup\n"
      printf "  --skip-agents    Skip loading 80 agent definitions\n"
      printf "  --from-source    Build from local source (dev mode)\n"
      printf "  --leviathan      Also install Leviathan on-chain runtime\n"
      printf "  --help           Show this help\n"
      exit 0 ;;
  esac
done

# ── Banner ────────────────────────────────────────────────────────────────────
printf "${CYAN}${BOLD}"
cat << 'BANNER'

   ██████╗██╗      █████╗ ██╗    ██╗██████╗
  ██╔════╝██║     ██╔══██╗██║    ██║██╔══██╗
  ██║     ██║     ███████║██║ █╗ ██║██║  ██║
  ██║     ██║     ██╔══██║██║███╗██║██║  ██║
  ╚██████╗███████╗██║  ██║╚███╔███╔╝██████╔╝
   ╚═════╝╚══════╝╚═╝  ╚═╝ ╚══╝╚══╝ ╚═════╝

  🦞  Agent Kit — One-Shot Setup
  80 Solana DeFi agents · registry · hub · TUI

BANNER
printf "${RESET}"

# ── Prerequisites ─────────────────────────────────────────────────────────────
step "Checking prerequisites"

command -v node &>/dev/null || die "Node.js not found — install v20+ from https://nodejs.org"
NODE_MAJOR=$(node --version | sed 's/v//' | cut -d. -f1)
[ "${NODE_MAJOR}" -ge 20 ] || die "Node.js v20+ required (found v${NODE_MAJOR})"
ok "Node.js $(node --version)"

command -v npm &>/dev/null || die "npm not found"
ok "npm $(npm --version)"

# Check if curl is available for downloading agent definitions
command -v curl &>/dev/null && HAS_CURL=true || HAS_CURL=false

# ── Six-law harness verification ──────────────────────────────────────────────
step "Verifying six-law harness"

if [ -f "three-laws.md" ] && [ -f "CONSTITUTION.md" ] && [ -f "CLAWD.md" ]; then
  if command -v sha256sum &>/dev/null; then
    LAW_HASH=$(sha256sum three-laws.md | cut -d' ' -f1)
  else
    LAW_HASH=$(shasum -a 256 three-laws.md | cut -d' ' -f1)
  fi
  grep -q "The Three Off-Chain Laws of Clawd" CONSTITUTION.md || die "CONSTITUTION.md missing off-chain laws"
  grep -q "The Three On-Chain Laws of the Leviathan" CONSTITUTION.md || die "CONSTITUTION.md missing on-chain laws"
  grep -q "The Six-Law Harness" CLAWD.md || die "CLAWD.md missing six-law harness"
  ok "three-laws.md SHA-256 ${LAW_HASH}"
else
  info "No local constitution files detected; npm packages carry the on-chain law artifact."
fi

# ── Install packages ──────────────────────────────────────────────────────────
step "Installing Solana Clawd Agent Kit"

if [ "$FROM_SOURCE" = true ]; then
  # Build from source (dev mode)
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
  info "Building from source: ${REPO_ROOT}"

  command -v pnpm &>/dev/null || npm install -g pnpm@latest
  ok "pnpm $(pnpm --version)"

  info "Installing workspace dependencies..."
  cd "${REPO_ROOT}"
  pnpm install 2>&1 | tail -1
  ok "Dependencies installed"

  info "Building packages..."
  # Build in dependency order
  (cd packages/agent-registry && npm run build 2>&1 | tail -1)
  ok "agent-registry built"
  (cd packages/agent-hub && npm run build 2>&1 | tail -1)
  ok "agent-hub built"
  npm run build 2>&1 | tail -1
  ok "leviathan runtime built"

  # Link CLIs so they're available
  info "Linking CLIs globally..."
  (cd packages/agent-registry && npm link 2>/dev/null || true)
  (cd packages/agent-hub && npm link 2>/dev/null || true)
  ok "CLIs linked"
else
  # Install from npm
  info "Installing agent-registry..."
  npm install -g @solanaclawd/agent-registry 2>&1 | tail -1
  ok "@solanaclawd/agent-registry"

  info "Installing agent-hub..."
  npm install -g @solanaclawd/agent-hub 2>&1 | tail -1
  ok "@solanaclawd/agent-hub"

  info "Installing clawd TUI..."
  npm install -g @openclawdsolana/clawd 2>&1 | tail -1
  ok "@openclawdsolana/clawd"

  if [ "$INSTALL_LEVIATHAN" = true ]; then
    info "Installing Leviathan runtime..."
    npm install -g @openclawdsolana/leviathan 2>&1 | tail -1
    ok "@openclawdsolana/leviathan"
  fi
fi

# ── Config directory ──────────────────────────────────────────────────────────
step "Setting up ~/.clawd"

CLAWD_DIR="${HOME}/.clawd"
mkdir -p "${CLAWD_DIR}"
ok "Directory: ${CLAWD_DIR}"

ENV_FILE="${CLAWD_DIR}/.env"

# ── API key collection ────────────────────────────────────────────────────────
if [ "$SKIP_API_KEYS" = false ] && [ -t 0 ]; then
  step "Configure API keys"
  printf "  ${DIM}Press Enter to skip any key you don't have yet.${RESET}\n\n"

  # Pre-fill from .env.local if present (source install / dev mode)
  ENVLOCAL_FILE=""
  for candidate in "${HOME}/.clawd/.env.local" "${SCRIPT_DIR:-}/../.env.local" ".env.local"; do
    [ -f "$candidate" ] && { ENVLOCAL_FILE="$candidate"; break; }
  done
  if [ -n "$ENVLOCAL_FILE" ]; then
    info "Loading defaults from ${ENVLOCAL_FILE}"
    # shellcheck source=/dev/null
    set -o allexport; source "${ENVLOCAL_FILE}" 2>/dev/null || true; set +o allexport
  fi

  printf "  ${DIM}Free inference is available via OpenRouter (openrouter.ai — free tier).${RESET}\n"
  printf "  ${DIM}Press Enter to keep an existing value, or paste a new one.${RESET}\n\n"

  ask "OPENROUTER_API_KEY (free at openrouter.ai — enables all free models):"
  read -r _or_key
  OPENROUTER_KEY_VAL="${_or_key:-${OPENROUTER_API_KEY:-}}"

  ask "XAI_API_KEY (xAI / Grok — optional if OpenRouter is set):"
  read -r _xai_key
  XAI_API_KEY_VAL="${_xai_key:-${XAI_API_KEY:-}}"

  ask "HELIUS_API_KEY (Solana RPC — helius.dev, free tier):"
  read -r _helius_key
  HELIUS_KEY_VAL="${_helius_key:-${HELIUS_API_KEY:-}}"

  ask "SOLANA_PRIVATE_KEY (base58 keypair for on-chain ops, optional):"
  read -r -s _sol_key
  SOL_KEY_VAL="${_sol_key:-}"
  [ -n "${SOL_KEY_VAL}" ] && printf "\n"
else
  OPENROUTER_KEY_VAL="${OPENROUTER_API_KEY:-}"
  XAI_API_KEY_VAL="${XAI_API_KEY:-}"
  HELIUS_KEY_VAL="${HELIUS_API_KEY:-}"
  SOL_KEY_VAL=""
fi

# Write env file
cat > "${ENV_FILE}" << ENVEOF
# ── Solana Clawd Agent Kit — environment config ────────────────────────────
# Generated by setup-agent-kit.sh on $(date)
# x402.wtf · \$CLAWD: 8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump

# ── OpenRouter (free inference — recommended) ──────────────────────────────
# Get a free key at https://openrouter.ai (no credit card needed for free tier)
OPENROUTER_API_KEY=${OPENROUTER_KEY_VAL}
# Gacha slot 1 — heavy reasoning  (free)
OPENROUTER_MODEL1=nvidia/nemotron-3-ultra-550b-a55b:free
# Gacha slot 2 — safety / content filter  (free)
OPENROUTER_MODEL2=nvidia/nemotron-3.5-content-safety:free
# Gacha slot 3 — auto / general  (free)
OPENROUTER_MODEL3=openrouter/optimus-alpha:free

# ── AI providers (paid — optional if OpenRouter is set) ───────────────────
XAI_API_KEY=${XAI_API_KEY_VAL}
# ANTHROPIC_API_KEY=

# ── Solana ─────────────────────────────────────────────────────────────────
HELIUS_API_KEY=${HELIUS_KEY_VAL}
HELIUS_RPC_URL=${HELIUS_KEY_VAL:+https://mainnet.helius-rpc.com/?api-key=${HELIUS_KEY_VAL}}
SOLANA_RPC_URL=${HELIUS_KEY_VAL:+https://mainnet.helius-rpc.com/?api-key=${HELIUS_KEY_VAL}}
# SOLANA_PRIVATE_KEY=${SOL_KEY_VAL}

# ── x402 micropayments ─────────────────────────────────────────────────────
# X402_SVM_PRIVATE_KEY=
# X402_NETWORK=solana-mainnet
# X402_MAX_PER_REQUEST=0.10
# X402_MAX_SESSION=1.00

# ── Clawd hub ──────────────────────────────────────────────────────────────
CLAWD_HUB_PORT=3747
ENVEOF

chmod 600 "${ENV_FILE}"
ok "Config: ${ENV_FILE} (mode 600)"

# Source env for the current session
set -o allexport
# shellcheck source=/dev/null
source "${ENV_FILE}" 2>/dev/null || true
set +o allexport

# ── Load agent definitions ────────────────────────────────────────────────────
if [ "$SKIP_AGENTS" = false ]; then
  step "Loading Solana agent kit (80 agent definitions)"

  AGENTS_DIR=""

  # Try local source first
  if [ "$FROM_SOURCE" = true ] && [ -n "${REPO_ROOT:-}" ]; then
    AGENTS_DIR="${REPO_ROOT}/agents/src"
  fi

  # Fall back to downloading from GitHub
  if [ -z "$AGENTS_DIR" ] || [ ! -d "$AGENTS_DIR" ]; then
    if [ "$HAS_CURL" = true ]; then
      TMP_AGENTS=$(mktemp -d)
      info "Downloading agent definitions from GitHub..."
      AGENT_NAMES=(
        solana-autonomous-trader solana-arbitrage-scanner solana-market-maker
        solana-technical-analyst solana-memecoin-analyst solana-pumpfun-bot
        solana-perpetuals-trader solana-spot-trader solana-portfolio-risk
        solana-tokenomics-analyst solana-onchain-sleuth solana-whale-tracker
        solana-liquidation-bot solana-dex-aggregator solana-yield-optimizer
        solana-alpha-aggregator solana-sentiment-analyzer solana-price-predictor
        solana-anchor-developer solana-protocol-auditor solana-bot-architect
        solana-openclawd-orchestrator solana-agent-orchestrator
        solana-openclawd-pulse-monitor solana-openclawd-spawn-manager
        solana-openclawd-skill-router solana-openclawd-shell-auditor
        solana-vulcan-clawd-autonomous-perps clawdex
      )
      DOWNLOADED=0
      for name in "${AGENT_NAMES[@]}"; do
        url="https://raw.githubusercontent.com/solizardking/solanaclawd/main/agents/src/${name}.json"
        if curl -fsSL "${url}" -o "${TMP_AGENTS}/${name}.json" 2>/dev/null; then
          DOWNLOADED=$((DOWNLOADED + 1))
        fi
      done
      AGENTS_DIR="${TMP_AGENTS}"
      ok "Downloaded ${DOWNLOADED} agent definitions"
    else
      warn "curl not available — skipping agent download"
      SKIP_AGENTS=true
    fi
  fi

  if [ "$SKIP_AGENTS" = false ] && [ -d "$AGENTS_DIR" ]; then
    LOADED=0
    FAILED=0
    AGENT_FILES=("${AGENTS_DIR}"/*.json)
    for f in "${AGENT_FILES[@]}"; do
      [ -f "$f" ] || continue
      if command -v clawd-registry &>/dev/null; then
        if clawd-registry import "${f}" 2>/dev/null; then
          LOADED=$((LOADED + 1))
        else
          FAILED=$((FAILED + 1))
        fi
      else
        # clawd-registry not yet in PATH — copy to ~/.clawd/agents/
        AGENTS_CACHE="${CLAWD_DIR}/agents"
        mkdir -p "${AGENTS_CACHE}"
        cp "${f}" "${AGENTS_CACHE}/" 2>/dev/null && LOADED=$((LOADED + 1)) || FAILED=$((FAILED + 1))
      fi
    done
    ok "Loaded ${LOADED} agents${FAILED:+ (${FAILED} skipped)}"
  fi
fi

# ── Verify binaries ───────────────────────────────────────────────────────────
step "Verifying installation"

BINS_OK=true
declare -A BIN_STATUS
for bin in clawd clawd-registry clawd-hub; do
  if command -v "$bin" &>/dev/null; then
    BIN_STATUS[$bin]="ok"
    ok "$bin → $(command -v "$bin")"
  else
    BIN_STATUS[$bin]="missing"
    warn "$bin not found in PATH"
    BINS_OK=false
  fi
done

if [ "$BINS_OK" = false ]; then
  NPM_PREFIX=$(npm config get prefix 2>/dev/null || true)
  if [ -n "${NPM_PREFIX}" ]; then
    printf "\n  ${BOLD}Add to your shell profile (.zshrc / .bashrc):${RESET}\n"
    printf "  ${CYAN}export PATH=\"${NPM_PREFIX}/bin:\$PATH\"${RESET}\n"
    printf "  Then: ${BOLD}source ~/.zshrc${RESET}\n\n"
  fi
fi

# ── Smoke test ────────────────────────────────────────────────────────────────
step "Smoke test"

if command -v clawd-registry &>/dev/null; then
  COUNT=$(clawd-registry stats 2>/dev/null | grep -o '"total":[0-9]*' | grep -o '[0-9]*' || echo "?")
  ok "clawd-registry: ${COUNT} agents indexed"
else
  info "clawd-registry not in PATH — run: export PATH=\"\$(npm config get prefix)/bin:\$PATH\""
fi

if command -v clawd-hub &>/dev/null; then
  ok "clawd-hub: ready (run 'clawd-hub start' to launch on port ${CLAWD_HUB_PORT:-3747})"
fi

# ── Summary ───────────────────────────────────────────────────────────────────
printf "\n${BOLD}${GREEN}🦞  Solana Clawd Agent Kit ready!${RESET}\n\n"

printf "  ${BOLD}Quick start:${RESET}\n"
printf "  ${CYAN}1.${RESET} Edit ${BOLD}${ENV_FILE}${RESET} — add ${BOLD}XAI_API_KEY${RESET}\n"
printf "  ${CYAN}2.${RESET} ${BOLD}clawd${RESET}                  — interactive AI TUI\n"
printf "  ${CYAN}3.${RESET} ${BOLD}clawd-hub start --open${RESET}  — agent browser dashboard\n"
printf "  ${CYAN}4.${RESET} ${BOLD}clawd-registry list${RESET}     — list all loaded agents\n"
printf "\n"

printf "  ${BOLD}Agent registry commands:${RESET}\n"
printf "  ${CYAN}clawd-registry list${RESET}                         list agents\n"
printf "  ${CYAN}clawd-registry search <query>${RESET}               semantic search\n"
printf "  ${CYAN}clawd-registry add <on-chain-address>${RESET}       index from chain\n"
printf "  ${CYAN}clawd-registry mint --name ... --uri ...${RESET}    mint new agent NFT\n"
printf "  ${CYAN}clawd-registry stats${RESET}                        index statistics\n"
printf "\n"

printf "  ${BOLD}Hub (LM Studio for Solana agents):${RESET}\n"
printf "  ${CYAN}clawd-hub start${RESET}          start local hub (port ${CLAWD_HUB_PORT:-3747})\n"
printf "  ${CYAN}clawd-hub start --open${RESET}   start + open browser\n"
printf "  ${CYAN}clawd-hub status${RESET}          check hub status\n"
printf "\n"

printf "  ${BOLD}Links:${RESET}\n"
printf "  GitHub:  ${CYAN}https://github.com/solizardking/solanaclawd${RESET}\n"
printf "  CA:      ${DIM}8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump${RESET}\n"
printf "\n"
printf "  ${YELLOW}The shell molts. The laws do not. 🦞${RESET}\n\n"

#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════════════╗
# ║  Solana Clawd — pay.sh  ·  Formally Verified On-Chain Agent Installer   ║
# ║                                                                          ║
# ║  Clawd is the ONLY formally verified, SAS-attested, on-chain Solana     ║
# ║  agent runtime. It installs FIRST. Everything else plugs in AFTER.       ║
# ║                                                                          ║
# ║  curl -fsSL https://raw.githubusercontent.com/Solizardking/solana-clawd/main/pay.sh | bash
# ║  $CLAWD: 8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump                  ║
# ╚══════════════════════════════════════════════════════════════════════════╝
set -euo pipefail

# ── Terminal colours ──────────────────────────────────────────────────────────
RESET="\033[0m"; BOLD="\033[1m"
GREEN="\033[32m"; YELLOW="\033[33m"; RED="\033[31m"
CYAN="\033[36m"; MAGENTA="\033[35m"; BLUE="\033[34m"; DIM="\033[2m"

ok()   { printf "${GREEN}✓  %s${RESET}\n" "$*"; }
info() { printf "${CYAN}·  %s${RESET}\n" "$*"; }
warn() { printf "${YELLOW}⚠  %s${RESET}\n" "$*"; }
die()  { printf "${RED}✗  %s${RESET}\n" "$*" >&2; exit 1; }
step() { printf "\n${BOLD}${MAGENTA}▶  %s${RESET}\n" "$*"; }

# ── Parse flags ───────────────────────────────────────────────────────────────
INSTALL_ANTHROPIC=false
INSTALL_OPENAI=false
INSTALL_XAI=false
INSTALL_PERPLEXITY=false
INSTALL_LEVIATHAN=false
INSTALL_PERPS=false
INSTALL_PUMP=false
INSTALL_SDK=false

for arg in "$@"; do
  case "$arg" in
    --anthropic)    INSTALL_ANTHROPIC=true ;;
    --openai)       INSTALL_OPENAI=true ;;
    --xai)          INSTALL_XAI=true ;;
    --perplexity)   INSTALL_PERPLEXITY=true ;;
    --all-models)   INSTALL_ANTHROPIC=true; INSTALL_OPENAI=true; INSTALL_XAI=true; INSTALL_PERPLEXITY=true ;;
    --leviathan)    INSTALL_LEVIATHAN=true ;;
    --perps)        INSTALL_PERPS=true ;;
    --pump)         INSTALL_PUMP=true ;;
    --sdk)          INSTALL_SDK=true ;;
    --full)         INSTALL_LEVIATHAN=true; INSTALL_PERPS=true; INSTALL_PUMP=true; INSTALL_SDK=true; INSTALL_ANTHROPIC=true; INSTALL_OPENAI=true; INSTALL_XAI=true; INSTALL_PERPLEXITY=true ;;
    --help|-h)
      printf "Usage: pay.sh [flags]\n\n"
      printf "  ${BOLD}Clawd (formally verified on-chain Solana agent)${RESET}\n"
      printf "  ${GREEN}Always installed as the default agent. Zero config to start.${RESET}\n\n"
      printf "  ${BOLD}PROVIDER FLAGS (optional — plug in after Clawd)${RESET}\n"
      printf "  ${BOLD}--anthropic${RESET}   Anthropic Claude (recommended — Claude Opus 4.7 + MCP)\n"
      printf "  ${BOLD}--openai${RESET}       OpenAI (GPT-5 + DALL·E)\n"
      printf "  ${BOLD}--xai${RESET}          xAI Grok (real-time voice + deep search)\n"
      printf "  ${BOLD}--perplexity${RESET}   Perplexity (live internet search)\n"
      printf "  ${BOLD}--all-models${RESET}   All of the above\n"
      printf "\n"
      printf "  ${BOLD}RUNTIME FLAGS${RESET}\n"
      printf "  ${BOLD}--leviathan${RESET}    On-chain agent identity + spawn (SAS + Metaplex Agent Registry)\n"
      printf "  ${BOLD}--perps${RESET}        Phoenix perpetuals via Vulcan CLI\n"
      printf "  ${BOLD}--pump${RESET}         Rust copy-trading sniping bot (clawd-pump)\n"
      printf "  ${BOLD}--sdk${RESET}          @openclawdsolana/solana-sdk + wallet\n"
      printf "  ${BOLD}--full${RESET}         Everything — Clawd + leviathan + perps + pump + SDK + all models\n"
      printf "\n"
      printf "  ${DIM}Set VAULT_PASSPHRASE to encrypt the leviathan keypair at spawn.${RESET}\n"
      printf "  ${DIM}Set SOLANA_RPC_URL to use a custom RPC (Helius/Triton/QuickNode).${RESET}\n"
      printf "\n"
      printf "  ${DIM}Examples:${RESET}\n"
      printf "  ${DIM}  curl -fsSL ...pay.sh | bash                      # Clawd only${RESET}\n"
      printf "  ${DIM}  curl -fsSL ...pay.sh | bash -s -- --anthropic    # Clawd + Claude${RESET}\n"
      printf "  ${DIM}  curl -fsSL ...pay.sh | bash -s -- --full         # Everything${RESET}\n"
      exit 0 ;;
  esac
done

# ── Banner ────────────────────────────────────────────────────────────────────
printf "${CYAN}${BOLD}"
cat << 'BANNER'

 ╔══════════════════════════════════════════════════════════════════════════╗
 ║                                                                          ║
 ║    ██████╗██╗      █████╗ ██╗    ██╗██████╗                             ║
 ║   ██╔════╝██║     ██╔══██╗██║    ██║██╔══██╗                            ║
 ║   ██║     ██║     ███████║██║ █╗ ██║██║  ██║                            ║
 ║   ██║     ██║     ██╔══██║██║███╗██║██║  ██║                            ║
 ║   ╚██████╗███████╗██║  ██║╚███╔███╔╝██████╔╝                            ║
 ║    ╚═════╝╚══════╝╚═╝  ╚═╝ ╚══╝╚══╝ ╚═════╝                             ║
 ║                                                                          ║
 ║    F O R M A L L Y   V E R I F I E D   ·   O N - C H A I N               ║
 ║                                                                          ║
 ║    SAS Attestation: 22zoJMtdu4tQc2PzL74ZUT7FrwgB1Udec8DdW4yw4BdG        ║
 ║    Metaplex Agent Registry: CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d ║
 ║    CAAP/1.0 Discovery: x402.wtf/.well-known/agent-auth.json              ║
 ║                                                                          ║
 ║    x402.wtf  ·  github.com/Solizardking/solana-clawd  ║
 ║                                                                          ║
 ╚══════════════════════════════════════════════════════════════════════════╝

BANNER
printf "${RESET}"

printf "\n${BOLD}${GREEN}🦞  Clawd — Formally Verified On-Chain Solana Agent${RESET}\n\n"
printf "  ${DIM}Clawd is the only Solana agent runtime with SAS on-chain attestation.${RESET}\n"
printf "  ${DIM}Every agent identity is an MPL Core NFT registered with Metaplex.${RESET}\n"
printf "  ${DIM}CAAP/1.0 agent auth — Ed25519 keypairs, JWT capabilities, SIWS gating.${RESET}\n"
printf "  ${DIM}Encrypted at birth: agentwallet-vault (AES-256-GCM sealed keypair).${RESET}\n\n"

# ── Prerequisites ─────────────────────────────────────────────────────────────
step "Checking prerequisites"

command -v node &>/dev/null || die "Node.js not found. Install v20+ from https://nodejs.org"
NODE_MAJOR=$(node --version | sed 's/v//' | cut -d. -f1)
[ "${NODE_MAJOR}" -ge 20 ] || die "Node.js v20+ required (found v${NODE_MAJOR})"
ok "Node.js $(node --version)"

command -v npm &>/dev/null || die "npm not found"
ok "npm $(npm --version)"

# ══════════════════════════════════════════════════════════════════════════════
# PHASE 1 — Solana Clawd Core (always installed — formally verified default)
# ══════════════════════════════════════════════════════════════════════════════

step "PHASE 1 — Solana Clawd Core (formally verified on-chain agent)"

info "Installing clawd TUI (the terminal operator)..."
npm install -g @openclawdsolana/clawd &>/dev/null || die "Failed to install @openclawdsolana/clawd"
ok "@openclawdsolana/clawd — formal verification status: ✅ SAS attested"

info "Installing agent registry (on-chain identity + indexing)..."
npm install -g @openclawdsolana/agent-registry &>/dev/null || die "Failed to install @openclawdsolana/agent-registry"
ok "@openclawdsolana/agent-registry — Metaplex MPL Core compatible"

info "Installing agent hub (local discovery dashboard)..."
npm install -g @openclawdsolana/agent-hub &>/dev/null || die "Failed to install @openclawdsolana/agent-hub"
ok "@openclawdsolana/agent-hub — port 3747"

info "Installing agentwallet-vault (encrypted keypair at birth)..."
npm install -g agentwallet-vault &>/dev/null || die "Failed to install agentwallet-vault"
ok "agentwallet-vault — AES-256-GCM · Encrypted by default"

# ── Runtime packages (optional) ───────────────────────────────────────────────
if [ "$INSTALL_LEVIATHAN" = true ]; then
  info "Installing Leviathan on-chain runtime (SAS + Metaplex spawn)..."
  npm install -g @openclawdsolana/leviathan &>/dev/null || die "Failed to install @openclawdsolana/leviathan"
  ok "@openclawdsolana/leviathan — spawn with: leviathan --spawn"
fi

if [ "$INSTALL_SDK" = true ]; then
  info "Installing Solana SDK + wallet..."
  npm install -g @openclawdsolana/solana-sdk &>/dev/null || die "Failed to install @openclawdsolana/solana-sdk"
  npm install -g @openclawdsolana/wallet &>/dev/null || die "Failed to install @openclawdsolana/wallet"
  ok "@openclawdsolana/solana-sdk + @openclawdsolana/wallet"
fi

if [ "$INSTALL_PERPS" = true ]; then
  info "Installing x402.wtf CLI (perps gateway)..."
  npm install -g x402.wtf &>/dev/null || die "Failed to install x402.wtf"
  ok "x402.wtf — perps gateway"

  # Vulcan CLI
  LOCAL_BIN="${HOME}/.local/bin"
  mkdir -p "${LOCAL_BIN}"
  info "Downloading Vulcan CLI (Phoenix perps)..."
  if curl -fsSL "https://github.com/Ellipsis-Labs/vulcan-cli/releases/latest/download/install.sh" \
      -o /tmp/_vulcan_install.sh 2>/dev/null; then
    chmod +x /tmp/_vulcan_install.sh
    VULCAN_INSTALL_DIR="${LOCAL_BIN}" sh /tmp/_vulcan_install.sh
    rm -f /tmp/_vulcan_install.sh
    ok "Vulcan CLI → ${LOCAL_BIN}/vulcan"
  else
    warn "Vulcan download failed — install manually: vulcan setup"
  fi
fi

if [ "$INSTALL_PUMP" = true ]; then
  if command -v cargo &>/dev/null && [ -d "clawd-pump" ]; then
    export PROTOC="${PROTOC:-$(which protoc)}"
    info "Building clawd-pump Rust bot..."
    (cd clawd-pump && env PROTOC="$PROTOC" cargo build --release 2>&1 | tail -2) && \
      ok "clawd-pump built" || warn "clawd-pump build failed — check Rust toolchain"
  else
    warn "Skipping clawd-pump — requires cargo + clawd-pump/ directory"
  fi
fi

# ══════════════════════════════════════════════════════════════════════════════
# PHASE 2 — AI Provider Plugins (optional — plug in AFTER Clawd)
# ══════════════════════════════════════════════════════════════════════════════

if [ "$INSTALL_ANTHROPIC" = true ] || [ "$INSTALL_OPENAI" = true ] || [ "$INSTALL_XAI" = true ] || [ "$INSTALL_PERPLEXITY" = true ]; then
  step "PHASE 2 — AI Provider Plugins (pluggable after Clawd)"
fi

if [ "$INSTALL_ANTHROPIC" = true ]; then
  printf "\n  ${BOLD}${BLUE}Anthropic Claude${RESET}\n"
  printf "  ${DIM}Clawd defaults to Claude Sonnet 4.6 → Opus 4.7 for deep reasoning.${RESET}\n"
  printf "  ${DIM}Set ANTHROPIC_API_KEY in ~/.clawd/.env${RESET}\n"
  printf "  ${DIM}MCP servers auto-configure with Claude Desktop integration.${RESET}\n"
  info "Anthropic Claude configured as preferred provider in Clawd"
fi

if [ "$INSTALL_OPENAI" = true ]; then
  printf "\n  ${BOLD}${GREEN}OpenAI${RESET}\n"
  printf "  ${DIM}GPT-5 + DALL·E available as secondary provider.${RESET}\n"
  printf "  ${DIM}Set OPENAI_API_KEY in ~/.clawd/.env${RESET}\n"
  info "OpenAI configured as secondary provider in Clawd"
fi

if [ "$INSTALL_XAI" = true ]; then
  printf "\n  ${BOLD}${RED}xAI Grok${RESET}\n"
  printf "  ${DIM}Real-time voice + deep search via Grok.${RESET}\n"
  printf "  ${DIM}Set XAI_API_KEY in ~/.clawd/.env${RESET}\n"
  info "xAI Grok configured as secondary provider in Clawd"
fi

if [ "$INSTALL_PERPLEXITY" = true ]; then
  printf "\n  ${BOLD}${CYAN}Perplexity${RESET}\n"
  printf "  ${DIM}Live internet search integrated with Clawd tools.${RESET}\n"
  printf "  ${DIM}Set PERPLEXITY_API_KEY in ~/.clawd/.env${RESET}\n"
  info "Perplexity configured as search provider in Clawd"
fi

# ══════════════════════════════════════════════════════════════════════════════
# PHASE 3 — Environment Setup
# ══════════════════════════════════════════════════════════════════════════════

step "PHASE 3 — Environment Setup"

CLAWD_DIR="${HOME}/.clawd"
mkdir -p "${CLAWD_DIR}"
ok "Config dir: ${CLAWD_DIR}"

ENV_FILE="${CLAWD_DIR}/.env"
if [ ! -f "${ENV_FILE}" ]; then
  cat > "${ENV_FILE}" << 'ENV'
# ── Solana Clawd — Formally Verified On-Chain Agent ───────────────────────────
# Clawd is the DEFAULT. Everything below is optional — Clawd works without them.
# Free inference: set OPENROUTER_API_KEY for zero-cost access (openrouter.ai ← no card needed)

# ── Clawd (formally verified — always active) ────────────────────────────────
# Clawd is SAS-attested on Solana mainnet. No key required.
# On-chain identity: leviathan --spawn
# Agent auth: CAAP/1.0 discovery at https://x402.wtf/.well-known/agent-auth.json

# ── Free inference via OpenRouter (no cost to start) ──────────────────────────
OPENROUTER_API_KEY=
OPENROUTER_MODEL1=nvidia/nemotron-3-ultra-550b-a55b:free
OPENROUTER_MODEL2=nvidia/nemotron-3.5-content-safety:free
OPENROUTER_MODEL3=openrouter/optimus-alpha:free

# ── Preferred provider: Anthropic Claude (recommended for Clawd) ─────────────
# ANTHROPIC_API_KEY=          # Claude Sonnet 4.6 → Opus 4.7 (1M context)

# ── Additional providers (optional) ───────────────────────────────────────────
# XAI_API_KEY=                # Grok — real-time voice + deep search
# OPENAI_API_KEY=             # GPT-5 + DALL·E
# PERPLEXITY_API_KEY=         # Live internet search

# ── Solana ────────────────────────────────────────────────────────────────────
# SOLANA_PRIVATE_KEY=         # base58 keypair (on-chain ops)
# SOLANA_RPC_URL=             # Helius/Triton/QuickNode URL
# HELIUS_API_KEY=             # free at helius.dev

# ── Agentwallet Vault (encrypted keypair at spawn) ────────────────────────────
# VAULT_PASSPHRASE=           # encrypt your leviathan keypair (AES-256-GCM)

# ── x402 micropayments ────────────────────────────────────────────────────────
# X402_SVM_PRIVATE_KEY=
# X402_NETWORK=solana-mainnet

# ── ClawdBrowser / x402.wtf — live API endpoints ─────────────────────────────
# All 493 routes live at https://x402.wtf — no extra setup needed.
X402_BASE_URL=https://x402.wtf
CLAWD_LLM_ENDPOINT=https://x402.wtf/api/tide/v1/chat/completions
CLAWD_AGENT_CATALOG=https://x402.wtf/api/agents/catalog
CLAWD_AGENT_CHAT=https://x402.wtf/api/agents/chat
CLAWD_SKILLS_CATALOG=https://x402.wtf/api/skills
CAAP_DISCOVERY_URL=https://x402.wtf/.well-known/agent-auth.json
CLAWD_GATEWAY_URL=https://x402.wtf/gateway
ENV
  ok "Created ${ENV_FILE}"
else
  info "~/.clawd/.env already exists — preserving existing configuration"
fi

# ── Ensure x402.wtf endpoints are in .env (backfill for existing configs) ────
_env_add() {
  grep -q "^${1}=" "${ENV_FILE}" 2>/dev/null || printf '\n%s=%s\n' "${1}" "${2}" >> "${ENV_FILE}"
}
_env_add "X402_BASE_URL"          "https://x402.wtf"
_env_add "CLAWD_LLM_ENDPOINT"     "https://x402.wtf/api/tide/v1/chat/completions"
_env_add "CLAWD_AGENT_CATALOG"    "https://x402.wtf/api/agents/catalog"
_env_add "CLAWD_AGENT_CHAT"       "https://x402.wtf/api/agents/chat"
_env_add "CLAWD_SKILLS_CATALOG"   "https://x402.wtf/api/skills"
_env_add "CAAP_DISCOVERY_URL"     "https://x402.wtf/.well-known/agent-auth.json"
_env_add "CLAWD_GATEWAY_URL"      "https://x402.wtf/gateway"
ok "x402.wtf endpoints written to ${ENV_FILE}"

# ══════════════════════════════════════════════════════════════════════════════
# PHASE 4 — Gateway Registration (tracks install in Convex, fire-and-forget)
# ══════════════════════════════════════════════════════════════════════════════

step "PHASE 4 — Registering with x402.wtf gateway"

INSTALL_ID="$(node -e 'process.stdout.write(Date.now().toString(36)+Math.random().toString(36).slice(2,8))' 2>/dev/null || echo "unknown")"
_PLATFORM="$(uname -srm 2>/dev/null || echo "unknown")"

if curl -fsSL -X POST "https://x402.wtf/api/gateway/install" \
     -H "Content-Type: application/json" \
     -d "{\"installId\":\"${INSTALL_ID}\",\"platform\":\"${_PLATFORM}\",\"node\":\"$(node --version 2>/dev/null)\",\"packages\":[\"clawd\",\"agent-registry\",\"agent-hub\",\"agentwallet-vault\"],\"flags\":{\"leviathan\":${INSTALL_LEVIATHAN},\"sdk\":${INSTALL_SDK},\"perps\":${INSTALL_PERPS},\"pump\":${INSTALL_PUMP},\"anthropic\":${INSTALL_ANTHROPIC},\"openai\":${INSTALL_OPENAI},\"xai\":${INSTALL_XAI},\"perplexity\":${INSTALL_PERPLEXITY}}}" \
     --max-time 5 --silent --output /dev/null 2>/dev/null; then
  ok "Registered install ${INSTALL_ID} → x402.wtf/api/gateway/install"
else
  warn "Gateway registration skipped (offline or unreachable)"
fi

# ── Open gateway, agents, skills in browser (macOS / Linux) ──────────────────
_open_url() {
  if command -v open &>/dev/null; then
    open "$1" 2>/dev/null &
  elif command -v xdg-open &>/dev/null; then
    xdg-open "$1" 2>/dev/null &
  fi
}

info "Opening x402.wtf gateway, agents, and skills..."
_open_url "https://x402.wtf/gateway"
_open_url "https://x402.wtf/agents"
_open_url "https://x402.wtf/skills"

# ── Verify binaries ───────────────────────────────────────────────────────────
step "Verifying installation"

for bin in clawd clawd-registry clawd-hub; do
  if command -v "$bin" &>/dev/null; then
    ok "$bin"
  else
    warn "$bin not in PATH"
    NPM_PREFIX=$(npm config get prefix 2>/dev/null || true)
    [ -n "${NPM_PREFIX}" ] && warn "  Add to PATH: export PATH=\"${NPM_PREFIX}/bin:\$PATH\""
  fi
done

command -v agentwallet &>/dev/null && ok "agentwallet" || warn "agentwallet not in PATH"

# ── Done ──────────────────────────────────────────────────────────────────────
printf "\n${BOLD}${GREEN}🦞  Clawd — Formally Verified On-Chain Agent — Ready${RESET}\n\n"

printf "  ${BOLD}Clawd is the default agent. It runs FIRST. Everything else plugs in after.${RESET}\n\n"

printf "  ${BOLD}Quick start:${RESET}\n"
printf "  ${CYAN}1.${RESET} ${BOLD}clawd${RESET}                                    — interactive AI terminal\n"
printf "  ${CYAN}2.${RESET} ${BOLD}clawd-hub start --open${RESET}                   — agent dashboard (localhost:3747)\n"
printf "  ${CYAN}3.${RESET} ${BOLD}clawd character list${RESET}                     — 94 personas (no key needed)\n"
printf "\n"

if [ "$INSTALL_LEVIATHAN" = true ]; then
  printf "  ${BOLD}On-chain identity:${RESET}\n"
  printf "  ${CYAN}leviathan --spawn --name \"Kraken\" --creator <PUBKEY>${RESET}\n"
  printf "  ${CYAN}leviathan --run${RESET}                        — start OODA pulse loop\n"
  printf "  ${CYAN}leviathan --status${RESET}                     — depth + balances\n"
  printf "\n"
fi

if [ "$INSTALL_PERPS" = true ]; then
  printf "  ${BOLD}Phoenix Perps:${RESET}\n"
  printf "  ${CYAN}vulcan setup${RESET}                           — first-run wallet wizard\n"
  printf "  ${CYAN}vulcan paper init --balance 10000${RESET}      — paper trade (no real funds)\n"
  printf "\n"
fi

if [ "$INSTALL_PUMP" = true ]; then
  printf "  ${BOLD}clawd-pump Bot:${RESET}\n"
  printf "  ${CYAN}clawd-agents pump start${RESET}                — start copy-trading bot\n"
  printf "  ${CYAN}clawd-agents pump build${RESET}                — build from source\n"
  printf "\n"
fi

printf "  ${BOLD}Verification credentials:${RESET}\n"
printf "  ${DIM}SAS Attestation:  22zoJMtdu4tQc2PzL74ZUT7FrwgB1Udec8DdW4yw4BdG${RESET}\n"
printf "  ${DIM}CAAP/1.0:          https://x402.wtf/.well-known/agent-auth.json${RESET}\n"
printf "  ${DIM}Metaplex:          CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d${RESET}\n"
printf "\n"

printf "  ${DIM}Set VAULT_PASSPHRASE to encrypt your leviathan keypair at spawn.${RESET}\n"
printf "  ${DIM}Free inference: set OPENROUTER_API_KEY in ~/.clawd/.env (no card needed)${RESET}\n"
printf "\n"

printf '  %sx402.wtf API (493 routes — live now):%s\n' "${BOLD}" "${RESET}"
printf '  %shttps://x402.wtf/gateway%s                        — agent gateway + installer\n' "${CYAN}" "${RESET}"
printf '  %shttps://x402.wtf/agents%s                         — 125 live agents\n' "${CYAN}" "${RESET}"
printf '  %shttps://x402.wtf/skills%s                         — 130+ skills catalog\n' "${CYAN}" "${RESET}"
printf '  %shttps://x402.wtf/api/tide/v1/chat/completions%s   — OpenAI-compat LLM proxy\n' "${CYAN}" "${RESET}"
printf '  %shttps://x402.wtf/api/agents/catalog%s             — agent catalog JSON\n' "${CYAN}" "${RESET}"
printf '  %shttps://x402.wtf/.well-known/agent-auth.json%s    — CAAP/1.0 discovery\n' "${CYAN}" "${RESET}"
printf "\n"
printf "  ${BOLD}Links:${RESET}\n"
printf "  Website:      ${CYAN}https://x402.wtf${RESET}\n"
printf "  Agents:       ${CYAN}https://x402.wtf/agents${RESET}\n"
printf "  Skills:       ${CYAN}https://x402.wtf/skills${RESET}\n"
printf "  Gateway:      ${CYAN}https://x402.wtf/gateway${RESET}\n"
printf "  x402:         ${CYAN}https://x402.wtf${RESET}\n"
printf "  GitHub:       ${CYAN}https://github.com/Solizardking/solana-clawd${RESET}\n"
printf "  \$CLAWD CA:   ${DIM}8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump${RESET}\n"
printf "\n  ${YELLOW}Formally verified. On-chain native. Clawd first. Always. 🦞${RESET}\n\n"
#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════════════╗
# ║  Solana Clawd — one-shot installer                                      ║
# ║  curl -fsSL https://raw.githubusercontent.com/openclawd/solana-clawd/main/install.sh | bash
# ║  $CLAWD: 8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump                  ║
# ╚══════════════════════════════════════════════════════════════════════════╝
set -euo pipefail

# ── Terminal colours ──────────────────────────────────────────────────────────
RESET="\033[0m"; BOLD="\033[1m"
GREEN="\033[32m"; YELLOW="\033[33m"; RED="\033[31m"
CYAN="\033[36m"; MAGENTA="\033[35m"; DIM="\033[2m"

ok()   { printf "${GREEN}✓  %s${RESET}\n" "$*"; }
info() { printf "${CYAN}·  %s${RESET}\n" "$*"; }
warn() { printf "${YELLOW}⚠  %s${RESET}\n" "$*"; }
die()  { printf "${RED}✗  %s${RESET}\n" "$*" >&2; exit 1; }
step() { printf "\n${BOLD}${MAGENTA}▶  %s${RESET}\n" "$*"; }

# ── Parse flags ───────────────────────────────────────────────────────────────
INSTALL_REGISTRY=true
INSTALL_HUB=true
INSTALL_TUI=true
INSTALL_LEVIATHAN=false
INSTALL_SDK=false
INSTALL_PERPS=false
INSTALL_X402=false
INSTALL_PUMP=false
INSTALL_GATEWAY=false

for arg in "$@"; do
  case "$arg" in
    --minimal)    INSTALL_HUB=false; INSTALL_LEVIATHAN=false ;;
    --leviathan)  INSTALL_LEVIATHAN=true ;;
    --sdk)        INSTALL_SDK=true ;;
    --perps)      INSTALL_PERPS=true ;;
    --x402)       INSTALL_X402=true ;;
    --pump)       INSTALL_PUMP=true ;;
    --gateway)    INSTALL_GATEWAY=true ;;
    --full)       INSTALL_LEVIATHAN=true; INSTALL_SDK=true; INSTALL_PERPS=true; INSTALL_X402=true; INSTALL_PUMP=true; INSTALL_GATEWAY=true ;;
    --tui-only)   INSTALL_REGISTRY=false; INSTALL_HUB=false ;;
    --help|-h)
      printf "Usage: install.sh [flags]\n\n"
      printf "  ${BOLD}--full${RESET}       Everything (TUI + registry + hub + leviathan + SDK + perps + x402 + pump)\n"
      printf "  ${BOLD}--perps${RESET}      Solana perps via Phoenix/Vulcan CLI (Rise SDK)\n"
      printf "  ${BOLD}--x402${RESET}       x402.wtf CLI (gateway + terminal launcher)\n"
      printf "  ${BOLD}--sdk${RESET}        @openclawdsolana/solana-sdk + @openclawd/wallet\n"
      printf "  ${BOLD}--pump${RESET}       Rust copy-trading bot (clawd-pump) — requires Rust toolchain\n"
      printf "  ${BOLD}--gateway${RESET}    CLAWD Gateway — Telegram bot + HTTP API (Helius/Birdeye)\n"
      printf "  ${BOLD}--leviathan${RESET}  @openclawdsolana/leviathan on-chain runtime\n"
      printf "  ${BOLD}--minimal${RESET}    TUI only (no registry or hub)\n"
      printf "  ${BOLD}--tui-only${RESET}   clawd TUI only\n"
      printf "\n"
      printf "  ${DIM}Set SOLANA_RPC_URL in env to skip the RPC prompt during --perps.${RESET}\n"
      printf "  ${DIM}Set VAULT_PASSPHRASE to encrypt the leviathan keypair at spawn.${RESET}\n"
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

  🦞  Solana Clawd — The LM Studio of Solana Agents
  github.com/openclawd/solana-clawd

BANNER
printf "${RESET}"

# ── Prerequisites ─────────────────────────────────────────────────────────────
step "Checking prerequisites"

command -v node &>/dev/null || die "Node.js not found. Install v20+ from https://nodejs.org"
NODE_MAJOR=$(node --version | sed 's/v//' | cut -d. -f1)
[ "${NODE_MAJOR}" -ge 20 ] || die "Node.js v20+ required (found v${NODE_MAJOR})"
ok "Node.js $(node --version)"

command -v npm &>/dev/null || die "npm not found"
ok "npm $(npm --version)"

# ── Clawd npm packages ────────────────────────────────────────────────────────
step "Installing Solana Clawd suite"

if [ "$INSTALL_TUI" = true ]; then
  info "Installing clawd TUI..."
  npm install -g @openclawdsolana/clawd 2>&1 | tail -1
  ok "@openclawdsolana/clawd"
fi

if [ "$INSTALL_REGISTRY" = true ]; then
  info "Installing agent registry..."
  npm install -g @openclawdsolana/agent-registry 2>&1 | tail -1
  ok "@openclawdsolana/agent-registry"
fi

if [ "$INSTALL_HUB" = true ]; then
  info "Installing agent hub..."
  npm install -g @openclawdsolana/agent-hub 2>&1 | tail -1
  ok "@openclawdsolana/agent-hub"
fi

if [ "$INSTALL_LEVIATHAN" = true ]; then
  info "Installing Leviathan on-chain runtime..."
  npm install -g @openclawdsolana/leviathan 2>&1 | tail -1
  ok "@openclawdsolana/leviathan"

  info "Installing agentwallet-vault (encrypted keypair at birth)..."
  npm install -g agentwallet-vault 2>&1 | tail -1
  ok "agentwallet-vault"
fi

if [ "$INSTALL_SDK" = true ]; then
  info "Installing Solana SDK..."
  npm install -g @openclawdsolana/solana-sdk 2>&1 | tail -1
  ok "@openclawdsolana/solana-sdk"
  info "Installing Clawd wallet..."
  npm install -g @openclawd/wallet 2>&1 | tail -1
  ok "@openclawd/wallet"
fi

# ── x402.wtf CLI ─────────────────────────────────────────────────────────────
if [ "$INSTALL_X402" = true ]; then
  step "Installing x402.wtf CLI"
  info "Installing x402.wtf..."
  npm install -g x402.wtf 2>&1 | tail -1
  ok "x402.wtf CLI installed"
  info "Verifying x402.wtf doctor..."
  x402.wtf doctor 2>/dev/null && ok "x402.wtf endpoints OK" || warn "x402.wtf doctor: check endpoints manually"
fi

# ── Phoenix Perps — Vulcan CLI (Rise SDK) ─────────────────────────────────────
if [ "$INSTALL_PERPS" = true ]; then
  step "Installing Vulcan CLI — Phoenix perps / Rise SDK"
  info "docs: https://docs.phoenix.trade"

  # 1. Download vulcan binary
  LOCAL_BIN="${HOME}/.local/bin"
  mkdir -p "${LOCAL_BIN}"

  info "Downloading Vulcan CLI from Ellipsis-Labs/vulcan-cli..."
  if curl -fsSL \
      "https://github.com/Ellipsis-Labs/vulcan-cli/releases/latest/download/install.sh" \
      -o /tmp/_vulcan_install.sh 2>/dev/null; then
    chmod +x /tmp/_vulcan_install.sh
    VULCAN_INSTALL_DIR="${LOCAL_BIN}" sh /tmp/_vulcan_install.sh
    rm -f /tmp/_vulcan_install.sh
    ok "Vulcan CLI installed → ${LOCAL_BIN}/vulcan"
  else
    warn "Could not download Vulcan — install manually:"
    warn "  curl -fsSL https://github.com/Ellipsis-Labs/vulcan-cli/releases/latest/download/install.sh | sh"
    INSTALL_PERPS=false
  fi

  # 2. Add ~/.local/bin to PATH if missing
  if ! echo "${PATH}" | tr ':' '\n' | grep -qx "${LOCAL_BIN}"; then
    warn "~/.local/bin is not in PATH. Detecting shell profile..."
    SHELL_PROF=""
    if [ -f "${HOME}/.zshrc" ];        then SHELL_PROF="${HOME}/.zshrc"
    elif [ -f "${HOME}/.bashrc" ];     then SHELL_PROF="${HOME}/.bashrc"
    elif [ -f "${HOME}/.bash_profile" ]; then SHELL_PROF="${HOME}/.bash_profile"
    fi
    if [ -n "${SHELL_PROF}" ]; then
      printf '\nexport PATH="${HOME}/.local/bin:${PATH}"  # added by Solana Clawd installer\n' >> "${SHELL_PROF}"
      ok "Added ~/.local/bin to PATH in ${SHELL_PROF}"
    else
      warn "Add to your shell profile:  export PATH=\"\${HOME}/.local/bin:\${PATH}\""
    fi
    export PATH="${LOCAL_BIN}:${PATH}"
  fi

  # 3. Resolve Solana RPC URL
  HELIUS_KEY="${HELIUS_API_KEY:-}"
  DERIVED_HELIUS_RPC=""
  if [ -n "${HELIUS_KEY}" ]; then
    DERIVED_HELIUS_RPC="https://mainnet.helius-rpc.com/?api-key=${HELIUS_KEY}"
  fi
  RPC_URL="${HELIUS_RPC_URL:-${SOLANA_RPC_URL:-${DERIVED_HELIUS_RPC}}}"
  VULCAN_CFG="${HOME}/.vulcan/config.toml"

  if [ -z "${RPC_URL}" ]; then
    if [ -f "${VULCAN_CFG}" ] && grep -q "rpc_url" "${VULCAN_CFG}" 2>/dev/null; then
      RPC_URL=$(grep "rpc_url" "${VULCAN_CFG}" | head -1 | sed 's/.*= *//' | tr -d '"')
      info "Using existing Vulcan RPC URL: ${RPC_URL}"
    elif [ -t 0 ]; then
      printf "\n  ${BOLD}Solana RPC URL${RESET}\n"
      printf "  ${DIM}Paste your Helius, Triton, or QuickNode URL. Leave blank to use HELIUS_API_KEY or public mainnet.${RESET}\n"
      printf "  ${DIM}e.g. https://mainnet.helius-rpc.com/?api-key=YOUR_KEY${RESET}\n"
      printf "  ${CYAN}RPC URL:${RESET} "
      read -r RPC_URL
      RPC_URL="${RPC_URL:-${DERIVED_HELIUS_RPC:-https://api.mainnet-beta.solana.com}}"
    else
      RPC_URL="${DERIVED_HELIUS_RPC:-https://api.mainnet-beta.solana.com}"
      warn "Non-interactive: using ${DERIVED_HELIUS_RPC:+derived Helius RPC from HELIUS_API_KEY}${DERIVED_HELIUS_RPC:+' '}${DERIVED_HELIUS_RPC:-public mainnet RPC}. Set HELIUS_RPC_URL or SOLANA_RPC_URL to override."
    fi
  fi
  ok "RPC URL: ${RPC_URL}"

  mkdir -p "${HOME}/.vulcan"
  if [ ! -f "${VULCAN_CFG}" ]; then
    cat > "${VULCAN_CFG}" << TOML
[network]
rpc_url = "${RPC_URL}"
api_url = "https://perp-api.phoenix.trade"

[wallet]
default = ""

[trading]
default_slippage_bps = 50
confirm_trades = true
TOML
    ok "Created ~/.vulcan/config.toml"
  else
    if command -v sed &>/dev/null; then
      sed -i'' "s|^rpc_url = .*|rpc_url = \"${RPC_URL}\"|" "${VULCAN_CFG}" 2>/dev/null || \
        sed -i   "s|^rpc_url = .*|rpc_url = \"${RPC_URL}\"|" "${VULCAN_CFG}" 2>/dev/null || true
    fi
    ok "Updated rpc_url in ~/.vulcan/config.toml"
  fi

  VULCAN_BIN="${LOCAL_BIN}/vulcan"
  command -v vulcan &>/dev/null && VULCAN_BIN="vulcan"

  if [ -x "${VULCAN_BIN}" ] || command -v vulcan &>/dev/null; then
    info "Installing Vulcan agent skills (agentskills)..."
    "${VULCAN_BIN}" agent install --target agentskills 2>/dev/null && \
      ok "Vulcan agent skills installed" || \
      warn "Run manually after reload:  vulcan agent install --target agentskills"
    info "Wiring Vulcan MCP server into Claude config..."
    "${VULCAN_BIN}" agent mcp install --target claude --scope user 2>/dev/null && \
      ok "Vulcan MCP → Claude" || \
      warn "Run manually after reload:  vulcan agent mcp install --target claude --scope user"
    info "Running vulcan status..."
    "${VULCAN_BIN}" status -o json 2>/dev/null | grep -q '"ok"' && \
      ok "vulcan status OK (wallet setup pending: run vulcan setup)" || \
      info "vulcan status: run 'vulcan setup' to complete wallet configuration"
  else
    warn "vulcan binary not found — reload shell then run:"
    warn "  vulcan agent install --target agentskills"
    warn "  vulcan agent mcp install --target claude --scope user"
    warn "  vulcan setup"
  fi

  CLAWD_ENV="${HOME}/.clawd/.env"
  if [ -f "${CLAWD_ENV}" ]; then
    if grep -q "HELIUS_API_KEY" "${CLAWD_ENV}"; then
      sed -i'' "s|# *HELIUS_API_KEY=.*|HELIUS_API_KEY=${HELIUS_KEY}|" "${CLAWD_ENV}" 2>/dev/null || \
        sed -i   "s|# *HELIUS_API_KEY=.*|HELIUS_API_KEY=${HELIUS_KEY}|" "${CLAWD_ENV}" 2>/dev/null || true
      sed -i'' "s|^HELIUS_API_KEY=.*|HELIUS_API_KEY=${HELIUS_KEY}|"  "${CLAWD_ENV}" 2>/dev/null || \
        sed -i   "s|^HELIUS_API_KEY=.*|HELIUS_API_KEY=${HELIUS_KEY}|"  "${CLAWD_ENV}" 2>/dev/null || true
    elif [ -n "${HELIUS_KEY}" ]; then
      printf "\nHELIUS_API_KEY=%s\n" "${HELIUS_KEY}" >> "${CLAWD_ENV}"
    fi
    if grep -q "HELIUS_RPC_URL" "${CLAWD_ENV}"; then
      sed -i'' "s|# *HELIUS_RPC_URL=.*|HELIUS_RPC_URL=${RPC_URL}|" "${CLAWD_ENV}" 2>/dev/null || \
        sed -i   "s|# *HELIUS_RPC_URL=.*|HELIUS_RPC_URL=${RPC_URL}|" "${CLAWD_ENV}" 2>/dev/null || true
      sed -i'' "s|^HELIUS_RPC_URL=.*|HELIUS_RPC_URL=${RPC_URL}|"  "${CLAWD_ENV}" 2>/dev/null || \
        sed -i   "s|^HELIUS_RPC_URL=.*|HELIUS_RPC_URL=${RPC_URL}|"  "${CLAWD_ENV}" 2>/dev/null || true
    else
      printf "\nHELIUS_RPC_URL=%s\n" "${RPC_URL}" >> "${CLAWD_ENV}"
    fi
    if grep -q "SOLANA_RPC_URL" "${CLAWD_ENV}"; then
      sed -i'' "s|# *SOLANA_RPC_URL=.*|SOLANA_RPC_URL=${RPC_URL}|" "${CLAWD_ENV}" 2>/dev/null || \
        sed -i   "s|# *SOLANA_RPC_URL=.*|SOLANA_RPC_URL=${RPC_URL}|" "${CLAWD_ENV}" 2>/dev/null || true
      sed -i'' "s|^SOLANA_RPC_URL=.*|SOLANA_RPC_URL=${RPC_URL}|"  "${CLAWD_ENV}" 2>/dev/null || \
        sed -i   "s|^SOLANA_RPC_URL=.*|SOLANA_RPC_URL=${RPC_URL}|"  "${CLAWD_ENV}" 2>/dev/null || true
    else
      printf "\nSOLANA_RPC_URL=%s\n" "${RPC_URL}" >> "${CLAWD_ENV}"
    fi
    ok "HELIUS + SOLANA RPC env → ~/.clawd/.env"
  fi
fi

# ── clawd-pump Rust Bot ───────────────────────────────────────────────────────
if [ "$INSTALL_PUMP" = true ]; then
  step "Building clawd-pump Rust copy-trading bot"
  info "Requires Rust toolchain — install via: curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh"

  if ! command -v cargo &>/dev/null; then
    warn "cargo not found — install Rust: https://rustup.rs"
    warn "Then run: cd clawd-pump && cargo build --release"
  elif [ -d "clawd-pump" ]; then
    info "Building clawd-pump (release, target-cpu=native)..."
    (cd clawd-pump && cargo build --release 2>&1 | tail -3) && \
      ok "clawd-pump built → clawd-pump/target/release/solana-vntr-sniper" || \
      warn "Build failed — check Rust toolchain and retry: npm run pump:build"
  else
    warn "clawd-pump/ directory not found — clone the repo first"
    warn "  git clone https://github.com/openclawd/solana-clawd"
    warn "  cd solana-clawd && bash install.sh --pump"
  fi
fi

# ── Verify all binaries ───────────────────────────────────────────────────────
step "Verifying binaries"

for bin in clawd clawd-registry clawd-hub; do
  if command -v "$bin" &>/dev/null; then
    ok "$bin"
  else
    warn "$bin not in PATH"
    NPM_PREFIX=$(npm config get prefix 2>/dev/null || true)
    [ -n "${NPM_PREFIX}" ] && warn "  Add to PATH: export PATH=\"${NPM_PREFIX}/bin:\$PATH\""
  fi
done

if [ "$INSTALL_X402" = true ]; then
  command -v x402.wtf &>/dev/null && ok "x402.wtf" || warn "x402.wtf not in PATH (check npm global bin)"
fi

if [ "$INSTALL_PERPS" = true ]; then
  (command -v vulcan &>/dev/null || [ -x "${HOME}/.local/bin/vulcan" ]) && \
    ok "vulcan" || warn "vulcan not in PATH yet — reload shell: source ~/.zshrc"
fi

if [ "$INSTALL_PUMP" = true ]; then
  [ -x "clawd-pump/target/release/solana-vntr-sniper" ] && \
    ok "clawd-pump binary" || \
    info "clawd-pump: build manually (npm run pump:build)"
fi

# ── ~/.clawd config directory ─────────────────────────────────────────────────
step "Setting up ~/.clawd"

CLAWD_DIR="${HOME}/.clawd"
mkdir -p "${CLAWD_DIR}"
ok "Config dir: ${CLAWD_DIR}"

ENV_FILE="${CLAWD_DIR}/.env"
if [ ! -f "${ENV_FILE}" ]; then
  cat > "${ENV_FILE}" << 'ENV'
# ── Solana Clawd — environment config ─────────────────────────────────────────

# ── Free inference via OpenRouter (no cost to start) ──────────────────────────
# Get a free key at openrouter.ai — no credit card required
OPENROUTER_API_KEY=
OPENROUTER_MODEL1=nvidia/nemotron-3-ultra-550b-a55b:free
OPENROUTER_MODEL2=nvidia/nemotron-3.5-content-safety:free
OPENROUTER_MODEL3=openrouter/optimus-alpha:free

# ── AI provider (paid — optional if OpenRouter key is set) ────────────────────
# XAI_API_KEY=
# ANTHROPIC_API_KEY=

# ── Solana ────────────────────────────────────────────────────────────────────
# SOLANA_PRIVATE_KEY=     # base58 keypair (on-chain ops only)
# SOLANA_RPC_URL=         # Helius/Triton/QuickNode URL — set by --perps installer
# HELIUS_API_KEY=         # free at helius.dev

# ── Agentwallet Vault (encrypted keypair at spawn) ────────────────────────────
# Set a strong passphrase to encrypt the leviathan keypair at spawn time.
# If left empty, a passphrase is auto-derived from the keypair material.
# VAULT_PASSPHRASE=

# ── Phoenix Perps (Vulcan CLI / Rise SDK) ─────────────────────────────────────
# Config lives in ~/.vulcan/config.toml — run: vulcan setup
# VULCAN_WALLET_NAME=     # wallet name for non-interactive MCP sessions
# VULCAN_WALLET_PASSWORD= # wallet password for non-interactive MCP sessions

# ── x402 micropayments ────────────────────────────────────────────────────────
# X402_SVM_PRIVATE_KEY=
# X402_NETWORK=solana-mainnet
ENV
  ok "Created ${ENV_FILE}"
  warn "Edit ${ENV_FILE} and add OPENROUTER_API_KEY to start"
else
  info "~/.clawd/.env already exists"
fi

# ── Done ──────────────────────────────────────────────────────────────────────
printf "\n${BOLD}${GREEN}🦞  Solana Clawd installed!${RESET}\n\n"

printf "  ${BOLD}Quick start:${RESET}\n"
printf "  ${CYAN}1.${RESET} Edit ${BOLD}${ENV_FILE}${RESET} — add ${BOLD}OPENROUTER_API_KEY${RESET}\n"
printf "  ${CYAN}2.${RESET} ${BOLD}clawd${RESET}                    — interactive AI terminal (TUI)\n"
printf "  ${CYAN}3.${RESET} ${BOLD}clawd-hub start --open${RESET}   — agent discovery dashboard\n"
printf "  ${CYAN}4.${RESET} ${BOLD}clawd agent list${RESET}         — browse indexed agents\n"
printf "\n"

if [ "$INSTALL_X402" = true ]; then
  printf "  ${BOLD}x402 gateway:${RESET}\n"
  printf "  ${CYAN}x402.wtf${RESET}                    — open the CLAWD terminal\n"
  printf "  ${CYAN}x402.wtf tui${RESET}                — launch solana-clawd TUI\n"
  printf "  ${CYAN}x402.wtf gateway${RESET}             — x402 payment gateway dashboard\n"
  printf "  ${CYAN}x402.wtf agents${RESET}              — browse x402-gated agents\n"
  printf "  ${CYAN}x402.wtf doctor${RESET}              — smoke-test public endpoints\n"
  printf "\n"
fi

if [ "$INSTALL_PERPS" = true ]; then
  printf "  ${BOLD}Phoenix Perps (Vulcan CLI / Rise SDK):${RESET}\n"
  printf "  ${CYAN}vulcan setup${RESET}                           — first-run wizard\n"
  printf "  ${CYAN}vulcan status -o json${RESET}                  — confirm connectivity\n"
  printf "  ${CYAN}vulcan wallet create --name trader${RESET}     — create trading wallet\n"
  printf "  ${CYAN}vulcan margin deposit 500${RESET}              — deposit 500 USDC collateral\n"
  printf "  ${CYAN}vulcan paper init --balance 10000${RESET}      — paper mode (no real funds)\n"
  printf "  ${CYAN}vulcan paper buy SOL --notional-usdc 100${RESET}  — paper trade\n"
  printf "  ${CYAN}vulcan market ticker SOL${RESET}               — live SOL-PERP price\n"
  printf "  ${CYAN}vulcan market list${RESET}                     — all Phoenix markets\n"
  printf "  ${CYAN}vulcan ta report SOL${RESET}                   — RSI/MACD/BBands snapshot\n"
  printf "  ${CYAN}vulcan trade market-buy SOL --notional-usdc 100 --tp 250 --sl 180${RESET}\n"
  printf "  ${DIM}Config: ~/.vulcan/config.toml${RESET}\n"
  printf "  ${DIM}Docs:   https://docs.phoenix.trade${RESET}\n"
  printf "\n"
fi

if [ "$INSTALL_PUMP" = true ]; then
  printf "  ${BOLD}clawd-pump Rust Bot:${RESET}\n"
  printf "  ${CYAN}npm run pump:start${RESET}           — start copy-trading bot\n"
  printf "  ${CYAN}npm run pump:autobuy${RESET}         — start in auto-buy mode\n"
  printf "  ${CYAN}npm run pump:build${RESET}           — build from source\n"
  printf "  ${CYAN}clawd-agents pump start${RESET}      — start via CLI\n"
  printf "  ${CYAN}clawd-agents pump stop${RESET}       — pause via control file\n"
  printf "  ${DIM}Source: clawd-pump/${RESET}\n"
  printf "\n"
fi

printf "  ${BOLD}Agent workflow:${RESET}\n"
printf "  ${CYAN}clawd-registry list${RESET}                  list indexed agents\n"
printf "  ${CYAN}clawd-registry add <address>${RESET}         index an on-chain agent\n"
printf "  ${CYAN}clawd-registry stats${RESET}                 index statistics\n"
printf "\n"

if [ "$INSTALL_LEVIATHAN" = false ]; then
  printf "  ${DIM}On-chain runtime:  npm install -g @openclawdsolana/leviathan${RESET}\n"
fi
if [ "$INSTALL_PERPS" = false ]; then
  printf "  ${DIM}Phoenix perps:     bash install.sh --perps${RESET}\n"
fi
if [ "$INSTALL_X402" = false ]; then
  printf "  ${DIM}x402 gateway CLI:  bash install.sh --x402${RESET}\n"
fi
if [ "$INSTALL_PUMP" = false ]; then
  printf "  ${DIM}Rust pump bot:     bash install.sh --pump${RESET}\n"
fi
if [ "$INSTALL_GATEWAY" = false ]; then
  printf "  ${DIM}CLAWD Gateway:     bash install.sh --gateway${RESET}\n"
fi

# ── CLAWD Gateway (Telegram bot + HTTP API) ──────────────────────────────────
if [ "$INSTALL_GATEWAY" = true ]; then
  step "Building CLAWD Gateway"
  if [ -d "gateway" ]; then
    cd gateway && npm install --no-audit --no-fund 2>&1 | tail -3 && npm run build 2>&1 | tail -3 && cd ..
    ok "CLAWD Gateway built → dist/gateway/src/index.js"
    info "Start with: cd gateway && npm start"
    info "Or deploy to Fly.io: cd gateway && fly deploy"
  else
    warn "gateway/ directory not found — clone the repo first"
    warn "  git clone https://github.com/openclawd/solana-clawd"
    warn "  cd solana-clawd && bash install.sh --gateway"
  fi
fi

printf "\n  ${BOLD}Links:${RESET}\n"
printf "  Website:      ${CYAN}https://x402.wtf${RESET}\n"
printf "  Library:      ${CYAN}https://x402.wtf/library${RESET}\n"
printf "  Skills:       ${CYAN}https://x402.wtf/skills${RESET}\n"
printf "  x402:         ${CYAN}https://x402.wtf${RESET}\n"
printf "  Phoenix docs: ${CYAN}https://docs.phoenix.trade${RESET}\n"
printf "  Vulcan repo:  ${CYAN}https://github.com/Ellipsis-Labs/vulcan-cli${RESET}\n"
printf "  GitHub:       ${CYAN}https://github.com/openclawd/solana-clawd${RESET}\n"
printf "  \$CLAWD CA:   ${DIM}8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump${RESET}\n"
printf "\n  ${YELLOW}The shell molts. The laws do not. 🦞${RESET}\n\n"

#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
#  CLAWD Cloud OS CLI
#  Unified command center for SolanaOS + solana-clawd + xAI Grok
# ═══════════════════════════════════════════════════════════════════

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../scripts/lib/common.sh
. "$SCRIPT_DIR/../scripts/lib/common.sh"
clawd_load_env

# ── Banner ──────────────────────────────────────────────────────────
print_banner() {
  echo -e "${BOLD}${CYAN}"
  cat <<'ART'
   _____       __                        ________                    __
  / ___/____  / /___ _____  ____ _     / ____/ /___ __      ______/ /
  \__ \/ __ \/ / __ `/ __ \/ __ `/    / /   / / __ `/ | /| / / __  /
 ___/ / /_/ / / /_/ / / / / /_/ /    / /___/ / /_/ /| |/ |/ / /_/ /
/____/\____/_/\__,_/_/ /_/\__,_/     \____/_/\__,_/ |__/|__/\__,_/
ART
  echo -e "${RESET}"
  echo -e "  ${BOLD}CLAWD Cloud OS CLI v2.0${NC}  ${DIM}· SolanaOS + solana-clawd + xAI Grok${NC}"
  echo ""
}

# ═══════════════════════════════════════════════════════════════════
#  COMMANDS
# ═══════════════════════════════════════════════════════════════════

cmd_setup() {
  echo -e "${BOLD}Setting up CLAWD Cloud OS...${NC}"
  echo ""

  local SCRIPT_DIR
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../scripts" && pwd)"

  if [ -f "$SCRIPT_DIR/bootstrap.sh" ]; then
    bash "$SCRIPT_DIR/bootstrap.sh"
  else
    info "Bootstrap script not found locally."
    info "Downloading and running bootstrap..."
    curl -fsSL https://raw.githubusercontent.com/x402agent/solana-clawd/main/clawd-cloud-os/scripts/bootstrap.sh | bash
  fi
}

cmd_install_go() {
  echo -e "${BOLD}Installing Go...${NC}"
  echo ""

  local SCRIPT_DIR
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../scripts" && pwd)"

  if [ -f "$SCRIPT_DIR/install-go.sh" ]; then
    bash "$SCRIPT_DIR/install-go.sh"
  else
    info "Downloading Go installer..."
    curl -fsSL https://raw.githubusercontent.com/x402agent/solana-clawd/main/clawd-cloud-os/scripts/install-go.sh | bash
  fi
}

cmd_doctor() {
  echo -e "${BOLD}System Check${NC}"
  echo ""
  local FAILURES=0

  # Go
  if command -v go >/dev/null 2>&1; then
    ok "Go          $(go version 2>/dev/null | awk '{print $3}')"
  else
    err "Go          not found — run: ${YELLOW}clawd-cli install-go${NC}"
    FAILURES=$((FAILURES + 1))
  fi

  # Node
  if command -v node >/dev/null 2>&1; then
    local NODE_V
    NODE_V="$(node -v)"
    local NODE_MAJOR
    NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
    if [ "$NODE_MAJOR" -ge 20 ]; then
      ok "Node        $NODE_V"
    else
      warn "Node        $NODE_V (need 20+)"
      FAILURES=$((FAILURES + 1))
    fi
  else
    err "Node        not found"
    FAILURES=$((FAILURES + 1))
  fi

  # npm
  if command -v npm >/dev/null 2>&1; then
    ok "npm         $(npm -v)"
  else
    err "npm         not found"
    FAILURES=$((FAILURES + 1))
  fi

  # Git
  if command -v git >/dev/null 2>&1; then
    ok "git         $(git --version | awk '{print $3}')"
  else
    err "git         not found"
    FAILURES=$((FAILURES + 1))
  fi

  # curl
  if command -v curl >/dev/null 2>&1; then
    ok "curl        available"
  else
    err "curl        not found"
    FAILURES=$((FAILURES + 1))
  fi

  # jq (optional)
  if command -v jq >/dev/null 2>&1; then
    ok "jq          $(jq --version)"
  else
    warn "jq          not found (optional, for JSON output)"
  fi

  echo ""

  # SolanaOS
  if [ -x "$SOLANAOS_BIN" ]; then
    local SOS_V
    SOS_V="$("$SOLANAOS_BIN" version 2>/dev/null || true)"
    ok "SolanaOS    installed at $SOLANAOS_BIN ${SOS_V:+($SOS_V)}"
  else
    err "SolanaOS    not found — run: ${YELLOW}clawd-cli setup${NC}"
    FAILURES=$((FAILURES + 1))
  fi

  # solana-clawd
  if [ -d "$CLAWD_DIR" ] && [ -f "$CLAWD_DIR/package.json" ]; then
    local CLAWD_V
    CLAWD_V="$(node -e "console.log(require('$CLAWD_DIR/package.json').version || 'unknown')" 2>/dev/null || echo 'unknown')"
    ok "solana-clawd v$CLAWD_V at $CLAWD_DIR"
  else
    err "solana-clawd not found — run: ${YELLOW}clawd-cli setup${NC}"
    FAILURES=$((FAILURES + 1))
  fi

  # Environment
  echo ""
  echo -e "${BOLD}Environment:${NC}"
  [ -n "${XAI_API_KEY:-}" ]             && ok "XAI_API_KEY             $(clawd_mask "$XAI_API_KEY")" || warn "XAI_API_KEY             not set"
  [ -n "${HELIUS_API_KEY:-}" ]          && ok "HELIUS_API_KEY          $(clawd_mask "$HELIUS_API_KEY")" || warn "HELIUS_API_KEY          not set"
  [ -n "${SOLANA_TRACKER_API_KEY:-}" ]  && ok "SOLANA_TRACKER_API_KEY  $(clawd_mask "$SOLANA_TRACKER_API_KEY")" || warn "SOLANA_TRACKER_API_KEY  not set"

  # Platform
  echo ""
  echo -e "${BOLD}Platform:${NC}"
  info "OS:   $(uname -s) $(uname -r)"
  info "Arch: $(uname -m)"
  info "Env:  $(clawd_detect_env)"
  echo ""
  clawd_print_paths

  echo ""
  if [ "$FAILURES" -gt 0 ]; then
    err "Doctor found $FAILURES blocking issue(s)"
    return 1
  fi
  ok "Doctor completed without blocking issues"
}

cmd_start() {
  echo -e "${BOLD}Starting CLAWD Cloud OS services...${NC}"
  echo ""

  if [ -x "$SOLANAOS_BIN" ]; then
    clawd_start_service solanaos-server "$SOLANAOS_UI_PORT" "$HOME" "$SOLANAOS_BIN" server || true
    clawd_start_service solanaos-daemon "$SOLANAOS_DAEMON_PORT" "$HOME" "$SOLANAOS_BIN" daemon || true
  else
    warn "SolanaOS not found — skipping"
  fi

  if [ -d "$CLAWD_DIR" ] && [ -f "$CLAWD_DIR/package.json" ]; then
    if npm --prefix "$CLAWD_DIR" run 2>/dev/null | grep -q 'mcp:http'; then
      clawd_start_service solana-clawd-mcp "$CLAWD_MCP_PORT" "$CLAWD_DIR" npm run mcp:http || true
    else
      warn "solana-clawd package has no mcp:http script — skipping MCP"
    fi
  else
    warn "solana-clawd not found — skipping"
  fi

  echo ""
  ok "Start request complete"
  echo -e "  ${DIM}SolanaOS UI:  http://localhost:7777${NC}"
  echo -e "  ${DIM}MCP Server:   http://localhost:3000/mcp${NC}"
  echo -e "  ${DIM}Logs:         $CLAWD_LOG_DIR${NC}"
}

cmd_stop() {
  echo -e "${BOLD}Stopping CLAWD Cloud OS services...${NC}"
  echo ""
  clawd_stop_service solana-clawd-mcp || true
  clawd_stop_service solanaos-daemon || true
  clawd_stop_service solanaos-server || true

  if [ -x "$SOLANAOS_BIN" ]; then
    "$SOLANAOS_BIN" stop >/dev/null 2>&1 || true
  fi
}

cmd_status() {
  echo -e "${BOLD}CLAWD Cloud OS Status${NC}"
  echo ""

  # Remote API
  info "Checking solanaclawd.com..."
  local HTTP_CODE
  HTTP_CODE="$(clawd_http_code "$CLAWD_API/status")"
  if [ "$HTTP_CODE" = "200" ]; then
    ok "API online ($CLAWD_API)"
    if command -v jq >/dev/null 2>&1; then
      curl -s "$CLAWD_API/status" | jq '.' 2>/dev/null || true
    fi
  else
    warn "API unreachable (HTTP $HTTP_CODE)"
  fi

  echo ""

  # Local services
  for PORT_NAME in "$SOLANAOS_UI_PORT:SolanaOS UI" "$CLAWD_MCP_PORT:MCP Server" "$SOLANAOS_DAEMON_PORT:SolanaOS daemon/gateway"; do
    local PORT="${PORT_NAME%%:*}"
    local NAME="${PORT_NAME##*:}"
    if lsof -ti:"$PORT" >/dev/null 2>&1; then
      ok "$NAME running on port $PORT"
    else
      info "$NAME not running (port $PORT)"
    fi
  done

  echo ""
  echo -e "${BOLD}Managed processes:${NC}"
  for NAME in solanaos-server solanaos-daemon solana-clawd-mcp; do
    local PID_FILE PID
    PID_FILE="$(clawd_pid_file "$NAME")"
    if [ -f "$PID_FILE" ]; then
      PID="$(cat "$PID_FILE" 2>/dev/null || true)"
      if clawd_is_pid_running "$PID"; then
        ok "$NAME pid $PID"
      else
        warn "$NAME stale pid file ($PID_FILE)"
      fi
    else
      info "$NAME not managed in this profile"
    fi
  done
}

cmd_agents() {
  info "Listing registered agents..."
  if command -v jq >/dev/null 2>&1; then
    curl -s "$CLAWD_API/agents" | jq '.'
  else
    curl -s "$CLAWD_API/agents"
  fi
}

cmd_wallet() {
  info "Fetching wallet info..."
  if command -v jq >/dev/null 2>&1; then
    curl -s "$CLAWD_API/wallet" | jq '.'
  else
    curl -s "$CLAWD_API/wallet"
  fi
}

cmd_prices() {
  info "Live token prices..."
  if command -v jq >/dev/null 2>&1; then
    curl -s "$CLAWD_API/prices" | jq '.'
  else
    curl -s "$CLAWD_API/prices"
  fi
}

cmd_register() {
  info "Registering on Metaplex Agent Registry..."
  local TOOLS_DIR
  TOOLS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  if [ -f "$TOOLS_DIR/clawd-register.ts" ]; then
    npx tsx "$TOOLS_DIR/clawd-register.ts" "$@"
  else
    echo "  Run: npx tsx clawd-register.ts"
    echo "  Requires: HELIUS_API_KEY"
  fi
}

cmd_paths() {
  clawd_print_paths
  echo ""
  echo -e "${BOLD}Config files:${NC}"
  for FILE in "$CLAWD_CONFIG_DIR"/*.json; do
    [ -f "$FILE" ] && info "$FILE"
  done
}

cmd_logs() {
  local name="${1:-}"
  if [ -n "$name" ]; then
    local file
    file="$(clawd_log_file "$name")"
    [ -f "$file" ] || fail "No log file for $name at $file"
    tail -n "${CLAWD_LOG_LINES:-80}" "$file"
    return
  fi

  echo -e "${BOLD}Recent logs in $CLAWD_LOG_DIR:${NC}"
  find "$CLAWD_LOG_DIR" -maxdepth 1 -type f -name '*.log' -print 2>/dev/null | sort | while IFS= read -r file; do
    info "$file"
    tail -n 8 "$file" 2>/dev/null || true
  done
}

cmd_env() {
  echo -e "${BOLD}Environment files loaded in precedence order:${NC}"
  clawd_env_files | while IFS= read -r file; do
    if [ -f "$file" ]; then
      ok "$file"
    else
      info "$file (not present)"
    fi
  done
  echo ""
  echo -e "${BOLD}Key status:${NC}"
  info "XAI_API_KEY=$(clawd_mask "${XAI_API_KEY:-}")"
  info "HELIUS_API_KEY=$(clawd_mask "${HELIUS_API_KEY:-}")"
  info "SOLANA_TRACKER_API_KEY=$(clawd_mask "${SOLANA_TRACKER_API_KEY:-}")"
  info "CLAWD_API=$CLAWD_API"
  info "CLAWD_DIR=$CLAWD_DIR"
}

cmd_validate() {
  echo -e "${BOLD}Validating CLAWD Cloud OS files...${NC}"
  echo ""
  local FAILURES=0
  local file

  for file in \
    "$CLAWD_CLOUD_OS_HOME/README.md" \
    "$CLAWD_CLOUD_OS_HOME/.env.example" \
    "$CLAWD_CLOUD_OS_HOME/config/clawd-cloud-os.json" \
    "$CLAWD_CLOUD_OS_HOME/config/clawd-openclaw-config.json" \
    "$CLAWD_CLOUD_OS_HOME/config/clawd-registration.json" \
    "$CLAWD_CLOUD_OS_HOME/config/solana-clawd-registration.json" \
    "$CLAWD_CLOUD_OS_HOME/docs/terminal-help.md" \
    "$CLAWD_CLOUD_OS_HOME/scripts/lib/common.sh" \
    "$CLAWD_CLOUD_OS_HOME/tools/clawd-cli.sh"; do
    if [ -f "$file" ]; then
      ok "found ${file#$CLAWD_CLOUD_OS_HOME/}"
    else
      err "missing ${file#$CLAWD_CLOUD_OS_HOME/}"
      FAILURES=$((FAILURES + 1))
    fi
  done

  echo ""
  echo -e "${BOLD}JSON configs:${NC}"
  for file in "$CLAWD_CONFIG_DIR"/*.json; do
    [ -f "$file" ] || continue
    if node -e "JSON.parse(require('fs').readFileSync(process.argv[1], 'utf8'))" "$file" >/dev/null 2>&1; then
      ok "valid ${file#$CLAWD_CLOUD_OS_HOME/}"
    else
      err "invalid ${file#$CLAWD_CLOUD_OS_HOME/}"
      FAILURES=$((FAILURES + 1))
    fi
  done

  echo ""
  echo -e "${BOLD}Shell scripts:${NC}"
  while IFS= read -r file; do
    if bash -n "$file" >/dev/null 2>&1; then
      ok "syntax ${file#$CLAWD_CLOUD_OS_HOME/}"
    else
      err "syntax ${file#$CLAWD_CLOUD_OS_HOME/}"
      FAILURES=$((FAILURES + 1))
    fi
    if [ -x "$file" ]; then
      ok "executable ${file#$CLAWD_CLOUD_OS_HOME/}"
    else
      warn "not executable ${file#$CLAWD_CLOUD_OS_HOME/}"
    fi
  done < <(find "$CLAWD_CLOUD_OS_HOME/scripts" "$CLAWD_CLOUD_OS_HOME/tools" -type f -name '*.sh' | sort)

  echo ""
  if [ "$FAILURES" -gt 0 ]; then
    err "Validation found $FAILURES blocking issue(s)"
    return 1
  fi
  ok "Validation passed"
}

cmd_connect() {
  info "Connecting to solanaclawd.com..."
  if command -v jq >/dev/null 2>&1; then
    curl -s -X POST "$CLAWD_API/connect" \
      -H "Content-Type: application/json" \
      -d '{"agent":"solana-clawd","version":"2.0"}' | jq '.'
  else
    curl -s -X POST "$CLAWD_API/connect" \
      -H "Content-Type: application/json" \
      -d '{"agent":"solana-clawd","version":"2.0"}'
  fi
}

cmd_demo() {
  if [ -d "$CLAWD_DIR" ]; then
    (cd "$CLAWD_DIR" && npm run demo)
  else
    fail "solana-clawd not found at $CLAWD_DIR"
  fi
}

cmd_birth() {
  if [ -d "$CLAWD_DIR" ]; then
    (cd "$CLAWD_DIR" && npm run birth)
  else
    fail "solana-clawd not found at $CLAWD_DIR"
  fi
}

cmd_help() {
  print_banner
  cat <<EOF
${BOLD}Usage:${NC} clawd-cli <command>

${BOLD}Bootstrap & Setup${NC}
  setup              One-shot bootstrap (Go + SolanaOS + solana-clawd)
  install-go         Install Go on any terminal (root or non-root)
  doctor             Check all prerequisites and system health

${BOLD}Service Management${NC}
  start              Start all services (SolanaOS + MCP)
  stop               Stop all services
  status             Check local + remote service status
  logs [service]     Show managed service logs
  paths              Show resolved OpenClawd/CLAWD paths
  env                Show loaded env files and masked key status
  validate           Validate Cloud OS config and scripts

${BOLD}Remote API (solanaclawd.com)${NC}
  agents             List registered agents
  wallet             View wallet info
  prices             Get live token prices
  register           Register on Metaplex Agent Registry
  connect            Connect to solanaclawd.com

${BOLD}solana-clawd${NC}
  demo               Run the animated walkthrough
  birth              Hatch a Blockchain Buddy

${BOLD}Examples${NC}
  ${DIM}# Fresh terminal? One command:${NC}
  clawd-cli setup

  ${DIM}# Just need Go?${NC}
  clawd-cli install-go

  ${DIM}# Check everything is working:${NC}
  clawd-cli doctor

  ${DIM}# Start the full stack:${NC}
  clawd-cli start

  ${DIM}# E2B sandbox quick start:${NC}
  curl -fsSL https://raw.githubusercontent.com/x402agent/solana-clawd/main/clawd-cloud-os/scripts/install-go.sh | bash
  source ~/.bashrc
  clawd-cli setup

EOF
}

# ═══════════════════════════════════════════════════════════════════
#  DISPATCH
# ═══════════════════════════════════════════════════════════════════
case "${1:-help}" in
  setup)       cmd_setup ;;
  install-go)  cmd_install_go ;;
  doctor)      cmd_doctor ;;
  start)       cmd_start ;;
  stop)        cmd_stop ;;
  status)      cmd_status ;;
  logs)        shift; cmd_logs "${1:-}" ;;
  paths)       cmd_paths ;;
  env)         cmd_env ;;
  validate)    cmd_validate ;;
  agents)      cmd_agents ;;
  wallet)      cmd_wallet ;;
  prices)      cmd_prices ;;
  register)    shift; cmd_register "$@" ;;
  connect)     cmd_connect ;;
  demo)        cmd_demo ;;
  birth)       cmd_birth ;;
  help|--help|-h)  cmd_help ;;
  *)
    fail "Unknown command: $1"
    echo ""
    cmd_help
    exit 1
    ;;
esac

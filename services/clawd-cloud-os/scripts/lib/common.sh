#!/usr/bin/env bash
# Shared helpers for CLAWD Cloud OS scripts.

if [ -n "${CLAWD_COMMON_SH_LOADED:-}" ]; then
  return 0 2>/dev/null || exit 0
fi
CLAWD_COMMON_SH_LOADED=1

if [ -z "${BOLD+x}" ]; then BOLD=$'\033[1m'; fi
if [ -z "${CYAN+x}" ]; then CYAN=$'\033[36m'; fi
if [ -z "${GREEN+x}" ]; then GREEN=$'\033[32m'; fi
if [ -z "${YELLOW+x}" ]; then YELLOW=$'\033[33m'; fi
if [ -z "${RED+x}" ]; then RED=$'\033[31m'; fi
if [ -z "${DIM+x}" ]; then DIM=$'\033[2m'; fi
if [ -z "${RESET+x}" ]; then RESET=$'\033[0m'; fi
NC="${NC:-$RESET}"

ok()   { echo -e "  ${GREEN}✓${RESET} $*"; }
info() { echo -e "  ${CYAN}→${RESET} $*"; }
warn() { echo -e "  ${YELLOW}!${RESET} $*"; }
err()  { echo -e "  ${RED}✗${RESET} $*"; }
fail() { err "$*"; exit 1; }

clawd_common_dir() {
  cd "$(dirname "${BASH_SOURCE[0]}")" && pwd
}

CLAWD_LIB_DIR="${CLAWD_LIB_DIR:-$(clawd_common_dir)}"
CLAWD_CLOUD_OS_HOME="${CLAWD_CLOUD_OS_HOME:-$(cd "$CLAWD_LIB_DIR/../.." && pwd)}"
OPENCLAWD_ROOT="${OPENCLAWD_ROOT:-$(cd "$CLAWD_CLOUD_OS_HOME/.." && pwd)}"
CLAWD_CONFIG_DIR="${CLAWD_CONFIG_DIR:-$CLAWD_CLOUD_OS_HOME/config}"
CLAWD_STATE_DIR="${CLAWD_STATE_DIR:-$HOME/.clawd-cloud-os}"
CLAWD_LOG_DIR="${CLAWD_LOG_DIR:-$CLAWD_STATE_DIR/logs}"
CLAWD_PID_DIR="${CLAWD_PID_DIR:-$CLAWD_STATE_DIR/pids}"
CLAWD_RUN_PROFILE="${CLAWD_RUN_PROFILE:-default}"
CLAWD_API="${CLAWD_API:-${CLAWD_API_ENDPOINT:-https://solanaclawd.com/api}}"
CLAWD_ENDPOINT="${CLAWD_ENDPOINT:-https://solanaclawd.com}"
CLAWD_WS_ENDPOINT="${CLAWD_WS_ENDPOINT:-wss://solanaclawd.com/ws}"
SOLANAOS_BIN="${SOLANAOS_BIN:-$HOME/.solanaos/bin/solanaos}"
SOLANAOS_UI_PORT="${SOLANAOS_UI_PORT:-7777}"
SOLANAOS_DAEMON_PORT="${SOLANAOS_DAEMON_PORT:-18790}"
CLAWD_MCP_PORT="${CLAWD_MCP_PORT:-3000}"
CLAWD_WEB_PORT="${CLAWD_WEB_PORT:-3000}"

if [ -z "${CLAWD_DIR:-}" ]; then
  if [ -d "$OPENCLAWD_ROOT/solana-clawd" ]; then
    CLAWD_DIR="$OPENCLAWD_ROOT/solana-clawd"
  else
    CLAWD_DIR="$HOME/src/solana-clawd"
  fi
fi
export CLAWD_DIR

if ! mkdir -p "$CLAWD_LOG_DIR" "$CLAWD_PID_DIR" 2>/dev/null; then
  CLAWD_STATE_DIR="${TMPDIR:-/tmp}"
  CLAWD_STATE_DIR="${CLAWD_STATE_DIR%/}/clawd-cloud-os-${USER:-user}"
  CLAWD_LOG_DIR="$CLAWD_STATE_DIR/logs"
  CLAWD_PID_DIR="$CLAWD_STATE_DIR/pids"
  mkdir -p "$CLAWD_LOG_DIR" "$CLAWD_PID_DIR"
  warn "Configured state directory is not writable; using $CLAWD_STATE_DIR"
fi

clawd_env_files() {
  printf '%s\n' \
    "$CLAWD_CLOUD_OS_HOME/.env" \
    "$OPENCLAWD_ROOT/.env" \
    "$CLAWD_DIR/.env"
}

clawd_load_env() {
  local file key value
  while IFS= read -r file; do
    [ -f "$file" ] || continue
    while IFS= read -r line || [ -n "$line" ]; do
      case "$line" in
        ''|\#*) continue ;;
        export\ *) line="${line#export }" ;;
      esac
      key="${line%%=*}"
      value="${line#*=}"
      case "$key" in
        ''|*[!A-Za-z0-9_]*) continue ;;
      esac
      value="${value%\"}"; value="${value#\"}"
      value="${value%\'}"; value="${value#\'}"
      if [ -z "${!key+x}" ]; then
        export "$key=$value"
      fi
    done < "$file"
  done < <(clawd_env_files)
}

clawd_detect_env() {
  if [ -f /etc/e2b ]; then
    echo "e2b"
  elif [ -f /.dockerenv ]; then
    echo "docker"
  elif grep -qi microsoft /proc/version 2>/dev/null; then
    echo "wsl"
  elif [ "$(uname)" = "Darwin" ]; then
    echo "macos"
  else
    echo "linux"
  fi
}

clawd_have() {
  command -v "$1" >/dev/null 2>&1
}

clawd_json_value() {
  local file="$1" path="$2"
  [ -f "$file" ] || return 1
  if clawd_have jq; then
    jq -r "$path // empty" "$file" 2>/dev/null
  else
    return 1
  fi
}

clawd_pid_file() {
  printf '%s/%s.%s.pid\n' "$CLAWD_PID_DIR" "$CLAWD_RUN_PROFILE" "$1"
}

clawd_log_file() {
  printf '%s/%s.%s.log\n' "$CLAWD_LOG_DIR" "$CLAWD_RUN_PROFILE" "$1"
}

clawd_is_pid_running() {
  local pid="${1:-}"
  [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null
}

clawd_is_service_running() {
  local name="$1" pid_file
  pid_file="$(clawd_pid_file "$name")"
  [ -f "$pid_file" ] && clawd_is_pid_running "$(cat "$pid_file" 2>/dev/null)"
}

clawd_port_pids() {
  local port="$1"
  lsof -ti:"$port" 2>/dev/null || true
}

clawd_port_listening() {
  [ -n "$(clawd_port_pids "$1")" ]
}

clawd_start_service() {
  local name="$1" port="$2" cwd="$3"
  shift 3
  local pid_file log_file pid
  pid_file="$(clawd_pid_file "$name")"
  log_file="$(clawd_log_file "$name")"

  if [ -f "$pid_file" ]; then
    pid="$(cat "$pid_file" 2>/dev/null || true)"
    if clawd_is_pid_running "$pid"; then
      ok "$name already running (pid $pid)"
      return 0
    fi
    rm -f "$pid_file"
  fi

  if [ -n "$port" ] && clawd_port_listening "$port"; then
    warn "$name not started; port $port is already in use by pid(s): $(clawd_port_pids "$port" | tr '\n' ' ')"
    return 1
  fi

  info "Starting $name..."
  (
    cd "$cwd"
    nohup "$@" >"$log_file" 2>&1 &
    echo $! > "$pid_file"
  )

  sleep 1
  pid="$(cat "$pid_file" 2>/dev/null || true)"
  if clawd_is_pid_running "$pid"; then
    ok "$name started (pid $pid, log: $log_file)"
  else
    rm -f "$pid_file"
    warn "$name exited during startup; check $log_file"
    return 1
  fi
}

clawd_stop_service() {
  local name="$1" pid_file pid
  pid_file="$(clawd_pid_file "$name")"
  if [ ! -f "$pid_file" ]; then
    info "$name has no pid file"
    return 0
  fi

  pid="$(cat "$pid_file" 2>/dev/null || true)"
  if ! clawd_is_pid_running "$pid"; then
    rm -f "$pid_file"
    info "$name was not running"
    return 0
  fi

  info "Stopping $name (pid $pid)..."
  kill "$pid" 2>/dev/null || true
  sleep 1
  if clawd_is_pid_running "$pid"; then
    warn "$name did not stop cleanly; sending TERM again"
    kill "$pid" 2>/dev/null || true
    sleep 1
  fi
  if clawd_is_pid_running "$pid"; then
    warn "$name still running; leaving pid file at $pid_file"
    return 1
  fi
  rm -f "$pid_file"
  ok "$name stopped"
}

clawd_http_code() {
  local url="$1"
  curl -s -o /dev/null -w '%{http_code}' "$url" 2>/dev/null || echo "000"
}

clawd_mask() {
  local value="${1:-}"
  if [ -z "$value" ]; then
    echo "not set"
  elif [ "${#value}" -le 8 ]; then
    echo "set"
  else
    printf '%s...%s\n' "${value:0:4}" "${value: -4}"
  fi
}

clawd_print_paths() {
  echo -e "${BOLD}Paths:${RESET}"
  info "OpenClawd root:     $OPENCLAWD_ROOT"
  info "Cloud OS home:      $CLAWD_CLOUD_OS_HOME"
  info "solana-clawd dir:   $CLAWD_DIR"
  info "state dir:          $CLAWD_STATE_DIR"
  info "logs:               $CLAWD_LOG_DIR"
  info "pids:               $CLAWD_PID_DIR"
}

#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

BUNDLE_DIR="${CLAWD_PUMP_SERVE_BUNDLE_DIR:-${HOME}/Library/Application Support/clawd-pump-serve}"
LAUNCHD_LABEL="gui/$(id -u)/com.openclawd.clawd-pump.serve"
REPO_BINARY="target/release/solana-vntr-sniper"
BUNDLE_BINARY="$BUNDLE_DIR/solana-vntr-sniper"
REPO_ENV=".env"
BUNDLE_ENV="$BUNDLE_DIR/.env"

hash_file() {
  local file="$1"
  if [[ ! -f "$file" ]]; then
    printf ""
    return
  fi
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$file" | awk '{print $1}'
  else
    sha256sum "$file" | awk '{print $1}'
  fi
}

same_file_hash() {
  local left="$1"
  local right="$2"
  local left_hash right_hash
  left_hash="$(hash_file "$left")"
  right_hash="$(hash_file "$right")"
  [[ -n "$left_hash" && "$left_hash" == "$right_hash" ]]
}

json_bool() {
  if [[ "$1" == "0" ]]; then
    printf "true"
  else
    printf "false"
  fi
}

json_string() {
  jq -Rn --arg v "${1:-}" '$v'
}

binary_in_sync=1
same_file_hash "$REPO_BINARY" "$BUNDLE_BINARY" && binary_in_sync=0

env_in_sync=1
same_file_hash "$REPO_ENV" "$BUNDLE_ENV" && env_in_sync=0

launchd_loaded=1
launchd_running=1
launchd_pid=""
if command -v launchctl >/dev/null 2>&1; then
  if launchctl print "$LAUNCHD_LABEL" >/tmp/clawd-pump-bundle-launchd.txt 2>/tmp/clawd-pump-bundle-launchd.err; then
    launchd_loaded=0
    grep -Eq "^\s*state = running" /tmp/clawd-pump-bundle-launchd.txt && launchd_running=0
    launchd_pid="$(awk -F'= ' '/^[[:space:]]*pid = / { print $2; exit }' /tmp/clawd-pump-bundle-launchd.txt)"
  fi
fi

cat <<JSON
{
  "bundle_path": $(json_string "$BUNDLE_DIR"),
  "bundle_installed": $(if [[ -d "$BUNDLE_DIR" && -x "$BUNDLE_BINARY" ]]; then printf "true"; else printf "false"; fi),
  "binary_in_sync": $(json_bool "$binary_in_sync"),
  "env_in_sync": $(json_bool "$env_in_sync"),
  "repo_binary_present": $(if [[ -x "$REPO_BINARY" ]]; then printf "true"; else printf "false"; fi),
  "bundle_binary_present": $(if [[ -x "$BUNDLE_BINARY" ]]; then printf "true"; else printf "false"; fi),
  "repo_env_present": $(if [[ -f "$REPO_ENV" ]]; then printf "true"; else printf "false"; fi),
  "bundle_env_present": $(if [[ -f "$BUNDLE_ENV" ]]; then printf "true"; else printf "false"; fi),
  "launchd_label": $(json_string "$LAUNCHD_LABEL"),
  "launchd_loaded": $(json_bool "$launchd_loaded"),
  "launchd_running": $(json_bool "$launchd_running"),
  "launchd_pid": $(json_string "$launchd_pid")
}
JSON

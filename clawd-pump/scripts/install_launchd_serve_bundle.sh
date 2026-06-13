#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

apply="${1:-}"
if [[ -n "$apply" && "$apply" != "--apply" ]]; then
  printf "usage: %s [--apply]\n" "$0" >&2
  exit 2
fi

dry_run=true
if [[ "$apply" == "--apply" ]]; then
  dry_run=false
fi

bundle_dir="${CLAWD_PUMP_SERVE_BUNDLE_DIR:-${HOME}/Library/Application Support/clawd-pump-serve}"
launchd_name="com.openclawd.clawd-pump.serve"
launchd_plist="${HOME}/Library/LaunchAgents/${launchd_name}.plist"
binary="target/release/solana-vntr-sniper"

run_or_print() {
  if [[ "$dry_run" == "true" ]]; then
    printf "dry-run: %s\n" "$*"
  else
    "$@"
  fi
}

if [[ ! -f ".env" ]]; then
  printf "missing .env\n" >&2
  exit 1
fi

if [[ ! -x "$binary" ]]; then
  if [[ "$dry_run" == "true" ]]; then
    printf "dry-run: cargo build --release\n"
  else
    cargo build --release
  fi
fi

run_or_print mkdir -p "$bundle_dir/logs" "${HOME}/Library/LaunchAgents"
run_or_print cp "$binary" "$bundle_dir/solana-vntr-sniper"
run_or_print cp ".env" "$bundle_dir/.env"
if [[ "$dry_run" == "false" ]]; then
  chmod 700 "$bundle_dir"
  chmod 755 "$bundle_dir/solana-vntr-sniper"
  chmod 600 "$bundle_dir/.env"
fi

runner="${bundle_dir}/run_serve_24_7.sh"
plist_tmp="${bundle_dir}/${launchd_name}.plist"

if [[ "$dry_run" == "true" ]]; then
  printf "dry-run: write %s\n" "$runner"
  printf "dry-run: write %s\n" "$plist_tmp"
else
  cat > "$runner" <<'RUNNER'
#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

LOG_DIR="${LOG_DIR:-${PWD}/logs}"
LOG_MAX_BYTES="${LOG_MAX_BYTES:-10485760}"
LOG_KEEP_FILES="${LOG_KEEP_FILES:-5}"
mkdir -p "$LOG_DIR"

log_file="$LOG_DIR/clawd-pump-serve.log"

file_size() {
  local file="$1"
  if stat -f%z "$file" >/dev/null 2>&1; then
    stat -f%z "$file"
  else
    stat -c%s "$file"
  fi
}

rotate_log_if_needed() {
  if [[ ! -f "$log_file" ]]; then
    return
  fi
  local size
  size="$(file_size "$log_file")"
  if [[ "$size" -lt "$LOG_MAX_BYTES" ]]; then
    return
  fi
  local rotated
  rotated="$log_file.$(date -u +%Y%m%dT%H%M%SZ)"
  mv "$log_file" "$rotated"
  find "$LOG_DIR" -maxdepth 1 -type f -name "clawd-pump-serve.log.*" -print \
    | sort -r \
    | awk -v keep="$LOG_KEEP_FILES" 'NR > keep { print }' \
    | while IFS= read -r old_log; do rm -f "$old_log"; done
}

while true; do
  rotate_log_if_needed
  printf "[%s] launching clawd-pump serve\n" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" | tee -a "$log_file"
  ./solana-vntr-sniper --serve 2>&1 | tee -a "$log_file"
  code="${PIPESTATUS[0]}"
  printf "[%s] serve exited with code %s; restarting in 10s\n" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$code" | tee -a "$log_file"
  sleep 10
done
RUNNER
  chmod 755 "$runner"

  cat > "$plist_tmp" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${launchd_name}</string>
  <key>WorkingDirectory</key>
  <string>${bundle_dir}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${runner}</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>RUST_LOG</key>
    <string>info</string>
    <key>LOG_DIR</key>
    <string>${bundle_dir}/logs</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${bundle_dir}/logs/launchd.out.log</string>
  <key>StandardErrorPath</key>
  <string>${bundle_dir}/logs/launchd.err.log</string>
</dict>
</plist>
PLIST
fi

run_or_print cp "$plist_tmp" "$launchd_plist"
if [[ "$dry_run" == "true" ]]; then
  printf "dry-run: launchctl bootout gui/%s/%s\n" "$(id -u)" "$launchd_name"
else
  launchctl bootout "gui/$(id -u)/${launchd_name}" >/dev/null 2>&1 || true
fi
run_or_print launchctl bootstrap "gui/$(id -u)" "$launchd_plist"
run_or_print launchctl kickstart -k "gui/$(id -u)/${launchd_name}"

printf "bundle: %s\n" "$bundle_dir"
printf "service: %s\n" "$launchd_name"
if [[ "$dry_run" == "true" ]]; then
  printf "dry-run only; append --apply to install and start\n"
fi

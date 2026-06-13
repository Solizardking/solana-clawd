#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

kind="${1:-}"
mode="${2:-copy}"

case "$mode" in
  copy|autobuy|serve) ;;
  *)
    printf "usage: %s [systemd|launchd] [copy|autobuy|serve]\n" "$0" >&2
    exit 2
    ;;
esac

repo_dir="$(pwd)"
log_dir="${repo_dir}/logs"
mkdir -p deploy/generated logs

render_systemd() {
  local out="deploy/generated/clawd-pump-${mode}.service"
  local description="clawd-pump 24/7 ${mode} agent"
  local user group
  user="$(id -un)"
  group="$(id -gn)"
  sed \
    -e "s#Description=.*#Description=${description}#" \
    -e "s#WorkingDirectory=.*#WorkingDirectory=${repo_dir}#" \
    -e "s#Environment=LOG_DIR=.*#Environment=LOG_DIR=${log_dir}#" \
    -e "s#ExecStart=.*#ExecStart=${repo_dir}/scripts/run_24_7.sh ${mode}#" \
    -e "s#User=REPLACE_WITH_OPERATOR_USER#User=${user}#" \
    -e "s#Group=REPLACE_WITH_OPERATOR_GROUP#Group=${group}#" \
    -e "s#ReadWritePaths=.*#ReadWritePaths=${repo_dir}#" \
    deploy/systemd/clawd-pump.service.example > "$out"
  printf "%s\n" "$out"
}

render_launchd() {
  local out="deploy/generated/com.openclawd.clawd-pump.${mode}.plist"
  sed \
    -e "s#<string>com.openclawd.clawd-pump</string>#<string>com.openclawd.clawd-pump.${mode}</string>#" \
    -e "s#<string>/Users/8bit/Downloads/solana-clawd/clawd-pump</string>#<string>${repo_dir}</string>#g" \
    -e "s#<string>/Users/8bit/Downloads/solana-clawd/clawd-pump/scripts/run_24_7.sh</string>#<string>${repo_dir}/scripts/run_24_7.sh</string>#" \
    -e "s#<string>copy</string>#<string>${mode}</string>#" \
    -e "s#<string>/Users/8bit/Downloads/solana-clawd/clawd-pump/logs</string>#<string>${log_dir}</string>#" \
    -e "s#<string>/Users/8bit/Downloads/solana-clawd/clawd-pump/logs/launchd.out.log</string>#<string>${log_dir}/launchd-${mode}.out.log</string>#" \
    -e "s#<string>/Users/8bit/Downloads/solana-clawd/clawd-pump/logs/launchd.err.log</string>#<string>${log_dir}/launchd-${mode}.err.log</string>#" \
    deploy/launchd/com.openclawd.clawd-pump.plist.example > "$out"
  printf "%s\n" "$out"
}

case "$kind" in
  systemd)
    rendered="$(render_systemd)"
    ;;
  launchd)
    rendered="$(render_launchd)"
    ;;
  *)
    printf "usage: %s [systemd|launchd] [copy|autobuy|serve]\n" "$0" >&2
    exit 2
    ;;
esac

printf "rendered %s service: %s\n" "$kind" "$rendered"
printf "preflight still runs before the service starts trading\n"

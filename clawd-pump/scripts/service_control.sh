#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

action="${1:-}"
kind="${2:-}"
mode="${3:-copy}"
apply="${4:-}"

usage() {
  printf "usage: %s [install|uninstall|status] [launchd|systemd] [copy|autobuy|serve] [--apply]\n" "$0" >&2
}

case "$action" in
  install|uninstall|status) ;;
  *) usage; exit 2 ;;
esac

case "$kind" in
  launchd|systemd) ;;
  *) usage; exit 2 ;;
esac

case "$mode" in
  copy|autobuy|serve) ;;
  *) usage; exit 2 ;;
esac

if [[ -n "$apply" && "$apply" != "--apply" ]]; then
  usage
  exit 2
fi

dry_run=true
if [[ "$apply" == "--apply" ]]; then
  dry_run=false
fi

run_or_print() {
  if [[ "$dry_run" == "true" ]]; then
    printf "dry-run: %s\n" "$*"
  else
    "$@"
  fi
}

launchd_plist="${HOME}/Library/LaunchAgents/com.openclawd.clawd-pump.plist"
launchd_label="gui/$(id -u)/com.openclawd.clawd-pump"
systemd_service="/etc/systemd/system/clawd-pump.service"

if [[ "$action" == "install" ]]; then
  ./scripts/render_service.sh "$kind" "$mode"
fi

case "${action}:${kind}" in
  install:launchd)
    rendered="deploy/generated/com.openclawd.clawd-pump.${mode}.plist"
    run_or_print mkdir -p "${HOME}/Library/LaunchAgents"
    run_or_print cp "$rendered" "$launchd_plist"
    run_or_print launchctl bootstrap "gui/$(id -u)" "$launchd_plist"
    printf "note: service is installed only; start with launchctl kickstart after preflight passes\n"
    ;;
  uninstall:launchd)
    run_or_print launchctl bootout "$launchd_label"
    run_or_print rm -f "$launchd_plist"
    ;;
  status:launchd)
    run_or_print launchctl print "$launchd_label"
    ;;
  install:systemd)
    rendered="deploy/generated/clawd-pump-${mode}.service"
    run_or_print sudo cp "$rendered" "$systemd_service"
    run_or_print sudo systemctl daemon-reload
    run_or_print sudo systemctl enable clawd-pump
    printf "note: service is enabled only; start with sudo systemctl start clawd-pump after preflight passes\n"
    ;;
  uninstall:systemd)
    run_or_print sudo systemctl disable clawd-pump
    run_or_print sudo rm -f "$systemd_service"
    run_or_print sudo systemctl daemon-reload
    ;;
  status:systemd)
    run_or_print systemctl status clawd-pump
    ;;
esac

if [[ "$dry_run" == "true" ]]; then
  printf "dry-run only; append --apply to execute these commands\n"
fi

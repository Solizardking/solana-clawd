#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

action="${1:-}"
kind="${2:-}"
mode="${3:-copy}"
apply="${4:-}"

usage() {
  printf "usage: %s [install|uninstall|start|stop|restart|status|logs] [launchd|systemd] [copy|autobuy|serve] [--apply]\n" "$0" >&2
}

case "$action" in
  install|uninstall|start|stop|restart|status|logs) ;;
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

service_name="clawd-pump-${mode}"
launchd_name="com.openclawd.clawd-pump.${mode}"
launchd_plist="${HOME}/Library/LaunchAgents/${launchd_name}.plist"
launchd_label="gui/$(id -u)/${launchd_name}"
systemd_service="/etc/systemd/system/${service_name}.service"
log_dir="$(pwd)/logs"

if [[ "$action" == "install" ]]; then
  ./scripts/render_service.sh "$kind" "$mode"
fi

case "${action}:${kind}" in
  install:launchd)
    rendered="deploy/generated/com.openclawd.clawd-pump.${mode}.plist"
    run_or_print mkdir -p "${HOME}/Library/LaunchAgents"
    run_or_print cp "$rendered" "$launchd_plist"
    run_or_print launchctl bootstrap "gui/$(id -u)" "$launchd_plist"
    printf "note: service installed as %s\n" "$launchd_name"
    ;;
  uninstall:launchd)
    run_or_print launchctl bootout "$launchd_label"
    run_or_print rm -f "$launchd_plist"
    ;;
  start:launchd)
    run_or_print launchctl kickstart -k "$launchd_label"
    ;;
  stop:launchd)
    run_or_print launchctl bootout "$launchd_label"
    ;;
  restart:launchd)
    run_or_print launchctl kickstart -k "$launchd_label"
    ;;
  status:launchd)
    run_or_print launchctl print "$launchd_label"
    ;;
  logs:launchd)
    printf "stdout: %s/launchd-%s.out.log\n" "$log_dir" "$mode"
    printf "stderr: %s/launchd-%s.err.log\n" "$log_dir" "$mode"
    run_or_print tail -n 80 "$log_dir/launchd-${mode}.out.log"
    run_or_print tail -n 80 "$log_dir/launchd-${mode}.err.log"
    ;;
  install:systemd)
    rendered="deploy/generated/clawd-pump-${mode}.service"
    run_or_print sudo cp "$rendered" "$systemd_service"
    run_or_print sudo systemctl daemon-reload
    run_or_print sudo systemctl enable "$service_name"
    printf "note: service installed as %s\n" "$service_name"
    ;;
  uninstall:systemd)
    run_or_print sudo systemctl disable "$service_name"
    run_or_print sudo rm -f "$systemd_service"
    run_or_print sudo systemctl daemon-reload
    ;;
  start:systemd)
    run_or_print sudo systemctl start "$service_name"
    ;;
  stop:systemd)
    run_or_print sudo systemctl stop "$service_name"
    ;;
  restart:systemd)
    run_or_print sudo systemctl restart "$service_name"
    ;;
  status:systemd)
    run_or_print systemctl status "$service_name"
    ;;
  logs:systemd)
    run_or_print journalctl -u "$service_name" -n 120 --no-pager
    ;;
esac

if [[ "$dry_run" == "true" ]]; then
  printf "dry-run only; append --apply to execute these commands\n"
fi

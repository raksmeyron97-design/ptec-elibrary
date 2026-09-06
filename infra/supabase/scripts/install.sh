#!/usr/bin/env bash
# One-time setup of the self-hosted Supabase stack on the ZimaOS box (run as root):
#   sudo ./infra/supabase/scripts/install.sh
# Installs the systemd timers (backup nightly, restore test weekly, monitor
# 5-min + daily), runs preflight, starts the stack (with the tunnel profile
# iff SUPABASE_TUNNEL_TOKEN is set) and waits for health.
set -euo pipefail
SCRIPT_NAME=install
. "$(dirname "$0")/lib.sh"
[ "$(id -u)" -eq 0 ] || die "run with sudo"
require_cmd docker systemctl
load_env
mkdir -p "$STATE_DIR" "${BACKUP_DIR:-/DATA/backups/supabase}" "${SUPABASE_DATA_DIR:-$INFRA_DIR/volumes/db/data}"
chmod 700 "${BACKUP_DIR:-/DATA/backups/supabase}"

"$INFRA_DIR/scripts/preflight.sh"

log "installing systemd units"
for u in "$INFRA_DIR"/systemd/*.service "$INFRA_DIR"/systemd/*.timer; do
  sed "s|__INFRA_DIR__|$INFRA_DIR|g" "$u" > "/etc/systemd/system/$(basename "$u")"
done
systemctl daemon-reload
systemctl enable --now ptec-supabase-backup.timer ptec-supabase-restore-test.timer ptec-supabase-monitor.timer ptec-supabase-monitor-daily.timer
systemctl list-timers 'ptec-supabase-*' --no-pager || true

log "starting the stack"
if [ -n "${SUPABASE_TUNNEL_TOKEN:-}" ]; then compose --profile tunnel up -d; else warn "SUPABASE_TUNNEL_TOKEN unset — starting WITHOUT the tunnel (loopback/LAN only)"; compose up -d; fi
for i in $(seq 1 60); do "$INFRA_DIR/scripts/healthcheck.sh" >/dev/null 2>&1 && break; sleep 5; done
"$INFRA_DIR/scripts/healthcheck.sh"

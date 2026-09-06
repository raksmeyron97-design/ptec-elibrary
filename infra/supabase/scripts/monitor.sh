#!/usr/bin/env bash
# Box-side monitoring for the self-hosted stack (docs/MONITORING.md).
#
#   ./monitor.sh --fast    # every 5 min: postgres, containers, API, auth
#   ./monitor.sh --daily   # daily: RAM, disk, backup freshness
#
# Alerts are STATE-TRANSITION based: a check that is failing alerts once when
# it starts failing and once when it recovers, never every tick
# (docs/ALERT-CATALOG.md hygiene rule 2). State lives in $STATE_DIR/monitor/.
# Thresholds from .env: ALERT_RAM_WARN/CRIT, ALERT_DISK_WARN/CRIT (percent).
set -uo pipefail
SCRIPT_NAME=monitor
. "$(dirname "$0")/lib.sh"
load_env
MODE="${1:---fast}"
SD="$STATE_DIR/monitor"; mkdir -p "$SD" 2>/dev/null || { SD="${BACKUP_DIR:-/tmp}/.monitor"; mkdir -p "$SD"; }
KONG="http://127.0.0.1:${KONG_HTTP_PORT:-8000}"

# transition NAME STATUS(ok|warn|crit) MESSAGE — alerts only on change.
transition() {
  local name="$1" status="$2" msg="$3" prev
  prev=$(cat "$SD/$name" 2>/dev/null || echo ok)
  printf '%s' "$status" > "$SD/$name"
  [ "$prev" = "$status" ] && return 0
  case "$status" in
    crit) alert 1 "$name" "$msg" "docs/MONITORING.md" ;;
    warn) alert 2 "$name" "$msg" "docs/MONITORING.md" ;;
    ok)   [ "$prev" != ok ] && alert 3 "RECOVERED: $name" "$msg" "docs/MONITORING.md" ;;
  esac
}
code() { curl -sS -m 5 -o /dev/null -w '%{http_code}' "$@" 2>/dev/null || echo 000; }

if [ "$MODE" = "--fast" ]; then
  if docker exec supabase-db pg_isready -U postgres -h localhost >/dev/null 2>&1; then transition postgres-alive ok "pg_isready ok"
  else transition postgres-alive crit "PostgreSQL is not accepting connections (supabase-db)"; fi

  bad=""
  for c in supabase-db supabase-kong supabase-auth supabase-rest realtime-dev.supabase-realtime; do
    s=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$c" 2>/dev/null || echo missing)
    case "$s" in healthy|running) ;; *) bad="$bad $c=$s";; esac
  done
  [ -z "$bad" ] && transition containers ok "all core containers healthy" || transition containers crit "unhealthy containers:$bad"

  c=$(code -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY" "$KONG/rest/v1/categories?select=id&limit=1")
  [ "$c" = 200 ] && transition api-postgrest ok "PostgREST 200" || transition api-postgrest crit "PostgREST via Kong returned $c"
  c=$(code -H "apikey: $ANON_KEY" "$KONG/auth/v1/health")
  [ "$c" = 200 ] && transition auth-gotrue ok "GoTrue 200" || transition auth-gotrue crit "GoTrue /health via Kong returned $c"
  if [ -n "${SUPABASE_TUNNEL_TOKEN:-}" ]; then
    c=$(code -H "apikey: $ANON_KEY" "${SUPABASE_PUBLIC_URL}/auth/v1/health")
    [ "$c" = 200 ] && transition tunnel-public ok "public hostname 200" || transition tunnel-public crit "${SUPABASE_PUBLIC_URL} returned $c — tunnel or Cloudflare"
  fi
  exit 0
fi

if [ "$MODE" = "--daily" ]; then
  ram=$(awk '/MemTotal/{t=$2} /MemAvailable/{a=$2} END{printf "%d", (t-a)*100/t}' /proc/meminfo)
  if [ "$ram" -ge "${ALERT_RAM_CRIT:-85}" ]; then transition ram crit "RAM ${ram}% used (crit ≥ ${ALERT_RAM_CRIT:-85}%)"
  elif [ "$ram" -ge "${ALERT_RAM_WARN:-75}" ]; then transition ram warn "RAM ${ram}% used (warn ≥ ${ALERT_RAM_WARN:-75}%)"
  else transition ram ok "RAM ${ram}% used"; fi

  for path in "${SUPABASE_DATA_DIR:-/DATA}" "${BACKUP_DIR:-/DATA/backups/supabase}" "$(docker info --format '{{.DockerRootDir}}' 2>/dev/null || echo /var/lib/docker)"; do
    [ -d "$path" ] || continue
    use=$(df -P "$path" | awk 'NR==2{gsub("%","",$5); print $5}')
    key="disk-$(printf '%s' "$path" | tr '/' '_')"
    if [ "$use" -ge "${ALERT_DISK_CRIT:-85}" ]; then transition "$key" crit "disk ${use}% used at $path"
    elif [ "$use" -ge "${ALERT_DISK_WARN:-75}" ]; then transition "$key" warn "disk ${use}% used at $path"
    else transition "$key" ok "disk ${use}% used at $path"; fi
  done

  last="${BACKUP_DIR:-/DATA/backups/supabase}/.last-ok"
  if [ -f "$last" ]; then
    age_h=$(( ( $(date +%s) - $(date -d "$(cat "$last")" +%s 2>/dev/null || stat -c %Y "$last") ) / 3600 ))
    [ "$age_h" -le 30 ] && transition backup-fresh ok "last good backup ${age_h}h ago" || transition backup-fresh warn "last good backup ${age_h}h ago (> 30h — docs/ALERT-CATALOG.md backup-stale)"
  else transition backup-fresh warn "no successful backup recorded yet"; fi

  # Container memory vs. limits — an early warning before the kernel OOM-kills.
  docker stats --no-stream --format '{{.Name}} {{.MemPerc}}' 2>/dev/null | while read -r name perc; do
    p=${perc%\%}; p=${p%.*}
    case "$name" in supabase-*|realtime-dev.*) [ "${p:-0}" -ge 90 ] && transition "mem-$name" warn "$name at ${perc} of its memory limit" || transition "mem-$name" ok "$name at ${perc}";; esac
  done
  exit 0
fi
die "usage: monitor.sh --fast | --daily"

#!/usr/bin/env bash
# One screen of truth for the whole stack. Exit 0 when every required
# component is healthy; 1 otherwise. Used by monitor.sh and by hand.
#
#   ./healthcheck.sh            # human output
#   ./healthcheck.sh --json     # machine output
set -uo pipefail
SCRIPT_NAME=healthcheck
. "$(dirname "$0")/lib.sh"
load_env
JSON=0; [ "${1:-}" = "--json" ] && JSON=1
KONG="http://127.0.0.1:${KONG_HTTP_PORT:-8000}"
declare -A R
fail=0

status_of() { docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$1" 2>/dev/null || echo missing; }
http_code() { curl -sS -m 5 -o /dev/null -w '%{http_code}' "$@" 2>/dev/null || echo 000; }

for c in supabase-db supabase-kong supabase-auth supabase-rest realtime-dev.supabase-realtime supabase-meta supabase-studio supabase-mail-templates; do
  s=$(status_of "$c"); R["container:$c"]="$s"
  case "$c:$s" in *:healthy|*:running) ;; supabase-studio:*|supabase-meta:*) ;; *) fail=1 ;; esac
done
R["container:supabase-tunnel"]=$(status_of supabase-tunnel)

R["postgres:pg_isready"]=$(docker exec supabase-db pg_isready -U postgres -h localhost >/dev/null 2>&1 && echo ok || { fail=1; echo fail; })
R["postgres:select1_ms"]=$( { /usr/bin/time -f %e docker exec supabase-db psql -U postgres -Atc 'select 1' >/dev/null; } 2>&1 | tail -1 | awk '{printf "%d", $1*1000}' 2>/dev/null || echo "?")

c=$(http_code -H "apikey: $ANON_KEY" "$KONG/auth/v1/health"); R["auth:/auth/v1/health"]="$c"; [ "$c" = 200 ] || fail=1
c=$(http_code -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY" "$KONG/rest/v1/categories?select=id&limit=1"); R["rest:/rest/v1/categories(anon)"]="$c"; [ "$c" = 200 ] || fail=1
c=$(http_code "$KONG/rest/v1/categories?select=id&limit=1"); R["rest:no-apikey→401"]="$c"; [ "$c" = 401 ] || fail=1
c=$(http_code -H "apikey: $ANON_KEY" "$KONG/rest/v1/"); R["rest:openapi-root(anon)→403"]="$c"; [ "$c" = 403 ] || [ "$c" = 401 ] || fail=1
c=$(http_code -H "apikey: $ANON_KEY" "$KONG/realtime/v1/api/tenants/realtime-dev/health"); R["realtime:tenant-api-blocked→403"]="$c"
c=$(http_code -H "apikey: $SERVICE_ROLE_KEY" -H "Authorization: Bearer $SERVICE_ROLE_KEY" "$KONG/pg/health"); R["meta:/pg/health(service)"]="$c"
c=$(http_code "$KONG/"); R["kong:/→404"]="$c"; [ "$c" = 404 ] || fail=1
c=$(http_code "http://127.0.0.1:${STUDIO_PORT:-3001}/api/platform/profile"); R["studio:loopback"]="$c"
if [ -n "${SUPABASE_TUNNEL_TOKEN:-}" ]; then
  c=$(http_code -H "apikey: $ANON_KEY" "${SUPABASE_PUBLIC_URL}/auth/v1/health"); R["public:${SUPABASE_PUBLIC_URL}/auth/v1/health"]="$c"; [ "$c" = 200 ] || fail=1
fi

if [ "$JSON" -eq 1 ]; then
  printf '{'; first=1
  for k in "${!R[@]}"; do [ $first -eq 0 ] && printf ','; first=0; printf '"%s":"%s"' "$k" "${R[$k]}"; done
  printf ',"healthy":%s}\n' "$([ $fail -eq 0 ] && echo true || echo false)"
else
  for k in $(printf '%s\n' "${!R[@]}" | sort); do printf '  %-52s %s\n' "$k" "${R[$k]}"; done
  echo; [ $fail -eq 0 ] && log "STACK HEALTHY" || log "STACK DEGRADED"
fi
exit $fail

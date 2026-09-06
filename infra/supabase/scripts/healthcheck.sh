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
RESULTS="$(mktemp)"; trap 'rm -f "$RESULTS"' EXIT
fail=0
rec() { printf '%s\t%s\n' "$1" "$2" >> "$RESULTS"; }
status_of() { local o; o=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$1" 2>/dev/null | tr -d '\n'); printf '%s' "${o:-missing}"; }
http_code() { local c; c=$(curl -sS -m 5 -o /dev/null -w '%{http_code}' "$@" 2>/dev/null); printf '%s' "${c:-000}"; }
expect() { # expect KEY CODE WANT... — record and fail unless CODE is one of WANT
  local key="$1" code="$2"; shift 2; rec "$key" "$code"
  for w in "$@"; do [ "$code" = "$w" ] && return 0; done; fail=1
}

# Containers — Studio, meta and the tunnel are reported but not required.
for c in supabase-db supabase-kong supabase-auth supabase-rest realtime-dev.supabase-realtime; do
  s=$(status_of "$c"); rec "container:$c" "$s"; case "$s" in healthy|running) ;; *) fail=1 ;; esac
done
for c in supabase-meta supabase-studio supabase-mail-templates supabase-tunnel; do rec "container:$c" "$(status_of "$c")"; done

# Postgres.
if docker exec supabase-db pg_isready -U postgres -h localhost >/dev/null 2>&1; then rec "postgres:pg_isready" ok; else rec "postgres:pg_isready" fail; fail=1; fi
t0=$(epoch_ms); docker exec supabase-db psql -U postgres -Atc 'select 1' >/dev/null 2>&1; rec "postgres:select1_ms" "$(( $(epoch_ms) - t0 ))"

# Through the gateway: what the browser and the app actually hit.
expect "auth:/auth/v1/health"                "$(http_code -H "apikey: $ANON_KEY" "$KONG/auth/v1/health")" 200
expect "rest:/rest/v1/categories(anon)"      "$(http_code -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY" "$KONG/rest/v1/categories?select=id&limit=1")" 200
expect "rest:no-apikey→401"                  "$(http_code "$KONG/rest/v1/categories?select=id&limit=1")" 401
expect "rest:openapi-root(anon)→401/403"     "$(http_code -H "apikey: $ANON_KEY" "$KONG/rest/v1/")" 401 403
expect "rest:openapi-root(service)→200"      "$(http_code -H "apikey: $SERVICE_ROLE_KEY" -H "Authorization: Bearer $SERVICE_ROLE_KEY" "$KONG/rest/v1/")" 200
expect "kong:/→404"                          "$(http_code "$KONG/")" 404
rec    "realtime:tenant-api-blocked→403"     "$(http_code -H "apikey: $ANON_KEY" "$KONG/realtime/v1/api/tenants/realtime-dev/health")"
rec    "meta:/pg/health(service)"            "$(http_code -H "apikey: $SERVICE_ROLE_KEY" "$KONG/pg/health")"
rec    "studio:loopback"                     "$(http_code "http://127.0.0.1:${STUDIO_PORT:-3001}/api/platform/profile")"
if [ -n "${SUPABASE_TUNNEL_TOKEN:-}" ]; then
  expect "public:${SUPABASE_PUBLIC_URL}/auth/v1/health" "$(http_code -H "apikey: $ANON_KEY" "${SUPABASE_PUBLIC_URL}/auth/v1/health")" 200
fi

if [ "$JSON" -eq 1 ]; then
  printf '{'; first=1
  while IFS=$'\t' read -r k v; do [ $first -eq 0 ] && printf ','; first=0; printf '"%s":"%s"' "$k" "$v"; done < "$RESULTS"
  printf ',"healthy":%s}\n' "$([ $fail -eq 0 ] && echo true || echo false)"
else
  sort "$RESULTS" | while IFS=$'\t' read -r k v; do printf '  %-48s %s\n' "$k" "$v"; done
  echo; [ $fail -eq 0 ] && log "STACK HEALTHY" || log "STACK DEGRADED"
fi
exit $fail

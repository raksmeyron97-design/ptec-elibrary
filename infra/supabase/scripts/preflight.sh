#!/usr/bin/env bash
# Refuse to start the stack with placeholder secrets, weak keys, published
# database ports, or missing prerequisites. Exit 0 = safe to `compose up`.
set -euo pipefail
SCRIPT_NAME=preflight
. "$(dirname "$0")/lib.sh"
require_cmd docker
docker compose version >/dev/null 2>&1 || die "docker compose v2 is required"
load_env

fail=0
bad() { printf '  ✗ %s\n' "$*"; fail=1; }
ok()  { printf '  ✓ %s\n' "$*"; }

echo "Secrets"
for k in POSTGRES_PASSWORD JWT_SECRET ANON_KEY SERVICE_ROLE_KEY SECRET_KEY_BASE REALTIME_DB_ENC_KEY PG_META_CRYPTO_KEY; do
  v="${!k:-}"
  if [ -z "$v" ]; then bad "$k is empty"
  elif printf '%s' "$v" | grep -qiE 'CHANGE_ME|your-super-secret|example|placeholder|insecure'; then bad "$k still holds a placeholder"
  else ok "$k set"; fi
done
[ "${#JWT_SECRET}" -ge 32 ] || bad "JWT_SECRET shorter than 32 chars"
[ "${#POSTGRES_PASSWORD}" -ge 16 ] || bad "POSTGRES_PASSWORD shorter than 16 chars"
[ "${#SECRET_KEY_BASE}" -ge 48 ] || bad "SECRET_KEY_BASE shorter than 48 chars"
[ "${#PG_META_CRYPTO_KEY}" -ge 32 ] || bad "PG_META_CRYPTO_KEY shorter than 32 chars"

# The keys must be HS256 JWTs signed by JWT_SECRET with the right role.
check_key() {
  local name="$1" token="$2" role="$3" h p s calc payload
  IFS=. read -r h p s <<<"$token"
  [ -n "$s" ] || { bad "$name is not a JWT"; return; }
  calc=$(printf '%s.%s' "$h" "$p" | openssl dgst -sha256 -hmac "$JWT_SECRET" -binary | openssl base64 -A | tr '+/' '-_' | tr -d '=')
  [ "$calc" = "$s" ] || { bad "$name signature does not match JWT_SECRET"; return; }
  payload=$(printf '%s' "$p" | tr '_-' '/+' | awk '{l=length($0)%4; if(l==2)$0=$0"=="; else if(l==3)$0=$0"="; print}' | openssl base64 -d -A 2>/dev/null || true)
  printf '%s' "$payload" | grep -q "\"role\":\"$role\"" && ok "$name is a valid $role key for this JWT_SECRET" || bad "$name role claim is not $role"
}
command -v openssl >/dev/null && { check_key ANON_KEY "$ANON_KEY" anon; check_key SERVICE_ROLE_KEY "$SERVICE_ROLE_KEY" service_role; }

echo "URLs"
case "${SUPABASE_PUBLIC_URL:-}" in https://*) ok "SUPABASE_PUBLIC_URL is https ($SUPABASE_PUBLIC_URL)";; http://*) [ "${ALLOW_HTTP_PUBLIC_URL:-0}" = 1 ] && ok "SUPABASE_PUBLIC_URL is http (staging override)" || bad "SUPABASE_PUBLIC_URL is not https (set ALLOW_HTTP_PUBLIC_URL=1 for a LAN staging stack)";; *) bad "SUPABASE_PUBLIC_URL missing";; esac
case "${SITE_URL:-}" in https://*|http://localhost*|http://127.0.0.1*) ok "SITE_URL=$SITE_URL";; *) bad "SITE_URL must be https (or localhost for staging)";; esac
case "${SUPABASE_PUBLIC_URL:-}" in */) bad "SUPABASE_PUBLIC_URL must not end with a slash";; esac

echo "Auth configuration"
if [ "${GOOGLE_ENABLED:-false}" = "true" ]; then
  printf '%s%s' "${GOOGLE_OAUTH_CLIENT_ID:-}" "${GOOGLE_OAUTH_SECRET:-}" | grep -qi 'CHANGE_ME' && bad "Google OAuth enabled but credentials are placeholders" || ok "Google OAuth credentials set"
else warn "Google OAuth disabled (GOOGLE_ENABLED=false) — the login page's Google button will fail"; fi
if [ "${AUTH_CAPTCHA_ENABLED:-true}" = "true" ]; then
  printf '%s' "${TURNSTILE_SECRET_KEY:-}" | grep -qiE 'CHANGE_ME|^$' && bad "captcha enabled but TURNSTILE_SECRET_KEY is a placeholder" || ok "Turnstile secret set"
fi
printf '%s%s' "${SMTP_USER:-}" "${SMTP_PASS:-}" | grep -qiE 'CHANGE_ME' && bad "SMTP credentials are placeholders (auth emails would fail silently)" || ok "SMTP credentials set"

echo "Exposure"
db_ports=$(compose config 2>/dev/null | awk '/^  db:/{f=1} f&&/ports:/{print; exit} /^  [a-z]/{if($1!="db:")f=0}')
[ -z "$db_ports" ] && ok "Postgres publishes no port" || bad "Postgres publishes a port — remove it"
for b in KONG_BIND STUDIO_BIND; do
  v="${!b:-127.0.0.1}"
  case "$v" in 127.0.0.1|localhost) ok "$b=$v (loopback)";; 0.0.0.0) bad "$b=0.0.0.0 publishes to every interface";; *) warn "$b=$v (LAN exposure — intended?)";; esac
done
[ -f "$INFRA_DIR/kong/kong.yml" ] || bad "kong/kong.yml missing"
grep -q 'url: http://studio' "$INFRA_DIR/kong/kong.yml" && bad "kong.yml routes Studio — Studio must never be on the public gateway" || ok "Studio is not routed through Kong"

echo "Host"
dir="${SUPABASE_DATA_DIR:-$INFRA_DIR/volumes/db/data}"
mkdir -p "$dir" 2>/dev/null || bad "cannot create SUPABASE_DATA_DIR=$dir"
free_gb=$(df -Pk "$dir" 2>/dev/null | awk 'NR==2{printf "%d", $4/1024/1024}')
min_free="${PREFLIGHT_MIN_FREE_GB:-10}"
[ "${free_gb:-0}" -ge "$min_free" ] && ok "${free_gb} GB free at $dir" || bad "less than ${min_free} GB free at $dir (PREFLIGHT_MIN_FREE_GB overrides for a staging host)"
mem_gb=$(awk '/MemTotal/{printf "%d", $2/1024/1024}' /proc/meminfo 2>/dev/null || sysctl -n hw.memsize 2>/dev/null | awk '{printf "%d",$1/1024/1024/1024}')
[ "${mem_gb:-0}" -ge 7 ] && ok "${mem_gb} GB RAM" || warn "${mem_gb:-?} GB RAM — below the 8 GB the memory budget assumes"
[ -d "${MAIL_TEMPLATES_DIR:-$INFRA_DIR/../../supabase/templates}" ] && ok "mail templates directory present" || bad "mail templates directory missing"
compose config -q 2>/dev/null && ok "compose file renders" || bad "compose config failed"

echo
if [ "$fail" -eq 0 ]; then log "PREFLIGHT PASS"; else die "PREFLIGHT FAILED — fix the items above before starting the stack"; fi

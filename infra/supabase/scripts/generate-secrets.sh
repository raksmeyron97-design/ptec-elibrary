#!/usr/bin/env bash
# Generate every secret the self-hosted stack needs and write infra/supabase/.env.
#
#   ./generate-secrets.sh                 # new .env from .env.example, all secrets generated
#   ./generate-secrets.sh --jwt-secret X  # reuse the Cloud project's legacy JWT secret;
#                                         # anon/service keys are derived from it (so they
#                                         # equal the Cloud keys iff iss/iat/exp match — pass
#                                         # --anon-key/--service-key to copy them verbatim)
#   ./generate-secrets.sh --rotate-jwt    # replace JWT_SECRET/ANON_KEY/SERVICE_ROLE_KEY in an
#                                         # existing .env (everyone re-signs-in; rebuild app image)
#
# Refuses to overwrite an existing .env unless --rotate-jwt or --force.
# Prints nothing secret. Requires openssl + coreutils only.
set -euo pipefail
SCRIPT_NAME=generate-secrets
. "$(dirname "$0")/lib.sh"
require_cmd openssl

JWT_SECRET_IN="" ANON_IN="" SERVICE_IN="" ROTATE=0 FORCE=0
while [ $# -gt 0 ]; do
  case "$1" in
    --jwt-secret) JWT_SECRET_IN="$2"; shift 2 ;;
    --anon-key) ANON_IN="$2"; shift 2 ;;
    --service-key) SERVICE_IN="$2"; shift 2 ;;
    --rotate-jwt) ROTATE=1; shift ;;
    --force) FORCE=1; shift ;;
    *) die "unknown argument: $1" ;;
  esac
done

b64url() { openssl base64 -A | tr '+/' '-_' | tr -d '='; }
rand_hex() { openssl rand -hex "$1"; }
rand_b64() { openssl rand -base64 "$1" | tr -d '\n'; }

# HS256 JWT with Supabase's key claims. iat = now, exp = +10 years (Supabase
# issues its own keys with a ~10-year expiry too).
mint_key() {
  local role="$1" secret="$2" iat exp header payload sig
  iat=$(date +%s); exp=$((iat + 315360000))
  header=$(printf '{"alg":"HS256","typ":"JWT"}' | b64url)
  payload=$(printf '{"iss":"supabase","ref":"ptec-selfhost","role":"%s","iat":%s,"exp":%s}' "$role" "$iat" "$exp" | b64url)
  sig=$(printf '%s.%s' "$header" "$payload" | openssl dgst -sha256 -hmac "$secret" -binary | b64url)
  printf '%s.%s.%s' "$header" "$payload" "$sig"
}

set_kv() { # set_kv FILE KEY VALUE (value must not contain '|')
  local file="$1" key="$2" val="$3"
  if grep -qE "^${key}=" "$file"; then
    sed -i.bak "s|^${key}=.*|${key}=${val}|" "$file" && rm -f "$file.bak"
  else
    printf '%s=%s\n' "$key" "$val" >> "$file"
  fi
}

if [ "$ROTATE" -eq 1 ]; then
  [ -f "$ENV_FILE" ] || die "--rotate-jwt needs an existing $ENV_FILE"
  cp "$ENV_FILE" "$ENV_FILE.pre-rotate.$(date +%Y%m%d-%H%M%S)"; chmod 600 "$ENV_FILE".pre-rotate.*
  JWT="${JWT_SECRET_IN:-$(rand_hex 32)}"
  set_kv "$ENV_FILE" JWT_SECRET "$JWT"
  set_kv "$ENV_FILE" ANON_KEY "${ANON_IN:-$(mint_key anon "$JWT")}"
  set_kv "$ENV_FILE" SERVICE_ROLE_KEY "${SERVICE_IN:-$(mint_key service_role "$JWT")}"
  log "rotated JWT_SECRET / ANON_KEY / SERVICE_ROLE_KEY in $ENV_FILE (backup kept beside it)"
  log "NEXT: restart the stack, update GitHub variable NEXT_PUBLIC_SUPABASE_ANON_KEY + secret"
  log "      SUPABASE_SERVICE_ROLE_KEY, the box's app .env, and republish the image."
  exit 0
fi

if [ -f "$ENV_FILE" ] && [ "$FORCE" -eq 0 ]; then
  die "$ENV_FILE already exists. Use --rotate-jwt to rotate keys, or --force to regenerate everything (DESTROYS the Postgres password match with an existing data directory)."
fi

cp "$INFRA_DIR/.env.example" "$ENV_FILE"; chmod 600 "$ENV_FILE"
JWT="${JWT_SECRET_IN:-$(rand_hex 32)}"
set_kv "$ENV_FILE" POSTGRES_PASSWORD "$(rand_hex 24)"
set_kv "$ENV_FILE" JWT_SECRET "$JWT"
set_kv "$ENV_FILE" ANON_KEY "${ANON_IN:-$(mint_key anon "$JWT")}"
set_kv "$ENV_FILE" SERVICE_ROLE_KEY "${SERVICE_IN:-$(mint_key service_role "$JWT")}"
set_kv "$ENV_FILE" SECRET_KEY_BASE "$(rand_b64 48)"
set_kv "$ENV_FILE" REALTIME_DB_ENC_KEY "$(rand_hex 8)"
set_kv "$ENV_FILE" PG_META_CRYPTO_KEY "$(rand_hex 16)"
log "wrote $ENV_FILE with generated secrets"
[ -n "$JWT_SECRET_IN" ] && log "JWT secret reused from the value you supplied" || log "new JWT secret generated"
log "STILL TO FILL BY HAND: SMTP_*, TURNSTILE_SECRET_KEY, GOOGLE_OAUTH_*, SUPABASE_TUNNEL_TOKEN, TELEGRAM_* (see .env.example)"
log "then: ./scripts/preflight.sh"

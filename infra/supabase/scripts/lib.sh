#!/usr/bin/env bash
# Shared helpers for infra/supabase/scripts/*. Source, don't run.
# Requirements: bash 4+, docker (compose v2), coreutils. node is optional.

INFRA_DIR="${INFRA_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
REPO_DIR="${REPO_DIR:-$(cd "$INFRA_DIR/../.." && pwd)}"
ENV_FILE="${ENV_FILE:-$INFRA_DIR/.env}"
DB_CONTAINER="${DB_CONTAINER:-supabase-db}"
STATE_DIR="${STATE_DIR:-/var/lib/ptec-supabase}"

log()  { printf '%s [%s] %s\n' "$(date -Is)" "${SCRIPT_NAME:-infra}" "$*"; }
warn() { printf '%s [%s] WARN: %s\n' "$(date -Is)" "${SCRIPT_NAME:-infra}" "$*" >&2; }
die()  { printf '%s [%s] ERROR: %s\n' "$(date -Is)" "${SCRIPT_NAME:-infra}" "$*" >&2; exit 1; }

# Load KEY=VALUE lines from the infra .env without echoing values. Values are
# exported for the current process only.
load_env() {
  [ -f "$ENV_FILE" ] || die "missing $ENV_FILE (copy .env.example and fill it in)"
  local perms
  perms="$(stat -c '%a' "$ENV_FILE" 2>/dev/null || stat -f '%Lp' "$ENV_FILE" 2>/dev/null || echo "")"
  case "$perms" in 600|400) ;; *) warn ".env permissions are $perms — run: chmod 600 $ENV_FILE" ;; esac
  set -a
  # shellcheck disable=SC1090
  . <(grep -E '^[A-Za-z_][A-Za-z0-9_]*=' "$ENV_FILE" | sed 's/\r$//')
  set +a
}

compose() { (cd "$INFRA_DIR" && docker compose --env-file "$ENV_FILE" "$@"); }

# psql inside the db container as the superuser. stdin is forwarded.
dbsql() { docker exec -i "$DB_CONTAINER" psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 "$@"; }
# Scalar query → stdout, no headers.
dbscalar() { docker exec "$DB_CONTAINER" psql -U supabase_admin -d postgres -Atc "$1"; }

# Heartbeat row the app's /api/health deep probe and admin "Backups" card read
# (public.ops_events, migration 0088). kind: backup_db|backup_verify|restore_drill|maintenance|other
record_ops_event() {
  local kind="$1" status="$2" detail_json="${3:-{}}"
  dbscalar "insert into public.ops_events (kind, status, detail) values ('$kind', '$status', '$detail_json'::jsonb)" >/dev/null 2>&1 \
    || warn "could not record ops_events heartbeat ($kind/$status)"
}

# Telegram alert with the repo's shared format when node + the CLI are
# available; a plain curl otherwise. Never fails the caller.
alert() {
  local severity="$1" title="$2" message="$3" runbook="${4:-infra/supabase/README.md}"
  [ -n "${TELEGRAM_BOT_TOKEN:-}" ] && [ -n "${TELEGRAM_CHAT_ID:-}" ] || { warn "alert not sent (no Telegram config): $title"; return 0; }
  if command -v node >/dev/null 2>&1 && [ -f "$REPO_DIR/scripts/ops/alert-telegram.mjs" ]; then
    TELEGRAM_BOT_TOKEN="$TELEGRAM_BOT_TOKEN" TELEGRAM_CHAT_ID="$TELEGRAM_CHAT_ID" \
      node "$REPO_DIR/scripts/ops/alert-telegram.mjs" --severity "$severity" --title "$title" \
      --service supabase-selfhost --message "$message" --runbook "$runbook" >/dev/null 2>&1 && return 0
  fi
  local icon="⚠️"; [ "$severity" = "1" ] && icon="🚨"
  local text="$icon Sev $severity — $title
service: supabase-selfhost
$message
runbook: $runbook"
  curl -sS -m 10 -o /dev/null -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
    --data-urlencode "chat_id=${TELEGRAM_CHAT_ID}" --data-urlencode "text=${text}" >/dev/null 2>&1 \
    || warn "telegram send failed"
}

require_cmd() { for c in "$@"; do command -v "$c" >/dev/null 2>&1 || die "required command not found: $c"; done; }

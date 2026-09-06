#!/usr/bin/env bash
# Shared helpers for scripts/migration/*. Source, don't run.
#
# Two database targets, addressed by environment variables that hold FULL
# connection strings. Never printed.
#   CLOUD_DB_URL       Supabase Cloud SESSION POOLER URL (port 5432, IPv4) — the
#                      same string migrate.yml's SUPABASE_DB_URL secret holds.
#   SELFHOST_DB_URL    Self-hosted Postgres. Because the self-hosted DB publishes
#                      no port, this is normally UNSET and the scripts use
#                      `docker exec supabase-db` instead (SELFHOST_DB_CONTAINER).
#
# psql/pg_dump/pg_restore come from a postgres:17 client container when they
# are not installed on the host (the Mac and the ZimaOS box both lack them).
REPO_DIR="${REPO_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
OUT_ROOT="${MIGRATION_OUT_DIR:-$REPO_DIR/reports/migration}"
PG_CLIENT_IMAGE="${PG_CLIENT_IMAGE:-postgres:17-alpine}"
SELFHOST_DB_CONTAINER="${SELFHOST_DB_CONTAINER:-supabase-db}"

now()  { date -u +%Y-%m-%dT%H:%M:%SZ; }
log()  { printf '%s [%s] %s\n' "$(now)" "${SCRIPT_NAME:-migration}" "$*"; }
warn() { printf '%s [%s] WARN: %s\n' "$(now)" "${SCRIPT_NAME:-migration}" "$*" >&2; }
die()  { printf '%s [%s] ERROR: %s\n' "$(now)" "${SCRIPT_NAME:-migration}" "$*" >&2; exit 1; }
epoch_ms() { python3 -c 'import time;print(int(time.time()*1000))' 2>/dev/null || echo $(( $(date +%s) * 1000 )); }
sha256() { if command -v sha256sum >/dev/null 2>&1; then sha256sum "$@"; else shasum -a 256 "$@"; fi; }
require_cmd() { for c in "$@"; do command -v "$c" >/dev/null 2>&1 || die "required command not found: $c"; done; }

# Load repo .env / .env.local (names the app already uses) without printing.
load_app_env() {
  local f line key val
  for f in "$REPO_DIR/.env" "$REPO_DIR/.env.local"; do
    [ -f "$f" ] || continue
    while IFS= read -r line || [ -n "$line" ]; do
      line="${line%$'\r'}"
      case "$line" in ''|'#'*) continue ;; esac
      key="${line%%=*}"; val="${line#*=}"
      [[ "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || continue
      case "$val" in \"*\") val="${val#\"}"; val="${val%\"}" ;; \'*\') val="${val#\'}"; val="${val%\'}" ;; esac
      export "$key=$val"
    done < "$f"
  done
}

# Run a postgres client tool against a URL. Prefers a host binary; falls back
# to the client container (host networking so 127.0.0.1 URLs work on Linux;
# on macOS Docker Desktop, host.docker.internal is substituted automatically).
pgtool() { # pgtool <psql|pg_dump|pg_restore> <url> [args...]
  local tool="$1" url="$2"; shift 2
  if command -v "$tool" >/dev/null 2>&1; then "$tool" "$url" "$@"; return; fi
  local u="$url"
  [ "$(uname)" = Darwin ] && u="${u//127.0.0.1/host.docker.internal}" && u="${u//localhost/host.docker.internal}"
  # PG_CLIENT_NETWORK lets a staging rehearsal point the client at a container
  # on the Supabase network (e.g. postgres://…@supabase-db:5432/postgres).
  docker run --rm -i --network "${PG_CLIENT_NETWORK:-host}" -e PGCONNECT_TIMEOUT=15 "$PG_CLIENT_IMAGE" "$tool" "$u" "$@"
}

# psql against the self-hosted database: URL if given, else docker exec.
selfhost_psql() {
  if [ -n "${SELFHOST_DB_URL:-}" ]; then pgtool psql "$SELFHOST_DB_URL" "$@"
  else docker exec -i "$SELFHOST_DB_CONTAINER" psql -U supabase_admin -d postgres "$@"; fi
}
cloud_psql() { [ -n "${CLOUD_DB_URL:-}" ] || die "CLOUD_DB_URL is not set (Supabase session pooler URL)"; pgtool psql "$CLOUD_DB_URL" "$@"; }

redact() { sed -E 's#(postgres(ql)?://[^:]+:)[^@]+@#\1***@#g; s/(eyJ[A-Za-z0-9_-]{10})[A-Za-z0-9_.-]+/\1…/g'; }

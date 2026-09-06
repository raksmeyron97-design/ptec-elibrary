#!/usr/bin/env bash
# Nightly logical backup of the self-hosted Postgres (docs/BACKUP-DR.md §3).
#
#   pg_dump -Fc (custom format, compressed, verifiable with pg_restore --list)
#   of the whole `postgres` database — public AND auth (users, identities, MFA
#   factors, refresh tokens), which the Cloud-era JSONL backup could never
#   reach — plus a globals dump (roles) and a JSON row-count manifest that
#   restore-test.sh compares against.
#
# Properties: atomic (written to .partial, renamed on success), verified
# (pg_restore --list must parse and list the books table), rotated
# (BACKUP_RETENTION_DAYS, default 30), optionally encrypted (BACKUP_PASSPHRASE →
# openssl aes-256-cbc -pbkdf2), disk-checked before starting, locked against
# overlap, and observable: an ops_events heartbeat (backup_db ok|fail) that the
# app's /api/health deep probe and the admin "Backups" card read, and a Sev 2
# Telegram alert on any failure. Exit code is non-zero on failure.
#
#   ./backup-db.sh                # nightly run (systemd/ptec-supabase-backup.timer)
#   ./backup-db.sh --no-rotate    # keep everything (before a risky migration)
set -euo pipefail
SCRIPT_NAME=backup-db
. "$(dirname "$0")/lib.sh"
load_env
require_cmd docker gzip
ROTATE=1; [ "${1:-}" = "--no-rotate" ] && ROTATE=0

BACKUP_DIR="${BACKUP_DIR:-/DATA/backups/supabase}"
RETENTION="${BACKUP_RETENTION_DAYS:-30}"
mkdir -p "$BACKUP_DIR"; chmod 700 "$BACKUP_DIR"
mkdir -p "$STATE_DIR" 2>/dev/null || STATE_DIR="$BACKUP_DIR/.state"; mkdir -p "$STATE_DIR"
exec 9>"$STATE_DIR/backup.lock"; flock -n 9 || die "another backup is running"

TS=$(date -u +%Y%m%d-%H%M%S)
BASE="$BACKUP_DIR/db-$TS"
fail_out() {
  local msg="$1"
  warn "$msg"
  rm -f "$BASE".*.partial
  record_ops_event backup_db fail "{\"error\":$(printf '%s' "$msg" | head -c 200 | sed 's/"/\\"/g; s/^/"/; s/$/"/')}"
  alert 2 "Supabase backup failed" "$msg" "docs/BACKUP-DR.md §3"
  exit 1
}
trap 'fail_out "backup aborted at line $LINENO"' ERR

# Disk: need at least 2× the last dump (or 1 GB) free.
last=$(ls -1S "$BACKUP_DIR"/db-*.dump* 2>/dev/null | head -1 || true)
need_kb=1048576; [ -n "$last" ] && need_kb=$(( $(du -k "$last" | cut -f1) * 2 ))
free_kb=$(df -Pk "$BACKUP_DIR" | awk 'NR==2{print $4}')
[ "$free_kb" -gt "$need_kb" ] || fail_out "not enough disk for a backup: ${free_kb} KB free, need ${need_kb} KB"

docker exec supabase-db pg_isready -U postgres -h localhost >/dev/null || fail_out "database not ready"

log "dumping database → $BASE.dump"
docker exec supabase-db pg_dump -U supabase_admin -d postgres -Fc --no-sync \
  --exclude-schema=_realtime --exclude-schema=realtime --exclude-schema=_analytics \
  > "$BASE.dump.partial"
docker exec supabase-db pg_dumpall -U supabase_admin --globals-only --no-role-passwords 2>/dev/null \
  | gzip > "$BASE.globals.sql.gz.partial" || true

# Row-count manifest (what restore-test.sh compares against).
log "recording row counts"
{
  echo '{'
  echo "  \"created_at\": \"$(date -u -Is)\","
  echo "  \"image\": \"$(docker inspect --format '{{.Config.Image}}' supabase-db)\","
  echo "  \"pg_version\": \"$(dbscalar 'show server_version')\","
  echo '  "counts": {'
  dbscalar "select format('    \"%s.%s\": %s', n.nspname, c.relname, (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', n.nspname, c.relname), false, true, '')))[1]::text) from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind='r' and n.nspname in ('public','auth') order by 1" | paste -sd ',\n' | sed 's/,$//' | tr -d '\r'
  echo '  },'
  echo "  \"extensions\": [$(dbscalar "select string_agg(format('\"%s@%s:%s\"', e.extname, e.extversion, n.nspname), ', ' order by e.extname) from pg_extension e join pg_namespace n on n.oid=e.extnamespace")],"
  echo "  \"functions_public\": $(dbscalar "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'"),"
  echo "  \"policies\": $(dbscalar "select count(*) from pg_policies where schemaname='public'"),"
  echo "  \"indexes_public\": $(dbscalar "select count(*) from pg_indexes where schemaname='public'")"
  echo '}'
} > "$BASE.manifest.json.partial"

# Verify the archive is a readable custom-format dump containing the core table.
log "verifying archive"
listing=$(docker run --rm -i --entrypoint pg_restore "$(docker inspect --format '{{.Config.Image}}' supabase-db)" --list < "$BASE.dump.partial")
printf '%s' "$listing" | grep -q 'TABLE DATA public books ' || fail_out "archive verification failed: books table data missing from listing"
printf '%s' "$listing" | grep -q 'TABLE DATA auth users ' || fail_out "archive verification failed: auth.users missing from listing"
entries=$(printf '%s\n' "$listing" | grep -c '^[0-9]' || true)

# Encrypt (optional) and land atomically.
if [ -n "${BACKUP_PASSPHRASE:-}" ]; then
  for f in dump globals.sql.gz manifest.json; do
    [ -f "$BASE.$f.partial" ] || continue
    openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -in "$BASE.$f.partial" -out "$BASE.$f.enc.partial" -pass env:BACKUP_PASSPHRASE
    rm -f "$BASE.$f.partial"; mv "$BASE.$f.enc.partial" "$BASE.$f.enc"
  done
  suffix=".enc"
else
  warn "BACKUP_PASSPHRASE unset — archive written UNENCRYPTED (it contains auth data)"
  for f in dump globals.sql.gz manifest.json; do [ -f "$BASE.$f.partial" ] && mv "$BASE.$f.partial" "$BASE.$f"; done
  suffix=""
fi
chmod 600 "$BASE".*
sha256sum "$BASE".* > "$BASE.sha256"
bytes=$(du -k "$BASE.dump$suffix" | cut -f1)
log "OK: $BASE.dump$suffix (${bytes} KB, $entries archive entries)"

if [ "$ROTATE" -eq 1 ]; then
  pruned=$(find "$BACKUP_DIR" -maxdepth 1 -name 'db-*' -type f -mtime +"$RETENTION" -print -delete | wc -l | tr -d ' ')
  log "rotation: removed $pruned file(s) older than $RETENTION days"
fi
remaining=$(ls -1 "$BACKUP_DIR"/db-*.dump* 2>/dev/null | wc -l | tr -d ' ')

date -u -Is > "$BACKUP_DIR/.last-ok"
record_ops_event backup_db ok "{\"file\":\"$(basename "$BASE.dump$suffix")\",\"kb\":$bytes,\"entries\":$entries,\"encrypted\":$([ -n "$suffix" ] && echo true || echo false),\"retained\":$remaining,\"method\":\"pg_dump\"}"
record_ops_event backup_verify ok "{\"file\":\"$(basename "$BASE.dump$suffix")\",\"entries\":$entries}"
trap - ERR
exit 0

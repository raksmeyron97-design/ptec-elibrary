#!/usr/bin/env bash
# A backup that has never been restored is not a backup (docs/BACKUP-DR.md).
# Restores the newest (or given) dump into a THROWAWAY Postgres container on
# the same image, runs integrity checks, compares row counts with the manifest
# written at backup time, records ops_events restore_drill, and tears down.
# Never touches the live database.
#
#   ./restore-test.sh                       # newest dump in BACKUP_DIR
#   ./restore-test.sh /DATA/backups/supabase/db-20260906-031000.dump[.enc]
set -euo pipefail
SCRIPT_NAME=restore-test
. "$(dirname "$0")/lib.sh"
load_env
require_cmd docker
BACKUP_DIR="${BACKUP_DIR:-/DATA/backups/supabase}"
DUMP="${1:-$(ls -1t "$BACKUP_DIR"/db-*.dump "$BACKUP_DIR"/db-*.dump.enc 2>/dev/null | head -1 || true)}"
[ -n "$DUMP" ] && [ -f "$DUMP" ] || die "no dump found (BACKUP_DIR=$BACKUP_DIR)"
IMAGE="$(docker inspect --format '{{.Config.Image}}' supabase-db 2>/dev/null || echo supabase/postgres:17.6.1.136)"
NAME="ptec-restore-test-$$"
WORK="$(mktemp -d)"
cleanup() { docker rm -f -v "$NAME" >/dev/null 2>&1 || true; rm -rf "$WORK"; }
trap cleanup EXIT

manifest="${DUMP%.dump*}.manifest.json"; [ -f "$manifest.enc" ] && manifest="$manifest.enc"
log "dump: $DUMP"
if [[ "$DUMP" == *.enc ]]; then
  [ -n "${BACKUP_PASSPHRASE:-}" ] || die "encrypted dump but BACKUP_PASSPHRASE is unset"
  openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -in "$DUMP" -out "$WORK/db.dump" -pass env:BACKUP_PASSPHRASE
  [ -f "$manifest" ] && openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -in "$manifest" -out "$WORK/manifest.json" -pass env:BACKUP_PASSPHRASE || true
else
  cp "$DUMP" "$WORK/db.dump"; [ -f "$manifest" ] && cp "$manifest" "$WORK/manifest.json" || true
fi

log "starting throwaway postgres ($IMAGE)"
docker run -d --name "$NAME" --network none -e POSTGRES_PASSWORD=restore-test -e JWT_SECRET=restore-test-restore-test-restore-test-1234 -e JWT_EXP=3600 \
  -v "$INFRA_DIR/db/init/99-roles.sql:/docker-entrypoint-initdb.d/init-scripts/99-roles.sql:ro" \
  -v "$INFRA_DIR/db/init/99-jwt.sql:/docker-entrypoint-initdb.d/init-scripts/99-jwt.sql:ro" \
  -v "$INFRA_DIR/db/init/99-realtime.sql:/docker-entrypoint-initdb.d/migrations/99-realtime.sql:ro" \
  "$IMAGE" postgres -c config_file=/etc/postgresql/postgresql.conf -c log_min_messages=fatal >/dev/null
for i in $(seq 1 60); do docker exec "$NAME" pg_isready -U postgres -h localhost >/dev/null 2>&1 && break; sleep 2; done
docker exec "$NAME" pg_isready -U postgres -h localhost >/dev/null || die "throwaway postgres never became ready"
sleep 3

t0=$(date +%s)
log "restoring (pg_restore --clean --if-exists, errors on pre-existing supabase objects are expected and counted)"
set +e
docker exec -i "$NAME" pg_restore -U supabase_admin -d postgres --no-owner --role=supabase_admin \
  --clean --if-exists -Fc < "$WORK/db.dump" > "$WORK/restore.log" 2>&1
rc=$?
set -e
errors=$(grep -c 'ERROR' "$WORK/restore.log" || true)
log "pg_restore exit $rc, $errors error line(s), $(( $(date +%s) - t0 ))s"
[ "$errors" -gt 0 ] && { echo "  first errors (pre-existing GoTrue/Supabase objects are expected):"; grep 'ERROR' "$WORK/restore.log" | head -5 | cut -c1-160 | sed 's/^/    /'; }

q() { docker exec "$NAME" psql -U supabase_admin -d postgres -Atc "$1"; }
fail=0; check() { if [ "$2" = "$3" ]; then printf '  ✓ %s = %s\n' "$1" "$2"; else printf '  ✗ %s: got %s expected %s\n' "$1" "$2" "$3"; fail=1; fi; }
echo "Integrity"
for t in public.books public.profiles public.authors public.book_pages public.book_chunks public.research_reports public.publications auth.users auth.identities auth.mfa_factors; do
  got=$(q "select count(*) from $t" 2>/dev/null || echo ERR)
  if [ -f "$WORK/manifest.json" ]; then
    want=$(grep -o "\"$t\": [0-9]*" "$WORK/manifest.json" | awk '{print $2}')
    [ -n "$want" ] && check "$t rows" "$got" "$want" || printf '  · %s = %s (not in manifest)\n' "$t" "$got"
  else printf '  · %s = %s\n' "$t" "$got"; fi
done
for e in vector pg_trgm pgcrypto; do check "extension $e" "$(q "select count(*) from pg_extension where extname='$e'")" 1; done
check "books_embedding_idx exists" "$(q "select count(*) from pg_indexes where indexname='books_embedding_idx'")" 1
check "RLS on books" "$(q "select relrowsecurity from pg_class where oid='public.books'::regclass")" t
check "policies > 100" "$([ "$(q 'select count(*) from pg_policies')" -gt 100 ] && echo yes || echo no)" yes
check "handle_new_user trigger on auth.users" "$(q "select count(*) from pg_trigger where tgname='on_auth_user_created'")" 1
check "match_library() callable" "$(q "select count(*) from pg_proc where proname='match_library'" | awk '{print ($1>0)?"1":"0"}')" 1
fk_bad=$(q "select count(*) from pg_constraint where contype='f' and not convalidated"); check "unvalidated FKs" "$fk_bad" 0

status=ok; [ $fail -eq 0 ] || status=fail
record_ops_event restore_drill "$status" "{\"dump\":\"$(basename "$DUMP")\",\"restore_errors\":$errors,\"seconds\":$(( $(date +%s) - t0 ))}" || true
echo
if [ $fail -eq 0 ]; then log "RESTORE TEST PASS"; else alert 2 "Supabase restore test FAILED" "dump $(basename "$DUMP") did not restore cleanly — see restore-test output" "docs/BACKUP-DR.md §6"; die "RESTORE TEST FAILED"; fi

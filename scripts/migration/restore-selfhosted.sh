#!/usr/bin/env bash
# Restore a dump-cloud.sh directory into the self-hosted database.
#
#   ./restore-selfhosted.sh reports/migration/dump-<ts>          # refuses a non-empty target
#   ./restore-selfhosted.sh reports/migration/dump-<ts> --force  # wipe public + auth data first
#
# Preconditions (checked): the self-hosted stack is up, GoTrue has already run
# its own migrations (auth schema exists), public schema is empty. Order:
#   1. extensions in the same schemas as Cloud
#   2. public + supabase_migrations schema (single transaction)
#   3. triggers on auth.users
#   4. data with session_replication_role=replica (no trigger side-effects,
#      FK order irrelevant), public first, then auth
#   5. realtime publication membership
#   6. ANALYZE; restart PostgREST so it reloads the schema cache
# Everything runs as supabase_admin inside the db container. The target's
# auth.schema_migrations is never touched — GoTrue owns it.
set -euo pipefail
SCRIPT_NAME=restore-selfhosted
. "$(dirname "$0")/common.sh"
require_cmd docker
DUMP="${1:-}"; FORCE=0; [ "${2:-}" = "--force" ] && FORCE=1
[ -d "$DUMP" ] || die "usage: restore-selfhosted.sh <dump dir> [--force]"
for f in 00-extensions.sql 10-schema.sql 20-auth-triggers.sql 30-data-public.sql 40-data-auth.sql 50-publication.sql; do [ -f "$DUMP/$f" ] || die "missing $DUMP/$f"; done
(cd "$DUMP" && sha256sum -c --quiet <(sed -n '/--- sha256/,$p' manifest.txt | tail -n +2)) || die "sha256 mismatch — the dump was modified after it was written"

docker exec "$SELFHOST_DB_CONTAINER" pg_isready -U postgres -h localhost >/dev/null || die "self-hosted database not ready"
selfhost_psql -Atc "select 1 from auth.schema_migrations limit 1" >/dev/null 2>&1 || die "auth schema not initialised — start the auth (GoTrue) container first and wait for it to be healthy"
ntab=$(selfhost_psql -Atc "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'")
nusers=$(selfhost_psql -Atc "select count(*) from auth.users")
if [ "$ntab" != 0 ] || [ "$nusers" != 0 ]; then
  [ $FORCE -eq 1 ] || die "target is not empty (public tables: $ntab, auth.users: $nusers). Re-run with --force to DROP public objects and DELETE auth data first."
  warn "--force: dropping public schema objects and deleting auth data on the SELF-HOSTED database"
  read -r -p "Type the container name ($SELFHOST_DB_CONTAINER) to confirm: " ans; [ "$ans" = "$SELFHOST_DB_CONTAINER" ] || die "aborted"
  selfhost_psql -v ON_ERROR_STOP=1 -q <<'SQL'
drop schema public cascade; create schema public;
grant usage on schema public to postgres, anon, authenticated, service_role;
grant all on schema public to postgres, supabase_admin;
drop schema if exists supabase_migrations cascade;
set session_replication_role = replica;
truncate auth.users, auth.identities, auth.sessions, auth.refresh_tokens, auth.mfa_factors, auth.mfa_challenges, auth.mfa_amr_claims, auth.one_time_tokens, auth.flow_state cascade;
SQL
fi

t0=$(date +%s)
log "1/6 extensions";      selfhost_psql -v ON_ERROR_STOP=1 -q < "$DUMP/00-extensions.sql"
log "2/6 schema";          selfhost_psql -v ON_ERROR_STOP=1 -q --single-transaction < "$DUMP/10-schema.sql"
log "3/6 auth.users triggers"; selfhost_psql -v ON_ERROR_STOP=1 -q --single-transaction < "$DUMP/20-auth-triggers.sql"
log "4/6 data (public)";   { echo "set session_replication_role = replica;"; cat "$DUMP/30-data-public.sql"; } | selfhost_psql -v ON_ERROR_STOP=1 -q --single-transaction
log "4/6 data (auth)";     { echo "set session_replication_role = replica;"; cat "$DUMP/40-data-auth.sql"; } | selfhost_psql -v ON_ERROR_STOP=1 -q --single-transaction
log "5/6 realtime publication"; selfhost_psql -v ON_ERROR_STOP=1 -q < "$DUMP/50-publication.sql" || warn "publication step failed (Realtime postgres_changes only); continuing"
log "6/6 analyze + PostgREST schema reload"
selfhost_psql -q -c "analyze;" >/dev/null
selfhost_psql -q -c "notify pgrst, 'reload schema';" >/dev/null || true
docker kill -s SIGUSR1 supabase-rest >/dev/null 2>&1 || true

echo "Row counts after restore (compare with $DUMP/manifest.txt):"
for t in public.books public.profiles public.authors public.book_pages public.book_chunks public.research_reports public.publications auth.users auth.identities auth.refresh_tokens auth.mfa_factors; do
  printf '  %-28s %s\n' "$t" "$(selfhost_psql -Atc "select count(*) from $t")"
done
log "restore finished in $(( $(date +%s) - t0 ))s. Next: scripts/migration/verify-db.sh --compare"

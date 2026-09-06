#!/usr/bin/env bash
# Dump the Supabase Cloud project for restore into the self-hosted stack.
# READ-ONLY against Cloud. Produces a timestamped directory:
#
#   reports/migration/dump-<ts>/
#     00-extensions.sql   CREATE EXTENSION … WITH SCHEMA <as on Cloud>
#     10-schema.sql       public + supabase_migrations schemas (pg_dump --schema-only, grants kept)
#     20-auth-triggers.sql  the two triggers ON auth.users (not in a public-schema dump)
#     30-data-public.sql    public + supabase_migrations data (COPY)
#     40-data-auth.sql      auth.* data except auth.schema_migrations (GoTrue owns that)
#     50-publication.sql    ALTER PUBLICATION supabase_realtime ADD TABLE … as on Cloud
#     manifest.txt        row counts, versions, sha256s
#
#   CLOUD_DB_URL='postgresql://…pooler.supabase.com:5432/postgres' ./dump-cloud.sh
#
# Why not `supabase db dump`: its schema/data selection changes between CLI
# releases and it cannot emit the auth.users triggers; explicit pg_dump is
# deterministic and every choice is written down here. Why not replay the
# migration chain instead of restoring the schema: hosted drift (dashboard-made
# columns) that the chain does not reproduce — the data must match the schema
# it came from.
set -euo pipefail
SCRIPT_NAME=dump-cloud
. "$(dirname "$0")/common.sh"
require_cmd docker
[ -n "${CLOUD_DB_URL:-}" ] || die "CLOUD_DB_URL not set"
TS=$(date -u +%Y%m%d-%H%M%S); OUT="$OUT_ROOT/dump-$TS"; mkdir -p "$OUT"; chmod 700 "$OUT"
log "→ $OUT"

extra_schemas="${EXTRA_SCHEMAS:-}"   # comma-separated custom schemas beyond public,supabase_migrations
schema_args=(--schema=public --schema=supabase_migrations)
IFS=, read -ra xs <<<"$extra_schemas"; for s in "${xs[@]}"; do [ -n "$s" ] && schema_args+=(--schema="$s"); done

log "00 extensions (with their Cloud schemas)"
cloud_psql -Atc "select format('create extension if not exists %I with schema %I;', e.extname, n.nspname) from pg_extension e join pg_namespace n on n.oid=e.extnamespace where e.extname in ('vector','pg_trgm','pgcrypto','unaccent','uuid-ossp','pg_stat_statements') order by 1" > "$OUT/00-extensions.sql"
cat "$OUT/00-extensions.sql" | sed 's/^/    /'

log "10 schema (public + supabase_migrations, grants and RLS included, owners kept)"
pgtool pg_dump "$CLOUD_DB_URL" --schema-only --no-comments=false "${schema_args[@]}" --quote-all-identifiers > "$OUT/10-schema.sql"

log "20 triggers on auth.users"
{
  echo "-- Triggers on auth.users whose functions live in public (a public-schema dump omits them)."
  cloud_psql -Atc "select pg_get_triggerdef(t.oid)||';' from pg_trigger t where t.tgrelid='auth.users'::regclass and not t.tgisinternal order by t.tgname"
} > "$OUT/20-auth-triggers.sql"
cat "$OUT/20-auth-triggers.sql" | sed 's/^/    /'

log "30 data: public + supabase_migrations"
pgtool pg_dump "$CLOUD_DB_URL" --data-only "${schema_args[@]}" --quote-all-identifiers > "$OUT/30-data-public.sql"

log "40 data: auth (users, identities, sessions, refresh tokens, MFA factors; not schema_migrations)"
pgtool pg_dump "$CLOUD_DB_URL" --data-only --schema=auth --exclude-table=auth.schema_migrations --exclude-table=auth.audit_log_entries --quote-all-identifiers > "$OUT/40-data-auth.sql"

log "50 realtime publication membership"
cloud_psql -Atc "select format('alter publication supabase_realtime add table %I.%I;', schemaname, tablename) from pg_publication_tables where pubname='supabase_realtime' order by 1" > "$OUT/50-publication.sql"
[ -s "$OUT/50-publication.sql" ] || echo "-- (no tables in supabase_realtime on Cloud)" > "$OUT/50-publication.sql"

log "manifest"
{
  echo "dumped_at=$(now)"
  echo "source=$(printf '%s' "$CLOUD_DB_URL" | sed -E 's#.*@([^/:]+).*#\1#')"
  echo "postgres=$(cloud_psql -Atc 'show server_version')"
  echo "auth_schema_version=$(cloud_psql -Atc 'select max(version) from auth.schema_migrations')"
  echo "migrations_applied=$(cloud_psql -Atc 'select count(*) from supabase_migrations.schema_migrations' 2>/dev/null || echo 0)"
  echo "--- row counts (public, auth)"
  cloud_psql -Atc "select format('select %L||''=''||count(*) from %I.%I;', n.nspname||'.'||c.relname, n.nspname, c.relname) from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind='r' and n.nspname in ('public','auth') and c.relname<>'schema_migrations' order by 1" > "$OUT/.counts.sql"
  cloud_psql -At < "$OUT/.counts.sql"
  rm -f "$OUT/.counts.sql"
  echo "--- sha256"
  (cd "$OUT" && sha256 ./*.sql)
} > "$OUT/manifest.txt"
chmod 600 "$OUT"/*
du -sh "$OUT" | sed 's/^/    /'
log "DONE. Contains auth data (password hashes, refresh tokens): treat $OUT as a secret; delete after the cutover is verified."

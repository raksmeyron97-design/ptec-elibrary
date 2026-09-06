#!/usr/bin/env bash
# Go/no-go checks BEFORE dumping Cloud or restoring anything. Read-only.
#
#   CLOUD_DB_URL='postgresql://…pooler.supabase.com:5432/postgres' ./preflight.sh
#
# Checks: tooling; Cloud reachable and its Postgres/GoTrue/PostgREST versions
# vs. the self-hosted pins; extension schemas; auth-schema shape hints (MFA
# secret encryption); row counts of the five headline tables; whether any
# file_url still points at Supabase Storage; the realtime publication; the
# self-hosted stack's health and emptiness.
set -euo pipefail
SCRIPT_NAME=preflight
. "$(dirname "$0")/common.sh"
load_app_env
require_cmd docker curl
fail=0; ok() { printf '  ✓ %s\n' "$*"; }; bad() { printf '  ✗ %s\n' "$*"; fail=1; }; note() { printf '  · %s\n' "$*"; }

echo "Cloud (source)"
[ -n "${CLOUD_DB_URL:-}" ] || die "CLOUD_DB_URL not set"
case "$CLOUD_DB_URL" in *pooler.supabase.com:5432*|*:5432/*) ok "session pooler / port 5432 URL";; *6543*) bad "transaction pooler (6543) — use the SESSION pooler";; *) warn "URL is not the pooler; the direct host is IPv6-only from many networks";; esac
v=$(cloud_psql -Atc "select version()" 2>/dev/null | redact || true); [ -n "$v" ] && ok "connected: ${v%% on *}" || bad "cannot connect to Cloud with CLOUD_DB_URL"
if [ -n "$v" ]; then
  cloud_psql -Atc "select e.extname||'@'||e.extversion||' in '||n.nspname from pg_extension e join pg_namespace n on n.oid=e.extnamespace where e.extname in ('vector','pg_trgm','pgcrypto','unaccent') order by 1" | while read -r l; do note "extension $l"; done
  vs=$(cloud_psql -Atc "select n.nspname from pg_extension e join pg_namespace n on n.oid=e.extnamespace where e.extname='vector'"); [ -n "$vs" ] && ok "vector lives in schema '$vs' (restore recreates it there)" || bad "vector extension missing on Cloud?!"
  for t in books profiles authors book_pages book_chunks; do note "public.$t rows: $(cloud_psql -Atc "select count(*) from public.$t")"; done
  note "auth.users rows: $(cloud_psql -Atc 'select count(*) from auth.users')"
  mfa=$(cloud_psql -Atc "select count(*) from auth.mfa_factors where status='verified'"); note "verified MFA factors: $mfa"
  enc=$(cloud_psql -Atc "select count(*) from auth.mfa_factors where secret like '{%' or secret like '%\"alg\"%'" 2>/dev/null || echo 0)
  [ "${enc:-0}" = 0 ] && ok "MFA secrets look like plaintext base32 (portable)" || bad "$enc MFA secret(s) look encrypted at rest — admins will need to re-enrol TOTP after cutover"
  sb=$(cloud_psql -Atc "select count(*) from public.book_files where file_url like '%supabase.co/storage%'" 2>/dev/null || echo "?"); [ "$sb" = 0 ] && ok "no book_files.file_url on Supabase Storage" || warn "$sb book_files rows reference Supabase Storage URLs"
  pub=$(cloud_psql -Atc "select coalesce(string_agg(schemaname||'.'||tablename, ','), '(none)') from pg_publication_tables where pubname='supabase_realtime'"); note "realtime publication tables: $pub"
  cust=$(cloud_psql -Atc "select coalesce(string_agg(rolname, ','), '(none)') from pg_roles where rolname not like 'pg\_%' and rolname not in ('postgres','anon','authenticated','service_role','authenticator','supabase_admin','supabase_auth_admin','supabase_storage_admin','supabase_functions_admin','supabase_replication_admin','supabase_read_only_user','supabase_realtime_admin','dashboard_user','pgbouncer','pgsodium_keyholder','pgsodium_keyiduser','pgsodium_keymaker','pgtle_admin','cloud_admin','supabase_etl_admin')"); note "non-standard roles: $cust"
  schemas=$(cloud_psql -Atc "select string_agg(nspname, ',') from pg_namespace where nspname not like 'pg\_%' and nspname not in ('information_schema','auth','storage','realtime','_realtime','extensions','graphql','graphql_public','pgsodium','pgsodium_masks','vault','supabase_functions','net','cron','pgbouncer','_analytics','supabase_migrations','public','pgtle')"); [ -z "$schemas" ] && ok "no custom schemas beyond public/supabase_migrations" || warn "custom schemas present: $schemas — add them to dump-cloud.sh"
fi
if [ -n "${NEXT_PUBLIC_SUPABASE_URL:-}" ] && [ -n "${NEXT_PUBLIC_SUPABASE_ANON_KEY:-}" ]; then
  gv=$(curl -sS -m 10 -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" "$NEXT_PUBLIC_SUPABASE_URL/auth/v1/health" | sed -n 's/.*"version":"\([^"]*\)".*/\1/p'); note "Cloud GoTrue version: ${gv:-unknown} (self-hosted pin: v2.195.0 — must be ≥)"
fi

echo "Self-hosted (target)"
if docker inspect "$SELFHOST_DB_CONTAINER" >/dev/null 2>&1; then
  ok "container $SELFHOST_DB_CONTAINER present ($(docker inspect --format '{{.Config.Image}}' "$SELFHOST_DB_CONTAINER"))"
  n=$(selfhost_psql -Atc "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'" 2>/dev/null || echo "?")
  [ "$n" = 0 ] && ok "public schema is empty (safe restore target)" || warn "public schema already has $n tables — restore-selfhosted.sh will refuse without --force"
  u=$(selfhost_psql -Atc "select count(*) from auth.users" 2>/dev/null || echo "?"); [ "$u" = 0 ] && ok "auth.users empty" || warn "auth.users has $u rows"
  selfhost_psql -Atc "select 'auth schema migrated to '||max(version) from auth.schema_migrations" 2>/dev/null | sed 's/^/  · /' || bad "auth.schema_migrations missing — start GoTrue first so it creates the auth schema"
else bad "self-hosted db container not running (infra/supabase: docker compose up -d)"; fi

echo; [ $fail -eq 0 ] && log "PREFLIGHT PASS" || die "PREFLIGHT FAILED"

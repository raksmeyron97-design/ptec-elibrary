#!/usr/bin/env bash
# Apply supabase/migrations/ to the self-hosted database — ON the box, pull-based.
#
# Replaces .github/workflows/migrate.yml's `supabase db push` for the
# self-hosted stack: the database publishes no port, so nothing outside the
# box can reach it, and the Supabase CLI has no container image we can pin.
# This applier is deliberately compatible with the CLI's bookkeeping table
# (supabase_migrations.schema_migrations: version, statements, name) so
# `supabase migration list --db-url …` and a future `db push` still agree.
#
#   ./migrate.sh --dry-run    # list pending files, apply nothing
#   ./migrate.sh              # git pull --ff-only, dry-run, then apply pending in order
#   ./migrate.sh --no-pull    # apply what is checked out (CI/staging)
#
# Each file runs in ONE transaction (psql --single-transaction, ON_ERROR_STOP),
# as supabase_admin, and its version row is inserted in the same transaction —
# a failure leaves neither half-applied SQL nor a lying history row. Stops at
# the first failure, alerts Sev 2 (same as migrate.yml), exits non-zero, so
# deploy/deploy.sh refuses to roll the image forward onto an old schema.
set -euo pipefail
SCRIPT_NAME=migrate
. "$(dirname "$0")/lib.sh"
load_env
DRY=0; PULL=1
for a in "$@"; do case "$a" in --dry-run) DRY=1;; --no-pull) PULL=0;; *) die "unknown argument: $a";; esac; done
MIG_DIR="$REPO_DIR/supabase/migrations"
[ -d "$MIG_DIR" ] || die "no migrations directory at $MIG_DIR"
mkdir -p "$STATE_DIR" 2>/dev/null || STATE_DIR="$INFRA_DIR/.state"; mkdir -p "$STATE_DIR"
exec 9>"$STATE_DIR/migrate.lock"; flock -n 9 || die "another migrate run is in progress"

if [ "$PULL" -eq 1 ] && [ "$DRY" -eq 0 ] && [ -d "$REPO_DIR/.git" ]; then
  log "git pull --ff-only in $REPO_DIR"
  git -C "$REPO_DIR" pull --ff-only --quiet origin main || die "git pull failed — resolve by hand, nothing applied"
fi

docker exec supabase-db pg_isready -U postgres -h localhost >/dev/null || die "database not ready"
dbsql -q <<'SQL'
create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (version text primary key);
alter table supabase_migrations.schema_migrations add column if not exists statements text[];
alter table supabase_migrations.schema_migrations add column if not exists name text;
SQL

applied=$(dbscalar "select version from supabase_migrations.schema_migrations" | sort)
pending=()
for f in $(ls "$MIG_DIR"/*.sql | sort); do
  base=$(basename "$f" .sql); version="${base%%_*}"
  grep -qx "$version" <<<"$applied" || pending+=("$f")
done

if [ ${#pending[@]} -eq 0 ]; then log "schema is current ($(wc -l <<<"$applied" | tr -d ' ') versions applied)"; exit 0; fi
log "pending: ${#pending[@]} migration(s)"; for f in "${pending[@]}"; do echo "    $(basename "$f")"; done
[ "$DRY" -eq 1 ] && exit 0

for f in "${pending[@]}"; do
  base=$(basename "$f" .sql); version="${base%%_*}"; name="${base#*_}"
  log "applying $base"
  # Single transaction: the file, then the history row. $$-quoting keeps the
  # whole file as one element of statements[] — enough for the CLI to list it.
  { cat "$f"; printf '\n;\ninsert into supabase_migrations.schema_migrations (version, name, statements) values (%s, %s, array[$mig$%s$mig$]);\n' "'$version'" "'$name'" "$(sed "s/\\\$mig\\\$/\$m1g\$/g" "$f")"; } \
    | dbsql -q --single-transaction 2> "$STATE_DIR/migrate.err" || {
      msg="migration $base FAILED: $(tail -c 400 "$STATE_DIR/migrate.err" | tr '\n' ' ')"
      warn "$msg"
      alert 2 "Database migration failed on the box" "$msg" "docs/RUNBOOKS.md §I16"
      exit 1
    }
done
log "applied ${#pending[@]} migration(s); history now $(dbscalar 'select count(*) from supabase_migrations.schema_migrations') versions"

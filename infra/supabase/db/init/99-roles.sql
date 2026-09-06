-- Runs once when the data directory is empty (docker-entrypoint-initdb.d).
-- The supabase/postgres image creates these roles with placeholder passwords;
-- align them with POSTGRES_PASSWORD so GoTrue/PostgREST/Realtime can connect.
--
-- Guarded per role: the image's migrate.sh runs every init script with
-- ON_ERROR_STOP, and a single missing role (supabase_functions_admin only
-- exists when the upstream webhooks.sql — omitted here — has run) aborted the
-- whole init, leaving auth.uid() owned by postgres and no _realtime schema.
\set pgpass `echo "$POSTGRES_PASSWORD"`
-- psql variables are not expanded inside dollar-quoted blocks; pass it via a
-- session GUC instead.
SELECT set_config('ptec.pgpass', :'pgpass', false);

DO $$
DECLARE
  r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['authenticator', 'pgbouncer', 'supabase_auth_admin',
                           'supabase_functions_admin', 'supabase_storage_admin']
  LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('ALTER USER %I WITH PASSWORD %L', r, current_setting('ptec.pgpass'));
    ELSE
      RAISE NOTICE 'role % does not exist in this image; skipped', r;
    END IF;
  END LOOP;
END $$;

-- Runs once when the data directory is empty (docker-entrypoint-initdb.d).
-- The supabase/postgres image creates these roles with placeholder passwords;
-- align them with POSTGRES_PASSWORD so GoTrue/PostgREST/Realtime can connect.
-- Identical to the upstream volumes/db/roles.sql.
\set pgpass `echo "$POSTGRES_PASSWORD"`

ALTER USER authenticator WITH PASSWORD :'pgpass';
ALTER USER pgbouncer WITH PASSWORD :'pgpass';
ALTER USER supabase_auth_admin WITH PASSWORD :'pgpass';
ALTER USER supabase_functions_admin WITH PASSWORD :'pgpass';
ALTER USER supabase_storage_admin WITH PASSWORD :'pgpass';

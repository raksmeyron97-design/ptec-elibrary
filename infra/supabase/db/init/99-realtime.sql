-- Runs once on an empty data directory. Realtime keeps its tenant tables in
-- _realtime (DB_AFTER_CONNECT_QUERY sets the search_path).
\set pguser `echo "$POSTGRES_USER"`

create schema if not exists _realtime;
alter schema _realtime owner to :pguser;

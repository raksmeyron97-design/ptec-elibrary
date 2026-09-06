-- Deterministic text snapshot of everything the migration must preserve.
-- Run with: psql -At -v ON_ERROR_STOP=1 -f snapshot.sql (both sides), then diff.
-- No secrets: object names, counts, definitions.
\echo === extensions
select e.extname||' '||e.extversion||' '||n.nspname from pg_extension e join pg_namespace n on n.oid=e.extnamespace where e.extname in ('vector','pg_trgm','pgcrypto','unaccent','uuid-ossp') order by 1;
\echo === roles (standard set present?)
select rolname from pg_roles where rolname in ('anon','authenticated','service_role','authenticator','supabase_auth_admin','supabase_admin') order by 1;
\echo === tables (public) with rls flag
select c.relname||' rls='||c.relrowsecurity::text from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' order by 1;
\echo === row counts
select format('select %L||'' ''||count(*) from %I.%I;', n.nspname||'.'||c.relname, n.nspname, c.relname) from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind='r' and (n.nspname='public' or (n.nspname='auth' and c.relname in ('users','identities','mfa_factors'))) order by 1 \gexec
\echo === columns (public)
select table_name||'.'||column_name||' '||data_type||' '||is_nullable||' '||coalesce(column_default,'-') from information_schema.columns where table_schema='public' order by table_name, ordinal_position;
\echo === constraints (public)
select conrelid::regclass::text||' '||conname||' '||contype::text||' '||pg_get_constraintdef(oid) from pg_constraint where connamespace='public'::regnamespace order by 1;
\echo === indexes (public)
select schemaname||'.'||indexname||' '||regexp_replace(indexdef, '^CREATE (UNIQUE )?INDEX \S+ ON ', 'ON ') from pg_indexes where schemaname='public' order by indexname;
\echo === functions (public)
select p.proname||'('||pg_get_function_identity_arguments(p.oid)||') secdef='||p.prosecdef::text||' lang='||l.lanname||' md5='||md5(p.prosrc) from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_language l on l.oid=p.prolang where n.nspname='public' order by 1;
\echo === function grants (public)
select p.proname||' '||coalesce(array_to_string(p.proacl,','),'(default)') from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' order by 1;
\echo === triggers
select t.tgrelid::regclass::text||' '||t.tgname||' '||pg_get_triggerdef(t.oid) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where not t.tgisinternal and (n.nspname='public' or t.tgrelid='auth.users'::regclass) order by 1;
\echo === views (public)
select c.relname||' invoker='||coalesce((select option_value from pg_options_to_table(c.reloptions) where option_name='security_invoker'),'false')||' md5='||md5(pg_get_viewdef(c.oid)) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='v' order by 1;
\echo === policies (public)
select tablename||' '||policyname||' '||cmd||' roles='||array_to_string(roles,',')||' using='||coalesce(md5(qual),'-')||' check='||coalesce(md5(with_check),'-') from pg_policies where schemaname='public' order by 1;
\echo === table grants (public)
select table_name||' '||grantee||' '||privs from (select table_name, grantee, string_agg(privilege_type, ',' order by privilege_type) as privs from information_schema.role_table_grants where table_schema='public' and grantee in ('anon','authenticated','service_role') group by table_name, grantee) g order by 1;
\echo === sequences (public)
select sequencename||' last='||coalesce(last_value::text,'-') from pg_sequences where schemaname='public' order by 1;
\echo === realtime publication
select schemaname||'.'||tablename from pg_publication_tables where pubname='supabase_realtime' order by 1;
\echo === vector columns
select table_name||'.'||column_name||' '||udt_name from information_schema.columns where table_schema='public' and udt_name='vector' order by 1;
\echo === migration history
select version from supabase_migrations.schema_migrations order by 1;
\echo === auth schema version
select max(version) from auth.schema_migrations;

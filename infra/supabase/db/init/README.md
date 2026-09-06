# Database init scripts

These run **once**, when Postgres first starts on an empty data directory, in
the order the image mounts them (`init-scripts/` before `migrations/`). They are
the upstream self-hosting scripts minus the parts this stack does not run:

| Upstream file | Here | Why |
|---|---|---|
| `roles.sql` | `99-roles.sql` | sets service-role passwords to `POSTGRES_PASSWORD` |
| `jwt.sql` | `99-jwt.sql` | `app.settings.jwt_secret` / `jwt_exp` database GUCs |
| `realtime.sql` | `99-realtime.sql` | `_realtime` schema |
| `webhooks.sql` | omitted | `pg_net` + `supabase_functions` — no webhook is used (audit §3) |
| `_supabase.sql`, `logs.sql`, `pooler.sql` | omitted | analytics DB and Supavisor are not deployed |

Changing a password later is done with `ALTER USER`, not by editing these files
— they never run again on an existing volume.

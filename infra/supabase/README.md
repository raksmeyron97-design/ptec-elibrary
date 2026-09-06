# Self-hosted Supabase for the PTEC e-Library (ZimaOS)

Everything needed to reproduce the database/auth tier on the box, except the
secrets. Read `docs/SELF_HOSTED_SUPABASE_MIGRATION_AUDIT.md` first for *why*
the stack looks like this; this file is *how*.

```
infra/supabase/
  docker-compose.yml        db · kong · auth · rest · realtime · meta · studio · mail-templates · cloudflared
  docker-compose.dev.yml    staging override: Mailpit catches auth emails
  .env.example              every variable, with the placeholder policy preflight enforces
  kong/kong.yml             routes + key-auth + acl (Studio is NOT routed)
  db/init/                  one-time Postgres init (roles, jwt GUCs, _realtime schema)
  postgres/README.md        tuning rationale
  scripts/                  generate-secrets · preflight · healthcheck · backup-db · restore-test · monitor · migrate · install
  systemd/                  timers for backup (nightly), restore test (weekly), monitor (5 min + daily)
```

## Layout on the box

| Path | Purpose |
|---|---|
| `/DATA/AppData/ptec-elibrary/app` | the repo checkout `deploy/install.sh` already created — this directory lives inside it |
| `/DATA/AppData/ptec-supabase/db` | Postgres data (`SUPABASE_DATA_DIR`) |
| `/DATA/backups/supabase` | nightly dumps, 30-day retention (`BACKUP_DIR`) |
| `/var/lib/ptec-supabase` | locks and monitor state |

## Bring-up

```bash
cd /DATA/AppData/ptec-elibrary/app/infra/supabase
./scripts/generate-secrets.sh --jwt-secret '<Cloud legacy JWT secret>' \
    --anon-key '<Cloud anon key>' --service-key '<Cloud service_role key>'   # option A (recommended)
# or: ./scripts/generate-secrets.sh                                          # option B: fresh keys
chmod 600 .env && $EDITOR .env      # SMTP_*, TURNSTILE_SECRET_KEY, GOOGLE_OAUTH_*, TELEGRAM_*, SUPABASE_TUNNEL_TOKEN
./scripts/preflight.sh             # refuses placeholders, weak keys, exposed ports
sudo ./scripts/install.sh          # timers + compose up (+ tunnel iff token set) + health wait
./scripts/healthcheck.sh
```

`install.sh` is idempotent. Without `SUPABASE_TUNNEL_TOKEN` the stack is
reachable only on the loopback ports (`KONG_BIND`/`STUDIO_BIND`), which is the
correct state for staging validation (docs/SELF_HOSTED_SUPABASE_CUTOVER.md
Phase E).

## Network and exposure

```
Internet → Cloudflare → tunnel → kong:8000 → auth | rest | realtime | meta
app container ──── docker network `ptec-supabase` ──── kong:8000  (SUPABASE_INTERNAL_URL)
Studio ── 127.0.0.1:3001 (or STUDIO_BIND=<LAN IP>) — never through Kong/tunnel
Postgres ── no published port. Use: docker exec -it supabase-db psql -U supabase_admin
```

The tunnel is a **second** Cloudflare Tunnel (or a second public hostname on
the existing one), created in the account that owns `storage-ptec.online`:
public hostname `supabase.storage-ptec.online`, service `http://kong:8000`.
WebSockets are on by default for the zone; Realtime needs them. Do not put
Cloudflare Access in front of this hostname — browsers call it anonymously.

The app joins the network via `docker-compose.selfhost.yml` at the repo root
(`COMPOSE_FILE=docker-compose.yml:docker-compose.selfhost.yml` in the app's
`.env`), which also sets `SUPABASE_INTERNAL_URL=http://kong:8000` so server-side
calls never leave the box. Browser calls still use the public hostname — the
URL in the client bundle must be reachable from the Internet.

## Operations

| Task | Command (in `infra/supabase`) |
|---|---|
| Status | `./scripts/healthcheck.sh` · `docker compose ps` · `docker stats` |
| Logs | `docker compose logs -f auth` (or `rest`, `kong`, `db`, `realtime`) |
| Backup now | `./scripts/backup-db.sh --no-rotate` |
| Prove the backup | `./scripts/restore-test.sh` (throwaway container, ~1–2 min) |
| Apply migrations | `./scripts/migrate.sh --dry-run` then `./scripts/migrate.sh` (deploy.sh does this before every image roll) |
| SQL console | `docker exec -it supabase-db psql -U supabase_admin -d postgres` |
| Studio | `ssh -L 3001:127.0.0.1:3001 box` → http://127.0.0.1:3001 |
| Rotate JWT keys | `./scripts/generate-secrets.sh --rotate-jwt` → restart → update GitHub vars/secret + app `.env` → republish image (everyone re-signs-in) |
| Change any other secret | edit `.env`, `docker compose up -d` (Postgres password: also `ALTER USER` for each role in db/init/99-roles.sql) |
| Upgrade a component | bump the `*_IMAGE_TAG` in `.env`, `docker compose pull && docker compose up -d`, run healthcheck; GoTrue/PostgREST never older than Cloud's last versions (v2.195.0 / v14.17) |

## Backups

- **Nightly `pg_dump -Fc`** (`backup-db.sh`, 03:20 local): whole database incl.
  `auth`, custom format (verifiable, selective restore), globals dump, JSON
  row-count manifest, `sha256`, optional AES-256 with `BACKUP_PASSPHRASE`,
  atomic rename, 30-day rotation, disk pre-check, `ops_events` heartbeat
  (`backup_db`) — so the admin dashboard's Backups card and `/api/health` deep
  probe keep working — and a Sev 2 Telegram alert on failure.
- **Weekly restore test** (`restore-test.sh`, Sunday 04:30): restores the
  newest dump into a throwaway container on the same image and checks row
  counts against the manifest, extensions, RLS, policies, the `auth.users`
  trigger, vector index. Records `ops_events restore_drill`.
- **Weekly volume backup** (manual or ZimaOS snapshot): with the stack stopped
  or from a filesystem snapshot, copy `SUPABASE_DATA_DIR` and the `db-config`
  volume (pgsodium key: `docker run --rm -v ptec-supabase_db-config:/c alpine tar c -C /c .`).
  The logical dump is the primary restore path; the volume copy is for a
  same-version cold start.
- The Cloud-era `scripts/backup/backup-db.mjs` (JSONL via PostgREST) keeps
  running from `deploy/ptec-db-backup.timer`; it remains the input of the
  PGlite restore drill and of the per-table restore procedures in
  `docs/BACKUP-DR.md §6.1`.

Restore for real: `docs/SELF_HOSTED_SUPABASE_ROLLBACK.md §4` (self-hosted →
self-hosted) — in short `pg_restore -U supabase_admin -d postgres --clean
--if-exists` into a fresh stack after GoTrue has run its migrations.

## Monitoring

`monitor.sh --fast` (5 min): Postgres alive, core container health, PostgREST
and GoTrue through Kong, public hostname when the tunnel is configured.
`monitor.sh --daily` (08:00): RAM ≥ 75/85 %, disk ≥ 75/85 % on the data dir,
backup dir and Docker root, backup freshness (> 30 h), containers above 90 %
of their memory limit. Alerts fire on state transitions only, Sev 1 for
outages, Sev 2 for thresholds, and announce recovery. The app's own
`/api/health` now also probes `/auth/v1/health`, so the external UptimeRobot
monitor covers auth without any change.

## Staging validation (what Phase E ran)

```bash
cp .env.example .env && ./scripts/generate-secrets.sh --force        # local keys
# SUPABASE_PUBLIC_URL=http://127.0.0.1:18000 SITE_URL=http://localhost:3100 ALLOW_HTTP_PUBLIC_URL=1
# KONG_HTTP_PORT=18000 STUDIO_PORT=13001 SUPABASE_DATA_DIR=./volumes/db/data AUTH_CAPTCHA_ENABLED=false
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d
./scripts/migrate.sh --no-pull                                       # or restore a Cloud dump
docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < ../../supabase/seed.sql
./scripts/healthcheck.sh && ../../scripts/migration/verify-auth.sh
```

## Security properties (checked by preflight)

No placeholder secrets; JWT secret ≥ 32 chars and both API keys verified
against it; Postgres, GoTrue, PostgREST, Realtime, pg-meta publish no port;
Kong and Studio bind to loopback unless told otherwise; Studio absent from the
public gateway; `no-new-privileges` on every container; logs capped; `.env`
mode 600; backups mode 600 and encrypted when a passphrase is set.

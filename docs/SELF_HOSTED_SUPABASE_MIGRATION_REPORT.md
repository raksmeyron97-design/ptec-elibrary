# Self-Hosted Supabase Migration — Report

_Status on 2026-09-06: **Phases A–E complete on a staging stack; production
untouched.** Phase F (readiness) has one open BLOCKER and several manual
preparation items; Phase G (cutover) has not been scheduled. Supabase Cloud is
still production and has not been modified in any way by this work._

Branch: `feat/self-hosted-supabase` (based on `main` @ 8e981f0). Companion
documents: [audit](SELF_HOSTED_SUPABASE_MIGRATION_AUDIT.md),
[cutover runbook](SELF_HOSTED_SUPABASE_CUTOVER.md),
[rollback runbook](SELF_HOSTED_SUPABASE_ROLLBACK.md),
[stack README](../infra/supabase/README.md). Evidence files:
`docs/self-hosted-supabase/results/`.

## 1. Architecture

**Current**: browser → Cloudflare → tunnel → Next.js on the ZimaOS box →
(Internet) → Supabase Cloud (Postgres 17.6 / GoTrue v2.195.0 / PostgREST
v14.17 / Realtime). Files on Zima Storage. Migrations from GitHub through the
Cloud session pooler. Image builds on GitHub prerender against Cloud.

**Target**: same edge and app; a second tunnel hostname
`supabase.storage-ptec.online` → Kong :8000 on the box → GoTrue / PostgREST /
Realtime / pg-meta → Postgres 17 (no published port). The app reaches Kong over
the private Docker network (`SUPABASE_INTERNAL_URL`), browsers over the
tunnel. Studio bound to loopback/LAN only. Migrations applied on the box.
Zima Storage unchanged. Full diagrams: audit §1.

## 2. Repository audit findings (summary)

Four client factories carry every Supabase call; no Supabase Storage; no Edge
Functions; no `pg_net`/`pg_cron`/`vault`; Realtime used only by comment
presence; extensions needed: `vector`, `pg_trgm`, `pgcrypto`. Seven plan
assumptions were wrong or incomplete (URL baked into the image, pooler-based
migrations, build needs a live DB, JSONL not `pg_dump` backups, dashboard-only
Google OAuth, hardcoded CSP/SW hostnames, cookie rename) plus one found on
staging: **the auth email templates in the repo are empty files**. Details:
audit §0–§4.

## 3. Changed files

| Area | Files | Commits |
|---|---|---|
| Audit | `docs/SELF_HOSTED_SUPABASE_MIGRATION_AUDIT.md` | `audit:` |
| Infrastructure | `infra/supabase/{docker-compose.yml,docker-compose.dev.yml,.env.example,.gitignore,README.md}`, `kong/kong.yml`, `db/init/*`, `postgres/README.md`, `scripts/{lib,generate-secrets,preflight,healthcheck,backup-db,restore-test,monitor,migrate,install}.sh`, `systemd/*` | `infra:` ×3 |
| Migration tooling | `scripts/migration/{common,preflight,dump-cloud,restore-selfhosted,verify-db,verify-auth,verify-api,rollback}.sh`, `snapshot.sql`, `benchmark.mjs` | `db:` ×3 |
| Application | `lib/supabase/origin.ts` (+test), `lib/csp.ts` (+`csp.supabase-origin.test.ts`), `app/sw.ts` (+`sw-supabase-host.test.ts`), `lib/supabase/{server,public}.ts`, `middleware.ts`, `app/api/health/route.ts`, `lib/rate-limit.ts`, `lib/security/{sink,incidents,notify/telegram}.ts`, `lib/chunk-embed.ts`, `lib/pdf-page-index.ts`, `app/api/contact/route.ts`, `.env.example`, `docker-compose.selfhost.yml`, `deploy/deploy.sh` | `app:` |
| CI | `.github/workflows/migrate.yml` | `docs:`/`ci:` |
| Docs | cutover, rollback, this report, `supabase/MIGRATIONS.md`, `docs/SECRET-REGISTRY.md`, `CLAUDE.md` | `docs:` |

Every code change answers the four change-management questions in its
commit message (why self-hosted needs it, what it affects, how tested,
rollback). No unrelated refactoring.

## 4. Infrastructure

Stack, memory budget, exposure rules and operations: `infra/supabase/README.md`.
Images: `supabase/postgres:17.6.1.136`, `kong:2.8.1`, `supabase/gotrue:v2.195.0`
(= Cloud), `postgrest/postgrest:v14.17` (= Cloud), `supabase/realtime:v2.102.3`,
`supabase/postgres-meta:v0.96.6`, `supabase/studio:2026.08.03`, `busybox:1.37`,
`cloudflare/cloudflared:2026.8.0`. Excluded: Storage, imgproxy, Edge Functions,
Logflare/Vector, Supavisor (audit §6).

## 5. Database migration strategy

`pg_dump` of Cloud (schema of `public`+`supabase_migrations` with grants and
RLS; data of those plus `auth`; the two `auth.users` triggers extracted
separately; realtime publication; extension schemas recorded) → restore into
the self-hosted stack after GoTrue has created the `auth` schema, data under
`session_replication_role = replica`. Rationale (hosted drift, GoTrue owns
`auth.schema_migrations`): audit §0. Future migrations: box-side applier
compatible with the CLI's history table (`supabase/MIGRATIONS.md`).

## 6. Authentication, OAuth, CSP, PWA, CI, backups, monitoring

- **Auth**: GoTrue env mirrors `supabase/config.toml` plus the dashboard-only
  items (SMTP, captcha, MFA, rate limits, Google). JWT secret reused; API keys are per-backend (Cloud `sb_*` keys are refused by Kong, the stack's JWT keys by Cloud — see the cutover runbook, decision 1)
  from Cloud at cutover (decision, cutover runbook). Cookie renames once.
- **Google OAuth**: add `https://supabase.storage-ptec.online/auth/v1/callback`
  as a second authorised redirect URI in Google Cloud Console; keep the Cloud
  one until rollback is retired; credentials go to `infra/supabase/.env`.
- **CSP**: derived from `NEXT_PUBLIC_SUPABASE_URL` (origin + `wss://`), legacy
  `*.supabase.co` kept for the window. **PWA**: SW host match derived from the
  same helper, falls back to the Cloud suffix, never throws.
- **CI**: `migrate.yml` is a green no-op without `SUPABASE_DB_URL`; image build
  inputs unchanged in shape — only the variable values change at cutover.
- **Backups**: nightly `pg_dump -Fc` incl. `auth`, verified, rotated (30 d),
  optional AES-256, heartbeat into `ops_events`, weekly restore test into a
  throwaway container; weekly volume copy documented.
- **Monitoring**: `monitor.sh --fast` (5 min) and `--daily` with
  state-transition Telegram alerts (RAM/disk 75/85 %); `/api/health` now
  probes GoTrue; existing UptimeRobot/`uptime.yml` unchanged.

## 7. Security findings

- Postgres, GoTrue, PostgREST, Realtime, pg-meta publish no ports; Kong and
  Studio bind to loopback unless configured; Studio is not routed through
  Kong; `preflight.sh` enforces all of it plus non-placeholder secrets and
  key/secret consistency.
- Found and fixed during staging: a Kong regex route with `strip_path`
  forwarded every table request as `/` (OpenAPI document) — would have broken
  the site while looking like an app bug; the OpenAPI root is now service-role
  only (anon → 403), which is stricter than Cloud.
- `SUPABASE_SERVICE_ROLE_KEY` doubles as an HMAC secret for analytics; reuse
  at cutover avoids re-bucketing. Rotation later is its own change.
- Backups contain auth data: mode 600, encrypted when `BACKUP_PASSPHRASE` is
  set; preflight warns when it is not.
- Not changed, flagged: `lib/zima.ts` and `next.config.ts` keep dead
  `.supabase.co` Supabase-Storage entries until `verify-db` on Cloud confirms
  no `file_url` points there.

## 8. Performance

`scripts/migration/benchmark.mjs` records p50/p95 per layer. Two runs exist
(`docs/self-hosted-supabase/results/`): the Cloud production baseline from a
laptop, and the staging stack with `next dev` on the same laptop. They are
**not comparable for TTFB** (dev compiles pages on first request) and the
gateway rows compare Internet-to-Singapore against localhost. They prove the
tool; the measurement that counts is prescribed in the cutover runbook: run
from the box before T-30 and at T+30 with the production image. **No latency
improvement is claimed in this report.**

| probe | Cloud prod (laptop) p50/p95 | staging (laptop, dev) p50/p95 |
|---|---|---|
| supabase.rest | 124 / 340 ms | 11 / 22 ms |
| supabase.auth | 106 / 233 ms | 8 / 15 ms |
| app.api.search | 186 / 278 ms | 35 / 58 ms |
| app.health.db (inside app) | n/a (no CRON_SECRET) | 55 / 189 ms |

## 9. Test results

Legend: PASS / FAIL / WARN / NOT RUN. Everything marked PASS was executed on
2026-09-06 against the staging stack on this machine (Docker Desktop, 8 GB VM,
Kong on 127.0.0.1:18000, app `next dev` on :3100, seed data).

### Application (staging, via the real UI unless noted)
| Check | Result | Evidence |
|---|---|---|
| Email/password login (student) → `/dashboard` | PASS | Playwright: landed on `/dashboard`, persisted on reload |
| Session refresh / authenticated PostgREST read / logout | PASS | `verify-auth.sh` password grant, refresh grant, `/auth/v1/user`, logout 204 |
| Admin login → MFA **enrol** → TOTP verify → `/admin` | PASS | Playwright + TOTP computed from the factor; AAL2 dashboard and `/admin/security` rendered |
| Admin AAL2 session survives dump → restore | PASS | `/admin` still served after `restore-selfhosted.sh --force` (refresh tokens restored) |
| Google OAuth | NOT RUN | needs a real https hostname + Google credentials (Phase E8) |
| Email confirmation / recovery mail | WARN | Mailpit received the recovery mail with the bilingual subject and an **empty body** — the repo templates are empty (BLOCKER F-1) |
| Public pages `/`, `/books`, `/theses`, `/publications`, `/km`, `/search`, login pages, book detail, reader shell | PASS | `verify-api.sh` |
| Native search EN + KM, popular, recommendations, sitemap, manifest | PASS | `verify-api.sh` |
| `/api/health` db + auth ok (storage fails: no Zima on staging) | PASS (storage WARN) | deep probe latencies recorded |
| Bundle/CSP point at the configured Supabase (`connect-src`, preconnect) | PASS | `verify-api.sh` |
| Service worker served by the production build | PASS | `/sw.js` 200 from the standalone server; caching/offline behaviour itself: NOT RUN in a browser |
| PDF read / upload / download permission | NOT RUN | no Zima Storage on staging (reader shell renders) |
| Realtime websocket connect through Kong | PASS | `verify-auth.sh` (Node WebSocket) |
| Comments presence in two browsers | NOT RUN | manual smoke item at T+5 |

### Database
| Check | Result | Evidence |
|---|---|---|
| Migration chain applies from the baseline via the box applier | PASS | 87 files, history table 87 versions |
| Seed applies (auth.users/identities inserts) | PASS | 4 users, login works |
| Extensions vector 0.8.2, pg_trgm 1.6, pgcrypto 1.3 | PASS | snapshot |
| Vector indexes, trgm indexes, 166 policies, 52 triggers incl. 2 on `auth.users`, 12 views, 81 app functions | PASS | snapshot sections |
| dump-cloud → restore-selfhosted → compare | PASS | 0 structural diffs except re-serialised text of two views and rows my own smoke tests wrote |
| Row counts vs manifest after restore | PASS | 6 books, 4 profiles, 4 authors, 5 pages, 4 users, 1 MFA factor |
| Compare Cloud vs self-hosted | NOT RUN | requires `CLOUD_DB_URL` (session pooler) — Phase E2/E5 on the box |
| Realtime publication membership | PASS (empty) | matches a fresh chain; Cloud's is captured by the dump |

### Infrastructure & operations
| Check | Result | Evidence |
|---|---|---|
| Postgres / GoTrue / PostgREST / Realtime / Kong / pg-meta / Studio healthy | PASS | `healthcheck.sh` STACK HEALTHY |
| Studio loopback-only, not routed via Kong; Postgres no port | PASS | preflight + `kong:/→404` |
| Key-auth (no key → 401, bad key → 401), OpenAPI root anon → 403 | PASS | healthcheck / verify-auth |
| Stack restart (`compose restart`) returns to healthy with data intact | PASS | E11 |
| Nightly backup script (pg_dump -Fc, verified, manifest, heartbeat) | PASS | `ops_events backup_db ok`, 1 MB archive |
| Restore test into throwaway container | PASS | all integrity checks, 5 s |
| Backup rotation | PASS (logic) | 0 files pruned — nothing older than 30 d yet |
| Monitor scripts | NOT RUN | Linux-only checks (`/proc/meminfo`); syntax-checked |
| Cloudflare Tunnel for the Supabase hostname | NOT RUN | requires the tunnel token (Phase E8) |
| Telegram alerts | NOT RUN | no bot token on staging |

### Code quality (worktree, branch head)
| Check | Result |
|---|---|
| `npx vitest run` (targeted: CSP, SW, origin, security parity, cache safety, rate limit, sink, authorization boundary) | PASS 286/286 |
| `npx vitest run` (full suite) | PASS — 3866 passed, 50 skipped; one unrelated component test (`upload-progress.test.tsx`) hit its 5 s timeout while the machine was under build load and passes in isolation |
| `npx tsc --noEmit` | PASS |
| `npm run lint` | PASS (0 errors; 141 pre-existing warnings, none in files touched here) |
| `npm run build` against the staging Supabase (prerender with service key) | PASS — 115 static pages, only Next's own pre-existing edge-runtime notice |
| Service worker bundle carries the configured host (`public/sw.js`) | PASS — `NEXT_PUBLIC_SUPABASE_URL` is inlined into the worker; legacy suffix retained |
| Standalone production server (`node .next/standalone/server.js`) against staging | PASS — `/api/health` db+auth ok, `/sw.js` 200, CSP `connect-src` carries the configured origin, its `ws://` twin and the legacy wildcard |

## 10. Remaining risks and open items (Phase F)

| # | Item | Severity |
|---|---|---|
| F-1 | **Auth email templates are empty in the repo** — export the three templates from the Cloud dashboard into `supabase/templates/` and verify with Mailpit | **BLOCKER** |
| F-2 | Google OAuth: credentials into `infra/supabase/.env`, second redirect URI in Google Console, round-trip test on a real https hostname | BLOCKER until done |
| F-3 | Tunnel hostname `supabase.storage-ptec.online` → `http://kong:8000`; Cloud-vs-self-hosted `verify-db --compare` and `preflight.sh` run against the real Cloud DB (needs the session-pooler URL, which only GitHub holds today) | BLOCKER until done |
| F-4 | GitHub build must reach the new hostname at build time (tunnel up before the first self-hosted image) | WARN |
| F-5 | MFA secrets: if Cloud encrypts `auth.mfa_factors.secret`, admins re-enrol (preflight reports) | WARN |
| F-6 | Every user signs in once after cutover (cookie rename) | WARN (communicate) |
| F-7 | Realtime `postgres_changes` on `post_comments` is only live if Cloud's publication includes the table (dump carries it) | INFO |
| F-8 | `.supabase.co` literals in CSP/`next.config.ts`/`lib/zima.ts` to remove after 7 clean days | INFO |
| F-9 | Privacy copy in `messages/*.json` names Supabase as processor | INFO |
| F-10 | Vercel warm-standby decision (repoint to self-hosted or leave on Cloud) | DECISION |

## 11. Rollback and cutover

`SELF_HOSTED_SUPABASE_ROLLBACK.md` (env + Cloud-built image swap via
`scripts/migration/rollback.sh`; Cloud kept alive ≥ 30 days) and
`SELF_HOSTED_SUPABASE_CUTOVER.md` (Phase E table, Phase F checklist,
T-30 … T+30 timeline, smoke list). **Recommendation: do not schedule the
cutover until F-1, F-2 and F-3 are closed and E8/E9 have been run from the
box.**

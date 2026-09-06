# Self-Hosted Supabase Migration — Repository Audit

_Phase A of the migration from Supabase Cloud (project `ufeymdoqksojwyysicun`,
region Singapore) to a self-hosted Supabase stack on the ZimaOS box at
`https://supabase.storage-ptec.online`. Audit date 2026-09-06. Read-only: this
document changed no production behaviour. Companion documents:
`SELF_HOSTED_SUPABASE_CUTOVER.md`, `SELF_HOSTED_SUPABASE_ROLLBACK.md`,
`SELF_HOSTED_SUPABASE_MIGRATION_REPORT.md`, and `infra/supabase/README.md`._

## 0. Headline findings

The application is unusually easy to move, and the migration plan handed to us
was right about the destination but wrong or incomplete in seven places.

**What makes it easy**

- Every Supabase call funnels through four client factories
  (`lib/supabase/{client,server,public}.ts`), plus two inline clients in
  `middleware.ts` and a handful of raw `fetch`es to PostgREST. Nothing else knows
  the hostname.
- **Supabase Storage is not used** (zero `storage.from(` calls). Files live in
  Zima Storage, with legacy Cloudflare R2. **Edge Functions are not used**
  (no `supabase/functions/`, no `functions.invoke`).
- The schema uses **no** `pg_net`, `pg_cron`, `pgsodium`, `vault`, `pgjwt`,
  `pg_graphql`, `supabase_functions`, `storage.*` or `realtime.*` objects. Its
  only cross-schema dependencies are `auth.users` (18 foreign keys, 2 triggers)
  and `extensions.digest()` from pgcrypto.
- Extensions required: `vector` (pgvector, 768-dim HNSW cosine, 5 tables),
  `pg_trgm` (~30 GIN indexes; Khmer has no word boundaries so trigram, not
  FTS, is the search primitive), `pgcrypto`. All ship in the `supabase/postgres`
  image.
- **Realtime is used by exactly one feature**: the comments section under a post
  (`CommentsSection.tsx`) — typing presence, and a `postgres_changes`
  subscription on `post_comments`.

**Where the plan was wrong or incomplete**

| # | Plan assumed | Reality | Consequence |
|---|---|---|---|
| 1 | Swap `NEXT_PUBLIC_SUPABASE_URL` and redeploy | `NEXT_PUBLIC_*` are **compiled into the client bundle** (`Dockerfile` build args, `docker-publish.yml` repository variables). | Cutover requires a **rebuilt image**, not a restart; GitHub repo variables change, not just the box `.env`. |
| 2 | Migrations continue via CI | `migrate.yml` reaches the DB through the Cloud **session pooler** (`SUPABASE_DB_URL`). Self-hosted Postgres must not be Internet-reachable. | Migrations move **onto the box** (pull-based applier, same shape as `deploy/deploy.sh`); `migrate.yml` becomes a no-op in self-hosted mode. |
| 3 | The build is self-contained | `next build` prerenders through `getSiteConfig()` → `createServiceClient()` and reads `site_settings`, the sitemap, robots, ISR pages. | The GitHub runner must reach the **new** Supabase at build time — i.e. the tunnel must be up before the first self-hosted image can be built. |
| 4 | Backups exist via `pg_dump` | Today's "DB backup" is a **PostgREST JSONL** dump (`scripts/backup/backup-db.mjs`); `auth.users` is **not** backed up because PostgREST cannot reach it. | Self-hosting is the first time a real `pg_dump` (auth included) becomes possible. It is the highest-value ops change. |
| 5 | Copy Cloud auth settings | **Google OAuth exists only in the Cloud dashboard** — `supabase/config.toml` has no `[auth.external.google]`. SMTP, templates, rate limits, captcha, MFA are dashboard state too. | Every Auth setting becomes GoTrue env in `infra/supabase/.env` and must be transcribed from the dashboard during preparation; Google Console needs a second redirect URI. |
| 6 | CSP already env-aware | `lib/csp.ts` hardcodes `https://*.supabase.co wss://*.supabase.co`; its env escape hatch fires only for `http://` URLs. `app/sw.ts` matches `hostname.endsWith("supabase.co")`. Neither has a test. | An https self-hosted origin would be **blocked by connect-src** on every page — the single largest cutover risk. Fixed in Phase C. |
| 7 | Sessions survive | The auth cookie is named `sb-<first-hostname-label>-auth-token` by supabase-js. `ufeymdoqksojwyysicun` → `supabase`. | **Every user is signed out once at cutover** regardless of secret reuse. Expected, one-time, communicated. |
| 8 | Email templates are in the repo | `supabase/templates/{confirmation,recovery,magic_link}.html` are **committed as zero-byte files**; the bilingual templates exist only in the Cloud dashboard. Verified on staging: GoTrue sent an email with the Khmer subject and an **empty body**. | Export the three templates from Dashboard → Auth → Email Templates into those files before cutover; `infra/supabase/scripts/preflight.sh` refuses to start with empty templates. |

Two further facts that decide the design:

- `SUPABASE_SERVICE_ROLE_KEY` doubles as the **HMAC secret** for analytics
  session hashes, security-event IP hashes and `unknown:<hmac>` login labels
  (`lib/analytics/events.ts`, `lib/security/sink.ts`, `app/actions/sign-in.ts`).
  Rotating it at cutover re-buckets every analytics series. **Recommendation:
  reuse the Cloud JWT secret (and therefore the same anon/service keys) at
  cutover, and rotate later as its own change.** Supabase exposes the legacy
  JWT secret under Project Settings → API.
- The hosted schema carries **drift** the migration chain does not reproduce
  (dashboard-made columns; see `scripts/migrations/check-schema-drift.mjs` and
  memory of missing `created_at` columns). **Recommendation: restore the
  production schema from `pg_dump`, not by replaying the chain**, then seed the
  CLI history table from the same dump so future migrations continue.

## 1. Architecture

### Current

```
Browser
  ↓ HTTPS
Cloudflare (edge, WAF, cache)  ── Cloudflare Tunnel ──▶  ZimaOS box
                                                          ├── ptec-elibrary (Next.js, :3000, network `web`)
                                                          └── ptec-tunnel (cloudflared)
ptec-elibrary ── HTTPS over the Internet ──▶ Supabase Cloud (Singapore)
                                              ├── PostgreSQL 17.6 (pgvector, pg_trgm, pgcrypto)
                                              ├── GoTrue v2.195.0 (password, Google OAuth, TOTP MFA)
                                              ├── PostgREST v14.17
                                              └── Realtime (comment presence)
ptec-elibrary ── HTTPS ──▶ storage-ptec.online (Zima Storage: PDFs, covers)
GitHub Actions ── session pooler :5432 ──▶ Supabase Cloud (migrations)
GitHub Actions ── HTTPS ──▶ Supabase Cloud (image build prerender)
```

### Target

```
Browser
  ↓ HTTPS
Cloudflare Edge
  ├─ library.ptec.edu.kh ──── Tunnel ──▶ ptec-elibrary (Next.js)
  └─ supabase.storage-ptec.online ── Tunnel ──▶ Kong :8000  ─┬─ GoTrue      (/auth/v1)
                                                              ├─ PostgREST   (/rest/v1)
                                                              ├─ Realtime    (/realtime/v1, ws)
                                                              └─ pg-meta     (/pg, service role only)
                                                                    │
                                                              PostgreSQL 17 (no published port)
ptec-elibrary ── Docker network `ptec-supabase` ──▶ Kong :8000   (SUPABASE_INTERNAL_URL; no Internet hairpin)
ptec-elibrary ── HTTPS ──▶ storage-ptec.online (Zima Storage — unchanged)
Studio ── bound to 127.0.0.1 / LAN only (never through the tunnel)
GitHub Actions ── HTTPS ──▶ supabase.storage-ptec.online (image build prerender)
ZimaOS box ── pull-based ──▶ applies supabase/migrations/ locally (no inbound DB access)
```

Browser traffic to Supabase goes through the public Kong hostname because
`NEXT_PUBLIC_SUPABASE_URL` is shared by the browser bundle and the server. The
server additionally gets `SUPABASE_INTERNAL_URL=http://kong:8000` so that its
own PostgREST/GoTrue calls stay on the box.

## 2. Supabase dependency inventory

| Area | Current implementation | Supabase dependency | Migration action | Risk |
|---|---|---|---|---|
| Browser client | `lib/supabase/client.ts` `createBrowserClient` (anon) | GoTrue, PostgREST, Realtime via `NEXT_PUBLIC_SUPABASE_URL` | New URL/anon key as GitHub repo variables → rebuild image | Med — stale image ships old origin |
| Server clients | `lib/supabase/server.ts` (`createClient`, `createServiceClient`), `public.ts` | PostgREST/GoTrue by URL | Read `SUPABASE_INTERNAL_URL ?? NEXT_PUBLIC_SUPABASE_URL` | Low |
| Middleware | 2 inline `createServerClient` + raw REST fetch for legacy thesis redirect, slug gates | PostgREST/GoTrue | Same helper | Low |
| Email/password login | `app/actions/sign-in.ts` (server-proxied), Turnstile `captchaToken` | GoTrue password grant, captcha verification | `GOTRUE_SECURITY_CAPTCHA_*` with the same Turnstile secret | Med — captcha misconfig = every login fails |
| Signup / verify | `SignupContent.tsx` `signUp` + `resend`, `/auth/callback` `verifyOtp` | GoTrue mailer, SMTP, templates | GoTrue SMTP env (Gmail 465), templates served from `supabase/templates/` | Med |
| Password reset | `resetPasswordForEmail`, `updateUser` | GoTrue mailer | Same | Low |
| Google OAuth | `signInWithOAuth({provider:"google"})` client-side; callback exchanges code | GoTrue external provider, dashboard-only config | `GOTRUE_EXTERNAL_GOOGLE_*`; add `https://supabase.storage-ptec.online/auth/v1/callback` to Google Console | High — must be prepared before cutover |
| MFA (TOTP) | `admin/mfa/{enroll,verify}`, AAL2 gate in `(protected)/layout.tsx` | GoTrue MFA (a paid feature on Cloud, free self-hosted) | `GOTRUE_MFA_TOTP_ENROLL_ENABLED/VERIFY_ENABLED` | Med — see §4.4 secret encryption |
| Sessions / refresh | `getUser()` in middleware, cookie via `@supabase/ssr` | GoTrue refresh tokens in `auth.refresh_tokens` | Restore auth data; cookie name changes → one forced re-login | Low (expected) |
| Admin user mgmt | `auth.admin.listUsers/updateUserById/deleteUser/inviteUserByEmail` | GoTrue admin API (service role) | None (same API) | Low |
| Roles / RBAC | `profiles.role` + `role_permissions`, `is_admin()` SQL helpers | `auth.uid()`, `auth.role()` in RLS | Restore schema; no change | Low |
| Database reads/writes | PostgREST via supabase-js; 31 RPC functions | PostgREST + Postgres | Restore schema/data; PostgREST v14.17 same as Cloud | Low |
| Vector search | `match_library`, `match_book_chunks`, `match_record_chunks`, 5 HNSW indexes | pgvector | Ships in image; create extension in the **same schema** as Cloud before restore | Med — wrong schema breaks the dump |
| Fuzzy / native search | `search_library_fuzzy`, `find_book_duplicate_candidates`, ~30 trgm indexes | pg_trgm | Ships in image | Low |
| Staleness view | `public_resource_index_health` uses `extensions.digest()` | pgcrypto in `extensions` | Pre-installed in image | Low |
| Realtime | `CommentsSection.tsx` presence + `postgres_changes` on `post_comments` | Realtime + `supabase_realtime` publication | Include Realtime; copy publication membership from Cloud | Low — feature degrades gracefully |
| Storage references | `book_files.file_url` on Zima/R2; `lib/zima.ts` allow-list includes `.supabase.co` (legacy) | None functional | Keep; verify no rows reference Supabase Storage (`verify-db`) | Low |
| PWA / SW | `app/sw.ts` rule 8 caches anon `/rest/v1/{public tables}` from `*.supabase.co` | Hostname literal | Env-aware host match (Phase C) | Low — perf only |
| CSP | `lib/csp.ts` `connect-src`/`img-src` literals | Hostname literal | Derive origin + `wss://` from env, keep legacy during migration | **High** |
| `/api/health` | HEAD `/rest/v1/categories` (anon), Zima HEAD; deep: `ops_events` backup age | PostgREST | Add `/auth/v1/health` probe; use internal URL | Low |
| Image build | `getSiteConfig()` service-role read at prerender; sitemap/robots/ISR | PostgREST reachable from GitHub runner | Tunnel must be live before build; GitHub secret/vars repointed | Med |
| Migrations | `migrate.yml` → `supabase db push --db-url <pooler>` | Public Postgres endpoint | Box-side applier (`infra/supabase/scripts/migrate.sh`); workflow no-op when secret absent | Med |
| Backups | PostgREST JSONL nightly (`ptec-db-backup.timer`), no auth.users | Service key | Add `pg_dump -Fc` nightly incl. `auth`; keep JSONL for restore-drill + heartbeat | Low |
| Monitoring | UptimeRobot + `uptime.yml` probe `/api/health`; Telegram | Indirect | Add box-side monitor for containers/RAM/disk/DB/auth | Low |
| Scheduled jobs | `cron.yml` → `/api/cron/*` with `CRON_SECRET` | None | Unchanged | — |
| Scripts | `scripts/*.ts` (service key), `scripts/backup/*.mjs`, `scripts/ops/*.mjs` | URL + service key | Unchanged; run with the new URL | Low |
| E2E | `e2e/utils/auth.ts` derives cookie `sb-<label>-auth-token` from URL | Convention | Correct by construction (`supabase`) | Low |
| Privacy copy | `messages/*.json` name Supabase as processor | Disclosure | Update after cutover (content change, not code) | Low |

## 3. Database audit (from the 87-file chain + seed + config)

- **Extensions**: `pg_trgm` and `vector` created without schema in the baseline
  (→ `public` on a fresh apply; on Cloud they may live in `extensions` —
  `scripts/migration/dump-cloud.sh` records the real schema and
  `restore-selfhosted.sh` recreates them there). `pgcrypto WITH SCHEMA
  extensions` (0134). `gen_random_uuid()` is core Postgres.
- **Schemas referenced**: `public`, `auth` (uid(), role(), `auth.users` FKs, two
  triggers: `on_auth_user_created` → `handle_new_user()`,
  `trg_block_reserved_domain_signup` → `block_reserved_domain_signup()` which is
  granted to `supabase_auth_admin`), `extensions`. Nothing else.
- **Roles**: no `CREATE ROLE`. Grants to `anon`/`authenticated`/`service_role`
  (0117 is the explicit public-read grant set), one grant to
  `supabase_auth_admin`. All standard in the image.
- **Functions**: ~78 in `public` (52 SECURITY DEFINER); service-role-only ones
  keep `REVOKE` statements. **Triggers**: 47 (45 on public tables, 2 on
  `auth.users` — these are dumped with the `auth` schema, so the dump script
  extracts them separately). **Views**: 12, `security_invoker` except
  `research_report_rankings`. **RLS**: 106 tables enabled, 170 policies; only
  `rate_limit` relies on REVOKE alone.
- **Vector**: five `vector(768)` columns, five HNSW `vector_cosine_ops` indexes,
  four functions using `<=>`. A redundant ivfflat index from archived 0051 may
  still exist on Cloud and will come along in the dump (harmless).
- **Realtime**: no migration adds a table to `supabase_realtime`. The
  `postgres_changes` subscription on `post_comments` is therefore only live if
  it was added by hand; the dump script captures `pg_publication_tables` so the
  self-hosted stack reproduces whatever Cloud has.
- **Cloud-specific**: `graphql_public` in PostgREST schemas (unused → dropped),
  `supabase_migrations.schema_migrations` (kept — the box applier writes to it).
- **Versions seen on the linked project** (`supabase/.temp`): Postgres
  `17.6.1.121`, GoTrue `v2.195.0`, PostgREST `v14.17`. The stack pins GoTrue
  and PostgREST to exactly these so the restored `auth` data matches GoTrue's
  own migrations.

## 4. Auth findings that need a decision

1. **JWT secret**: reuse Cloud's legacy HS256 secret at cutover (same anon and
   service-role keys → no rebuild of GitHub variables for keys, analytics hash
   continuity, restored refresh tokens stay valid). Rotate afterwards with
   `scripts/ops/rotate-secret.mjs` as a separate change. Alternative (fresh
   secret) is supported by `infra/supabase/scripts/generate-secrets.sh`.
2. **Cookie name** changes to `sb-supabase-auth-token` → one forced sign-in.
   Pinning the old name via `cookieOptions.name` was considered and rejected
   (bakes a Cloud project ref into code).
3. **Google OAuth**: Google Cloud Console → Credentials → the web client must
   list **both** `https://ufeymdoqksojwyysicun.supabase.co/auth/v1/callback`
   (rollback) and `https://supabase.storage-ptec.online/auth/v1/callback`
   (target) as authorised redirect URIs. Authorised JavaScript origins:
   `https://library.ptec.edu.kh`. GoTrue env: `GOTRUE_EXTERNAL_GOOGLE_ENABLED`,
   `_CLIENT_ID`, `_SECRET`, `_REDIRECT_URI`.
4. **MFA secrets at rest**: newer GoTrue can encrypt `auth.mfa_factors.secret`
   with a server-held key. `verify-db.sh` reports whether secrets look like
   plaintext base32 or JSON ciphertext; if encrypted, admins re-enrol TOTP after
   cutover (documented in the cutover runbook).
5. **Error-message coupling**: `classifyAuthError()` string-matches GoTrue
   messages; pinning GoTrue to the Cloud version removes the drift risk.

## 5. Files that change (Phase C, minimal)

| File | Why |
|---|---|
| `lib/supabase/origin.ts` (new) | One pure place that derives the Supabase origin, its `ws(s)://` twin, and the server-side URL (`SUPABASE_INTERNAL_URL` override). |
| `lib/csp.ts` | `connect-src`/`img-src` include the configured origin (any scheme) + websocket; legacy `*.supabase.co` kept until post-cutover cleanup. |
| `app/sw.ts`, `lib/sw-policy.ts` | Host match for the public-REST cache derived from env, legacy suffix fallback, never throws. |
| `lib/supabase/server.ts`, `public.ts`, `middleware.ts`, `app/api/health/route.ts`, `lib/rate-limit.ts`, `lib/security/{sink,incidents,notify/telegram}.ts`, `lib/chunk-embed.ts`, `lib/pdf-page-index.ts`, `app/api/contact/route.ts` | Server-side callers use the internal URL when configured. |
| `app/api/health/route.ts` | `auth` probe (`/auth/v1/health`). |
| `.env.example`, `docker-compose.selfhost.yml` (new), `deploy/deploy.sh` | Document the new variables; join the Supabase network; apply migrations before a deploy in self-hosted mode. |
| `.github/workflows/migrate.yml` | Self-hosted mode: no `SUPABASE_DB_URL` → explain and exit 0 instead of failing. |

Not changed on purpose: `next.config.ts` `images.remotePatterns` and
`lib/zima.ts` (`.supabase.co` entries are dead Supabase Storage references —
cleanup after `verify-db` confirms no `file_url` points there),
`lib/indexing/environment.ts` (already prints the bare host), `messages/*.json`.

## 6. Infrastructure components — required vs excluded

| Component | Verdict | Evidence |
|---|---|---|
| PostgreSQL 17 (`supabase/postgres`) | Required | everything |
| GoTrue | Required | auth flows, admin API |
| PostgREST | Required | all data access |
| Kong | Required (API gateway, key-auth, CORS, single tunnel target) | — |
| Realtime | **Required** | `CommentsSection.tsx` presence; kept as a service, not a profile |
| pg-meta + Studio | Required by the plan; LAN-only | operator convenience; Studio never routed through Kong |
| Supabase Storage + imgproxy | **Excluded** | zero `storage.from(`; files on Zima |
| Edge Functions | **Excluded** | no functions directory, no `invoke` |
| Logflare / Vector analytics | **Excluded** | memory budget; Studio logs page degrades |
| Supavisor pooler | **Excluded** | app connects via PostgREST only; PostgREST holds its own pool |
| Mail template server (busybox httpd) | Added | GoTrue loads templates by URL; serves `supabase/templates/*.html` internally |
| cloudflared | Required (own token, `--profile tunnel`) | public hostname → `http://kong:8000` |

## 7. What could break at cutover (ranked)

0. Blank auth emails — the templates in the repo are empty (finding 8); preflight now blocks on it.
1. CSP blocks the new origin (fixed in Phase C; verified by unit test + browser).
2. Image built against the old URL still cached on the box (`deploy.sh` pulls
   by digest; cutover checklist verifies `NEXT_PUBLIC_SUPABASE_URL` inside the
   running bundle).
3. Google OAuth redirect URI not yet authorised → OAuth 400 (prepare first).
4. Captcha secret mismatch → every password login fails with a captcha error.
5. Extensions created in the wrong schema → schema restore fails on the first
   `vector(768)` column (dump script records; restore script honours).
6. GoTrue version older than Cloud → `auth` data restore fails on unknown
   columns (pinned to `v2.195.0`).
7. SMTP: Gmail App Password must be copied into GoTrue env or auth emails stop
   silently.
8. Cloudflare: WebSockets must be enabled on the zone (default on) for Realtime.
9. `index-reconcile` cron greps for `skippedEnvironment` — unaffected because
   Zima hosts do not change.

## 8. Automation boundary

**Automated safely** (scripts, idempotent, non-destructive): secret generation,
preflight, dumping Cloud, restoring into an **empty** self-hosted database
(refuses a non-empty one without `--force`), verification snapshots and diffs,
auth/API smoke tests, benchmarks, nightly backups, restore tests, monitoring,
box-side migration apply, rollback of the app's env.

**Manual production operations** (human, in a window): creating the tunnel
hostname, transcribing Auth settings from the dashboard, Google Console
changes, changing GitHub variables/secrets, publishing the image, editing the
box `.env`, the T-0 final dump/restore, and the decision to cut over or roll
back.

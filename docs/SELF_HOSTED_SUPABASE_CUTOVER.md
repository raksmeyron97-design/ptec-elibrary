# Self-Hosted Supabase — Production Cutover Runbook

_The controlled move of `library.ptec.edu.kh` from Supabase Cloud to the
self-hosted stack in `infra/supabase/`. Read the audit first
(`SELF_HOSTED_SUPABASE_MIGRATION_AUDIT.md`); keep the rollback runbook open
(`SELF_HOSTED_SUPABASE_ROLLBACK.md`). Every command is run by a human; nothing
here is triggered from a coding environment or from CI._

**Decisions this runbook assumes** (change them consciously, not by accident):

1. The Cloud **JWT secret** is reused (`generate-secrets.sh --jwt-secret …`), so
   restored refresh tokens stay valid and analytics HMACs stay continuous. The
   **API keys are not**: Cloud issues `sb_publishable_…` / `sb_secret_…` keys
   that its own gateway maps to roles, while the self-hosted Kong matches the
   `apikey` header against the JWT-format `ANON_KEY` / `SERVICE_ROLE_KEY` in
   `infra/supabase/.env` and PostgREST needs a JWT in the Bearer header.
   Verified 2026-09-06 with read-only count queries: the `sb_*` keys answer
   401 on the self-hosted stack and the generated JWTs answer 401 on Cloud. So
   at cutover the app's anon and service keys switch to the stack's JWT pair —
   `deploy/cutover-selfhost-env.sh` copies them from the stack's own env on the
   box — and the GitHub **variable** `NEXT_PUBLIC_SUPABASE_ANON_KEY` plus the
   **secret** `SUPABASE_SERVICE_ROLE_KEY` carry the same pair when the image is
   built. Rollback restores the `sb_*` keys with the Cloud URL (`.env.cloud`).
2. The production schema comes from **`pg_dump` of Cloud**, not from replaying
   the migration chain (hosted drift). The CLI history table travels with it,
   so `infra/supabase/scripts/migrate.sh` continues from the same point.
3. The Cloud project is **kept alive, untouched, for at least 30 days** after
   cutover. It is the rollback target.
4. Every user signs in once more after cutover (cookie name changes from
   `sb-<ref>-auth-token` to `sb-supabase-auth-token`). Announce it.

## Phase E — staging validation (done before any production date is set)

| Step | Command / action | Pass criterion |
|---|---|---|
| E1 | Stack up on the box with `SUPABASE_PUBLIC_URL=http://127.0.0.1:8000`, no tunnel, `docker-compose.dev.yml` (Mailpit) | `infra/supabase/scripts/healthcheck.sh` → STACK HEALTHY |
| E2 | `scripts/migration/preflight.sh` against Cloud | PASS; note extension schemas, MFA-secret verdict, publication tables, GoTrue version ≤ v2.195.0 |
| E3 | `scripts/migration/dump-cloud.sh` (read-only) | manifest row counts match the dashboard's; directory chmod 700 |
| E4 | `scripts/migration/restore-selfhosted.sh reports/migration/dump-<ts>` | finishes; row counts equal the manifest |
| E5 | `verify-db.sh --cloud`, `--selfhosted`, `--compare` | report says PASS (sequence values excluded). Expected residue: the two `public_resource_*_health` views' definition text re-serialises differently after a restore (same SQL, different pretty-print) — verify by eye, not a defect |
| E6 | `verify-auth.sh` with `TEST_EMAIL/TEST_PASSWORD` of a throwaway account (captcha disabled on staging) | PASS incl. refresh + logout |
| E7 | App image built with `NEXT_PUBLIC_SUPABASE_URL=http://<box-lan-ip>:8000` (or the `dev` server on a laptop pointed at the box), `.env` with `SUPABASE_INTERNAL_URL` | `verify-api.sh` PASS; browser: login, Google OAuth (needs a real https hostname — do on E8), MFA verify, PDF reader, upload, download-restricted book, admin, comments presence, offline shell |
| E8 | Tunnel hostname live (`supabase.storage-ptec.online` → `http://kong:8000`), `SUPABASE_PUBLIC_URL` switched to it, GoTrue restarted, Google redirect URI added | `verify-auth.sh` through the public URL PASS; Google sign-in round-trips on a staging app hostname |
| E9 | `benchmark.mjs --label cloud-baseline` (production today) and `--label selfhosted-staging` | numbers recorded in the report; no probe regresses by more than 2× |
| E10 | `backup-db.sh` then `restore-test.sh` | RESTORE TEST PASS; `ops_events` shows `backup_db ok` |
| E11 | Kill and restart the stack (`docker compose down && up -d`) | health returns; data intact; `db-config` volume preserved |

Any FAIL blocks scheduling. Record results in
`SELF_HOSTED_SUPABASE_MIGRATION_REPORT.md`.

## Phase F — readiness checklist

Mark each PASS / WARN / BLOCKER. **Any BLOCKER = no cutover.**

- [ ] E1–E11 PASS, with dates
- [ ] Google Cloud Console lists BOTH redirect URIs (Cloud and self-hosted)
- [ ] GoTrue env transcribed from the Cloud dashboard: SMTP (Gmail App
      Password), rate limits, OTP expiry, password policy, leaked-password
      check, captcha secret, MFA
- [ ] **Email templates exported** from Dashboard → Authentication → Email
      Templates into `supabase/templates/{confirmation,recovery,magic_link}.html`
      (the files in the repo are EMPTY today — staging sent blank emails), then
      committed; `preflight.sh` fails on an empty template. Verify on staging
      with `docker-compose.dev.yml` (Mailpit at 127.0.0.1:8025): the recovery
      mail must carry a link of the shape
      `<SUPABASE_PUBLIC_URL>/auth/v1/verify?token=…&type=recovery&redirect_to=…`
- [ ] `ADDITIONAL_REDIRECT_URLS` contains `https://library.ptec.edu.kh/**` (and
      the Vercel standby hostname if it must keep working)
- [ ] Cloudflare: WebSockets on; no Access policy on the Supabase hostname;
      cache bypass for it (API responses must never be edge-cached)
- [ ] GitHub: new values ready but NOT yet applied — `NEXT_PUBLIC_SUPABASE_URL`
      and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (variables), `SUPABASE_SERVICE_ROLE_KEY`
      (secret): the stack's JWT keys, per decision 1
- [ ] `deploy/cutover-selfhost-env.sh --dry-run` on the box shows the expected
      five-line diff and names the running image's `sha-` tag for `.env.cloud`
- [ ] `infra/supabase/.env` chmod 600; `preflight.sh` PASS with the production
      values (https public URL, captcha on, Google on)
- [ ] Backups timer enabled and one manual `backup-db.sh` succeeded on the box
- [ ] Vercel warm standby: decide — repoint its env to the new Supabase too
      (keeps failover coherent) or leave on Cloud (then it is a rollback path,
      not a standby). Write the decision down.
- [ ] Announcement drafted: "sign in again after <time>"
- [ ] Rollback rehearsed once on staging (`scripts/migration/rollback.sh --dry-run`)
- [ ] Two people available for the window; the professor's DNS is NOT touched

## Phase G — cutover timeline

Choose a low-traffic window (early morning, Phnom Penh). "T" is the moment the
new image goes live.

**T-30 — freeze and final dump**
1. Pause writers: in the Supabase dashboard set Auth → *Disable new signups*
   temporarily; ask staff to stop editing (announcement). Readers keep reading.
2. `scripts/migration/dump-cloud.sh` → `reports/migration/dump-<T>`.
   Verify `manifest.txt` counts against yesterday's staging numbers.

**T-20 — restore**
3. On the box, stack up with production `infra/supabase/.env` (public URL =
   tunnel hostname; tunnel profile on): `docker compose --profile tunnel up -d`,
   `healthcheck.sh`.
4. `scripts/migration/restore-selfhosted.sh reports/migration/dump-<T> --force`
   (the staging data from Phase E is what `--force` clears; type the container
   name when asked — `--yes` exists for scripted rehearsals only). The dump's
   `CREATE SCHEMA public` line is neutralised by the scripts; `session_replication_role
   = replica` makes FK order and the circular `security_incidents` constraint
   irrelevant during data load.
5. `verify-db.sh --selfhosted && verify-db.sh --compare` → PASS.
6. `verify-auth.sh` through `https://supabase.storage-ptec.online` → PASS.

**T-10 — configuration**
7. GitHub → Settings. Variables: `NEXT_PUBLIC_SUPABASE_URL=https://supabase.storage-ptec.online`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY=<stack ANON_KEY (JWT)>`. Secrets:
   `SUPABASE_SERVICE_ROLE_KEY=<stack SERVICE_ROLE_KEY (JWT)>` (the image build
   prerenders with it), and the secret copies of `NEXT_PUBLIC_SUPABASE_URL` /
   `NEXT_PUBLIC_SUPABASE_ANON_KEY` that `check-file-health.yml` reads. Remove
   the `SUPABASE_DB_URL` secret (migrate.yml switches to self-hosted mode).
   Keep every Cloud value written down in the password manager.
8. Box: `sudo ./deploy/cutover-selfhost-env.sh --dry-run`, read the diff, then
   `sudo ./deploy/cutover-selfhost-env.sh`. It writes `.env.cloud` first
   (pinned to the running image's `sha-` tag), then changes exactly five
   keys in `.env` — URL, `SUPABASE_INTERNAL_URL`, `COMPOSE_FILE`, and the two
   API keys read from `infra/supabase/.env` after a live check that the stack
   accepts them. Do **not** `compose up` yet.

**T-5 — build**
9. Merge/push the release commit (or `workflow_dispatch` Docker Publish). The
   build prerenders against the NEW Supabase through the tunnel — if the
   tunnel is down the build fails here, safely, before anything changes.
10. Wait for the image digest in the workflow summary.

**T-0 — go live**
11. Box: `sudo ./deploy/deploy.sh --force`. deploy.sh runs
    `infra/supabase/scripts/migrate.sh` (should report "schema is current" —
    the history table came with the dump), then rolls the image.
12. `docker exec ptec-elibrary env | grep SUPABASE` shows the internal URL;
    `curl -s http://127.0.0.1:3000/api/health` → `"db":"ok","auth":"ok"`.

**T+5 — smoke tests** (`scripts/migration/verify-api.sh` first, then a human)
- [ ] Home `/`, `/km` — content renders, counts match
- [ ] `/books`, `/theses`, `/publications` — lists and filters
- [ ] Login with password (captcha) — succeeds, session persists on reload
- [ ] Google OAuth — round-trips to `/auth/callback`
- [ ] Admin login → MFA verify → `/admin` dashboard loads
- [ ] Search `/search?q=…` English and Khmer; "found inside" hits
- [ ] AI search / Ask — deterministic answer and a model answer
- [ ] Book detail → PDF reader streams; range requests OK
- [ ] Upload a small PDF in `/admin/books/upload` (delete it after)
- [ ] A `read online only` book refuses `/download` with the audited 403
- [ ] Comments on a post: typing presence shows for a second browser
- [ ] `/dashboard` (reader) and `/profile`
- [ ] `/api/health` 200; deep probe shows latencies and `backupAgeHours`
- [ ] Service worker installs; offline shell served with network off
13. Re-enable signups in GoTrue if they were paused (they are enabled by env —
    the pause was on Cloud, which no longer matters).

**T+30 — observe**
- UptimeRobot green; `uptime.yml` green; Telegram quiet
- `docker stats` — no container near its limit; `db` under 1 GB
- `monitor.sh --fast` twice
- `benchmark.mjs --label selfhosted-prod` and compare with `cloud-baseline`
- Next morning: `backup_db ok` in `ops_events`; the JSONL backup timer also ok

**T+1 day … T+30 days**
- Keep Cloud alive and unchanged. Do not delete it.
- After 7 clean days: remove the Cloud redirect URI from Google Console,
  delete `.env.cloud` from the box (keep the password-manager copy), drop the
  `*.supabase.co` literals from `lib/csp.ts`, `next.config.ts` and `lib/zima.ts`
  (after `verify-db` confirmed no `file_url` on Supabase Storage), and update
  the privacy copy in `messages/*.json`.
- After 30 days: pause the Cloud project (pausing keeps a restorable copy;
  deletion is a separate, deliberate decision).

## Performance measurement

Run `node scripts/migration/benchmark.mjs --label cloud-baseline` **before**
T-30 from the box (and once from a laptop), and `--label selfhosted-prod`
at T+30 from the same places. Report all of: `supabase.rest` p50/p95 (gateway
+ DB), `app.health.db` (app → DB from inside the container — the number the
migration was meant to improve), `app.ttfb.*`, `app.api.search*`. A claim of
"faster" needs those two files side by side; nothing else counts.

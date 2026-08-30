# Secret Registry

_Created 2026-08-29 (RUNBOOKS.md §M16 companion). One row per credential:
what it is for, **every** place it lives, cadence, and what rotating it
breaks. Values never appear here — names and locations only (same contract
as `backup-config.mjs`, which fingerprints names + SHA-256 of values).
Rotation procedures are executable: `node scripts/ops/rotate-secret.mjs
<NAME>` prints the ordered, per-location commands and generates the new
value where generation is ours._

Location key: **GH-S** GitHub Actions secret · **GH-V** GitHub repo variable
· **Box** `/DATA/AppData/ptec-elibrary/app/.env` · **VC** Vercel env
(warm standby) · **SB** Supabase dashboard · **CF** Cloudflare dashboard ·
**PM** password manager. Cadence: **12 mo** = rotate at 12-month age, plus
always on suspected exposure (§I10) or offboarding of anyone who held it
(§M17).

## Server secrets

| Secret | Purpose | Locations | Cadence | Rotation impact |
|---|---|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | RLS-bypassing server client; image build prerendering | SB (issuer) · GH-S · Box · VC | 12 mo | Miss a location → failed builds or 500s on service-role paths; republish image required |
| `SUPABASE_DB_URL` | `migrate.yml` applies migrations (session pooler) | GH-S | With DB password | Migrations stop applying until updated |
| `CRON_SECRET` | Bearer auth for `/api/cron/*` | GH-S · Box | 12 mo | Sweeps 401 while the two copies disagree — one sitting |
| `ADMIN_SECRET_KEY` | Server-side admin signing/step-up | Box · VC | 12 mo | None user-visible if applied promptly |
| `ZIMA_API_KEY` | Primary file storage API | Zima admin (issuer) · Box · VC | 12 mo | Uploads + proxied downloads fail while stale |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | Legacy R2 presigned GETs | CF (issuer) · Box · VC | 12 mo | Legacy-file downloads only |
| `GEMINI_API_KEY` | AI search/assistant (server-only) | Google AI Studio (issuer) · Box · VC | 12 mo | AI features degrade to deterministic answers |
| `VIRUSTOTAL_API_KEY` | Upload hash-reputation check | VT (issuer) · Box · VC | 12 mo | Scan skips (fails open unless `FAIL_CLOSED_VIRUS_SCAN=true`) |
| `TURNSTILE_SECRET_KEY` | CAPTCHA verification | CF (issuer) · Box · VC | 12 mo | Contact form blocked while stale |
| `TELEGRAM_BOT_TOKEN` (+ `TELEGRAM_CHAT_ID`) | Contact-form delivery + Sev 1/2 alert channel | BotFather (issuer) · Box · GH-S · VC | 12 mo | **Alerting goes quiet while stale** — verify with `alert-telegram.mjs --test` |
| `SMTP_PASS` (Gmail App Password) | Supabase auth emails | Google (issuer) · **SB Auth→SMTP** · Box | 12 mo | Auth emails silently stop; the SB SMTP screen is the forgotten location |
| `VAPID_PRIVATE_KEY` (pair w/ public) | Web push signing | Box · VC (public half also GH-V, baked into image) | On compromise only | **Invalidates every push subscription** — announce first |
| `TUNNEL_TOKEN` | cloudflared → Cloudflare | CF Zero Trust (issuer) · Box | On compromise | Site unreachable during a stale window |
| `BACKUP_PASSPHRASE` | AES-256-GCM for DB/file backups | Box · PM · break-glass envelope | 12 mo | Old archives need the retired passphrase until they age out — retire, never delete |
| GHCR pull PAT (`read:packages`) | Box pulls images | GitHub (issuer) · Box `.docker` config | 12 mo (expiry) | Deploy timer silently stops installing new images on expiry |
| `CANONICAL_HOST_REDIRECT`, `STORAGE_BACKUP_*`, `SEO_INDEXING`, … | Config, not credentials | Box | n/a | Not secrets; listed to say so |

## Public values (not secrets, but rotation-coupled)

`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_ROOT_DOMAIN`,
`NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`,
`NEXT_PUBLIC_R2_PUBLIC_URL`, `NEXT_PUBLIC_R2_COVERS_URL` — GH-V + Box + VC.
Served to every browser by design, but **baked into the image at build
time**: changing any of them requires republishing the image, not restarting
the container.

## Rules

1. **Order is always**: new value everywhere → verify each consumer → revoke
   old **last**. Never revoke first (`rotate-secret.mjs` encodes this).
2. **One sitting per secret** — a half-rotated multi-location secret is an
   outage with a confusing signature.
3. Age > 12 months is a §M4 quarterly-review finding; record every rotation
   below.
4. New secret in the codebase ⇒ new row here + (if multi-location or
   generatable) an entry in `rotate-secret.mjs`, in the same PR.

## Rotation log

| Date | Secret | Reason (age / exposure / offboarding) | By |
|---|---|---|---|
| 2026-08-29 | — | Registry created; ages before this date unknown — treat every secret as due at the next §M4 review unless a later row says otherwise | WL |

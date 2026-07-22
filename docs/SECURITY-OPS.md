# PTEC e-Library — Security Operations Runbook

Operational security tasks that live **outside the codebase** (Supabase Dashboard,
Vercel, storage hosts). Companion to `SECURITY.md` (architecture, in Khmer).

Last reviewed: 2026-07-07.

---

## 1. Supabase Auth hardening (one-time dashboard steps)

These settings cannot be set from code — they must be enabled in the
**hosted** Supabase project (Dashboard → Authentication):

- [ ] **Leaked-password protection** — Authentication → Passwords →
      "Prevent use of leaked passwords" (HaveIBeenPwned check; requires Pro plan).
- [ ] **Password strength** — set minimum length **8** and require
      **letters + digits**, mirroring `supabase/config.toml`
      (`minimum_password_length = 8`, `password_requirements = "letters_digits"`).
      Local dev and production must match or passwords accepted locally will fail
      in production (or vice versa).
- [ ] **Secure password change** — require recent login to change password
      (mirrors `secure_password_change = true` in config.toml).
- [ ] **Turnstile CAPTCHA** — Authentication → Attack protection → confirm the
      Turnstile secret is set (this is what rate-limits and bot-protects
      login/signup server-side).
- [ ] **OAuth redirect allowlist** — Authentication → URL Configuration:
      Site URL `https://library.ptec.edu.kh`, and only known redirect URLs
      (production domain + `http://localhost:3000` for dev). No wildcards.
- [ ] **Before-user-created enforcement** — apply migration
      `0068_reserved_domain_signup_guard.sql` (see below), which enforces the
      reserved-admin-domain rule at the database layer instead of trusting the
      client to call `verifySignup()`.

## 2. Security monitoring & alerting

The app emits structured security events (`lib/security-log.ts`) as single
JSON lines on stderr/warn:

```json
{"evt":"security","ts":"…","type":"auth_forbidden","where":"requireAdmin","userId":"…"}
```

Event types: `auth_forbidden`, `mfa_required`, `rate_limited`, `captcha_failed`,
`cron_auth_failed`, `upload_rejected`, `suspicious_input`.

Setup (pick one):

1. **Vercel Log Drain** (Team settings → Log Drains) → Logtail / Datadog /
   Axiom. Filter on `evt:"security"`.
2. **Sentry** — add `@sentry/nextjs` for error monitoring; keep security events
   in the log drain (Sentry is for exceptions, not audit trails).

Recommended alerts:

| Condition | Why |
|---|---|
| > 10 `auth_forbidden` from one `userId` per hour | account probing for admin endpoints |
| any `cron_auth_failed` | someone is guessing `CRON_SECRET` |
| > 20 `captcha_failed` per hour | bot campaign against the contact form |
| any `upload_rejected` with "path traversal" | active attack from an admin account |

The `admin_audit_log` table is the durable audit trail for admin actions
(including `push_broadcast`); review it monthly at `/admin/logs`.

## 3. Backups

What must survive a disaster:

| Data | Where it lives | Backup mechanism |
|---|---|---|
| Database (books, users, notes, progress, reviews, audit log) | Supabase Postgres | Supabase daily backups (Pro). Verify: Dashboard → Database → Backups. Consider PITR if budget allows. |
| Book/thesis PDFs + covers | Zima Storage (`storage-ptec.online`) | **Zima is self-hosted — Supabase/Vercel do NOT back it up.** Schedule a nightly `rsync`/restic snapshot of its data directory to a second location (external disk or R2 bucket). This is the single biggest DR gap. |
| Legacy PDFs/covers | Cloudflare R2 | Enable object versioning on both buckets. |
| User avatars | Vercel Blob / Zima `avatars/` | Covered by the Zima snapshot; Blob is redundant (avatars are re-uploadable). |
| Env secrets | Vercel project settings | Keep an encrypted offline copy (e.g. in a password manager) of all production env vars. |

Retention policy suggestion: 7 daily + 4 weekly + 6 monthly snapshots.

## 4. Restore drill (run once per semester)

- [ ] Restore the latest Supabase backup into a **new** throwaway project.
- [ ] Point a local `.env` at it and run `npm run dev`; confirm books list,
      one book detail page, and login work.
- [ ] Pick 3 random PDFs from the Zima snapshot and open them.
- [ ] Time the whole exercise — that is your real RTO.
- [ ] Write down what failed and fix the runbook.

## 5. Disaster recovery steps (if production is lost)

1. Create a new Supabase project; restore the newest DB backup.
2. Stand up Zima Storage from the latest snapshot (or repoint `ZIMA_API_URL`
   at a restored host).
3. In Vercel: restore env vars from the offline copy; update
   `NEXT_PUBLIC_SUPABASE_URL` / keys to the new project.
4. Redeploy `main`. Update Supabase Auth URL configuration (step 1) for the
   domain.
5. Re-run the manual test checklist (public reading, login, admin MFA).

## 6. CI security gates

`.github/workflows/ci.yml` runs typecheck, lint, unit + e2e tests, plus:

- `node scripts/audit-gate.mjs` — audits production dependencies and **fails on
  high/critical advisories that have an actionable fix**, i.e. ones `npm audit
  fix` can resolve without a semver-major dependency change. High/critical
  advisories whose only remedy is a semver-major bump, or that have no
  published fix, are printed prominently with their advisory URLs but do not
  block the build.

  This replaced a bare `npm audit --omit=dev --audit-level=high` on
  2026-07-22, after newly-published `sharp`/libvips CVEs
  ([GHSA-f88m-g3jw-g9cj](https://github.com/advisories/GHSA-f88m-g3jw-g9cj))
  reachable only through `next` blocked every pull request in the repository.
  npm's proposed "fix" was downgrading Next 16 → 9.3.3, so the gate was
  stopping all work without making anything safer.

  The gate needs no allowlist and nothing to revert: as soon as upstream ships
  a real fix, npm reports it as actionable and the advisory starts failing CI
  again. **When a warning appears here, check it at the next dependency bump** —
  a warning means "no fix exists yet", never "ignore this".
- **gitleaks** — scans the full git history for committed secrets on every push.
- **dependency-review** — on PRs, flags newly-introduced vulnerable packages.

If gitleaks ever fires on a real secret: rotate the secret first, then rewrite
history — rotation is the fix, deletion is cosmetic.

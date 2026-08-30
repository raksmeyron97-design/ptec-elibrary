# PTEC e-Library — Security Operations Runbook

Operational security tasks that live **outside the codebase** (Supabase Dashboard,
Vercel, storage hosts). Companion to `SECURITY.md` (architecture, in Khmer).

Last reviewed: 2026-08-29. (§3–§5's backup sketch is superseded by
`BACKUP-DR.md`; monitoring delivery now runs through Telegram —
`ALERT-CATALOG.md` §Delivery channels.)

---

## 1. Supabase Auth hardening (one-time dashboard steps)

These settings cannot be set from code — they must be enabled in the
**hosted** Supabase project (Dashboard → Authentication). Repo state cannot
prove dashboard state, so each row carries a **Verified on / by** cell:
fill it when you check the live setting (and re-verify at the §M4 quarterly
review — the RUNBOOKS.md §M4 checklist points here). An empty cell means
*unverified*, not *off*.

| Setting | Where / target state | Verified on / by |
|---|---|---|
| **Leaked-password protection** | Authentication → Passwords → "Prevent use of leaked passwords" (HaveIBeenPwned; requires Pro plan — if on the free plan, record "n/a (plan)" here) | |
| **Password strength** | Minimum length **8**, require **letters + digits** — must mirror `supabase/config.toml` (`minimum_password_length = 8`, `password_requirements = "letters_digits"`) or passwords accepted locally fail in production | |
| **Secure password change** | Require recent login to change password (mirrors `secure_password_change = true`) | |
| **Turnstile CAPTCHA** | Authentication → Attack protection → Turnstile secret set (server-side bot protection for login/signup) | |
| **OAuth redirect allowlist** | URL Configuration: Site URL `https://library.ptec.edu.kh`; only known redirect URLs (production + `http://localhost:3000` for dev); no wildcards | |
| **Before-user-created enforcement** | Migration `0068_reserved_domain_signup_guard.sql` — in the applied chain (CI-applied; confirm via `supabase migration list`), enforcing the reserved-admin-domain rule at the DB layer | applied via migration chain |

## 2. Security monitoring & alerting

The app emits structured security events (`lib/security-log.ts`) as single
JSON lines on stderr/warn:

```json
{"evt":"security","ts":"…","type":"auth_forbidden","where":"requireAdmin","userId":"…"}
```

Event types: the full current list is the `SecurityEventType` union in
`lib/security-log.ts` (includes `virus_scan_blocked` / `virus_scan_error` /
`virus_scan_skipped`, `rate_limiter_degraded`, `lockdown_blocked`,
`security_spike`, …).

**Delivery, as configured (2026-08-29)**: active Sev 1/2 alerting runs
through Telegram (`ALERT-CATALOG.md` §Delivery channels — workflow failure
steps + `scripts/ops/alert-telegram.mjs`), with UptimeRobot as the external
probe monitor and GitHub failure email as backstop. Log-*filter* alerts
(the table below) still need a log sink; until one is chosen, the weekly
review greps `docker logs ptec-elibrary` for `evt:"security"` (§M2).
Optional upgrades, pick one:

1. **Vercel Log Drain** (Team settings → Log Drains) → Logtail / Datadog /
   Axiom. Filter on `evt:"security"`.
2. **Sentry** — add `@sentry/nextjs` for error monitoring; keep security events
   in the log drain (Sentry is for exceptions, not audit trails).

**Upload malware scanning posture** (`lib/virus-scan.ts`): VirusTotal hash
lookup on every admin upload. Default **fails open** — a scan that cannot
complete logs `virus_scan_skipped` (no API key) or `virus_scan_error` and
the upload proceeds. Set `FAIL_CLOSED_VIRUS_SCAN=true` in the box `.env` to
reject such uploads with a 503 instead (a VT "hash unknown" answer is a
*completed* scan and always passes). Either way, alert on any
`virus_scan_skipped` in production — it means the key is missing/expired.

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

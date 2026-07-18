# Monitoring, Alerting & Incident Runbooks

_Created 2026-07-11. Owner: library web team (raksmeyron.ptec@gmail.com).
Companion docs: `SECURITY-OPS.md` (security events, backups/DR),
`DDOS-PROTECTION.md` (abuse/WAF), `ZIMAOS-DEPLOYMENT.md` (self-hosted infra),
`SECURITY-HEADERS.md` (CSP reports)._

## Architecture recap (what can fail)

Browser → Cloudflare (DNS/WAF/tunnel) → Next.js app (ZimaOS Docker, and/or
Vercel) → Supabase (Postgres+Auth, hosted) · Zima Storage (self-hosted files)
· legacy R2 (old files) · Vercel Blob (avatars) · Gemini API (AI search)
· Gmail SMTP (auth + contact email) · web-push (notifications).

## Uptime probes (external monitor — UptimeRobot/BetterStack free tier)

Point an external monitor at these; the app now exposes a dedicated
dependency-health endpoint.

| # | Probe | Expect | Interval | Covers |
|---|---|---|---|---|
| 1 | `GET /` | 200, body contains "PTEC" | 1–5 min | homepage availability, tunnel, app process (`/home` now 308-redirects to `/` — probe `/` directly, or a monitor that doesn't follow redirects will false-alarm) |
| 2 | `GET /api/health` | 200 (`503` = degraded) | 1–5 min | **DB reachability + Zima Storage reachability** |
| 3 | `GET /api/search/popular` | 200 JSON | 15 min | search API path |
| 4 | `GET /books` | 200 | 15 min | listing + Supabase read path |
| 5 | `GET /auth/login` | 200 | 15 min | auth pages (Turnstile widget failures show in CSP/console, not here) |
| 6 | One published book detail URL | 200 | 15 min | detail page + cover CDN |
| 7 | `HEAD` one public cover URL (cdn.storage-ptec.online) | 200 | 15 min | PDF/file delivery origin |

The Docker `HEALTHCHECK` already probes `/home` from inside the box; probe 2
adds dependency depth and an outside-in view.

**Backstop** (added 2026-07-16): `.github/workflows/uptime.yml` runs probes
1 & 2 every 15 minutes from GitHub Actions and fails the workflow on sustained
failure (3 attempts, 30s apart) — GitHub emails the repo owner on failure. It
is a safety net; the external monitor above remains the primary alert. (Repo
is public, so Actions minutes are free; loosen to hourly if it ever goes
private again.)

## Log-based alerts

All security-relevant events are one-line JSON with `evt:"security"`
(`lib/security-log.ts`), now carrying `x-request-id` correlation (middleware
mints it, reuses Cloudflare `cf-ray` when present — quote it in bug reports
and grep across layers). Wire these filters wherever logs land (Vercel Logs
/ `docker logs` + Loki / grep cron):

| Alert | Filter | Threshold (per hour) | Severity | Runbook |
|---|---|---|---|---|
| Admin auth failures | `type:"auth_forbidden"` or `"mfa_required"` | >10 | P2 | §Suspected account compromise |
| Rate-limit storm | `type:"rate_limited"` | >100 | P2 | DDOS-PROTECTION.md |
| Captcha failures spike | `type:"captcha_failed"` | >50 | P3 | DDOS-PROTECTION.md |
| Upload rejected / malware | `type:"upload_rejected"` or `"virus_scan_blocked"` | ≥1 | P2 | SECURITY-OPS.md |
| CSP violations (new kind) | `type:"csp_violation"` | new directive+URI pair | P4 | SECURITY-HEADERS.md |
| Unhandled exceptions | Next.js error output / `digest:` lines | >10 | P2 | §Elevated 5xx |
| DB errors | PostgREST 5xx in server logs | >5 | P1 | §Database unavailable |

**Alert hygiene**: every alert above has an owner (web team), an explicit
threshold, and a runbook link — do not add alerts without all three. Prefer
raising a threshold over muting a channel. P1 = page immediately;
P2 = same-day; P3 = weekly review; P4 = dashboard only.

**Never log**: passwords, tokens, cookies, full contact-message bodies,
private notes. `logSecurityEvent` documents this contract; the CSP report
endpoint strips query strings before logging.

## Dashboards

- **Availability/latency**: external monitor dashboard (probes above).
- **Traffic + Web Vitals**: Vercel Analytics + Speed Insights (already wired).
- **Abuse/WAF**: Cloudflare dashboard → Security → Events (see DDOS doc).
- **DB**: Supabase dashboard → Reports (connections, slow queries, disk).
- **Search quality**: `/admin` → search insights (zero-result terms).
- **Data quality**: `/admin` data-quality dashboard (broken files).

## Service-specific notes

- **Email delivery** (Gmail SMTP for Supabase auth + contact): no cheap probe.
  Watch Supabase Auth logs → "error sending email" weekly, and alert on the
  contact form's failure path (`evt:security type:captcha_failed` excluded —
  watch server 5xx on `/api/contact` instead). A silent Gmail App-Password
  revocation is the most likely failure (see runbook).
- **Storage disk (ZimaOS box)**: `df -h` via cron → alert at 80%/90%
  (`docker system prune` reclaim first). Supabase disk: dashboard alert at 80%.
- **Backups**: Supabase PITR/daily dumps per SECURITY-OPS.md §backups; Zima
  Storage is the known DR gap — files have no automatic second copy. Weekly
  cron on the box should rsync `books/ research/ posts/` to a second disk and
  log success; alert if the marker file is >8 days old.
- **Background jobs**: `/api/cron/*` routes log `cron_auth_failed` on bad
  secrets; schedule hits from cron with the secret and alert on non-200.

## Incident runbooks

Each runbook: confirm → mitigate → root-cause → follow-up. Quote the
`x-request-id` from any failing response when filing issues.

### 1. Website unavailable
1. Confirm from outside: probe 1 failing? `curl -I https://library.ptec.edu.kh/`.
2. Cloudflare status + tunnel: `docker logs cloudflared` on the box (tunnel
   is outbound-only; a dead tunnel = 502/530 from Cloudflare).
3. App container: `docker ps`, `docker logs app --tail 200`. Restart:
   `docker compose restart app`.
4. If box is dead: fallback deploy path is Vercel (ZIMAOS-DEPLOYMENT.md
   §rollback) — flip DNS back to Vercel.

### 2. Database unavailable
1. `/api/health` shows `db: fail`. Check status.supabase.com and the
   project's dashboard (paused? disk full? connection limit?).
2. Free-tier projects pause after inactivity — resume from dashboard.
3. Connection exhaustion: restart the app container (releases pool), then
   look for a leaking route in recent deploys.
4. Nothing to fail over to — communicate downtime on the site's social
   channel; public pages with `unstable_cache` may keep serving stale data.

### 3. Storage (Zima) unavailable
1. `/api/health` shows `storage: fail`; covers 404/timeout; PDF reads fail.
2. Check the ZimaOS box: service up? disk full? cert expired on
   `api.storage-ptec.online`?
3. Legacy R2-keyed files still work (different origin) — the blast radius is
   Zima-hosted files only.
4. If prolonged: restore from the rsync copy to a new origin and update
   `ZIMA_API_URL` — do NOT bulk-rewrite DB URLs for a transient outage.

### 4. Email delivery failure
1. Symptom: signups stuck "confirm your email", password resets missing,
   contact replies not sending.
2. Supabase dashboard → Auth → Logs → filter "email" errors.
3. Most likely: Gmail App Password revoked (Google security sweep) →
   generate a new one, update SMTP settings in Supabase + `SMTP_PASS` env.
4. Check Gmail sending limits (~500/day) — a broadcast feature bug can
   exhaust them; look for a send loop first.

### 5. Elevated 5xx errors
1. Identify scope: one route or all? `docker logs app | grep " 500 "` (or
   Vercel logs). Grab a failing `x-request-id` and grep for it.
2. All routes → usually env/dependency (check /api/health first — DB?).
3. One route → recent deploy? `git log --oneline -5`; roll back the image
   (ZIMAOS-DEPLOYMENT.md §rollback keeps the previous tag).
4. After mitigation, reproduce locally with the same route + params.

### 6. Suspected account compromise (admin)
1. Signals: `auth_forbidden`/`mfa_required` bursts, logins at odd hours,
   unexpected `admin_audit_log` rows.
2. Immediately: Supabase dashboard → Auth → the user → sign out all
   sessions; set `profiles.role='reader'` for the account.
3. Review `admin_audit_log` for actions taken; revert content changes.
4. Rotate: user's password (reset email), and if a super_admin was hit,
   rotate `SUPABASE_SERVICE_ROLE_KEY` + `ADMIN_SECRET_KEY` and redeploy.
5. MFA is enforced for the admin panel (AAL2) — verify the factor list for
   the account wasn't changed; remove unknown factors.

### 7. High download abuse
1. Signals: `rate_limited` storm on download routes, Zima bandwidth spike.
2. Enable `PDF_DOWNLOAD_LIMIT_STRICT=1` (env switch, no deploy) — 10/min
   reads, 2/min downloads.
3. Cloudflare: rate rule on `/api/*/download*` and challenge the offending
   ASN/country per DDOS-PROTECTION.md.
4. Full playbook: DDOS-PROTECTION.md §incident order (Under Attack Mode →
   `DDOS_MODE=1` → IP blocks).

### 8. Disk nearly full
1. **App box**: `df -h`; usual culprits: docker images/layers
   (`docker system prune -af --volumes` — careful: keeps only running), logs
   (`docker logs` rotation, journald vacuum), Zima uploads growth.
2. **Supabase**: dashboard → Database → disk. Biggest tables here are
   `book_pages`/`book_chunks` (full-text + embeddings) — never truncate
   without re-index plan; prefer plan upgrade.
3. **Dev machine** (chronic): `.next` caches and Playwright browsers are
   safe to delete; avoid full production builds locally (known constraint).

## What is deliberately NOT monitored

- Gemini API quota (cost-guarded in-app by ai_usage circuit breaker; failure
  degrades gracefully to keyword search).
- Per-user analytics (privacy — only aggregates are stored).
- Synthetic login flows with real credentials (captcha + MFA make this
  brittle; auth path is covered by probe 5 + Supabase status).

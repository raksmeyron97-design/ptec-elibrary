# Security Monitoring — Phase 0 Audit

_Written 2026-08-31. This is the pre-implementation audit required before any
code is written for the Security Monitoring / Attack Detection / Incident
Response system. It records **what already exists**, **what is measurably
missing**, and **what cannot be detected at all with the current
architecture** — the last part matters most, because several detectors named
in the brief have no observable signal in this deployment today._

Method: read every file named below, plus a live probe against the local
Supabase stack (`supabase_db_e-library-ptec`, port 54332) to settle two
empirical questions the source alone could not answer (§3.1, §3.2).

---

## 1. Executive summary

PTEC already has a **well-designed alerting *policy*** and a **thin alerting
*mechanism***. The gap is the middle: there is no durable store, no
aggregation, no incident model, and no runtime alert path.

Concretely:

| Layer | State |
|---|---|
| Alert **policy** | ✅ Mature. `docs/ALERT-CATALOG.md` defines 40 alerts with threshold, severity, owner, suppression, escalation, runbook **and recovery condition** — including 12 security alerts. |
| Security **signal emission** | 🟡 Partial. `lib/security-log.ts` defines 16 event types; 43 call sites across 30 files emit them. |
| Security **event storage** | ❌ **None.** Every event is a `console.warn` line. Nothing is persisted, queried, or joined. |
| **Aggregation / detection** | 🟡 One in-process spike counter, per-container, reset on restart. |
| **Correlation / incidents** | ❌ None. No incident record, no dedupe, no lifecycle, no recovery detection. |
| **Alert delivery** | 🟡 Works, but only from CI and CLI — the *application* cannot send an alert. |
| **Dashboard** | 🟡 `/admin/logs` is a real console, but it cannot see security events (they aren't stored). |

**Headline finding:** the entire **Security** section of `ALERT-CATALOG.md` —
`admin-auth-anomaly`, `cron-secret-guessing`, `malware-upload`,
`captcha-storm`, `rate-limit-storm`, `security-spike`,
`rate-limiter-degraded`, `lockdown-active`, `csp-novel-violation` — documents
thresholds against a log stream **that is never collected**.
`docs/MONITORING.md` §Log-based alerts says "wire these filters wherever logs
land"; on the ZimaOS deployment the logs land in the container's default
json-file driver and are rotated away. **No security alert in the catalog can
fire today.** That, not the absence of a Telegram bot, is the actual defect.

**Second finding (present, not theoretical):** `uptime.yml` runs every 15
minutes and sends a Sev 1 Telegram message on *every* failing run. A
three-hour outage produces **12 identical 🚨 messages and no recovery
message**. This is exactly the failure mode the brief's §11 forbids, and it is
live in production today.

---

## 2. What already exists (inventory)

### 2.1 Signal emission — `lib/security-log.ts`

One JSON line per event, `evt:"security"`, on `console.warn`. Contract is
already documented and correct: no passwords, tokens, cookies, or
user-generated content; identifiers and short technical context only.

**Taxonomy (16 types) and measured call-site counts:**

| Type | Sites | Emitted from |
|---|---|---|
| `rate_limited` | 23 | search, native search, suggestions, file/download routes, contact, OAI, export, push, reviews, notes, drafts |
| `auth_forbidden` | 7 | `lib/auth/requireAdmin.ts`, admin layout, upload |
| `suspicious_input` | 5 | contact, search click, book suggestions |
| `upload_rejected` | 3 | `/api/admin/upload`, `app/actions/upload.ts` |
| `virus_scan_error` | 2 | `lib/virus-scan.ts` |
| `lockdown_blocked` | 2 | `lib/security/lockdown.ts`, `requireAdmin` |
| `cron_auth_failed` | 2 | `/api/cron/publish-scheduled`, `/api/cron/cleanup` |
| `virus_scan_skipped` / `virus_scan_blocked` | 1 each | `lib/virus-scan.ts` |
| `rate_limiter_degraded` | 1 | `lib/rate-limit.ts` (throttled 1/min/process) |
| `mfa_required` | 1 | admin `(protected)/layout.tsx` |
| `csp_violation` | 1 | `/api/csp-report` (10-min in-memory dedupe) |
| `captcha_failed` | 1 | `/api/contact` |
| `security_spike` | 1 | self-emitted by the spike detector |
| `rights_blocked`, `download_blocked` | declared, emitted via download routes |

**Spike detector**: 20 events of one type per 60 s (env
`SECURITY_SPIKE_THRESHOLD`) → one `security_spike` meta-event, then quiet for
that window. Per-process `Map`. The file's own comment is honest about the
limit: "on serverless each instance counts separately, so a fleet-wide burst
may under-trigger". On the single-container ZimaOS deployment the fleet
problem disappears, but **a container restart still resets every counter**,
and the event still goes nowhere durable.

### 2.2 Security primitives — `lib/security/`

- `bearer.ts` — constant-time `Authorization: Bearer` check, fails closed on
  an unset secret. Used by `/api/cron/*` and the `/api/health` deep probe.
- `lockdown.ts` — env kill switches (`LOCKDOWN_AI`, `LOCKDOWN_DOWNLOADS`,
  `LOCKDOWN_ADMIN_MUTATIONS`, `LOCKDOWN_ALL`), 503 + `Retry-After`, emits
  `lockdown_blocked`. Enforced inside `verifyAuthAndMFA`, so every Server
  Action and admin route is covered by one switch.
- `crawler.ts` — real reverse+forward DNS verification of Googlebot, 1 h
  cache, bounded at 10 000 entries. This is a genuine, reusable "known good
  crawler" signal for false-positive suppression.
- `return-to.ts` — open-redirect defence.

### 2.3 Rate limiting — `lib/rate-limit.ts` + `lib/rate-limit-policy.ts`

DB-backed sliding window (`check_rate_limit` RPC), three explicit failure
modes (`emergency` in-memory fallback by default, `closed`, `open`), and a
throttled `rate_limiter_degraded` event when the DB check itself errors.
15 named policies: `search`, `searchNative`, `suggestions`, `fileRead`,
`download`, `review`, `noteSave`, `postAutosave`, `thesisAutosave`, `oai`,
`export`, `storageBrowse|Upload|Mutate|Purge`. Emergency switches
(`DDOS_MODE`, `STRICT_RATE_LIMIT`, `DISABLE_EXPENSIVE_SEARCH`,
`PDF_DOWNLOAD_LIMIT_STRICT`).

**There is no `login` or `auth` policy** — see §3.1.

### 2.4 Request identity — `middleware.ts`, `lib/client-ip.ts`

- `x-request-id` is minted on every request, reusing Cloudflare's `cf-ray`
  when present, and set on both the request and the response. This is a
  ready-made correlation key that joins app logs to Cloudflare logs.
- `clientIp()` correctly prefers `cf-connecting-ip` behind the tunnel and
  skips private hops. Every rate-limit and abuse counter already keys on it.

### 2.5 Durable tables that already exist

| Table | Migration | Purpose | Reusable for security monitoring? |
|---|---|---|---|
| `activity_events` | 0094 | Polymorphic denied/failed download events. Has `event_type` (incl. `'security'`), `event_status`, `request_id`, `idempotency_key`, `ip_hash` (keyed hash, never raw IP), `user_agent_summary`, `metadata jsonb`, 6 indexes. | **Yes — and it was explicitly designed for this.** Its own comment: "Going forward this table can also absorb account/admin/security events without more DDL." Nothing writes `event_type='security'` today. |
| `admin_audit_log` | initial (0003) | `admin_id`, `action`, `target_table`, `target_id`, `metadata`, `created_at`. ~50 call sites, incl. `user_role.update` with `{from, to}`. | **Yes** — it is the authoritative privilege-change record. Not currently read by any security surface. |
| `ops_events` | 0088 | Backup/restore/maintenance heartbeats, service-role only. Read by `/api/health` deep probe (`backupAgeHours`). | Yes, as an infrastructure signal source. |
| `app_events` | 0090 | Request telemetry. `kind` is CHECK-constrained to `ai_request\|storage_operation\|notification\|export`. | Partially — adding a security kind means altering a CHECK constraint. |
| `auth.audit_log_entries` | GoTrue | Successful logins, logouts, token refresh/revoke, MFA challenge/verification. | Partially — see §3.1, it does **not** record failures. |

### 2.6 Admin console — `/admin/logs`

A genuine operational surface, not a stub: `lib/admin/activity-log.ts` (497
lines) unions `download_logs`, `research_report_downloads`, `view_logs` and
`activity_events` into one normalized `ActivityEvent` stream, with
server-side filtering/pagination, KPI grid, timeline bucketing (fixed UTC+7
arithmetic — Cambodia has no DST), per-resource breakdown, a security
breakdown with denial reasons, CSV export with formula-injection escaping,
and email masking gated on `super_admin`. Nav entry is `securityLogs` →
`/admin/logs`, admin-only.

Its "admin" and "security" tabs are wired but **structurally empty**: nothing
writes `activity_events` rows with `event_type='admin'` or `'security'`
(only `lib/admin/announcements/audit.ts` and the denied-download path in
`lib/analytics/events.ts` write to that table at all), and
`admin_audit_log` is not among the unioned sources.

### 2.7 Alert transport — `scripts/ops/alert-telegram.mjs`

Node-builtins-only ESM module + CLI. Exports
`sendTelegramAlert(env, {title, message, severity, runbook, service})`.
HTML-escapes, 15 s abort, dual UTC + Phnom Penh timestamps, **never throws**,
exit codes 0/1/2. Reuses `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID`.

Two constraints that matter for reuse:
1. It reads credentials through `loadEnv(REPO_ROOT)` from `scripts/backup/lib.mjs`
   — i.e. from `.env` **files on disk**. The production Docker image
   (`.next/standalone`) has env vars but not the repo, so this module cannot be
   imported by the Next.js runtime as-is.
2. It is `.mjs` with no types. Importing it into the typed app tree is possible
   but awkward.

### 2.8 Alert senders that actually fire today

| Sender | Trigger | Severity | Dedupe? |
|---|---|---|---|
| `.github/workflows/uptime.yml` | `/api/health` or `/` fails 3× | Sev 1 | ❌ **none — every 15 min** |
| `.github/workflows/cron.yml` (publish sweep) | non-200 twice | Sev 2 | ❌ none |
| `.github/workflows/cron.yml` (cleanup) | non-200 twice | Sev 2 | ❌ none |
| `scripts/backup/*` | backup failure | Sev 2 | ❌ none |

All three workflows inline the same ~12 lines of `curl` to the Bot API rather
than sharing a composite action. `ci.yml`, `codeql.yml`, `migrate.yml`,
`lighthouse.yml`, `docker-publish.yml`, `check-file-health.yml` send **no**
Telegram alert — CodeQL findings, gitleaks hits, dependency advisories, and
failed migrations reach only the GitHub failure email.

### 2.9 Documentation

`ALERT-CATALOG.md` (authoritative severity model + 40 alerts + 6 anti-fatigue
hygiene rules), `MONITORING.md` (probes, log filters, dashboards, 8 runbooks),
`RUNBOOKS.md` (M1–M17 maintenance, I1–I18 incidents), `SECURITY-OPS.md`,
`DDOS-PROTECTION.md`, `SECURITY_DEFENSE_*.md`, `SECURITY-HEADERS.md`,
`RLS-MATRIX.md`.

**The policy layer is already better than what most implementations produce.
It should be treated as the specification, not rewritten.**

---

## 3. What cannot be detected today (evidence-based)

These are the findings that change the plan. Both were verified by probe, not
inferred.

### 3.1 ❌ Failed logins are invisible. Brute force / credential stuffing is **not** currently detectable.

Login is performed **client-side, directly against GoTrue**:
`app/(auth)/auth/login/LoginContent.tsx:129` and
`app/(admin)/admin/login/page.tsx:31` both call
`supabase.auth.signInWithPassword(...)` from the browser. The Next.js server
is never in the path, so it cannot count, rate-limit, or log a failed attempt.

The obvious fallback — GoTrue's own audit table — does not help. **Probe
(local stack, 2026-08-31):** 3 × `POST /auth/v1/token?grant_type=password`
with a wrong password → all HTTP 400 → `auth.audit_log_entries` row count
unchanged at **146 before and after**. GoTrue records `login`, `logout`,
`token_refreshed`, `token_revoked`, `challenge_created`,
`verification_attempted`, `factor_in_progress` — **there is no
`login_failed` action at all.**

Consequences, stated plainly:

- `brute_force`, `credential_stuffing`, `account probing`, "repeated login
  attempts against multiple users", and "successful login immediately after
  suspicious failures" **cannot be implemented** against any existing signal.
- The `admin-auth-anomaly` alert in `ALERT-CATALOG.md` is narrower than its
  name: `auth_forbidden` / `mfa_required` fire only for users who are
  **already signed in** and lack a role, or hold a panel role without AAL2.
  It detects privilege probing by an authenticated account — not password
  guessing.
- The login form is protected by Turnstile only. **There is no rate limit on
  login** (no `login` policy exists among the 15).

Making these detectable requires moving password sign-in behind a server
route/action so the app observes each attempt. That is a real change to the
auth flow and is raised as decision **D1** in §6.

### 3.2 ❌ Failed MFA verifications are indistinguishable from successful ones.

`auth.audit_log_entries` writes `verification_attempted` with traits
`{challenge_id, factor_id, factor_type}` and **no outcome field** (verified
against live rows). So `mfa_failure_spike` cannot be built from GoTrue data.
It is only obtainable via the same server-side proxy as D1, applied to
`auth.mfa.verify`.

### 3.3 ❌ No WAF / Cloudflare signal.

No Cloudflare API token exists in `.env.example`, no client, no adapter.
`waf-spike` in the catalog is sourced from "Cloudflare Security Events" — a
dashboard a human looks at. `ddos_signal`, `waf_spike`, bot-score and
challenge events are unavailable in-process.

### 3.4 ❌ No request-level 404 / enumeration / injection observation.

`middleware.ts` rewrites unknown public slugs to a 404 but emits no event.
Nothing counts 404s per client, and no request path is ever matched against
injection signatures. `sql_injection`, `xss_attempt`, `path_traversal`,
`command_injection` and `api_abuse` have **no source** today.
`suspicious_input` (5 sites) is the closest existing analogue and fires only
at three specific trust boundaries.

### 3.5 ❌ Privilege changes are recorded but never watched.

`setUserRole` (`app/(admin)/admin/(protected)/users/actions.ts:67`) writes
`admin_audit_log` action `user_role.update` with `{from, to}` — good data,
correctly guarded (self-change blocked; only a super admin may grant
admin/super_admin). But no code reads it, `/admin/logs` does not union it, and
no alert derives from it. `privilege_change` / `privilege_escalation` are
therefore **detectable with existing data** and simply not implemented — the
cheapest high-value detector available.

### 3.6 ❌ Nothing observes the monitoring system itself.

No record of alert deliveries, so a Telegram outage is silent.

### 3.7 Doc drift found in passing

`CLAUDE.md` and `scripts/ops/alert-telegram.mjs` both describe
`TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID` as "the bot that delivers contact-form
messages". Contact now delivers by Gmail (`app/api/contact/route.ts` →
`lib/gmail.ts`); there is **no Telegram code anywhere in `app/` or `lib/`**.
The credentials are alert-only. Worth correcting so nobody assumes the contact
form breaks when the bot token is rotated.

---

## 4. Duplication risks to avoid

1. **Do not create a second security-event surface.** `/admin/logs` is the
   activity+security console. A new `/admin/security` must be the *incident*
   console and link to `/admin/logs` for raw events, or the two will diverge.
2. **Do not create a second events table** when `activity_events` was designed
   for this and already carries `request_id`, `ip_hash`, `metadata`,
   idempotency and the right indexes.
3. **Do not create a second Telegram sender.** Share formatting and policy;
   add only the runtime credential path `alert-telegram.mjs` cannot provide.
4. **Do not restate the alert catalog in code.** `ALERT-CATALOG.md` is the
   policy source; thresholds belong in one config module that the doc
   describes.
5. **Do not re-implement crawler exclusion.** `isVerifiedGoogleCrawler()`
   exists and does real DNS verification.
6. **Do not add a second CSP, a second rate limiter, or a second IP reader** —
   `CLAUDE.md` already forbids each.

---

## 5. Recommended architecture

Deliberately shaped around the constraint that this is **one container behind
Cloudflare Tunnel with a hosted Postgres**, not a fleet — so Postgres is a
legitimate event bus, and a per-process cache is a legitimate first-stage
filter.

```
request path (hot, synchronous)
  emit → lib/security-log.ts        [unchanged: console line, contract intact]
       → in-process throttle        [existing spike counter, generalized]
       → after() → one INSERT       [activity_events, event_type='security']
                                     never blocks, never throws

detection path (cold, out of band — cron every 5 min + on-write for critical)
  read recent security rows
       → normalize + fingerprint
       → threshold / baseline evaluation   (config, defaults documented)
       → risk score                        (weighted, explainable)
       → correlate by fingerprint + actor + window
       → open / update / recover incident  (security_incidents)
       → alert decision: first transition only, then suppress
       → deliver: Telegram → record delivery → fallback

surfaces
  /admin/security             status, KPIs, timeline, active incidents
  /admin/security/incidents   list + filters
  /admin/security/incidents/[id]  detail, correlated events, runbook, actions
  /admin/logs                 unchanged; gains the security rows it can now see
```

**Severity, thresholds, suppression and recovery come from
`ALERT-CATALOG.md`.** The implementation's job is to make the catalog
executable, not to invent a second policy.

### Database (additive only)

| Object | Why |
|---|---|
| `activity_events` — **no DDL** | Security events use `event_type='security'`, `event_status` ∈ `denied\|failed\|success`, `metadata.security_type`. Already indexed on `(event_type, occurred_at desc)` and `request_id`. |
| `security_incidents` — **new** | `fingerprint` (unique among open), status lifecycle, `severity`, `risk_score`, `first_seen`/`last_seen`/`recovered_at`, `event_count`, `parent_incident_id`, `assigned_to`, `summary`, `resolution`. |
| `security_incident_events` — **new** | Join table: which events an incident correlates. |
| `alert_deliveries` — **new** | One row per delivery attempt: channel, status, error class, retry count. Makes §41 (self-observability) real. |
| `security_baselines` — **new, Phase 6** | Rolling per-signal baselines. Defer until real event data exists — a baseline computed over an empty table is a false-positive generator. |

RLS: enable + `REVOKE ALL FROM public, anon, authenticated` on every new table
(`CLAUDE.md` rule; probes in `lib/rls.test.ts`).

### Privacy

Reuse the existing keyed-hash discipline: `ip_hash`, never a raw IP;
`maskEmail()` at the server boundary. Telegram payloads carry counts,
fingerprints, request ids, incident ids and links — never payload bodies,
never raw IPs, never secrets. Injection detection stores a **signature class**
(`sqli.union_select`) and a truncated hash, never the matched string.

---

## 6. Decisions taken (2026-08-31)

| # | Decision | Chosen | Consequence |
|---|---|---|---|
| **D1** | Server-side login proxy | **Yes** | Password sign-in + MFA verify move behind server actions. Makes `brute_force`, `credential_stuffing`, `mfa_failure_spike` real, and adds the missing login rate limit. OAuth stays client-side. |
| **D2** | Telegram inbound commands | **No — outbound only** | Alerts + recovery go out; acknowledge/resolve/silence happen in `/admin/security` behind the existing auth + MFA + RBAC. No new inbound surface. |
| **D3** | Cloudflare API | **Adapter, no live source** | `CloudflareSignalSource` interface with a null implementation. `waf_spike`/`ddos_signal` report "no source configured" rather than fabricating data. |
| **D4** | Scope | **Phases 0–7** | Full build, committed in phase-sized increments. |

_Original framing of each decision, for the record:_

**D1 — Server-side login proxy?** The only way to make brute-force,
credential-stuffing and MFA-failure detection real (§3.1, §3.2) is to route
password sign-in and MFA verify through a server action/route so the app sees
every attempt. It also enables the missing login rate limit. It touches the
auth flow and session-cookie write path (OAuth stays client-side). Without it,
those three detectors must be **dropped from scope and marked "not
detectable"** rather than faked.

**D2 — Telegram inbound commands?** `/ack`, `/resolve`, `/silence` require a
public webhook (`/api/telegram/webhook`) — a new unauthenticated inbound
surface, defended by Telegram's secret-token header plus a
`TELEGRAM_ALLOWED_USER_IDS` allowlist. Read-only alerts + dashboard actions
need none of this. Outbound-only is strictly safer.

**D3 — Cloudflare API integration?** Requires a scoped read-only API token in
production env. Without it, WAF/DDoS detectors ship as an adapter interface
with no live source (honest) rather than as working detectors.

**D4 — Scope of this pass.** Phases 0–4 (events → detection → incidents →
Telegram) deliver the operational value; phases 5–7 (dashboard, CI/infra
integration, hardening) are a second, larger tranche.

---

## 7. Verification baseline (pre-change)

Recorded so regressions are attributable.

- Migrations: 76 files, latest `0126_author_profiles_public_view.sql`
- Security event call sites: 43 across 30 files
- `logAdminAction` call sites: ~50
- Local Supabase stack: up (Kong 54331, DB 54332), `auth.audit_log_entries` = 146 rows
- **Tests: 167 files, 2,293 passing**

## 8. Post-implementation notes

Two findings from §5 were reversed during detailed design, and both are
recorded here rather than quietly changed:

**`activity_events` was NOT reused.** §4 and §5 proposed it, on the strength of
0094's own comment that it can absorb security events without more DDL. Two
concrete problems killed it: `lib/admin/activity-log.ts` reads each source with
`SOURCE_CAP = 5000` rows per range, so the highest-volume event class would
push downloads and views out of a working feature; and the detection engine
queries by `(event_type, occurred_at)` and `(fingerprint, occurred_at)` on
every pass, which in 0094 would live inside `metadata jsonb` behind expression
indexes against an `event_status` vocabulary that does not match the security
result model. Migration 0127 creates dedicated tables and leaves 0094 alone.

**A pre-existing enumeration exposure was left in place, deliberately.** The
public login form distinguishes "email not confirmed" from "invalid
credentials", which confirms an address has an account. Routing sign-in through
the server made it trivial to collapse both into one message — and that was
not done, because silently altering user-facing security behaviour is not what
this change was asked to do. It is a small, separate change; recorded as gap 4
in `SECURITY-MONITORING.md` §13.

# Security Monitoring

_How the PTEC e-Library detects suspicious activity, decides what is worth
telling a human about, and records what happened. Written 2026-08-31._

**Read this with `ALERT-CATALOG.md` open.** The catalog is the POLICY — what
counts as Sev 1, what the thresholds are, who owns each alert, and when it is
considered recovered. This document is the MECHANISM that makes that policy
executable. Where the two disagree, the catalog wins and the code is wrong.

---

## 1. Why this exists

Before this system, every security event in the app was a `console.warn` line
(`lib/security-log.ts`). On the ZimaOS container those land in Docker's default
json-file log driver and rotate away, and the aggregator `MONITORING.md` §Log-
based alerts assumes ("wire these filters wherever logs land") was never set
up.

The consequence, measured in `SECURITY_MONITORING_AUDIT.md`: **all twelve
alerts in the catalog's Security section described thresholds against data
nobody kept.** None of them could fire. Separately, `uptime.yml` sent a Sev 1
on every failing run every 15 minutes with no recovery message, so a
three-hour outage produced twelve identical 🚨 messages.

---

## 2. The three nouns

Getting these confused is how monitoring systems become unusable.

| | What it is | How many | Alerts? |
|---|---|---|---|
| **Event** | One thing that happened | Thousands/day | Never |
| **Finding** | A threshold was crossed | A few/week | Never directly |
| **Incident** | The durable record a human is told about | A few/month | Once, then on escalation, then on recovery |

100 failed logins = 100 events → 1 finding → 1 incident → **1 Telegram
message**, and one recovery message when it stops.

---

## 3. Pipeline

```
REQUEST PATH (synchronous, must stay fast)
  logSecurityEvent()                 lib/security-log.ts
    → normalizeEvent()               severity, risk, fingerprint, scrub
    → console.warn (JSON line)       unchanged contract, evt:"security"
    → in-process spike counter       catches a burst inside one second
    → sink: buffer + batch insert    lib/security/sink.ts — an array push

DETECTION PASS (out of band, every 5 min via cron.yml)
  GET /api/cron/security-scan
    → flush the sink buffer
    → load the window (60 min) + live incidents + baselines
    → detect()                       lib/security/detect.ts, 16 detectors
    → correlate()                    parent/child narrative
    → open or update incidents       DB enforces one live per fingerprint
    → decideAlert()                  lib/security/incident-policy.ts
    → notifyIncident()               lib/security/notify/telegram.ts
    → decideRecovery() + notify
    → check the alert pipeline's own health

SURFACES
  /admin/security                    posture, KPIs, timeline, coverage
  /admin/security/incidents          list, filters, pagination
  /admin/security/incidents/[ref]    evidence, deliveries, response, audit
  /admin/security/events             raw explorer, request-id tracing
```

**Detection is out of band on purpose.** "10 failures in 15 minutes" cannot be
answered by the request that produced the tenth without querying the other
nine, and doing that inline would put a range scan on every rate-limited
request. The request path writes one buffered row; the pass does the thinking.

---

## 4. What is detected — and what is not

### Detected (a real signal exists)

| Threat | Detector | Source | Sev |
|---|---|---|---|
| Brute force | `brute_force` | `login_failed` grouped by account | 2 |
| Credential stuffing | `credential_stuffing` | `login_failed` across accounts, one client | 2 |
| MFA failure spike | `mfa_failure_spike` | `mfa_failed` | 2 |
| Sign-in after failures | `auth_success_after_failures` | `login_succeeded` after a run of failures | 1 admin / 2 public |
| Authorization probing | `authorization_probing` | `auth_forbidden`, `mfa_required` | 2 |
| Privilege escalation | `privilege_escalation` | `privilege_change` to admin/super_admin | 1 super / 2 admin |
| Rate-limit storm | `rate_limit_storm` | `rate_limited` per route | 2 |
| Download abuse | `rate_limit_storm` (delivery) | `rate_limited` on file routes | 3 |
| CAPTCHA storm | `captcha_storm` | `captcha_failed` | 3 |
| Route enumeration | `enumeration` | unmatched `/api/*` requests | 3 |
| Injection patterns | `injection_pattern` | signature classes on query/path | 3 |
| Upload abuse | `upload_abuse` | `upload_rejected` | 3 |
| Malware | `malware_upload` | `virus_scan_blocked` (any) | 2 |
| Scanner failing open | `malware_upload` | `virus_scan_error`/`skipped` | 2 |
| Cron secret probing | `cron_secret_guessing` | `cron_auth_failed` (any) | 2 |
| Limiter degraded | `rate_limiter_degraded` | 2+ heartbeats in 10 min | 2 |
| Lockdown active | `lockdown_active` | `lockdown_blocked` | 3 |
| Event burst | `security_spike` | in-process spike detector | 2 |
| Alert pipeline broken | pipeline check | `alert_deliveries` | 2 |

### NOT detected, and why

Stating these plainly is the point. A dashboard that shows "0 WAF events"
reads as "no attacks"; it actually means "we are not looking".

| Not detected | Why |
|---|---|
| **WAF spikes, DDoS indicators** | No Cloudflare API credentials are configured (decision D3). The adapter boundary is typed and the dashboard says "not configured" rather than showing a zero. |
| **404 probing outside `/api`** (`/wp-admin`, `/.env`, `/.git/config`) | These are handled by middleware, which runs in the Edge runtime where the durable sink is not registered, and the global 404 page is deliberately static and reads no headers. Counting them would need either an extra internal request per 404 — amplification during exactly the flood you don't want to amplify — or making the 404 page dynamic, undoing a documented performance decision. Cloudflare already sees and can block these at the edge; that is the right layer. |
| **Impossible-travel / geo anomalies** | No geolocation data is stored. `ip_hash` is a daily-rotating keyed hash by design, so cross-day correlation is impossible on purpose. |
| **OAuth sign-in failures** | Google OAuth is a top-level redirect; a failure happens at Google, not here. |
| **Session hijacking / token theft** | No signal distinguishes a stolen session cookie from a legitimate one. |

---

## 5. Severity and risk

Severity comes from `ALERT-CATALOG.md` and is pinned by
`lib/security/model.test.ts`. Delivery follows the catalog exactly:

| Sev | Meaning | Channel |
|---|---|---|
| 1 | Critical — act immediately, any hour | Telegram |
| 2 | High — same working day | Telegram |
| 3 | Medium — next working day | Dashboard |
| 4 | Informational | Dashboard |

Risk (0–100) is a **sum of named weights**, and every incident carries the
sentence explaining its own score. There is no model and no heuristic:

```
anchor(event type)
  + volume        log-scaled, capped at 25 — 1000 events is not 100x the risk of 10
  + surface       +20 super_admin, +12 admin, +10 cron/service-role, +8 auth
  + result        +15 if it SUCCEEDED where failure was expected; -5 if blocked
  + actor         +10 if an admin acted
  → clamp 0..100
```

Bands: `0–29 LOW · 30–59 MEDIUM · 60–79 HIGH · 80–100 CRITICAL`.

**Severity is raised above the catalog's floor only when the evidence includes
something that WORKED — never by volume alone.** An earlier version escalated
12 blocked admin sign-in attempts to Sev 1, i.e. "act immediately, any hour".
Paging a librarian at 03:00 because a scanner failed twelve times is how a
channel stops being read.

---

## 6. Deduplication, suppression, recovery

**Fingerprints** are the dedupe key: `auth_attack:admin`, `privilege:<user-id>`,
`rate_limit_storm:/api/search`, `malware:uploads`. They deliberately exclude
the client address, so an attacker rotating IPs collapses onto one incident
instead of multiplying them.

**At most one live incident per fingerprint is a DATABASE guarantee** — a
partial unique index in migration 0127, `WHERE status NOT IN (recovered,
closed)` — not application logic. Two concurrent passes cannot both open one.

**Alerting rules**, in the order an operator would reason:

1. Alerting on at all? (`SECURITY_ALERTING_ENABLED`)
2. Silenced by an operator? → suppress, say how long is left
3. Does a parent incident already explain this? → suppress, name the parent
4. Severe enough for the channel? (Sev 3/4 → dashboard only)
5. First detection? → **alert**
6. Strictly more severe than when we last spoke, and past the cooldown? → **escalate**
7. Otherwise → continuing incident. Say nothing.

Rising *risk* at the same severity is **not** an escalation. Risk drifts upward
with volume on every pass; alerting on that would reproduce the every-tick spam
this system exists to stop.

**Recovery** is `INCIDENT_RECOVERY_QUIET_SECONDS` (30 min default) with no new
**events** — measured from raw events, not from findings, because a detector
stops producing findings as soon as an attack drops below its threshold while
the attack continues. Exactly one recovery message, and only for an incident
somebody was actually told about.

Recovery language is deliberately weak: *"no further events within the quiet
period"*, never "threat neutralised". Quiet is evidence that it stopped, not
evidence that we stopped it.

**Suppression pairs** (`SUPPRESSION` in `detect.ts`): a live
`site_down:production` suppresses dependency, limiter and abuse children; a
live `auth_attack:admin` suppresses `auth_attack:public`.

---

## 7. False-positive control

The catalog's hygiene rule 4 — "no per-user-error alerts" — is enforced by
tests that run first in `detect.test.ts`. Each of these produces **nothing**:

- one failed login · one rate limit · one CAPTCHA failure · one rejected
  upload · one 404 · one signature match · one degraded-limiter blip
- a user mistyping their password four times
- a user who mistypes twice and then signs in
- 500 rate-limit events from a DNS-verified Googlebot

`INJECTION_THRESHOLD` defaults to 3, not 1, precisely because the signature
regexes have false positives: a library search for a database textbook
legitimately contains "UNION SELECT". Verified crawlers are excluded from every
volume detector using the existing DNS reverse+forward check in
`lib/security/crawler.ts` — a spoofed User-Agent does not get the exemption.

---

## 8. Privacy

**Never stored, anywhere in this system:** passwords, tokens, cookies, session
identifiers, API keys, raw IP addresses, email addresses, message bodies, note
contents, search query text, or matched attack payloads.

**Stored instead:**

| Instead of | We store |
|---|---|
| the client's IP | `ip_hash` — daily-rotating HMAC (the scheme 0087/0090/0094 already use). Groups a client's events within a day; cannot be correlated across days. |
| the attacked email | the account's internal profile UUID, or `unknown:<12-hex>` for an address with no account |
| the matched payload | a signature **class** (`sqli.union`, `traversal.dotdot`) |
| the provider's error text | a reason class (`invalid_credentials`, `captcha_rejected`) |

Three layers enforce it: `sanitizeText`/`sanitizeMetadata` scrub on the way in
(forbidden keys are **dropped**, not redacted — a redacted password is still a
record that one was passed); `checkSafeForTelegram()` gates every outbound
message against nine leak classes; and a detector composing something unsafe is
logged as a bug rather than silently sent.

**A blocked message is worse than a redacted one.** The gate redacts and sends
anyway, because an operator who is not told an incident opened is worse off
than one told with a field blanked out.

---

## 9. Telegram

**One bot, one chat, one vocabulary.** `scripts/ops/alert-telegram.mjs` remains
the sender for box jobs and GitHub Actions (Node builtins only, credentials
from a `.env` file on disk). `lib/security/notify/telegram.ts` is the app-side
sender, needed only because the production container has env vars but not the
repo. `lib/security/notify/format.test.ts` reads the CLI's source and fails if
the severity tags, HTML escaping, timezone or parse mode ever drift apart.
`.github/actions/telegram-alert` is the third caller, sharing the same format.

**Commands are deliberately not implemented** (decision D2). Acknowledge,
resolve and silence live in `/admin/security`, which already has
authentication, an enforced second factor, per-role permissions and an audit
trail. A chat message has none of those. Telegram is a notification surface,
not a root shell.

**If Telegram fails:** the incident is already persisted; every attempt is
recorded in `alert_deliveries` with an error class (never the provider's body);
retryable classes are retried up to `SECURITY_ALERT_MAX_ATTEMPTS`, a 400 is not
(it will be a 400 forever); `alert_count` is incremented **even on failure**, so
a broken channel cannot cause the same alert to be re-sent every five minutes;
and a run of failures with no successes opens an `alert_pipeline_degraded`
incident (§41 of the brief — the monitoring monitors itself).

---

## 10. Configuration

Every value is an environment variable with a safe default, listed in
`.env.example` and defined in `lib/security/config.ts`. The ones worth knowing:

| Variable | Default | Meaning |
|---|---|---|
| `SECURITY_ALERTING_ENABLED` | `true` | Master off switch for outbound alerts |
| `SECURITY_ALERT_MIN_SEVERITY` | `2` | Only Sev ≤ this reaches Telegram |
| `ALERT_COOLDOWN_SECONDS` | `3600` | Minimum gap between alerts per incident |
| `INCIDENT_RECOVERY_QUIET_SECONDS` | `1800` | Quiet period before recovery |
| `AUTH_ATTACK_THRESHOLD` | `10` | Failures on one account → brute force |
| `CREDENTIAL_STUFFING_ACCOUNTS` | `5` | Accounts from one client → stuffing |
| `RATE_LIMIT_ALERT_THRESHOLD` | `100` | Catalog: rate-limit-storm >100/h |
| `CAPTCHA_STORM_THRESHOLD` | `50` | Catalog: captcha-storm >50/h |
| `INJECTION_THRESHOLD` | `3` | >1 on purpose — signatures false-positive |
| `SECURITY_EVENT_RETENTION_DAYS` | `180` | Purged by `/api/cron/cleanup` |

Retention: events, deliveries and baselines are purged daily. **Incidents are
kept** — they are the institutional record of what happened to this library,
they are low-volume by construction, and a deleted incident takes its
post-incident review with it.

---

## 11. Operating it

**Daily** — glance at `/admin/security`. A green posture that cannot say why it
is green is a bug; the banner always carries its reason.

**When a Telegram alert arrives:**
1. Open the incident link in the message.
2. Read the detection reason — it carries the numbers that fired.
3. Follow the runbook link.
4. Acknowledge (records who is on it), then investigate/mitigate.
5. If you need quiet while you work: silence for 1/4/24 h. Detection and
   recording continue; only the notifications pause.
6. Close with a note. An incident closed with no word about why teaches
   nothing at the next review.

**Monthly (catalog hygiene rule 5)** — retune anything that fired more than
three times without action. Raise the threshold in the environment or fix the
root cause; never mute the channel.

**Verify the alert path** any time: `node scripts/ops/alert-telegram.mjs --test`.

**Run a detection pass by hand:**
```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  https://library.ptec.edu.kh/api/cron/security-scan
```

**Turn alerting off for a maintenance window:** set
`SECURITY_ALERTING_ENABLED=false` and restart. Detection and recording
continue; deliveries are recorded as `skipped` with the reason.

---

## 12. Testing

| Suite | What it protects |
|---|---|
| `lib/security/model.test.ts` | Severity matches the catalog; risk bands; fingerprint stability; sanitization; signature classes |
| `lib/security/detect.test.ts` | The false-positive contract first; every detector's threshold; suppression; correlation |
| `lib/security/incident-policy.test.ts` | Dedupe, escalation, cooldown, recovery-once, the state machine |
| `lib/security/notify/format.test.ts` | Nine leak classes refused; CLI parity; message content |
| `lib/security/sink.test.ts` | Batching, buffer bounds, degradation, no raw IPs |
| `lib/security/incidents.integration.test.ts` | The whole pipeline against an in-memory PostgREST double, including the twelve-failing-probes scenario |
| `lib/security/incidents.probe.test.ts` | The same against a REAL Postgres — opt-in with `SECURITY_PROBE=1` |

The probe suite earns its keep: it caught a bug the in-memory double accepted
(`security_incidents` had no `metadata` column, so the alert-count write failed
silently — meaning every pass would have re-sent the same alert).

```bash
npx vitest run lib/security                                   # unit + integration
SECURITY_PROBE=1 npx vitest run lib/security/incidents.probe.test.ts   # real DB
```

---

## 13. Known gaps

Honest list; none of these are papered over in the UI.

1. **No Cloudflare/WAF signal.** Needs a scoped read-only API token. The
   adapter boundary is typed and ready.
2. **Non-`/api` 404 probing is not counted** (§4).
3. **Baselines are declared but unpopulated.** The `security_baselines` table
   and the deviation logic exist and are tested; nothing writes rows yet.
   Detectors fall back to fixed thresholds, which is the correct behaviour
   until there is enough history — a baseline computed over three quiet hours
   would call every normal Monday an attack.
4. **The public login form still distinguishes "email not confirmed" from
   "invalid credentials"**, which confirms an address has an account. This is
   pre-existing behaviour, left unchanged here on purpose: silently altering a
   user-facing security policy is not this change's job. Collapsing both into
   one message is a small, separate change.
5. **The in-process spike counter resets on container restart.** It is the
   fast first stage only; the durable pass is the real detector.
6. **No email fallback channel.** If Telegram is down, the fallbacks are the
   GitHub Actions failure email and the dashboard.

---

## 14. Related documents

- `ALERT-CATALOG.md` — the policy this implements
- `MONITORING.md` — probes, log filters, dashboards
- `RUNBOOKS.md` — I1–I18 incident procedures
- `SECURITY_MONITORING_AUDIT.md` — the Phase 0 audit and the decisions taken
- `SECURITY-OPS.md`, `DDOS-PROTECTION.md`, `SECURITY-HEADERS.md`, `RLS-MATRIX.md`

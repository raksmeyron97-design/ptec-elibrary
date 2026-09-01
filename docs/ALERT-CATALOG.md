# Alert Catalog

_Created 2026-07-12 (roadmap Task 5). This is the authoritative list — no
alert exists (or may be added) without every column filled in. Probes and
log filters are defined in `MONITORING.md`; incident procedures in
`RUNBOOKS.md`. Owner defaults: **WL** = web-team lead, **BO** = ZimaOS box
owner, **DIR** = library director._

## Severity model

| Sev | Meaning | Response | Channel |
|---|---|---|---|
| **1** | Critical outage or confirmed compromise (site down, DB down, admin account breached) | Act immediately, any hour | Telegram (push to WL's phone) |
| **2** | Major degradation or high security risk (storage down, auth failures spike, backups failing) | Same working day | Telegram + GitHub email |
| **3** | Partial degradation or operational issue (one route erroring, disk 80 %, noisy captcha) | Next working day / ticket | Email |
| **4** | Warning or maintenance item (CSP novelty, cert < 30 d, drift) | Weekly review | Dashboard/digest |

## Delivery channels (what actually fires, updated 2026-08-31)

Telegram is the **primary active channel** for Sev 1 and Sev 2. It uses
`TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` (in the box's `.env` and as GitHub
Actions repo secrets). *Correction to an earlier note here: these are ALERT
credentials, not contact-form credentials — the contact form has delivered by
Gmail since `lib/gmail.ts` landed, and rotating the bot token does not affect
it.* Four senders exist, all sharing one message format:

1. **The application** — `lib/security/notify/telegram.ts`, driven by the
   incident engine. This is the sender for everything the app itself detects
   (authentication attacks, privilege changes, abuse, malware). It alerts on
   the FIRST detection of an incident, on escalation, and once on recovery —
   never per event. See `SECURITY-MONITORING.md`.
2. **GitHub Actions** — `.github/actions/telegram-alert`, a shared composite
   action used by `uptime.yml` and `cron.yml`. `uptime.yml` alerts on state
   TRANSITIONS only (first failure, then recovery), using GitHub's own run
   history as the state store — the app's incident engine cannot help here,
   because the site being down is exactly when it is unreachable.
3. **Box jobs** — `scripts/ops/alert-telegram.mjs` is the CLI any script or
   systemd unit calls (`--severity 1-4 --title … --message … --runbook …`);
   the storage backup job uses it on failure. Verify wiring any time with
   `node scripts/ops/alert-telegram.mjs --test`.
4. **External monitor** — UptimeRobot (free tier) probes
   `https://library.ptec.edu.kh/api/health` and `GET /` at 5-min intervals;
   configure its alert contact as email + the UptimeRobot Telegram
   integration to the same chat. Configuration checklist in
   `MONITORING.md` §Uptime probes.

All four use the same severity tags, HTML escaping and dual UTC + Phnom Penh
timestamps; `lib/security/notify/format.test.ts` reads the CLI's source and
fails if they drift apart.

GitHub's "workflow failed" email to the repo owner remains the backstop when
Telegram itself is down — and a run of failed deliveries with no successes
opens an `alert-pipeline-degraded` incident, so a silently broken channel is
itself alertable. Sev 3/4 stay dashboard/digest (`SECURITY_ALERT_MIN_SEVERITY`
enforces it in one place) — do not push them to Telegram, or rule 5 (baseline
reviews) will be retuning it within a month.

## Availability & infrastructure

| Alert | Purpose | Source | Threshold | Sev | Owner | Suppression | Escalation | Runbook | Recovery |
|---|---|---|---|---|---|---|---|---|---|
| site-down | Homepage unreachable | External probe `GET /` (`/home` 308-redirects — probing it false-alarms on monitors that don't follow redirects) | 2 consecutive failures (≈2–10 min) | 1 | WL | Maintenance window flag in monitor | BO if tunnel/box; DIR if > 2 h (comms) | RUNBOOKS §I1 | probe green 5 min |
| dependency-degraded | DB or storage failing behind a live app | Probe `GET /api/health` returns 503 | 2 consecutive | 1 (db) / 2 (storage) | WL | during site-down (dedupe: child of it) | Supabase support / BO | §I2, §I3 | health 200 |
| dns-broken | Domain not resolving | External DNS check on `library.ptec.edu.kh` | any NXDOMAIN/SERVFAIL | 1 | WL | none | Registrar/Cloudflare support | §I1 step DNS | resolves from 2 networks |
| tls-expiry | Cert about to lapse | Monitor cert check (site + `api.storage-ptec.online`) | < 21 days | 4 → 2 at < 7 days | WL/BO | none | — | §M14 | cert > 30 d |
| tunnel-down | Cloudflared dead (origin orphaned) | Cloudflare tunnel status / probe pattern (530s) | tunnel "down" 5 min | 1 | BO | box maintenance window | WL | §I1 step 2 | tunnel healthy |
| origin-disk | Box disk filling | Box cron `df -h` | 80 % (Sev 3) / 90 % (Sev 2) | 3/2 | BO | none | WL | §I7 | < 75 % |
| db-capacity | Supabase disk/connections | Supabase dashboard alerts | 80 % disk; connection errors in logs | 2 | WL | none | plan upgrade decision → DIR | §I2 | < 70 % |
| slow-queries | DB latency regression | `/api/health` deep `latencyMs.db`; Supabase query report | p95 > 1.5 s for 15 min | 3 | WL | during traffic spikes already alerting | — | §I6 | p95 < 500 ms |

## Application & jobs

| Alert | Purpose | Source | Threshold | Sev | Owner | Suppression | Escalation | Runbook | Recovery |
|---|---|---|---|---|---|---|---|---|---|
| elevated-5xx | App errors spiking | Logs: HTTP 5xx / `digest:` lines | > 10/h or > 1 % of requests | 2 | WL | during deploys (15 min window) | roll back deploy | §I6 | < 2/h for 1 h |
| elevated-4xx | Scraping/broken links burst | Logs: 404/429 rate | 5× 7-day baseline for 30 min | 3 | WL | known crawler UAs | DDOS playbook if hostile | DDOS-PROTECTION.md | back to baseline |
| pdf-unavailable | Book PDFs failing to serve | Probe: one known PDF URL + `file_health` sweep | probe fail 2× or sweep > 3 new broken | 2 | WL | storage-down open (child) | BO | §I4 | probe green + sweep clean |
| cron-missed | Scheduled jobs not running | Cron pinger (healthchecks.io-style) on `/api/cron/*` wrappers | no ping in 26 h | 3 | WL | none | — | §M2 | ping received |
| queue-push-failures | web-push sends erroring | Logs: push send failures | > 20 % of a broadcast | 3 | WL | none | — | push runbook (0081 notes) | next broadcast clean |
| upload-failures | Admin uploads erroring | Logs: `upload_rejected` (non-security) / 5xx on upload action | > 3/h | 3 | WL | bulk-import sessions | — | §I3 | uploads succeed |
| contact-mail-failure | Contact/auth email dead | Logs: 5xx on `/api/contact`; Supabase auth email errors | any sustained (2+ in 1 h) | 2 | WL | none | Gmail App-Password rotation | §I5 | test mail delivered |

## Backups & data

| Alert | Purpose | Source | Threshold | Sev | Owner | Suppression | Escalation | Runbook | Recovery |
|---|---|---|---|---|---|---|---|---|---|
| backup-failed | Nightly backup errored | `backup-db.mjs` / `backup-storage-files.mjs` push the alert themselves on failure; `ops_events` status=fail | any | 2 | WL | none | — | §I17 | next run ok |
| backup-stale | Backups silently not happening | `/api/health` deep `backupAgeHours` (monitor with bearer) | > 30 h or null | 2 | WL | announced backup-host downtime | — | §I17 | age < 24 h |
| backup-integrity | Archive corrupt | `--verify` chained inside the nightly `backup-db.mjs` run → `ops_events` kind=backup_verify status=fail (and backup_db=fail, so a corrupt archive never reads as a fresh restore point) | any | 2 | WL | none | re-run from source | §I17 | verify OK |
| file-snapshot-stale | Zima rsync leg dead | `.last-ok` marker age (box cron) | > 8 days | 2 | BO | none | WL | BACKUP-DR §3 | marker fresh |
| drill-overdue | No restore drill this quarter | Calendar / `ops_events` kind=restore_drill | > 100 days | 4 | WL | none | DIR | BACKUP-DR §7 | drill PASS recorded |
| data-quality-broken-files | Rot in stored file links | `/admin/data-quality` sweep results | new broken > 3 | 3 | WL | none | — | data-quality dashboard | sweep clean |

## Security

**These are now executable.** Until 2026-08-31 every alert in this section
described a threshold against `evt:"security"` log lines that were never
collected — no alert here could fire. Events are now persisted
(`security_events`, migration 0127) and evaluated every 5 minutes by
`/api/cron/security-scan`; the thresholds below are the defaults in
`lib/security/config.ts` and each is an environment variable. Mechanism:
`SECURITY-MONITORING.md`. Anything in the source column marked *(no source)*
still has no signal in this deployment and is listed so nobody mistakes a zero
for an all-clear.

| Alert | Purpose | Source | Threshold | Sev | Owner | Suppression | Escalation | Runbook | Recovery |
|---|---|---|---|---|---|---|---|---|---|
| admin-auth-anomaly | Account probing / takeover attempt | `evt:security` `auth_forbidden`/`mfa_required` | > 10/h one user or IP | 2 | WL | pen-test windows | §I8 immediately if success suspected | §I8 | 24 h quiet |
| privilege-change | Role escalation visibility | `admin_audit_log` role-change rows | any admin/super_admin grant | 3 (info) / 1 if unexpected | WL | change ticket exists | DIR | §I8/§M12 | reviewed + acknowledged |
| cron-secret-guessing | Someone probing job endpoints | `evt:security` `cron_auth_failed` | any | 2 | WL | own misconfig (first 24 h after deploy) | rotate CRON_SECRET | §I10 | none for 24 h |
| malware-upload | Infected file blocked (or missed) | `virus_scan_blocked` / VirusTotal hit | any | 2 | WL | none | §I12; DIR if published file affected | §I12 | file removed + rescan clean |
| captcha-storm | Bot campaign on forms | `captcha_failed` | > 50/h | 3 | WL | none | DDOS playbook | DDOS-PROTECTION.md | < 10/h |
| rate-limit-storm | Abuse/download farming | `rate_limited` | > 100/h | 2 | WL | announced load test | DDOS playbook / strict env switches | §I13 | < 20/h |
| waf-spike | Edge attack traffic | Cloudflare Security Events *(no source — needs a read-only API token; adapter is typed and ready)* | 10× baseline | 3 → 2 sustained | WL | none | Under Attack Mode | DDOS-PROTECTION.md | baseline 2 h |
| brute-force | Password guessing against one account | `login_failed` (server-side login proxy) | 10 per account / 15 min | 2 | WL | none | §I8; §I9 if admin | §I8 | 30 min quiet |
| credential-stuffing | One client testing many accounts | `login_failed` grouped by client hash | 5 distinct accounts / 15 min | 2 | WL | none | §I8 | §I8 | 30 min quiet |
| auth-success-after-failures | Possible account takeover | `login_succeeded` following ≥8 failures | any | 1 admin / 2 public | WL | none | §I9 immediately | §I9 | account holder confirms |
| mfa-failure-spike | Second factor being guessed, or clock drift | `mfa_failed` | 5 / 15 min | 2 | WL | none | §I8 | §I8 | 30 min quiet |
| enumeration | Scanner mapping the API | unmatched `/api/*` requests | 25 per client / 10 min | 3 | WL | verified crawlers excluded | DDoS playbook | DDOS-PROTECTION.md | 30 min quiet |
| injection-pattern | Possible injection/traversal probing | signature class on query or path | 3 of one class / 10 min | 3 | WL | none | — | SECURITY-HEADERS.md | 30 min quiet |
| upload-abuse | Upload validator being probed | `upload_rejected` | 10 / h | 3 | WL | bulk-import sessions | §I3 | §I3 | 30 min quiet |
| malware-scanner-open | Uploads landing unscanned | `virus_scan_error`/`virus_scan_skipped` | 3 | 2 | WL | none | set FAIL_CLOSED_VIRUS_SCAN | §I12 | scanner healthy |
| alert-pipeline-degraded | Incidents open but nobody is told | `alert_deliveries` failures with no successes | 3 in 1 h | 2 | WL | none | check bot token / chat id | MONITORING.md | a delivery succeeds |
| csp-novel-violation | New injection vector or regression | `/api/csp-report` distinct directive+URI | first occurrence of a new pair | 4 | WL | known-noisy extensions list | — | SECURITY-HEADERS.md | triaged |
| dependency-vuln | Vulnerable prod dependency | CI `npm audit` + dependency-review | high/critical | 3 | WL | accepted-risk list (documented) | — | §M5 | CI green |
| secret-in-history | Committed secret | gitleaks CI | any | 1 | WL | none | rotate first, then rewrite | §I10 | rotated + scan clean |
| security-spike | One event type bursting (stuffing, scraping) | `evt:security` `security_spike` (in-process detector, `lib/security-log.ts`) | any (detector already thresholds at 20/min/type; `SECURITY_SPIKE_THRESHOLD` tunes) | 2 | WL | announced load test | matching playbook for the underlying type | §I8/§I13 | no spike events 2 h |
| rate-limiter-degraded | DB rate limiter erroring — limits running on in-memory fallback | `evt:security` `rate_limiter_degraded` (1/min heartbeat per instance) | any sustained (2+ in 10 min) | 2 | WL | during a declared db incident (child of dependency-degraded) | Supabase support | §I2 | none for 30 min |
| lockdown-active | Emergency lockdown refusing requests | `evt:security` `lockdown_blocked` | any (info while a lockdown is declared; Sev 1 if NO lockdown was declared — switch set unexpectedly) | 3 / 1 | WL | declared incident window | DIR if undeclared | SECURITY_DEFENSE_IN_DEPTH.md §Lockdown | switches cleared |

## Hygiene rules (anti-fatigue)

1. **Grouping**: dependency-degraded is a child of site-down; pdf-unavailable
   is a child of storage checks — a parent open suppresses children.
2. **Dedupe**: monitors alert on state *transitions*, not every failing poll.
3. **Maintenance windows**: set the monitor's window before planned work —
   never mute channels ad hoc.
4. **No per-user-error alerts**: single 404s, individual failed logins, and
   one-off captcha failures are dashboard data, not alerts.
5. **Baseline reviews**: first Monday monthly — retune any alert that fired
   > 3× without action taken (raise threshold or fix root cause; never
   silently mute). Record changes in this file's git history.
6. **No secrets/PII in alert payloads**: alerts carry counts, request-ids,
   and links to dashboards — never tokens, passwords, message bodies, or raw
   IPs beyond what the log contract already permits.

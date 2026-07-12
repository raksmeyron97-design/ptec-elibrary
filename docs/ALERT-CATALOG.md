# Alert Catalog

_Created 2026-07-12 (roadmap Task 5). This is the authoritative list — no
alert exists (or may be added) without every column filled in. Probes and
log filters are defined in `MONITORING.md`; incident procedures in
`RUNBOOKS.md`. Owner defaults: **WL** = web-team lead, **BO** = ZimaOS box
owner, **DIR** = library director._

## Severity model

| Sev | Meaning | Response | Channel |
|---|---|---|---|
| **1** | Critical outage or confirmed compromise (site down, DB down, admin account breached) | Act immediately, any hour | Phone/push to WL |
| **2** | Major degradation or high security risk (storage down, auth failures spike, backups failing) | Same working day | Push/email to WL |
| **3** | Partial degradation or operational issue (one route erroring, disk 80 %, noisy captcha) | Next working day / ticket | Email |
| **4** | Warning or maintenance item (CSP novelty, cert < 30 d, drift) | Weekly review | Dashboard/digest |

## Availability & infrastructure

| Alert | Purpose | Source | Threshold | Sev | Owner | Suppression | Escalation | Runbook | Recovery |
|---|---|---|---|---|---|---|---|---|---|
| site-down | Homepage unreachable | External probe `GET /home` | 2 consecutive failures (≈2–10 min) | 1 | WL | Maintenance window flag in monitor | BO if tunnel/box; DIR if > 2 h (comms) | RUNBOOKS §I1 | probe green 5 min |
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
| backup-failed | Nightly backup errored | Cron wrapper exit ≠ 0 → mail/webhook; `ops_events` status=fail | any | 2 | WL | none | — | §I17 | next run ok |
| backup-stale | Backups silently not happening | `/api/health` deep `backupAgeHours` (monitor with bearer) | > 30 h or null | 2 | WL | announced backup-host downtime | — | §I17 | age < 24 h |
| backup-integrity | Archive corrupt | `verify-backup.mjs` failure (chained after backup) | any | 2 | WL | none | re-run from source | §I17 | verify OK |
| file-snapshot-stale | Zima rsync leg dead | `.last-ok` marker age (box cron) | > 8 days | 2 | BO | none | WL | BACKUP-DR §3 | marker fresh |
| drill-overdue | No restore drill this quarter | Calendar / `ops_events` kind=restore_drill | > 100 days | 4 | WL | none | DIR | BACKUP-DR §7 | drill PASS recorded |
| data-quality-broken-files | Rot in stored file links | `/admin/data-quality` sweep results | new broken > 3 | 3 | WL | none | — | data-quality dashboard | sweep clean |

## Security

| Alert | Purpose | Source | Threshold | Sev | Owner | Suppression | Escalation | Runbook | Recovery |
|---|---|---|---|---|---|---|---|---|---|
| admin-auth-anomaly | Account probing / takeover attempt | `evt:security` `auth_forbidden`/`mfa_required` | > 10/h one user or IP | 2 | WL | pen-test windows | §I8 immediately if success suspected | §I8 | 24 h quiet |
| privilege-change | Role escalation visibility | `admin_audit_log` role-change rows | any admin/super_admin grant | 3 (info) / 1 if unexpected | WL | change ticket exists | DIR | §I8/§M12 | reviewed + acknowledged |
| cron-secret-guessing | Someone probing job endpoints | `evt:security` `cron_auth_failed` | any | 2 | WL | own misconfig (first 24 h after deploy) | rotate CRON_SECRET | §I10 | none for 24 h |
| malware-upload | Infected file blocked (or missed) | `virus_scan_blocked` / VirusTotal hit | any | 2 | WL | none | §I12; DIR if published file affected | §I12 | file removed + rescan clean |
| captcha-storm | Bot campaign on forms | `captcha_failed` | > 50/h | 3 | WL | none | DDOS playbook | DDOS-PROTECTION.md | < 10/h |
| rate-limit-storm | Abuse/download farming | `rate_limited` | > 100/h | 2 | WL | announced load test | DDOS playbook / strict env switches | §I13 | < 20/h |
| waf-spike | Edge attack traffic | Cloudflare Security Events | 10× baseline | 3 → 2 sustained | WL | none | Under Attack Mode | DDOS-PROTECTION.md | baseline 2 h |
| csp-novel-violation | New injection vector or regression | `/api/csp-report` distinct directive+URI | first occurrence of a new pair | 4 | WL | known-noisy extensions list | — | SECURITY-HEADERS.md | triaged |
| dependency-vuln | Vulnerable prod dependency | CI `npm audit` + dependency-review | high/critical | 3 | WL | accepted-risk list (documented) | — | §M5 | CI green |
| secret-in-history | Committed secret | gitleaks CI | any | 1 | WL | none | rotate first, then rewrite | §I10 | rotated + scan clean |

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

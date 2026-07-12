# Operations Runbooks

_Created 2026-07-12 (roadmap Task 6). Master procedure book: maintenance
(§M) and incidents (§I). Alert → runbook mapping lives in
`ALERT-CATALOG.md`; probes/log filters in `MONITORING.md` (whose eight
original runbooks this file supersedes and extends); backup/DR detail in
`BACKUP-DR.md`; retention policy in `DATA-GOVERNANCE.md`._

## Shared conventions (read once)

- **Roles**: **WL** web-team lead (technical owner, first responder) ·
  **BO** ZimaOS box owner (physical infra) · **DIR** library director
  (communications + policy). The named-person contact list lives in the
  team's shared drive ("PTEC ops contacts") — deliberately **not** in this
  repo.
- **Communication (all Sev 1–2 incidents)**: WL posts a one-line status to
  the team channel within 30 min ("what broke, impact, next update time");
  DIR owns any public/site-banner message. Never speculate about causes
  publicly; never include user data.
- **Evidence (all security incidents)**: before changing anything, capture:
  timestamps, `x-request-id`s, relevant `docker logs`/Vercel log excerpts,
  `admin_audit_log` rows, Supabase auth-log screenshots, Cloudflare event
  export. Store in the shared drive under `incidents/<date>-<slug>/`.
- **Post-incident review (all Sev 1–2)**: within one week, 30 min, written
  as `docs/drills/PIR-<date>.md`: timeline, root cause, what worked, what
  didn't, ≤ 3 follow-up actions with owners. Update the runbook that ran.
- **Secrets**: procedures reference the password manager; no secret values
  appear here or in any incident notes.

---

## Maintenance (M)

### M1 Daily (5 min, WL — automated where noted)
- [ ] Uptime monitor green (probes 1–7, MONITORING.md) — *push on failure*
- [ ] Nightly backup + verify succeeded (cron mail absent = OK; `ops_events` row) — *alert on failure*
- [ ] Glance at error log for new 5xx/`digest:` lines
- [ ] `/admin/review`: anything waiting > 48 h? nudge reviewer

### M2 Weekly (20 min, WL)
- [ ] `/admin/search-insights`: work the zero-result action center
- [ ] `/admin/data-quality`: new broken files → §I4
- [ ] Supabase Auth logs: email delivery errors → §I5 early warning
- [ ] Cron endpoints ran (cleanup, publish-scheduled) — check pinger
- [ ] Zima snapshot marker `.last-ok` < 8 days (BO)
- [ ] Contact inbox: nothing unanswered > 5 working days

### M3 Monthly (1 h, WL)
- [ ] Review `admin_audit_log` at `/admin/logs` (odd actors? bulk deletes? role changes → §M12)
- [ ] Supabase dashboard: disk %, connection peaks, slow queries; confirm managed backups exist
- [ ] Alert hygiene review (ALERT-CATALOG.md §hygiene rule 5)
- [ ] Dependency PRs / `npm audit` triage (§M5)
- [ ] Prune backup archive per retention (BACKUP-DR §3)

### M4 Quarterly security review (half day, WL + DIR)
- [ ] User-role review (§M12) and staff access review signed by DIR
- [ ] Secret-rotation check (§M16): anything > 12 months old?
- [ ] Restore drill (`restore-drill.mjs`) — PASS recorded in `docs/drills/`
- [ ] Tabletop: run the next exercise in TABLETOP-EXERCISES.md rotation
- [ ] Cloudflare/tunnel review (§M15); cert expiries (§M14)
- [ ] Re-read SECURITY-OPS.md dashboard checklist for drift
- [ ] RLS probe suite: `RLS_PROBE=1 npx vitest run lib/rls.test.ts`

### M5 Dependency updates
1. Branch. `npm outdated`; take patch/minor batches, majors individually.
2. `npm run lint && npx tsc --noEmit && npm test -- --run`, then e2e smoke.
3. Never update `next`, `serwist`, or `pdfjs-dist` blind — each has known
   coupling (webpack build flag, SW generation, worker assets).
4. Deploy via §M7; watch elevated-5xx alert for 24 h.

### M6 Database migration procedure
1. Migration file is sequential, reviewed, and states its **rollback notes**
   in the header (mandatory since 0086).
2. `node scripts/backup/backup-db.mjs` immediately before applying.
3. Apply on hosted SQL editor in order; paste output into the PR/commit.
4. Verify: the feature's smoke check + `SELECT` the new objects; run
   `restore-drill.mjs` if the migration touched critical tables.
5. If broken → §I16.

### M7 Deployment
1. CI green (typecheck, lint, unit, e2e, audit, gitleaks).
2. Build uses `next build --webpack` (Turbopack silently drops the service
   worker — hard constraint from the 0081 incident).
3. Deploy box image (ZIMAOS-DEPLOYMENT.md), keep previous image tag.
4. Post-deploy: `/api/health` 200, homepage, one book page, one PDF read,
   admin login. Watch logs 15 min.

### M8 Rollback
- Box: redeploy previous image tag (ZIMAOS-DEPLOYMENT.md §rollback). Vercel:
  promote previous deployment.
- DB migrations are **not** auto-reverted: use the migration's rollback
  notes; restore data from the pre-migration backup only if data was
  damaged (§I14/§I16).
- Roll back code before data, then re-validate §M7 step 4.

### M9 Backup verification — nightly automated
(`verify-backup.mjs` chained after backup); monthly manual: open the newest
manifest, spot-check row counts against live counts for `books`,
`profiles`, `research_reports`.

### M10 Restoration — BACKUP-DR.md §6 (single-table, full-DB, storage, full-platform).

### M11 Content-metadata review
Weekly: `/admin/review` queue empty-ish; monthly: pick 5 random published
records → checklist grade ≥ B? verify facts against the source PDF; fix via
edit forms (versioned + audited automatically).

### M12 User-role review (quarterly, WL, DIR signs)
1. `/admin/users`: list staff+ accounts. Each maps to a current staff member?
2. Departures → offboard (§M17). Role creep → downgrade (audit-logged).
3. Confirm every admin-panel account has MFA enrolled (AAL2 is enforced, but
   verify factor list isn't stale).
4. Record sign-off in the shared drive.

### M13 Storage capacity review (monthly, BO)
`df -h` on box (< 80 %), Supabase disk (< 80 %), R2 usage vs plan, Vercel
Blob usage. Trend: uploads grow ~size-of-new-collection; plan upgrades a
quarter ahead.

### M14 Domain & certificate renewal
Domain auto-renew ON + card valid (check quarterly). Certs are
Cloudflare-managed (site) and Let's Encrypt on the box
(`api.storage-ptec.online` — confirm certbot timer). tls-expiry alert backs
this up; on alert: renew manually, then find why automation failed.

### M15 Cloudflare / tunnel review (quarterly, WL+BO)
Tunnel version + uptime; WAF rules still match DDOS-PROTECTION.md; DNS
records inventory unchanged (export a screenshot); Access policies (if any)
still least-privilege; API tokens scoped + < 12 months.

### M16 Secret rotation
- Inventory = `.env.example` + `backup-config.mjs` fingerprint.
- Rotate on: staff departure with access (§M17), any suspected exposure
  (§I10), or 12-month age for: `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`,
  `ADMIN_SECRET_KEY`, SMTP app password, Zima API key, VAPID keys (note:
  VAPID rotation invalidates push subscriptions — announce), R2 keys.
- Procedure per secret: generate new → update password manager → update
  Vercel/box env → redeploy → verify feature → revoke old. Never revoke
  before the new one is proven.

### M17 Staff onboarding / offboarding
**On**: account with correct role (least privilege — start `staff`), MFA
enrolled before first admin session, read RUNBOOKS.md §conventions +
SECURITY.md, added to ops contacts + monitor notifications.
**Off** (same day): role → `reader`, sign out all sessions (Supabase
dashboard), remove from monitor/contacts/shared drive, rotate any secret
they held (§M16), note in the quarterly access review.

---

## Incidents (I)

Format per runbook: **Purpose/Trigger/Sev** · Contain · Diagnose · Recover ·
Validate · Communicate/Escalate · Evidence · Rollback · Follow-up. Shared
conventions (top of file) always apply.

### I1 Website unavailable — Sev 1
- **Trigger**: site-down alert; user reports.
- **Contain**: none needed (already down) — start comms clock.
- **Diagnose** (outside-in): `curl -I https://library.ptec.edu.kh/home` →
  Cloudflare status page → tunnel (`docker logs cloudflared`; 530s = dead
  tunnel) → app (`docker ps`, `docker logs app --tail 200`) → `/api/health`.
- **Recover**: restart tunnel/app containers; if box dead → flip DNS to the
  Vercel fallback deployment (ZIMAOS-DEPLOYMENT.md §rollback).
- **Validate**: probes 1–2 green 5 min; test from mobile network.
- **Escalate**: BO (box), DIR (> 2 h, public note).
- **Evidence**: container logs, Cloudflare analytics window.
- **Rollback**: if a deploy caused it → §M8.
- **Follow-up**: PIR; if tunnel-related, add tunnel health to box cron.

### I2 Database unavailable — Sev 1
- **Trigger**: dependency-degraded (`db: fail`); PostgREST 5xx storm.
- **Contain**: nothing destructive; cached public pages keep serving.
- **Diagnose**: status.supabase.com → project dashboard (paused? disk full?
  connection limit?). Free-tier pause is the classic cause.
- **Recover**: resume project / clear connections (restart app container
  releases the pool) / disk → §I7 DB branch.
- **Validate**: `/api/health` 200; login; one write (save a note).
- **Escalate**: Supabase support ticket (Sev 1 template); DIR for comms.
- **Evidence**: dashboard screenshots, first failing `x-request-id`.
- **Rollback**: n/a. **Follow-up**: if pause — set calendar keep-alive or
  upgrade plan decision to DIR.

### I3 Storage (Zima) unavailable — Sev 2
- **Trigger**: `storage: fail`; covers 404; PDF reads failing.
- **Contain**: none; legacy R2 files unaffected (separate origin).
- **Diagnose**: box up? service up? disk? cert on `api.storage-ptec.online`?
- **Recover**: restart service; cert renew (§M14); if hardware →
  BACKUP-DR §6.3 (restore snapshot to new origin, repoint `ZIMA_API_URL`).
- **Validate**: health green; open 3 PDFs incl. 1 recent upload.
- **Escalate**: BO owns; WL assists. **Evidence**: box logs.
- **Rollback**: n/a. **Follow-up**: verify snapshot leg was current.

### I4 PDF files unavailable (site otherwise fine) — Sev 2
- **Trigger**: pdf-unavailable alert; data-quality sweep spike.
- **Diagnose**: one file or many? `file_health` table + `check-file-health.ts`
  run. One → bad upload/deleted object; many on one origin → §I3; many
  legacy-R2 → R2 creds/bucket issue (check R2 dashboard, presign creds).
- **Recover**: re-upload single files from backup snapshot; origin issues →
  §I3; R2 credential issue → rotate keys (§M16) and verify presigner.
- **Validate**: sweep clean; affected books open end-to-end.
- **Evidence**: sweep output before/after. **Follow-up**: if deletion — how?
  audit log → possibly §I11/§I14.

### I5 Contact emails not delivered — Sev 2
- **Trigger**: contact-mail-failure alert; user report; signups stuck.
- **Diagnose**: Supabase Auth logs "error sending email"; test the contact
  form; Gmail account health (App Password revoked is the usual cause;
  daily ~500 send limit — look for a send loop before blaming Google).
- **Recover**: new App Password → Supabase SMTP settings + `SMTP_PASS` env →
  redeploy; loop → disable offending feature first.
- **Validate**: password-reset email + contact reply arrive.
- **Evidence**: auth log excerpts. **Follow-up**: consider dedicated
  transactional provider if repeats.

### I6 Elevated application errors — Sev 2
- **Trigger**: elevated-5xx; slow-queries.
- **Contain**: if a deploy in the last hour → roll back first (§M8), ask
  questions after.
- **Diagnose**: one route or all? (all → dependency: check `/api/health`).
  Grab failing `x-request-id`, grep across layers; reproduce locally.
- **Recover**: rollback or forward-fix; DB latency → Supabase query report,
  add index/cache.
- **Validate**: error rate < 2/h for 1 h. **Evidence**: log excerpts,
  request-ids. **Follow-up**: add the failure mode to tests.

### I7 Disk nearly full — Sev 2/3
- **Box**: `docker system prune -af` (careful — keeps only running), log
  rotation/journald vacuum, then uploads growth → BO plans disk.
- **Supabase**: biggest tables are `book_pages`/`book_chunks` — never
  truncate without the rebuild plan (they ARE rebuildable:
  extract-pdf-text + embed-library); prefer plan upgrade; run retention
  purges (cron cleanup) which also trim search analytics + versions.
- **Dev machine**: `.next`, Playwright browsers safe to delete; avoid full
  prod builds locally (chronic constraint).
- **Validate**: < 75 %. **Follow-up**: adjust M13 trend line.

### I8 Suspected account compromise (any user) — Sev 2
- **Trigger**: admin-auth-anomaly; user report; odd audit rows.
- **Contain**: Supabase dashboard → user → sign out all sessions; force
  password reset.
- **Diagnose**: auth logs (times/IPs), `admin_audit_log` for actions,
  content changes by that account (content_versions history).
- **Recover**: reset credentials, verify MFA factors are the user's own,
  revert content via version restore.
- **Validate**: user confirms control; no further anomalies 24 h.
- **Evidence**: preserve before resetting (auth log export, audit rows).
- **Escalate**: if role ≥ staff → treat as §I9. **Follow-up**: PIR.

### I9 Admin account compromised — Sev 1
- **Contain (in order, minutes matter)**: sign out all sessions →
  `profiles.role='reader'` for the account → remove unknown MFA factors →
  if super_admin: rotate `SUPABASE_SERVICE_ROLE_KEY` + `ADMIN_SECRET_KEY`
  (§M16) and redeploy.
- **Diagnose**: full `admin_audit_log` review for the account's window;
  `content_versions` diff for every touched record; role_permissions and
  user-role changes; push_broadcast abuse.
- **Recover**: revert content (version restore), re-grant role only after
  new credentials + MFA re-enrollment; check for persistence (new admin
  accounts created, changed emails).
- **Validate**: RLS probes pass; audit log quiet; all admin accounts
  re-verified (M12 mini-run).
- **Communicate**: DIR decides user-facing disclosure; if user data was
  accessed → §I11 obligations.
- **Evidence**: everything (shared-drive incident folder) — before mutation.
- **Follow-up**: PIR mandatory; tabletop TT-4 lessons refresh.

### I10 Secret exposed (commit, log, screenshot, chat) — Sev 1
- **Contain**: rotate the secret NOW (§M16 order: new → deploy → revoke).
  Rotation is the fix; deleting the leak is cosmetic.
- **Diagnose**: what could it access? Any use in logs during exposure window
  (service key → PostgREST logs; Zima key → storage logs)?
- **Recover**: after rotation, rewrite git history only if the repo is/was
  shared; force-push coordination.
- **Validate**: old secret rejected (test one call); gitleaks clean.
- **Evidence**: exposure window, where it appeared. **Follow-up**: how did
  it escape? fix the path (pre-commit hook, log scrubbing).

### I11 Unauthorized data access — Sev 1
- **Trigger**: RLS probe failure, exposed endpoint discovered, report from
  outsider.
- **Contain**: close the hole first (RLS enable/revoke migration, route
  guard) even if it degrades a feature; document what was reachable.
- **Diagnose**: what data, since when (git blame the regression), accessed
  by whom (PostgREST/Cloudflare logs best-effort)?
- **Recover**: patch + probe (`RLS_PROBE=1` suite + manual anon curl).
- **Validate**: `docs/RLS-MATRIX.md` re-verified for the affected tables.
- **Communicate**: DIR decides notification duty based on data class
  (DATA-GOVERNANCE.md classification; user PII → notify affected users).
- **Follow-up**: add a probe test reproducing the hole; PIR.

### I12 Malware detected in upload — Sev 2
- **Trigger**: `virus_scan_blocked` (pre-publish) or VirusTotal flag on an
  already-published file.
- **Contain**: blocked pre-publish → nothing served; published → unpublish
  the record (status → archived) and delete/quarantine the object.
- **Diagnose**: uploader account (insider vs compromised — §I8), hash
  reputation details, other uploads by the same account (sha256 dedupe
  helps here).
- **Recover**: clean re-upload from a trusted source; rescan.
- **Validate**: VirusTotal clean; download of replacement verified.
- **Evidence**: file hash, VT report link, uploader audit rows. **Follow-up**:
  if it bypassed scanning (VIRUSTOTAL_API_KEY unset fails open) → set the
  key, alert on scan-skips.

### I13 DDoS or abusive traffic — Sev 2 (Sev 1 if down)
Full playbook: `DDOS-PROTECTION.md`. Order: Cloudflare Under Attack Mode →
`DDOS_MODE=1` env (no deploy needed) → `PDF_DOWNLOAD_LIMIT_STRICT=1` for
download farming → targeted WAF rules (ASN/country/path) → IP blocks last.
Validate: rate_limited events subside; real users unaffected (test from
phone). Evidence: Cloudflare event export. Follow-up: keep effective rules,
document in DDOS doc.

### I14 Accidental data deletion — Sev 1/2 by scope
- **Contain**: STOP all writes to the affected area (announce in channel);
  do not run "fix" updates before snapshotting current state
  (`backup-db.mjs` ad hoc — the wrong state is still evidence).
- **Diagnose**: what/when/how — audit log, content_versions, PostgREST logs.
- **Recover** (order of preference): `content_versions` restore (single
  records, audited) → JSONL archive rows re-insert (BACKUP-DR §6.1) →
  Supabase managed restore into a NEW project + copy rows across (never
  restore over live).
- **Validate**: spot-check restored records end-to-end; FK integrity
  (drill's checks against the live data via a fresh backup+drill run).
- **Evidence**: before/after row counts. **Rollback**: the pre-fix snapshot.
- **Follow-up**: why possible? missing confirm, over-broad role, bad script
  → fix; PIR.

### I15 Failed deployment — Sev 2
- **Contain**: §M8 rollback to previous image/deployment immediately.
- **Diagnose**: build logs vs runtime failure; env drift (compare config
  fingerprint); migration mismatch (deployed code expects unapplied
  migration → the pre-migration-safe pattern should have prevented it —
  which fallback was missing?).
- **Recover**: fix forward on a branch with the failure reproduced in CI.
- **Validate**: §M7 step 4 checklist.
- **Follow-up**: add the gap to CI; note in the migration procedure if
  code/migration ordering caused it.

### I16 Broken database migration — Sev 1/2
- **Contain**: stop applying further migrations; if the app is erroring
  against the new schema → §M8 code rollback first.
- **Diagnose**: which statement failed / what state is half-applied?
  (Supabase SQL editor: check objects the migration creates.)
- **Recover**: use the migration header's rollback notes to revert
  half-applied objects; restore damaged data from the pre-migration backup
  (M6 step 2 made one — this is why); fix the migration file; re-apply.
- **Validate**: feature smoke + `restore-drill.mjs` on a fresh backup.
- **Evidence**: SQL editor output. **Follow-up**: what did local testing
  miss? extend the migration checklist.

### I17 Backup failure — Sev 2
- **Trigger**: backup-failed / backup-stale / backup-integrity alerts.
- **Contain**: treat as "we currently have no recent restore point" —
  freeze risky changes (migrations, bulk edits) until a good backup exists.
- **Diagnose**: cron ran? (pinger) script error output? credentials expired?
  disk full on backup target? `ops_events` last rows.
- **Recover**: fix cause, run `backup-db.mjs` + `verify-backup.mjs`
  manually, confirm `ops_events` ok row and `backupAgeHours` < 24.
- **Validate**: next scheduled run also succeeds.
- **Follow-up**: if silent > 48 h — why didn't backup-stale fire? fix the
  monitor first.

### I18 Recovery from full server loss — Sev 1
The composite disaster: box destroyed / Supabase project gone / both.
1. Declare: WL + DIR agree scope; open incident folder; comms per shared
   conventions (expected outage: ≤ 1 working day per BACKUP-DR RTO).
2. DB: BACKUP-DR §6.2 (new project → migrations → JSONL reload → auth
   reconciliation).
3. Storage: BACKUP-DR §6.3 (snapshot → new origin → `ZIMA_API_URL`).
4. App: deploy `main` to Vercel first (fastest), box later; env from
   password manager, verified against latest config fingerprint.
5. DNS/auth config: Cloudflare records per ZIMAOS-DEPLOYMENT.md; Supabase
   Auth URL config; Turnstile keys.
6. Validate (in order): `/api/health` deep → public book page → PDF read →
   login+MFA → admin action → contact email → search (expect degraded until
   embeddings rebuilt) → OAI/exports.
7. Rebuild derived data (staged); re-enable crons; watch alerts 48 h.
8. PIR is mandatory; measure actual RTO/RPO vs targets and update
   BACKUP-DR §2.

---

## Staff training checklist (new operator)

- [ ] Read: this file's conventions, MONITORING.md, BACKUP-DR.md §1–2,
      DATA-GOVERNANCE.md summary, SECURITY-OPS.md
- [ ] Walk through `/admin` with an experienced operator (review queue,
      search insights, data quality, logs)
- [ ] Run a backup + verify + restore drill end-to-end, unassisted
- [ ] Locate: password manager entries, ops contacts, incident folder
- [ ] Shadow one weekly checklist (M2), then own one
- [ ] Tabletop: walk I1 and I9 verbally with the WL
- [ ] Confirm MFA enrolled; signature in the access-review sheet

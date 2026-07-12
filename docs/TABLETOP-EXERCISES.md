# Tabletop Exercises — Records & Lessons

_Created 2026-07-12 (roadmap testing requirement). Format: scenario walked
step-by-step against the REAL system state (configs, tables, backups, env)
— not against how we wish it looked. Every "finding" below was verified
against the live repo/DB during the 2026-07-11/12 governance phase; each
feeds a runbook update or follow-up. Cadence: one exercise per quarter
(RUNBOOKS §M4), rotating through this list._

## TT-1 Full website outage (runbook I1) — 2026-07-12

**Scenario**: probes report `/home` down at 21:00; WL is reachable, BO is not.

Walkthrough result: diagnosis chain (curl → Cloudflare → tunnel → app) is
fully executable by WL alone; the Vercel DNS fallback gives a recovery path
that does not need BO.

**Findings**
1. ✅ Runbook executable solo — no BO dependency for mitigation.
2. ⚠️ The fallback assumes the Vercel project's env is current. The new
   config fingerprint (weekly cron) is the drift detector — **follow-up:**
   after any env change on the box, mirror it to Vercel the same day (added
   to M2 mentally; enforce via fingerprint diff).
3. ⚠️ No status-page/banner mechanism exists for "we know, we're on it" —
   DIR communicates via social channel only. Accepted for now (small site).

## TT-2 Database failure (runbook I2) — 2026-07-12

**Scenario**: Supabase project paused/unavailable during a school morning.

**Findings**
1. ✅ Public pages partially survive via `unstable_cache`; health probe
   correctly reports `db: fail` (verified live behavior of `/api/health`).
2. ✅ We now hold an independent, hash-verified DB copy (2,309 rows nightly
   scope) — before this phase, recovery depended entirely on Supabase's
   plan-dependent backups (risk R2).
3. ⚠️ **Real gap found and fixed during the drill**: the restore tooling
   originally failed on 0-row tables (`catalog_books`) — the drill caught
   it; manifests now carry column lists. Lesson: *drills find restore bugs
   that backups never will* — keep the quarterly cadence.
4. ⚠️ `auth.users` cannot be exported via PostgREST — password hashes and
   MFA factors live only in Supabase's own backup. Documented in
   BACKUP-DR §8; accepted residual risk.

## TT-3 Storage failure (runbook I3) — 2026-07-12

**Scenario**: Zima box disk dies; last rsync snapshot is 1 day old.

**Findings**
1. ✅ Blast radius is correct in the runbook: legacy R2 files (114 refs in
   the live inventory) keep working — only Zima-hosted files (6 refs today,
   growing) go dark.
2. ⚠️ The storage inventory revealed the real current split: most files
   still live on **legacy R2 keys + external URLs** (117), so a Zima loss
   today is survivable — but every NEW upload increases Zima exposure.
   **Follow-up:** BO must evidence the rsync `.last-ok` marker before the
   next quarterly review (BACKUP-DR §8 gap stands).
3. ✅ Re-link validation is now automated (drill phase 4 probed restored
   URLs against live storage: 3/3 reachable).

## TT-4 Admin account compromise (runbook I9) — 2026-07-12

**Scenario**: super_admin session hijacked; attacker edits content and
grants a role.

**Findings**
1. ✅ Containment steps are executable from the Supabase dashboard alone
   (sessions, role reset, MFA factor removal) — no code deploy needed.
2. ✅ New `content_versions` trigger means every content mutation by the
   attacker is now snapshot-preserved and reversible (this did not exist
   before 0086 — previously "revert content changes" had no mechanism).
3. 🔴 **Single point of failure confirmed by the restore drill: exactly 1
   admin-capable profile exists.** If that account is compromised (or just
   MFA-locked), there is no second admin to run containment. **Follow-up
   (priority): create a second, sealed break-glass admin account (password
   manager, MFA on DIR's device), then it also covers accidental lockout.**
4. ⚠️ Service-key rotation forces redeploy; measured path (env update +
   redeploy) ≈ 15–30 min — acceptable, documented in I9.

## TT-5 Accidental deletion (runbook I14) — 2026-07-12

**Scenario**: a librarian bulk-deletes 30 books believing they were drafts.

**Findings**
1. ✅ Three recovery layers now exist, in preference order:
   `content_versions` (UPDATE history — but **deletes are not versioned**,
   see 3), nightly JSONL archive (row re-insert), Supabase managed restore.
2. ✅ "Snapshot the wrong state before fixing" step matters: verified the
   backup script is safe to run ad hoc (8s, read-only).
3. ⚠️ **Gap identified**: the 0086 trigger versions UPDATEs, not DELETEs —
   a hard delete leaves only the nightly archive (≤ 24 h RPO). Mitigation
   already in the workflow: the UI pushes "archive" (a status UPDATE,
   versioned + reversible) instead of hard deletes. **Follow-up (optional
   0089): BEFORE DELETE trigger writing a final snapshot; until then, the
   nightly archive is the recovery layer for hard deletes.**

## TT-6 DDoS / abusive traffic (runbook I13) — 2026-07-12

**Scenario**: download farming across the PDF proxy from a botnet.

**Findings**
1. ✅ Kill switches (`DDOS_MODE`, `PDF_DOWNLOAD_LIMIT_STRICT`) act without a
   deploy; rate limiting is DB-backed so it holds across instances.
2. ✅ New: obvious bots no longer pollute search analytics (UA filter at
   logging), so the zero-result report stays usable during an attack.
3. ⚠️ The rate-limit table itself grows under attack — `cleanup_rate_limit`
   cron is the pressure valve; confirmed it is wired and documented (M2).
4. ⚠️ Cloudflare WAF rules are account-side and not exported anywhere —
   **follow-up:** add the rules export/screenshot to the quarterly M15
   review (now in RUNBOOKS).

## Open follow-ups (owner → due)

| # | Action | From | Owner | Status |
|---|---|---|---|---|
| F1 | Create sealed break-glass second admin (MFA on DIR device) | TT-4 | WL+DIR | **open — priority** |
| F2 | Evidence Zima rsync `.last-ok` marker running | TT-3 | BO | open |
| F3 | Optional 0089: BEFORE DELETE snapshot trigger | TT-5 | WL | open (design noted) |
| F4 | Mirror env changes to Vercel same-day; diff fingerprints weekly | TT-1 | WL | open (process) |
| F5 | Export WAF rules at quarterly review | TT-6 | WL | folded into M15 ✓ |
| F6 | Apply migrations 0086–0088 to enable workflow columns, analytics actions, backup monitoring | phase | maintainer | **pending apply** |

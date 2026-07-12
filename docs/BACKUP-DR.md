# Backup & Disaster Recovery

_Created 2026-07-12 (roadmap Task 2). Supersedes the sketch in
`SECURITY-OPS.md` §3–5 (kept for dashboard-side steps). Tooling:
`scripts/backup/*.mjs`. Drill evidence: `docs/drills/`._

## 1. The 3-2-1 design

Three copies, two media, one off-site — per data class:

| Data | Copy 1 (live) | Copy 2 | Copy 3 (off-site/isolated) |
|---|---|---|---|
| **Database** (all metadata, users, audit, analytics) | Supabase hosted Postgres | Supabase managed daily backups (verify monthly in dashboard — plan-dependent) | `backup-db.mjs` JSONL archive on the operator machine/box, synced to a second location (external disk or private R2 bucket) |
| **Files** (PDFs, covers) on Zima | Zima Storage data dir | Nightly `rsync`/restic snapshot to a second disk **on a different device** (box cron — §3) | Weekly restic copy to a private R2 bucket (encrypted) |
| **Legacy R2 files** | R2 bucket | R2 object versioning (enable in dashboard) | Included in the weekly restic sweep when feasible |
| **Config/secrets** | Vercel/box env | Password-manager entry (values) | `backup-config.mjs` fingerprint (names + value hashes — **never values**) stored with the DB archive |
| **Code** | Working tree | GitHub remote | Any clone |
| **Infra config** (Cloudflare DNS/tunnel/WAF) | Cloudflare account | Documented in `ZIMAOS-DEPLOYMENT.md` + `DDOS-PROTECTION.md` | Screenshot/export after every change (quarterly checklist) |

Derived data is deliberately **outside** the RPO: `book_pages`,
`book_chunks`, `books.embedding` rebuild from the PDFs
(`scripts/extract-pdf-text.ts`, `scripts/embed-library.ts`); `rate_limit`
and caches are ephemeral.

## 2. Targets

| Metric | Target | Basis |
|---|---|---|
| **RPO — database** | ≤ 24 h (≤ 1 h during heavy editing weeks: run `backup-db.mjs` ad-hoc before/after bulk work) | nightly scripted backup + Supabase daily |
| **RPO — files** | ≤ 24 h | nightly rsync on the box |
| **RTO — single table / bad edit** | ≤ 1 h | restore values from JSONL archive or `content_versions` rollback |
| **RTO — database loss** | ≤ 4 h | new Supabase project + migrations + JSONL reload (drill-measured restore of current collection: **~6 s** for data; overhead is project setup) |
| **RTO — full platform loss** | ≤ 1 working day | composite: DB (≤4 h) + storage restore (size-dependent) + env restore (≤30 min) + redeploy/DNS (≤1 h) |
| **Retention** | 7 daily + 4 weekly + 6 monthly | prune script/manual (§3) |
| **Ownership** | Web-team lead (DB/config), box owner (file snapshots), director (policy sign-off) | see OPERATIONS-AUDIT.md §5 |

## 3. Schedules (cron)

On the operator machine or ZimaOS box (values illustrative — keep the real
crontab in the box's own docs):

```cron
# Nightly DB backup + integrity verify (03:10 local, off-peak)
10 3 * * * cd /path/to/e-library-ptec && node scripts/backup/backup-db.mjs \
  && node scripts/backup/verify-backup.mjs "$(ls -d ~/ptec-backups/db/*/ | tail -1)" \
  || echo "PTEC BACKUP FAILED" | mail -s "PTEC backup failure" <ops-email>

# Nightly storage inventory + reachability sample (03:40)
40 3 * * * cd /path/to/e-library-ptec && node scripts/backup/backup-storage-inventory.mjs

# Weekly config fingerprint (Sun 04:00)
0 4 * * 0 cd /path/to/e-library-ptec && node scripts/backup/backup-config.mjs

# Nightly file snapshot on the Zima box (04:10) — second disk
10 4 * * * rsync -a --delete /zima/data/ /mnt/backup-disk/zima-mirror/ && date > /mnt/backup-disk/zima-mirror/.last-ok

# Quarterly restore drill (also run before any risky migration)
# node scripts/backup/restore-drill.mjs
```

Retention pruning: keep the newest 7 daily dirs, first-of-week for 4 weeks,
first-of-month for 6 months; delete the rest (`ls ~/ptec-backups/db`).

## 4. Security posture

- **Encryption in transit**: every path is HTTPS (PostgREST) or SSH (rsync).
- **Encryption at rest**: set `BACKUP_PASSPHRASE` in the operator `.env` —
  every artifact is then AES-256-GCM encrypted (scrypt-derived key). The
  passphrase lives in the password manager, **not** in the repo. Unencrypted
  runs print a warning.
- **Access**: archives live under the operator account (`~/ptec-backups`),
  never inside the repo (no accidental commits) and never on the production
  app account. The app itself has no credentials that can read or delete
  backups — a compromised app cannot destroy them.
- **No secrets in artifacts**: DB rows contain no env secrets;
  `backup-config.mjs` stores names + SHA-256 prefixes only.
- **Integrity**: dual hashes per table (content + on-disk artifact) verified
  by `verify-backup.mjs`; tampering or bit-rot fails the check.

## 5. Monitoring & alerting

- Every script writes an `ops_events` row (migration 0088): `backup_db`,
  `backup_verify`, `backup_files`, `backup_config`, `restore_drill`, each
  `ok|warn|fail` with counts — no file contents, no secrets.
- `GET /api/health` with `Authorization: Bearer $CRON_SECRET` returns
  `backupAgeHours` from the latest good `backup_db` event. External monitor
  rule: **alert when > 30 h** (one missed nightly) — see `ALERT-CATALOG.md`
  §backup-stale.
- Scripts exit non-zero on failure; the cron wrapper's mail/webhook is the
  failed-backup alert. Never silence it — fix the cause.

## 6. Restoration procedures

### 6.1 Single bad edit / bad migration on one table
1. `node scripts/backup/restore-drill.mjs <archive>` — confirms the archive
   is sound and gives you a queryable copy in seconds.
2. Extract the needed rows from the JSONL (`gunzip -c books.jsonl.gz | jq …`;
   add `BACKUP_PASSPHRASE` decrypt step if encrypted).
3. Re-apply via PostgREST PATCH (service key) or SQL editor. For metadata
   fields, prefer the in-app `content_versions` restore (audit-logged).

### 6.2 Full database loss
1. Create a new Supabase project; apply `supabase/migrations/` in order.
2. Reload data from the newest verified archive (JSONL → PostgREST inserts;
   disable/re-enable triggers matter only for `content_versions` noise).
3. Restore auth: users re-register or are invited; `profiles` (restored)
   re-maps roles by email. Supabase-managed backup, when available, restores
   `auth.users` wholesale — prefer it, then reconcile `profiles`.
4. Update env (`NEXT_PUBLIC_SUPABASE_URL`, keys) from the password manager;
   verify against the latest config fingerprint. Redeploy.
5. Rebuild derived data: `extract-pdf-text.ts`, then `embed-library.ts`
   (staged — free-tier embedding quota).
6. Validate with the drill checklist: login + MFA, one book page, one PDF
   read, one admin action, `/api/health`.

### 6.3 Storage loss (Zima box)
1. Stand up storage from the newest snapshot (second disk / restic).
2. Point `ZIMA_API_URL` at the restored origin — **do not** bulk-rewrite DB
   URLs for a transient outage (MONITORING.md runbook 3).
3. Reconcile against the newest `storage-inventory-*.json`: every `zima`
   entry must resolve; the inventory's reachability sample automates the
   spot check.

### 6.4 Full platform loss
`SECURITY-OPS.md` §5 sequence, with this doc's archives as the sources.
Order: DB (6.2) → storage (6.3) → env/deploy → DNS → validation.

## 7. Drills

- **Cadence**: quarterly, plus before any risky migration.
- **Isolation**: `restore-drill.mjs` restores into in-process, in-memory
  PGlite — no network listener, nothing persisted, production untouchable.
- **Coverage**: integrity, schema+data restore, referential integrity
  (including the `download_logs.book_file_id` hosted-drift check),
  auth/roles presence, published-content completeness, admin/contact
  workflow tables, search-rebuild readiness, live storage re-link probes,
  timing. Reports land in `docs/drills/` and feed the runbook.
- **Latest result**: `docs/drills/RESTORE-DRILL-2026-07-12.md` — **PASS**,
  0 failures, 1 expected warning (derived tables excluded by design);
  64 tables / 2,309 rows restored and validated in ~7 s.
- A full-fidelity restore into a throwaway **Supabase** project (auth
  included) remains the per-semester exercise (SECURITY-OPS.md §4) — the
  PGlite drill is the safe, frequent one.

## 8. Known gaps / follow-ups

- Zima box rsync + off-site restic legs are **procedures on the box**, not
  yet evidenced in-repo — add the `.last-ok` marker check to the weekly
  checklist until confirmed running.
- Supabase managed-backup existence depends on plan; verify monthly
  (dashboard → Database → Backups) — do not assume PITR.
- `auth.users` is unreachable via PostgREST: account recovery depends on
  Supabase's backup or user re-registration + `profiles` re-mapping.

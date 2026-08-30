# Full-Fidelity Supabase Restore Guide

_The disaster path: the hosted Supabase project is gone (deleted, paused
beyond recovery, region loss) and the library must come back on a **new**
project. Created 2026-08-29. The quarterly PGlite drill
(`scripts/backup/restore-drill.mjs`) proves the data restores; this guide is
what it deliberately does not cover — a real project, real auth, real
storage re-linking. Run it as the per-semester drill (§7) against a
**throwaway** project before you ever need it in anger._

**What you need before starting** (if any is missing, that is the first
action item of the incident):

- The newest verified DB backup dir (`~/ptec-backups/db/<timestamp>/` on the
  operator machine/box — `verify-backup.mjs` must pass on it)
- `BACKUP_PASSPHRASE` (password manager) if the backup is encrypted
- The env inventory from `backup-config.mjs` + the password manager's full
  `.env` copy
- Repo access (github.com/raksmeyron97-design/ptec-elibrary)
- Supabase org owner access, and the Gmail App Password for SMTP

Time budget (RTO evidence from drills): new project + migrations ~30 min,
data load ~15 min, auth/storage/env re-linking ~45 min, redeploy + verify
~30 min → **≤ half a working day** for the database platform. File restore
(§5) runs in parallel from the box mirror.

---

## 1. Create the replacement project

1. Supabase dashboard → New project, region **Southeast Asia (Singapore)**
   (`vercel.json` pins functions to `sin1` next to it — a different region
   wrecks TTFB).
2. Record the new project ref, anon key, service-role key, and DB password in
   the password manager as you go — every later step consumes them.
3. Dashboard → Authentication → URL Configuration: Site URL
   `https://library.ptec.edu.kh`, and add the redirect URLs from the old
   project's config fingerprint (at minimum `/auth/callback` on the canonical
   host; dev hosts as needed).
4. Dashboard → Auth → SMTP: re-enter the Gmail SMTP settings (`SMTP_USER`,
   App Password) or every auth email silently uses Supabase's throttled
   default sender.
5. Re-apply the §1 hardening items from `SECURITY-OPS.md` (leaked-password
   protection, password strength, OTP expiry) — a fresh project has none of
   them.

## 2. Apply the schema (migrations, never hand-DDL)

The migration chain applies cleanly from the squashed baseline — the e2e CI
job proves this on every PR — so schema recovery is exactly:

```bash
git clone https://github.com/raksmeyron97-design/ptec-elibrary.git && cd e-library-ptec
supabase link --project-ref <NEW_REF>          # or use --db-url below
supabase db push --include-all --db-url "$NEW_SESSION_POOLER_URL"
```

Use the **Session pooler** connection string (port 5432), same as
`migrate.yml` — the direct `db.<ref>` host is IPv6-only and the transaction
pooler breaks prepared statements. Then run
`node scripts/migrations/check-schema-drift.mjs` against the new project: it
must report no drift before any data goes in.

## 3. Load the data

The backup is per-table JSONL (PostgREST shapes), so it loads back through
PostgREST with the new service key. Point the restore tooling at the new
project:

```bash
# .env.restore — NEW project, service key
NEXT_PUBLIC_SUPABASE_URL=https://<NEW_REF>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<new service key>
BACKUP_PASSPHRASE=<from password manager>
```

1. Verify the archive first: `node scripts/backup/verify-backup.mjs <dir>`.
2. Load tables in dependency order — parents before children:
   `organizations`, `departments`, `categories`, `authors`, `profiles`,
   then `books`, `book_files`, `research_reports`, `publications`,
   `learning_paths` (+ modules/steps), then everything that references them
   (`reviews`, `reading_*`, `download_logs`, `admin_audit_log`, …). Insert
   with `Prefer: return=minimal` and the service key; on FK errors, load the
   named parent first and retry (the PGlite drill's FK checks tell you the
   real dependency edges for the current schema).
3. **Sequences**: for any bigint-PK table loaded with explicit ids, reset the
   sequence (`SELECT setval(pg_get_serial_sequence('<t>','id'), (SELECT
   COALESCE(MAX(id),1) FROM <t>));` — SQL editor is acceptable here; the
   new project has no migration history to corrupt, but keep DDL out of it).
4. Skip derived tables if time-pressed: `book_pages`, `book_chunks`,
   embeddings rebuild later via `scripts/extract-pdf-text.ts` and
   `npx tsx scripts/embed-library.ts`; `rate_limit` starts empty on purpose.

## 4. Re-link auth (the honest hard part)

`auth.users` is not in the scripted backup — PostgREST cannot reach it
(BACKUP-DR.md §8). Two cases:

- **Supabase's own backup of the old project is restorable** (paid plans,
  region incident): prefer restoring their backup into the new project and
  treating §3 as a top-up/verification pass — auth comes back with real
  password hashes.
- **Total loss**: recreate accounts. `profiles` (restored in §3) is the
  authoritative roster of ids, emails, and roles. For each staff/admin
  profile, create the auth user with the **same UUID** via the Admin API so
  every FK keeps pointing at the right person:

  ```bash
  curl -X POST "https://<NEW_REF>.supabase.co/auth/v1/admin/users" \
    -H "apikey: $SERVICE_KEY" -H "Authorization: Bearer $SERVICE_KEY" \
    -H "Content-Type: application/json" \
    -d '{"id":"<profile uuid>","email":"<email>","email_confirm":true}'
  ```

  Then send password-reset emails to staff, and re-enroll MFA (factors are
  unrecoverable — admins will be prompted at `/admin/mfa`). Readers
  re-register or arrive via password reset; their reading lists and progress
  re-attach through the preserved profile UUID.
- Verify with the break-glass procedure (`BREAK-GLASS-PROCEDURE.md`): at
  least two working super-admin logins before calling auth restored.

## 5. Re-point storage

Zima Storage is independent of Supabase — if the box is fine, restored rows
already hold working URLs and there is nothing to do. If the box is also
gone, restore files from the nightly mirror (`BACKUP-DR.md §6.3`), then
reconcile against the newest `storage-inventory` JSON: every `ref` in it must
exist on the restored storage. `scripts/check-file-health.ts` sweeps the
result into `file_health`.

## 6. Cut the app over

1. Update env everywhere the registry says it lives (`SECRET-REGISTRY.md`):
   box `.env`, Vercel env, GitHub repo variables (`NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`) and secret (`SUPABASE_SERVICE_ROLE_KEY`),
   plus `SUPABASE_DB_URL` for `migrate.yml`.
2. `NEXT_PUBLIC_*` are **build-time**: republish the image (push to main or
   re-run Docker Publish) — a container restart is not enough.
3. Verify: `/api/health` 200 · login works · one book detail page renders ·
   one PDF opens · one admin login passes MFA · `node
   scripts/ops/alert-telegram.mjs --test`.

## 7. Drill mode (per-semester, throwaway project)

Same steps, two changes: use a free-tier throwaway project and **stop before
§6** (never point production env at a drill project). Record the result as
`docs/drills/RESTORE-DRILL-FULL-<date>.md` — steps run, wall-clock per
phase, row counts, and every mismatch between this guide and reality. A
drill that finds a wrong step in this file is a success. Delete the
throwaway project when done.

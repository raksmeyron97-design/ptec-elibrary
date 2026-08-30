# Deployment & Rollback Plan — Reliability & Governance Phase

_Created 2026-07-12; status updated 2026-08-29: **this phase shipped** —
migrations 0086–0088 are applied (the chain is now well past them) and both
pipelines are automated since this plan was written: migrations apply via
`.github/workflows/migrate.yml` on merge (never the SQL editor) and box
deploys are pull-based with auto-rollback (`deploy/deploy.sh`). Read
`RUNBOOKS.md` §M6/§M7/§M8 for the **current** procedures; the step list below
is kept as the historical record of the phase sequence._

## What ships

| Area | Code (safe pre-migration) | Migration (maintainer applies) |
|---|---|---|
| Metadata verification | `lib/content-status.ts`, `lib/metadata-quality.ts`, `app/actions/review.ts`, `app/actions/content-versions.ts`, upgraded `/admin/review` | **0086** — status vocabulary, provenance cols, books sync trigger, `content_versions` |
| Search governance | `lib/search/analytics.ts`, `/api/search/native` (bot filter, session hash, synonyms, curated), `search-insights` actions + action center | **0087** — `search_term_actions`, `search_synonyms`, `search_curated_results`, `session_hash`, retention fn |
| Metadata exports | `lib/metadata-exports/*`, `/api/export/*`, OAI verified-only gating | none (reads existing cols) |
| Backups & monitoring | `scripts/backup/*`, `/api/health` deep probe, cron retention wiring | **0088** — `ops_events` |
| Docs | `OPERATIONS-AUDIT`, `BACKUP-DR`, `ALERT-CATALOG`, `RUNBOOKS`, `DATA-GOVERNANCE`, `METADATA-EXPORTS`, `TABLETOP-EXERCISES` | — |

## Deploy order (code first — everything degrades gracefully)

The code was written to run **before** the migrations, using the established
rich-select→legacy-select fallback (proven by the 0062 precedent). So:

1. **Merge + deploy code** (RUNBOOKS §M7). Before migrations:
   - Review queue works with the old draft/pending/rejected semantics.
   - Search logs without `session_hash`; synonyms/curated silently no-op.
   - Exports serve verified-only (books/theses already have `verified_at`
     from 0062; unverified simply don't export — correct behavior).
   - `/api/health` deep probe returns `backupAgeHours: null` (unknown).
   - Backup scripts run and warn that `ops_events` isn't recorded.
2. **Back up first**: `node scripts/backup/backup-db.mjs` (RUNBOOKS §M6.2).
3. **Apply migrations in order**: 0086 → 0087 → 0088. Each has rollback
   notes in its header. _(Done — and how this works has since changed:
   merging a PR that touches `supabase/migrations/**` now applies them via
   `migrate.yml`; the SQL editor is no longer part of the procedure.)_
4. **Post-migration verify**:
   - `/admin/review`: new status filters + quality grades + version history
     load; submit → verify → publish a test record; confirm a librarian
     cannot self-approve (create as one account, verify as another).
   - `/admin/search-insights`: action center lists zero-result groups;
     add a synonym; confirm it fires only on a zero-result query.
   - `curl /api/export/theses?format=dc-xml | head` returns records.
   - Deep `/api/health` now returns a numeric `backupAgeHours`.
   - Run `node scripts/backup/restore-drill.mjs` → PASS.
5. **Wire cron** — done: `.github/workflows/cron.yml` is the scheduler of
   record (publish sweep + cleanup), and the nightly backup/verify runs on
   the box.
6. **Configure alerts** — done 2026-08-29: Telegram is the active Sev 1/2
   channel (`ALERT-CATALOG.md` §Delivery channels); site-down and cron
   failures alert from the workflows, backup failures from the box jobs.

## Rollback

- **Code**: standard image/deployment rollback (§M8). The code is
  forward-and-backward compatible with the pre-migration schema, so a code
  rollback after migrations is also safe (old code ignores new columns).
- **0088**: `drop table public.ops_events;` — nothing else depends on it.
- **0087**: drop `search_term_actions`, `search_synonyms`,
  `search_curated_results`, `purge_search_analytics`, and the
  `search_queries.session_hash` column. No data loss beyond curation.
- **0086**: drop the three `*_capture_version` triggers + `content_versions`
  + `capture_content_version` + `purge_content_versions`; restore the
  0061/0075 CHECK constraints; re-point the books trigger at
  `public.sync_publish_status`. Provenance columns can stay (nullable,
  harmless) or be dropped. No content data is rewritten in either direction.
- Because each migration is additive and independently reversible, you can
  roll back the newest without touching the others.

## Residual risk after this phase

See `OPERATIONS-AUDIT.md` §7 (register) and `TABLETOP-EXERCISES.md` open
follow-ups. The load-bearing ones:
- **F1**: ~~only one admin-capable account exists~~ — tooling + procedure
  shipped 2026-08-29 (`scripts/ops/create-breakglass-admin.mjs`,
  `BREAK-GLASS-PROCEDURE.md`); **run it once and seal the envelope** to
  close this for real.
- **F2**: ~~evidence the Zima file-snapshot cron is running~~ — replaced by
  an in-repo systemd timer with `.last-ok` + Telegram-on-failure
  (`BACKUP-DR.md` §3); remaining action is enabling it on the box.
- **F6**: ~~apply 0086–0088~~ — applied; migrations are now CI-applied on
  merge (`RUNBOOKS.md` §M6).
- Hard deletes aren't versioned (TT-5) — the workflow steers to "archive";
  nightly archive is the deletion recovery layer until an optional 0089.

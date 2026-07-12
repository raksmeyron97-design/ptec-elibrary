# Restoration Drill — 2026-07-12

**Verdict: PASS** (0 failures, 1 warnings) · total 7.1s

- Source archive: `2026-07-12T01-38-56Z` (created 2026-07-12T01:39:05.125Z, 2309 rows, encrypted: false)
- Target: PGlite (in-process, in-memory Postgres — fully isolated; production untouched)
- Phases: integrity 0.1s · restore 5.4s · validation 0.2s · re-link 1.3s

## Findings

| Result | Check | Detail |
|---|---|---|
| PASS | integrity | 64 tables / 2309 rows hash-verified |
| PASS | restore | 64 tables / 2309 rows loaded in 5.4s |
| PASS | row-count | every restored table matches its manifest count |
| PASS | fk | books.author_id → authors.id intact |
| PASS | fk | books.category_id → categories.id intact |
| PASS | fk | books.department_id → departments.id intact |
| PASS | fk | book_files.book_id → books.id intact |
| PASS | fk | research_reports.department_id → departments.id intact |
| PASS | fk | reviews.book_id → books.id intact |
| PASS | fk | download_logs.book_file_id → book_files.id intact |
| PASS | authz | 1 admin-capable profiles present |
| PASS | authz | role_permissions rows: 40 (0 = hardcoded defaults apply) |
| PASS | public-content | every published book has a slug |
| PASS | public-content | every published book has a file row |
| PASS | public-content | every published thesis has a file_url |
| PASS | workflow | admin audit trail restored (219 rows) |
| PASS | workflow | contact inbox restored (3 rows) |
| PASS | workflow | reader progress restored (97 rows) |
| WARN | search-index | book_pages excluded (derived) — rebuild after restore: scripts/extract-pdf-text.ts, then scripts/embed-library.ts for embeddings |
| PASS | re-link | 3/3 sampled restored file URLs reachable on live storage |

## RTO evidence

A metadata-complete database restore takes ~6s at current
collection size. Full production recovery adds: new Supabase project + apply
migrations (~30 min), storage restore from the box snapshot (size-dependent),
env restore from the password manager (~15 min), redeploy + auth URL config
(~15 min) — see docs/BACKUP-DR.md §RTO for the composite target.

## Follow-ups

- none required from this run
- review WARN items; excluded derived tables need their rebuild scripts after a real restore

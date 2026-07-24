# Canonical Resource Architecture (targeted consolidation)

_Started 2026-07-24. Status: **additive foundation landed** (migrations
0104–0109). Legacy tables/columns remain the app read source; consumers migrate
incrementally behind the new services._

## Why this exists

PTEC's academic resource types (books, theses, publications, learning paths)
share ~25 concepts — title, authors, files, subjects, references, engagement —
but modelled them **inconsistently**, which is expensive to maintain and risky
to extend. This document records the audit, the decision, and the additive
architecture that fixes the real fragmentation **without** a full supertable
rewrite (which would be over-engineering at the current ~120-resource scale and
would fight several deliberate, documented decisions in the schema).

### What the repo already did well (kept, not rebuilt)

- **Unified lifecycle** — `lib/content-status.ts` + the `status`/`is_published`
  sync triggers (0061/0075/0086) give one editorial state machine across books
  and theses.
- **Single-source counts** — `public_resource_statistics` (0103), enforced by
  `lib/resource-stats-consistency.test.ts`. Edits mutate rows in place, so there
  is no version table inflating counts — deliberately.
- **Change history** — `content_versions` (0086) already snapshots edits.
- **Polymorphic references** — `learning_path_steps.(resource_type, resource_id)`
  (0063) already points into books/research/catalog. The canonical link tables
  reuse this exact `(resource_type, resource_id)` convention.

### The real fragmentation this work fixes

| Concept | Before (three+ models) | After (one model) |
|---|---|---|
| **Contributors** | books `author_id`→`authors`; theses `author_names`/`advisor_name` **free text**; publications normalized `publication_authorships` | `contributors` + `resource_contributors` (0105) |
| **Files** | `book_files`; `publication_files`; theses single `file_url`; no checksum/scan/visibility layer | `storage_objects` + `resource_files` (0106) |
| **Subjects/keywords** | `category_id`; thesis `subject` text; `tags`/`keywords` text[] | `subjects` + `resource_subjects` + `resource_keywords` (0107) |
| **References** | publications `references` jsonb; theses `references` text | `resource_references` (+ `resource_relations`) (0108) |
| **Tenancy** | none (implicit PTEC) | `organizations` + `organization_id` (0104) |

## Design rules

1. **Additive & non-destructive.** No legacy table or column is dropped. Every
   backfill is idempotent (`NOT EXISTS` / `ON CONFLICT` guards + provenance
   columns), so migrations are safe to re-run.
2. **Legacy stays the read source** until a consumer is explicitly switched to a
   canonical service. Nothing that renders today changes behaviour on apply.
3. **Polymorphic link tables**, not a supertable. `(resource_type, resource_id)`
   with a CHECK enum — same pattern already proven by `learning_path_steps`. No
   cross-table FK (documented, matching 0063).
4. **RLS on every new table** (CLAUDE.md rule). Authority tables
   (`contributors`, `subjects`, `organizations`) are public-read/admin-write like
   `authors`/`categories`. Link tables are public **only when the linked
   resource is published** (mirroring `publication_authorships`); admins see all.
   `storage_objects` exposes only `public`-visibility metadata to anon.
5. **Multi-tenant ready, not activated.** `organization_id` exists and is
   populated everywhere; existing single-tenant RLS is **not** rewritten. When a
   second org is onboarded, add org predicates to write policies — the columns
   are already there. No policy hardcodes PTEC.
6. **Provenance for reconciliation.** `contributors.source`/`legacy_*_id`,
   `resource_files.legacy_*_id`, `subjects.legacy_category_id` make the backfill
   traceable and let `canonical_backfill_health` (0109) prove completeness.

## Tables added

| Migration | Tables / objects |
|---|---|
| 0104 | `organizations`, `default_organization_id()`, `organization_id` on books/research_reports/publications/catalog_books/learning_paths/posts |
| 0105 | `contributors`, `resource_contributors` (+ backfill A/B/C) |
| 0106 | `storage_objects`, `resource_files`, `upsert_legacy_storage_object()` (+ backfill) |
| 0107 | `subjects`, `resource_subjects`, `resource_keywords` (+ backfill) |
| 0108 | `resource_references`, `resource_relations` (+ backfill) |
| 0109 | `canonical_backfill_health` view (admin-only reconciliation) |

## Services (read side)

- `lib/resources/types.ts` — canonical `ResourceType`/role/file-role vocab + the
  `RESOURCE_TABLE` map (one place the historical `research_reports`=thesis naming
  lives).
- `lib/resources/author-names.ts` — pure split mirroring the 0105 SQL backfill
  (unit-tested in `author-names.test.ts`).
- `lib/resources/contributors.ts` — `getResourceContributors()` / `authorsOf()`.
- `lib/resources/files.ts` — `getResourceFiles()` / `primaryPdf()` / `coverFile()`.
- `lib/admin/canonical-backfill.ts` — `reconcileCanonicalBackfill()` reads 0109.

## Reconciliation

`canonical_backfill_health` (admin-only) compares, per domain, the legacy source
count with the canonical count the backfill produced. `gap = legacy - canonical`
must be **0** for every domain after apply. Surface it in the Data Quality admin
section next to the existing `reconcilePublicResourceStats()` panel.

Post-deploy verification: `RLS_PROBE=1 npx vitest run lib/rls.test.ts` (anon
visibility of the new public tables), then read `canonical_backfill_health`.

## Deliberately NOT done (and why)

- **No `resources` supertable / `resource_versions` / `resource_translations` /
  `search_documents`.** At 1 thesis + 1 publication + 4 paths, these add
  operational surface and duplicate mechanisms that already exist
  (`content_versions`, on-row embeddings, `title_km`/`abstract_km` columns) for
  no near-term benefit. Revisit if a resource type passes ~50k rows or a second
  institution onboards with divergent workflows.
- **No write-path migration yet.** Admin editors still write the legacy shapes;
  a follow-up dual-writes into the canonical tables, then flips reads.

## Follow-up removal plan (not yet safe to do)

Only after consumers read canonical services **and** `canonical_backfill_health`
shows zero gaps across two deploys:

1. Point book/thesis/publication detail reads at `getResourceContributors()` /
   `getResourceFiles()`.
2. Dual-write admin editors into the canonical tables.
3. Deprecate `publication_authors`/`publication_authorships`, `book_files`,
   `publication_files`, and the free-text `author_names`/`advisor_name`/
   `references` columns — behind a documented removal date, never in the same PR
   as the read switch.

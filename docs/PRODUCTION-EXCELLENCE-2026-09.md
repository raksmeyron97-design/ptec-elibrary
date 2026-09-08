# Production Excellence 2.0 — 2026-09-08

Reliability, data quality and observability at 270 resources. Everything here
is measured against production (`https://library.ptec.edu.kh`, self-hosted
Supabase) or against a local stack running the full migration chain. Where a
number could not be established, that is stated rather than filled in.

## Scorecard

| Category | Verdict | Evidence |
|---|---|---|
| CONTENT | **PASS** | 270 published books; metadata and file readiness both 100% |
| INDEXING | **PASS** | 0 never-attempted, 0 stale, 0 failed-config; 249/270 text-extracted |
| EMBEDDING | **WARN** | 246/270 chunk-ready; 19 permanently image-only, ~5 actionable |
| SEARCH | **PASS** | R@1 99% · R@5 100% · MRR 0.99 · zero-result 0% |
| AI | **PASS** | scope isolation 100%, no-evidence 100%, citations 100% |
| STORAGE | **PASS** | 477/477 public URLs serve; 0 orphaned `book_files` |
| CACHE | **NOT TESTED** | see Remaining risks |
| AUTH | **WARN → FIXED** | 5 mutations reported success without changing a row |
| SECURITY | **PASS** | admin gated, retrieval RPCs published-only + service-role only |
| SEO | **PASS** | 477/477 sitemap URLs return 200, zero redirects |
| PWA | **NOT TESTED** | offline specs did not complete cleanly — see CI |
| PERFORMANCE | **PASS** | search p50 188ms / p95 723ms |
| CRON | **PASS (by inspection)** | reconciler is claim-based; not load-tested |
| DATABASE | **PASS** | 89 migrations apply cleanly from the squashed baseline |

## 1. Collection

`scripts/audit-resource-health.ts` — one derived readiness model, computed
from the tables that already hold the facts. No new columns: a stored
readiness flag is a second source of truth that can disagree with the rows it
describes, which `resource_index_state.chunks` already demonstrates (it sums
to 175 across the collection while `book_chunks` holds six figures).

| stage | ready | coverage |
|---|---:|---:|
| metadata_ready | 270 | 100% |
| file_ready | 270 | 100% |
| text_ready | 248 | 91.9% |
| chunk_ready | 235 → **246** | 87% → **91%** |
| search_ready | 270 | 100% |
| ai_ready | **234** | 86.7% |

Every not-ready resource carries a reason, which is the point of the model:

| reason | books | actionable? |
|---|---:|---|
| ok | 234 | — |
| no_text_layer | 19 | **no** — image-only scans, permanently not AI-ready |
| not_embedded | 14 | yes, and shrinking: a backfill ran during this audit |
| index_failed | 2 | yes — ours to fix |
| never_indexed | 1 | yes |

Chunk coverage moved from 198 records (yesterday) → 235 → 246 over the course
of this audit, so the embedding backlog is actively draining. `ai_ready = 234`
was measured at the mid-point and is now conservative.

## 2. The defect that mattered: silent success

**Severity: high.** Not a data breach — a truthfulness failure, and the exact
thing this phase's final principle names.

**Root cause.** PostgREST answers an UPDATE or DELETE whose predicate matched
no row with `204 / error:null / data:null / count:null` — byte-for-byte what a
successful single-row mutation returns. Measured against production:

    UPDATE reading_lists …eq(id,<ghost>).eq(user_id,<ghost>)
      → error: null · status: 204 · data: null · count: null

**Evidence.** A source scan of `app/actions/*.ts` found 117 targeted
mutations observing only `error`. Triaged down to 12 whose only authorization
is an ownership predicate, then to 5 that are user-facing and where zero rows
means "not yours" rather than an intended no-op:

  · `deleteAnnotation` — **service client, RLS bypassed**
  · `updateAnnotationNote` — **service client, RLS bypassed**
  · `updateReadingList`
  · `deleteReadingList`
  · `updateComment` — a comment moderation removed mid-edit read as saved

**Impact.** The reader was told their edit or deletion happened when nothing
had, and nothing was logged, so it could be diagnosed from neither end. On the
two service-client paths the ownership predicate is the *only* guard there is,
so it was also unverified.

`ReadingListsSection` was worse: both handlers discarded the action result and
mutated local state unconditionally, so even a genuine database error redrew
the card as though it had worked. `handleCreate` fell through to its reset on
failure — form cleared, creator closed, no list, no error, typed name lost.

**Fix.** `lib/db/changed-row.ts` — ask via `.select()`, then separate `error`
from `no_match`. Pure, so the decision is testable without a database. A
result passed in *without* a `.select()` reports `no_match` rather than
success, so forgetting it fails loudly instead of restoring the bug.

**Test.** `lib/db/silent-mutation.test.ts` scans source, in the style of the
repo's other invariant tests. Verified to fail: reintroducing the missing
`.select()` on one delete names that exact file and line. Tables where zero
rows IS the intended end state (autosaved drafts, un-completing a step never
completed) are listed with their reason rather than silently skipped.

## 3. Reliability

**Delete cleanup and orphans — PASS.** `scripts/audit-orphans.ts` checked
eight derived tables against the 270 live books: `book_pages`, `book_chunks`,
`resource_index_state`, `book_files`, `reading_list_items`,
`book_annotations`, `reviews`, `file_health`. **Zero orphans in all eight.**
The script classifies rather than deletes — safe_cleanup vs needs_review vs
historical — because whether an orphan is garbage or someone's work is a
policy decision, not one a sweeper should take.

**Migrations — PASS.** `supabase db reset` applied all 89 migrations from the
squashed baseline through 0140 and seeded, with no manual intervention.

## 4. Security

- Both chunk-matching RPCs (`match_book_chunks`, `match_record_chunks`) join
  their parent on `is_published` and guard with
  `coalesce(b.id, r.id, p.id) is not null`, so an unpublished resource cannot
  become retrievable because its embedding exists.
- Both are `revoke execute … from public, anon, authenticated`, granted only
  to `service_role`.
- `/admin` redirects rather than serving (asserted in the smoke test).
- An unknown book slug returns a real 404, not a streamed 200.
- Scope isolation measured 100% over scoped AI questions.

## 5. SEO and dead links

`scripts/audit-sitemap-links.ts` crawled every advertised URL:

| | result |
|---|---|
| sitemap entries | 477 |
| returning 200 | **477** |
| 404 / 5xx | **0** |
| redirects | **0** |
| author URLs | 158, all 200 |

The author-URL 404s recorded in earlier notes are **resolved**.

The crawler retries a transport failure before believing it. Measured while
writing it: at concurrency 6, two long Khmer book URLs came back as connection
errors and returned 200 the moment they were asked again alone — two false
positives in the first run of a tool whose entire value is being trusted.

## 6. Counts and the physical catalog

**The brief's premise here is out of date.** It reports the homepage showing
"270 Digital resources / 270 E-books / 6 physical books / 0 theses / 0
publications / 0 learning paths" and `/catalogs` saying the catalog is being
prepared. Neither is what production serves.

The homepage shows three figures: **270 Digital resources**, **6 Books in the
physical library**, **2017 Serving PTEC since**. There is no duplicated
"E-books" number and no zero-valued rows, so the §36 ambiguity does not exist.

`/catalogs` is fully live: 6 books with DDC facets, copy counts (8 copies),
availability filters, sorting and pagination — "Showing 1–6 of 6 results".
Database facts agree: `catalog_books` holds 6 rows, all `is_active = true`,
all with real titles, authors and DDC numbers, and `catalog_copies` holds 8.
This is **State A** — genuinely ready and correctly exposed. No change made,
and none should be: inventing a "being prepared" state would be less truthful
than what is already shown.

One genuine inaccuracy, admin-facing only: `public_resource_statistics
.searchable_resources` counts book-level metadata embeddings (215) and is
named as though it meant findability. Every one of the 270 books is findable
by keyword, and semantic *evidence* depends on `book_chunks` (246), so the
figure matches neither. It is not shown to readers — only `/api/health` and
the admin count audit read it — so it is recorded here rather than changed,
since altering a public view's semantics is a migration.

## 7. Remaining risks

- **Cache invalidation (§12) was not tested.** Proving mutation → revalidation
  → updated public page needs authenticated admin writes against production,
  which this audit deliberately did not perform.
- **Scheduled publishing (§13) was not tested**, for the same reason.
- **Cron concurrency (§10) was verified by inspection only.** The reconciler
  claims records before processing, but two simultaneous invocations were not
  driven against production.
- **New-upload SLA (§8, §9) was not measured.** It requires uploading a real
  book to production; no target is proposed, because proposing one without
  measurement is exactly what the brief forbids.
- **Large-PDF matrix (§22) was not run** beyond what the reader e2e specs
  cover with generated fixtures.
- **`searchable_resources`** naming, above.

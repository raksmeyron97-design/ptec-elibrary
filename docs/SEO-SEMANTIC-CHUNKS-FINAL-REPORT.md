# Semantic SEO from AI chunks — final report

**Date:** 2026-09-05 · **Branch:** `feat/research-discovery-ai-2` ·
All figures measured against the live production database, read-only.

---

## 1. What was found

The brief anticipated a corpus of chunks waiting to be turned into pages. The
corpus is real — 47,255 extracted pages and 77,061 embedded chunks across 215
published books — but two findings changed what could honestly be built on it.

### 1.1 Every Khmer-script book in the collection holds broken text

Ninety-nine of the 215 published books extract as Khmer-dominant text. All 99
hold text that is not the document's text:

```
stored in book_pages:  យុ ទ ស ប េ ងៀ ន ទំ េនើ ប
the document says:     យុទ្ធសាស្ត្របង្រៀនទំនើប
```

Three distinct damage modes, each violating a different Khmer encoding rule —
coeng marks dropped, coeng marks spaced off the cluster they subscript, and
legacy-font Latin-Extended code points emitted inside Khmer runs. They come
from PDFs built with non-Unicode Khmer fonts, where pdf.js recovers glyph
positions faithfully and the character encoding not at all.

`resource_index_state` records every one of these books as `indexed`, and that
is correct: extraction ran and succeeded. The gap is that no table in the
system could say whether what it produced was usable. Consequences beyond this
feature: those 99 books are not searchable by their contents, cannot be cited
by page, and cannot ground an AI answer — and nothing in the application said
so.

### 1.2 The topic vocabulary already existed

All 215 books carry librarian-curated `tags` — a 672-term normalized
vocabulary, 84 terms on three or more books. Deriving topic *names* from a
model over 77,061 chunks would have invented what the library had already
stated. That settled the architecture: **the catalogue names topics, the corpus
proves and quantifies them.** No model is called anywhere in this feature.

### 1.3 A silent production defect, found while measuring

Eight books were recorded `failed` with `canceling statement due to statement
timeout`. Three of them hold **exactly 100 rows** with a max page number of
101–103, against `INSERT_BATCH = 100`. One statement committed and the next
timed out — and delete-then-insert left those records holding pages 1–101 of a
400- to 700-page book. `/api/search/native` reads `book_pages`, not
`resource_index_state`, so those books have been answering "found inside" for
their first hundred pages and staying silent about the rest, indistinguishable
from a book that genuinely only mentions a phrase early on.

## 2. What was changed

| File | Change |
|---|---|
| `lib/semantic/text-quality.ts` + test | Khmer orthographic damage detection; three named modes; thresholds calibrated on the real distribution |
| `lib/semantic/passages.ts` + test | running-header detection and stripping; structural page classification |
| `lib/semantic/topics.ts` + test | label admissibility, body-only evidence collection, scoring, evidence gate |
| `lib/semantic/build.ts` + test | the whole per-record decision, pure; `SEMANTIC_VERSION` |
| `lib/semantic/insights.ts` | the only public read path; cached, version-gated, fail-silent |
| `supabase/migrations/0137_resource_semantic_insights.sql` | precomputed rows + `public_resource_semantic_health` view; service-role only |
| `scripts/build-semantic-insights.ts` | idempotent, resumable, `--dry-run` first |
| `components/ui/books/BookTopics.tsx` | the public section |
| `app/[locale]/(public)/books/[slug]/page.tsx` | one `<Suspense>` block |
| `lib/admin/resource-stats.ts`, `components/admin/ResourceCountAudit.tsx` | semantic coverage in Data Quality |
| `lib/pdf-page-index.ts` + test | §1.3: byte-budgeted inserts, halving retry on 57014, and no truncated index on failure |
| `messages/en.json`, `messages/km.json` | `bookDetail.topics*`, `adminDataQuality.semantic.*` |

## 3. What was NOT changed

* **`app/sitemap.ts`, `app/robots.ts`, `lib/seo/*` — untouched.** The feature
  creates **no URLs**. `/subjects/[slug]` is already this library's topic
  landing ecosystem, gated against soft-404s and in the sitemap since SEO V2; a
  `/topics` space would be the duplicate ecosystem the brief's Rule C forbids.
* **No chunk or page URLs**, and `book_chunks` is not read at all — its text is
  a 150-character-overlapping window over `book_pages`, so counting occurrences
  in it would double-count across boundaries.
* **No excerpts** are stored or rendered. Deferred to a rights decision, not to
  a later sprint.
* **`allow_download` (0131) is untouched and unconsulted** — nothing here
  serves or quotes a file, so a read-online-only book gets identical topic
  counts. The counts describe the document, not access to it.
* **No LLM call, no embedding call, no token spend.**
* `lib/chunk-embed.ts` and `lib/gemini-embeddings.ts` carry uncommitted
  work-in-progress from another task; left alone.

## 4. Pilot results (full-corpus dry run, writes nothing)

```
records examined     215
ok                    81   →  352 topics, 172 distinct labels, 4.3 per record
damaged-text          99   →  withheld by the text-health gate
no-text               27   →  no extracted pages
unsupported-topics     8   →  clean text, no tag discussed in the body
```

Sample output for *Research Methods in Education (6th Edition)* — 646 pages,
615 classified as body, 12 front matter, 5 contents, 10 back matter, 4 sparse:

```
case study            — 47 pages, 121 mentions
educational research  — 130 pages, 327 mentions
questionnaires        — 74 pages, 148 mentions
data analysis         — 106 pages, 172 mentions
research methods      — 43 pages, 64 mentions
```

Two labels were **caught by running the pipeline against the real collection,
not by reasoning**: `SAGE` and `Springer` cleared the evidence gate comfortably
— a SAGE textbook names SAGE on dozens of pages — before the label gate learned
that a book does not cover its own imprint.

**Nothing has been written to production.** Migration 0137 is not yet applied
there (CI applies migrations on merge to main), so the pilot is a verified dry
run rather than a set of live rows. `docs/SEO-SEMANTIC-CHUNKS-ROLLOUT.md` §2 is
the sequence to make it live.

## 5. Indexing policy

Unchanged, because there is nothing new to index. The feature adds body content
to 81 existing `/books/[slug]` pages, which were already indexable, already
canonical, already in the sitemap with `hreflang` alternates. No new route, no
new sitemap entry, no new robots rule, no second CSP, no change to
`lib/seo/indexing.ts`.

The one indexability question the feature *does* answer is per-topic, not
per-URL: a topic with fewer than 3 body pages or fewer than 4 mentions is not
rendered at all, so the section can never pad a page with weak claims.

## 6. Security verification

* `resource_semantic_insights` and `public_resource_semantic_health`: RLS
  enabled, no policies, `REVOKE ALL … FROM PUBLIC, anon, authenticated` — the
  same posture as `book_pages` (0066), `book_chunks` (0082) and
  `resource_index_state` (0133).
* The public read goes through `lib/semantic/insights.ts`, which is
  `server-only` and uses the service client inside `unstable_cache`. The
  browser never reaches the table.
* **No document text** is stored in 0137 or rendered by `<BookTopics/>`.
  `lib/semantic/build.test.ts` asserts that a built row's serialization
  contains no fixture body text — the regression guard against a future change
  quietly adding excerpts.
* Published-state filtering is unchanged: the build script reads
  `books.is_published = true`, and an unpublished book simply has no row.
* `allow_download` is not consulted, because nothing here is a file path.

## 7. Performance verification

| Path | Cost |
|---|---|
| Book detail request | one row by primary key, `unstable_cache`d under the `books` tag, inside `<Suspense>` |
| Derivation (offline) | 1.5 s for the 1,622-page book; 856 ms for 646 pages; 3 ms for 15 pages |
| Model calls per request | 0 |
| Model calls per build | 0 |
| Extra queries on the book page | 1 (the insights row); `resolveSubjectLinks` reads an index already cached for `/subjects` |

No page fans out over a document's pages or chunks at request time. `<BookTopics/>`
returns `null` for 134 of 215 books, so the majority of book pages are
byte-identical to before.

## 8. Test results

```
npx vitest run lib/semantic                58 passed  (4 files)
npx vitest run lib/pdf-page-index.test.ts   9 passed
npx tsc --noEmit                            clean
npm run lint                                clean
```

Full suite: 245 files passed, 2 skipped; 3,800 tests passed, 50 skipped, 0
failed. `lib/i18n-keys.test.ts` caught eleven admin keys filed in the wrong
namespace during this work — the panel would have rendered raw key strings.

The semantic fixtures are verbatim
production excerpts — damaged Khmer pages paired with what those documents
actually say — so they are the regression guard for the gate that keeps 99
books out of public claims.

## 9. What this did not solve

* **Khmer remains excluded**, and the fix is an extraction-toolchain change (a
  font remap or OCR), not a change here. Because the gate is a text-health
  test rather than a language test, the day extraction is fixed a
  re-extraction plus `--all` picks those 99 books up with no code change.
* **Latin text quality is not verified** — `analyzeTextHealth` reports
  "healthy" for Latin in the weak sense of "no Khmer damage found".
* **27 books have no extracted text at all**, 8 of them because of §1.3.
  Re-running the page indexer over those records is a prerequisite for them
  ever gaining topics.
* **No SEO outcome is claimed.** The feature changes the body content of 81
  existing pages and creates no URLs; the measurement plan, including the 134
  untouched books as a control group in the same section of the same site, is
  in `docs/SEO-SEMANTIC-CHUNKS-ROLLOUT.md` §6.

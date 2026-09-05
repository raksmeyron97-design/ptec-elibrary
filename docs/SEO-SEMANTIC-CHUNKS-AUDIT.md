# Semantic SEO from AI chunks — repository + corpus audit

**Date:** 2026-09-05 · **Branch:** `feat/research-discovery-ai-2` ·
**Corpus measured against:** the live production Supabase project (read-only).

This document is the Phase-1 deliverable: what actually exists, what the
corpus actually contains, and which of the proposed features the evidence
supports. Nothing here is assumed from the brief — every number below was
measured, and the query scripts are reproduced in §7.

---

## 1. Existing chunk architecture

The pipeline is real and already three layers deep. There is **no** separate
"AI chunk" store to discover; `book_chunks` *is* it.

```
books / research_reports / publications        (per-type resource tables)
    │  file_url  (Zima storage, never client-exposed)
    ▼
book_pages          0066   (record_type, record_id, page_no, content)   ← full page text
    │                      GIN trigram on content; RLS on, no policies
    ▼
book_chunks         0082   (…, page_no, chunk_no, content, embedding vector(768))
                           HNSW cosine; RLS on, no policies
resource_index_state 0133/0134  one row per record: status, failure_kind,
                                pages, chunks, source_digest, attempted_at
```

Facts that constrain any design on top of it:

| Property | Value | Where |
|---|---|---|
| Chunk ordering | `(page_no, chunk_no)` — total order within a record | `0082` unique key |
| Chunk size | 1,000 chars target, 150 overlap, 40 min | `lib/chunk-embed.ts` |
| Chunk→page link | direct column, always present | `book_chunks.page_no` |
| Chunk metadata | **none** beyond position — no heading flag, no type, no section | `0082` |
| Chapter/section model | **does not exist** anywhere in the schema | — |
| Embedding model | `gemini-embedding-001` @ 768 dims, both sides | `lib/ai/models.ts` |
| Scoped retrieval | `match_record_chunks` (0135), service-role only | `0135` |
| Corpus-wide retrieval | `match_book_chunks` (0082), service-role only | `0082` |
| Access posture | **both tables are service-role only.** `anon`/`authenticated` are revoked; publish state is re-checked inside both RPCs at read time | `0082`, `0117`, `0135` |

Chunks are written by exactly two callers — `indexPdfPagesSafe()` chaining
`embedRecordChunksSafe()` after an upload, and `scripts/embed-library.ts` as
the backfill. Neither is on a request path.

## 2. Corpus measurement (production, 2026-09-05)

```
published books            215      (research_reports 0, publications 0)
book_pages rows         47,255
book_chunks rows        77,061
categories                  25      ← the live subject taxonomy
subjects (0107)             12      ← canonical table, backfilled once, unused
resource_subjects (0107)     0      ← EMPTY
resource_keywords (0107)     0      ← EMPTY
contributors (0105)          0      ← EMPTY
```

Per-book coverage:

```
books with extracted pages   198 / 215
books with embedded chunks   125 / 215      ← 90 books are mid-backfill
books with neither            17 / 215
```

Chunk counts per book span three orders of magnitude — 1 to 3,674:

```
3,674  1,622p  qualitative-research-and-evaluation-methods-4th-edition
2,709    646p  research-methods-in-education-6th-edition
2,240    100p  educational-research-competencies-for-analysis-11th-global-edition
   …
   32     23p  ថ្នាលអភិវឌ្ឍសមត្ថភាព-cdp
    4     25p  ឯកសារជំនួយ-ស្តីពី-ការអប់រំ-និងការលើកកម្ពស់សុខភាព
    1      5p  ការអប់រំសុខភាពសម្រាប់មជ្ឈមណ្ឌលគរុកោសល្យភូមិភាគ
```

Language split of the published collection: **122 Khmer, 93 English**
(`language` is free text — `Khmer`/`kh`/`khmer` and `English`/`en` all occur,
which is itself a small data-quality defect).

## 3. Existing SEO architecture — reuse map

This repository already holds a mature, centralized SEO layer. Every item
below is a **reuse target, not a thing to rebuild**.

| Concern | Owner | Note |
|---|---|---|
| Indexability decision | `lib/seo/indexing.ts` `isIndexableEnvironment()` | ANDed with the admin switch in System Settings → SEO |
| Base URL / absolute URLs | `lib/seo/site.ts` (`SITE_URL`, `absoluteUrl`) | never read `NEXT_PUBLIC_SITE_URL` directly |
| Canonical + hreflang | `lib/seo/alternates.ts` `localeAlternates()` | reciprocal en/km/x-default |
| Book metadata + JSON-LD | `lib/seo/book-seo.ts` (`buildBookMetadata`, `bookJsonLd`, `bookCanonicalUrl`) | per-resource SEO overrides fall back to auto values |
| Breadcrumbs | `lib/seo/schema.ts` `breadcrumbSchema()` | locale-correct, pinned by `lib/seo/breadcrumbs.test.ts` |
| Org/Library/WebSite nodes | `lib/seo/org-nodes.ts` + `RootShell` | only `RootShell` may *declare*; everything else references by `@id` |
| Sitemap | `app/sitemap.ts` | paginates past PostgREST's 1000-row cap, then **validates** every entry and drops fatal ones |
| Sitemap validation rules | `lib/seo/validate.ts` | `private-url-in-sitemap`, `canonical-has-query`, `trailing-slash`, … |
| Subject hub + landing pages | `lib/subjects/` (`getSubjectIndex`, `getIndexableSubjects`, `getSubjectDetail`) | **already refuses to advertise an empty subject** |
| Internal link graph edges | `lib/resources/connections.ts` | returns a link only when the target hub has resources |
| Cache invalidation | `lib/cache/revalidate.ts` `TAGS` | English is rewritten to `/en/...`, so `revalidatePath("/books")` is a no-op |

Two of these settle open questions in the brief outright:

* **§14 "topic landing pages"** — `/subjects/[slug]` already *is* the topic
  landing ecosystem, already gated against soft-404s, already in the sitemap,
  already linked from every book. A parallel `/topics` space would be the
  duplicate ecosystem the brief's own Rule C forbids. **Recommendation: build
  no new public URL space.**
* **§20 "sitemap integration"** — the sitemap already refuses URLs whose page
  would render empty. If the semantic layer introduces no new URLs, it needs
  no sitemap change at all.

## 4. The finding that governs everything: text quality is not uniform

Sampling `book_pages` across all 215 books and measuring Khmer script health
(ratio of the coeng subscript marker `U+17D2` to Khmer letters — healthy Khmer
prose runs 0.04–0.12; structurally correct text cannot approach zero):

```
books whose extracted text is Khmer-dominant       99
  … of those, with essentially NO coeng marks      19     ← unusable
books whose extracted text is Latin-dominant       97
books with no extracted text at all                19
```

What a damaged extraction looks like — this is the stored `book_pages.content`
for page 1 of *យុទ្ធសាស្ត្របង្រៀនទំនើប*:

```
យុ ទ ស ប េ ងៀ ន ទំ េនើ ប Modern Teaching Strategies េរៀ ប ចំ េ យ៖ ...
```

The title is `យុទ្ធសាស្ត្របង្រៀនទំនើប`. Every coeng stack and several vowel
signs have been dropped, and a space has been inserted between the surviving
clusters — the signature of a PDF built with a legacy non-Unicode Khmer font,
where pdf.js recovers glyph positions but not the character encoding. Space
ratio on those pages is 0.34–0.39 versus 0.11–0.17 for healthy Khmer.

**This text is not merely low quality — it is wrong.** It cannot be searched,
cannot be cited, cannot be summarized, and must never be published. It is also
invisible to `resource_index_state`, which correctly records `indexed` for
these books: extraction *succeeded*, it just produced garbage.

The corollary is the design's spine: **a per-record text-quality gate is not a
nice-to-have, it is the precondition for any public use of this corpus.**

## 5. Existing risks found

| # | Risk | Evidence | Bearing on this work |
|---|---|---|---|
| R-1 | 19 Khmer books hold structurally damaged text | §4 | Hard exclusion gate required |
| R-2 | 8 books failed page indexing with `canceling statement due to statement timeout` | `resource_index_state`, all large English titles | `lib/pdf-page-index.ts` deletes and inserts unbatched into a GIN-indexed table; §24 of the brief asks for this |
| R-3 | 2 books `Invalid PDF structure` (permanent), 1 `no_text_layer`, 1 stuck `running` | same | Correctly classified; no action |
| R-4 | 90 published books have pages but no chunks | §2 | Semantic layer must degrade per-record, never assume a chunk corpus |
| R-5 | Running headers are inline in chunk text (`"THE SAMPLE SIZE 101 Chapter 4 …"`) | sampled chunks | Repeated-line detection needed before any chunk text is shown or scored |
| R-6 | Front matter (copyright pages, dedications, TOC) is chunked identically to body text | sampled p2–p8 of every English title | Position-based demotion needed |
| R-7 | `language` column is free text with 5 spellings for 2 languages | §2 | Locale decisions must derive from the *text*, not the column |
| R-8 | 0107 canonical taxonomy tables are empty | §2 | They are not a usable topic store today |
| R-9 | Chunk tables are service-role only, by deliberate design | §1 | Any public read must go through a server module; never widen the grants |

## 6. What the corpus *does* support: an evidence layer over librarian tags

All 215 published books already carry a curated `tags` array (5 tags each,
librarian-reviewed at ingestion). Normalized, that is a **672-term vocabulary**,
distributed as:

```
tags on ≥ 1 book   672
tags on ≥ 2 books  162
tags on ≥ 3 books   84
tags on ≥ 5 books   45
tags on ≥ 8 books   23
```

Top of the vocabulary (count × label):

```
30× ក្រសួងអប់រំ   21× action research   19× educational research
17× qualitative research   16× គរុកោសល្យ   15× data analysis
15× សៀវភៅណែនាំគ្រូ   15× STEPSAM3   12× mixed methods   11× sampling
```

Two things follow.

**First, the topic vocabulary already exists and is human-authored.** Deriving
topic *names* from an LLM over 77,000 chunks would be inventing what the
library has already stated — and would be exactly the fabrication Rule D
forbids. The corpus's job is not to name topics; it is to **prove** them.

**Second, the vocabulary needs a naming gate, not a bigger model.** `ក្រសួងអប់រំ`
(Ministry of Education) is a publisher, `STEPSAM3` a project code, `RCI Fund`
a funder, `PTEC` the institution, `ថ្នាក់ទី៧` (Grade 7) a level. These are
useful facets and terrible topics. That is a deterministic classification
problem over ~672 strings, not a generative one.

## 7. Recommended integration points

| Step | Reuse | New |
|---|---|---|
| Text quality + chunk classification | — | `lib/semantic/text-quality.ts` (pure) |
| Topic candidates from tags + chunk evidence | `lib/search/normalize.ts` `normalizeSearchText`, `hasKhmer` | `lib/semantic/topics.ts` (pure) |
| Publishability decision | `lib/seo/indexing.ts` posture | `lib/semantic/gate.ts` (pure) |
| Precomputed per-book result | `resource_index_state` shape and posture | migration `0136` + `lib/semantic/insights.ts` |
| Book detail rendering | the page's existing streamed-section pattern, `ResourceConnections` | `components/ui/books/BookTopics.tsx` |
| Subject enrichment | `lib/subjects/index.ts` | evidence counts only |
| Sitemap / robots / canonical | **unchanged — no new URLs** | — |
| Pipeline reliability (R-2) | `lib/pdf-page-index.ts` | batched delete + smaller insert batch |

### Deliberate non-goals, with reasons

* **No `/topics/[slug]` route.** `/subjects/[slug]` is the existing topic
  ecosystem (Rule C, brief §14).
* **No per-page or per-chunk URLs.** Brief Rules A/B, and `book_pages` is
  service-role-only by design (R-9).
* **No public excerpts in v1.** §29 asks for a rights-respecting excerpt
  policy the library has not written. Page *references* ("discussed on pages
  47, 103, 210") carry most of the reader value and expose no protected text,
  so v1 ships references and defers excerpts to a policy decision.
* **No LLM anywhere in this feature.** Every signal is a database fact or a
  pure function of one, which makes the whole layer unit-testable offline and
  costs zero tokens (brief §23 taken to its conclusion).

## 8. Reproducing the measurements

The audit scripts are throwaway and were run against production read-only.
They are reproduced in `docs/SEO-SEMANTIC-CHUNKS-ROLLOUT.md` §Verification as
`npx tsx scripts/semantic-corpus-report.ts`, which is the committed, repeatable
form of §2/§4/§6 above.

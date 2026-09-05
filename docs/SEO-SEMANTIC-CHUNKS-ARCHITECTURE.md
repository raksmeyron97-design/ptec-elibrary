# Semantic layer — architecture

How 47,255 extracted pages become a small number of checkable claims on a book
page, and why almost every stage is a refusal.

Audit and measurements: `docs/SEO-SEMANTIC-CHUNKS-AUDIT.md`.
Operating instructions: `docs/SEO-SEMANTIC-CHUNKS-ROLLOUT.md`.

---

## 1. The shape

```
books.tags                    book_pages (0066)
(librarian-curated,           (extracted PDF text,
 5 per record)                 service-role only)
      │                              │
      │                              ▼
      │                    classifyPages()          lib/semantic/passages.ts
      │                    ├─ detectFurniture()     running header vocabulary
      │                    ├─ stripFurniture()      header/footer off the edges
      │                    └─ classifyPage()        body | front-matter |
      │                                             contents | references |
      │                                             back-matter | sparse
      │                              │
      │                              ▼
      │                    analyzeTextHealth()      lib/semantic/text-quality.ts
      │                    Khmer orthography, legacy-font artefacts
      │                              │
      │                    damaged ──┴──► STOP. Nothing is published.
      │                              │
      ▼                              ▼
   admitLabel() ──────────► collectEvidence()       lib/semantic/topics.ts
   locator? organization?   occurrences in BODY pages only
   publisher? format?
   self-reference?                   │
                                     ▼
                              scoreTopic()          breadth · depth · reach
                              supportedTopics()     ≥3 pages, ≥4 mentions
                                     │
                                     ▼
                        resource_semantic_insights  (0137)
                        status · topics · page_counts · text_health
                        semantic_version · source_digest
                                     │
                     ┌───────────────┴──────────────┐
                     ▼                              ▼
            getPublicTopics()              public_resource_semantic_health
            lib/semantic/insights.ts       admin Data Quality panel
                     │
                     ▼
             <BookTopics/>  →  /books/[slug]
             "Topics covered: Case study — 47 pages"
```

Everything left of `resource_semantic_insights` runs offline in
`scripts/build-semantic-insights.ts`. Everything right of it is one cached row
read by primary key. No request path parses a PDF, scans pages, or calls a
model — the derivation costs 1.5 s of CPU for the 1,622-page book in this
collection, which is fine in a script and unacceptable in a page render.

## 2. The claim, stated exactly

For each topic the page says:

> **Case study** — 47 pages

That is: 47 **body** pages of this PDF contain the phrase "case study", where
*body* excludes front matter, contents listings, bibliographies, back matter
and pages too sparse to be prose, and where the running header has been removed
from each page before counting.

Three things it deliberately is **not**:

* **Not printed page numbers.** `book_pages.page_no` is the PDF's page index.
  For a book with twenty pages of front matter that is nineteen off the folio
  printed on the page, so "discussed on page 111" would send a reader to the
  wrong one. The proving page list is stored so the claim stays auditable; only
  the count is published.
* **Not an excerpt.** No document text is stored in 0137 or rendered anywhere.
  A page count is a fact anyone holding the document can check. A passage is
  content, and this library has not written the rights policy that would govern
  publishing one.
* **Not a ranking signal.** The score orders topics *within* one document.
  A 1,622-page reference work and a 20-page guideline cannot be put on one
  scale by counting pages, and nothing ranks documents by it.

## 3. Why each refusal exists

| Stage | Refuses | Because |
|---|---|---|
| `analyzeTextHealth` | every Khmer-script book in the collection | extraction succeeded and returned text that is not the document's text (audit §4) |
| `classifyPage` → `contents` | contents pages | a contents page names every topic in the book; counting it makes the book "cover" all of them |
| `classifyPage` → `references` | bibliographies | a book cites subjects it does not cover |
| `stripFurniture` | running headers | a topic in a running header appears on every page of the book |
| `admitLabel` → `organization` | `SAGE`, `Ministry of Education`, `PTEC` | a book does not cover its own publisher or its funder |
| `admitLabel` → `locator` | `Grade 7`, `Volume 1` | a level is not a subject |
| `admitLabel` → `document-type` | `handbook`, `សទ្ទានុក្រម` | a format is not a subject |
| `admitLabel` → `self-reference` | the record's own title | "Topics covered: teaching strategies" under *Modern Teaching Strategies* says nothing |
| `supportedTopics` | < 3 pages or < 4 mentions | a passing mention is not coverage |

Two of those were found by running the pipeline over the real collection rather
than by reasoning: `SAGE` and `Springer` both cleared the evidence gate
comfortably before the publisher rule existed.

## 4. Provenance

Every published claim traces to rows that exist:

```
topic label   →  books.tags                        (librarian, at ingestion)
page numbers  →  book_pages                        (pdf.js, per page)
page kind     →  classifyPages()                   (pure, deterministic)
verdict       →  resource_semantic_insights.topics (stored with the pages)
```

"Why does this topic exist?" is answered by the stored `pages` array, and
`text_health` records why a record has *no* topics, by named damage mode rather
than as a bare failure.

## 5. What was deliberately not built

* **No `/topics/[slug]` route, and no new public URL of any kind.**
  `/subjects/[slug]` is already this library's topic ecosystem, already gated
  against soft-404s, already in the sitemap, already linked from every book
  (SEO V2). A parallel space would be the duplicate ecosystem the brief's own
  Rule C forbids. `app/sitemap.ts`, `app/robots.ts` and every canonical helper
  are untouched — because the feature adds no URLs, there is nothing for them
  to decide.
* **No chunk or page URLs.** Rules A and B, and `book_pages` is service-role
  only by design.
* **No LLM.** Every signal is a database fact or a pure function of one. The
  cost is zero tokens and the benefit is that every rule deciding what the
  public sees is unit-testable offline.
* **No excerpts.** Deferred to a rights decision, not to a later sprint.
* **No use of `book_chunks`.** The chunk table exists for vector retrieval and
  its text is a windowed copy of `book_pages` with 150 characters of overlap —
  so counting occurrences in it would double-count across window boundaries.
  Pages are the honest unit.

## 6. Versioning and idempotency

`SEMANTIC_VERSION` (`lib/semantic/build.ts`) is the generation of the pure
logic. It is stored on every row, and:

* `lib/semantic/insights.ts` **ignores** a row from a different generation
  rather than publishing a claim it can no longer justify;
* the build script recomputes such rows;
* `source_digest` does the same for the *input* — a re-extracted PDF changes
  the digest, so the row is rebuilt without a trigger.

Rows are keyed `(record_type, record_id)` and upserted, so reprocessing a
record replaces its row and can never produce a second one.

## 7. Access

`resource_semantic_insights` and `public_resource_semantic_health` are
service-role only, with `anon` and `authenticated` explicitly revoked — the
same posture as `book_pages` (0066), `book_chunks` (0082) and
`resource_index_state` (0133). The public book page reaches the table through a
server component, so the browser never needs it, and the table holds no
document text to leak in any case.

`allow_download` (0131) is untouched and unconsulted, because nothing here
serves or quotes a file. A read-online-only book gets exactly the same topic
counts as a downloadable one: the counts describe the document, not access to
it.

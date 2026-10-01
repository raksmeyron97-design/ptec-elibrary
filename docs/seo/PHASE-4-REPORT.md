# Phase 4 report: structured data

Branch `seo/phase-4-structured-data`, stacked on `seo/phase-3-research`
(nothing merged or pushed). Verified against a local production build (D13).

## Phase 4 report

**Finding addressed:** F10, under D10 (no SearchAction; keep the existing
FAQPage nodes, add none).

**What existed (audit).** 29 files rendered 52 JSON-LD blocks. `RootShell`
emitted the institutional graph on every page (EducationalOrganization,
Library, WebSite with a SearchAction), and each page added one to three more
blocks, each with its own `@context`. A page was therefore two to four
documents. Builders already existed for Book, ScholarlyArticle (with the
Issue → Volume → Periodical chain for mapped articles), Course,
CollectionPage/ItemList, ProfilePage/Person, NewsArticle and Event. Two
defects the old entity test missed: the About, Team and Committee pages each
declared an anonymous copy of the library and of the college (typed
`CollegeOrUniversity`, which that test did not look for).

**Changes**

| Commit | What changed |
|---|---|
| `feat(seo): F10 one JSON-LD document per page …` | `lib/seo/jsonld.ts` declares the three sitewide nodes. **CollegeOrUniversity** (`@id https://www.ptec.edu.kh/#org`, `sameAs` without its own site). **Library** (`#library`, parent the college, address, telephone, `openingHoursSpecification` from the footer's data). **WebSite** (Khmer `alternateName`, `inLanguage` en + km, publisher the library, **no SearchAction**). `pageGraph()` merges them with a page's nodes into one `{ @context, @graph }`, drops a page node that redeclares a sitewide `@id`, and prunes empty values. `<PageJsonLd>` renders it exactly once per public page. `RootShell` emits nothing. The homepage and policy FAQPage nodes join their page's graph. The About pages refer to the library by `@id`. |
| `feat(seo): F10 theses are Thesis nodes; paths list their steps` | **Thesis** (was ScholarlyArticle): author-role authors; advisors as `contributor` (through the byline classifier); degree as `inSupportOf`; the college as `sourceOrganization`; `encoding` MediaObject only for an open-access PDF. Learning paths gain an **ItemList** of their steps beside the Course. |
| `feat(seo): F10 event times in Phnom Penh time; EBook only with a file` | Event `startDate`/`endDate` are published as local time with `+07:00`; they were the stored UTC instant. `bookFormat: EBook` appears only when the book can be read here. |
| `… Person carries their Khmer name as alternateName` | The author `ProfilePage` → `Person` adds the Khmer name. `affiliation`, `jobTitle` and `sameAs` (ORCID, Scholar) were already there. |
| `fix(seo): F10 an ItemList with no items is dropped` | An out-of-range listing page left an empty ItemList. |
| tests and harness | `lib/seo/jsonld.test.ts`: the graph shape, plus a source scan that every public page renders one graph and nothing else renders `<JsonLd>`. Entity-graph and phone tests follow the move. The e2e specs read nodes out of `@graph` (`e2e/utils/jsonld.ts`). seo-check lets a noindex template (the reader, search, the offline shell) carry no structured data. |

**Evidence**

- `seo-check --phase 4`, local build, local list: **0 failing in phases 0–4**
  (1,545 ok, 8 advisory warnings, 0 5xx). Phase 4 had 164 failing at the
  Phase 3 exit. Every check passes on all 59 pages:
  - `jsonld-single-block`
  - `jsonld-no-searchaction`
  - `jsonld-empty-values`
  - `jsonld-target-types`
- Build route table: **identical** to Phase 3, so no route changed rendering
  mode, although every page now reads the cached site settings for its graph.
- `tsc` 0 errors; `lint` 0 errors (172 warnings, unchanged); `vitest`
  **9,057 passed**; `next build` exit 0 from a clean `.next`.
- E2E (committee, journals, seo, thesis-record, learning-paths): 72 passed and
  15 failed on the first run.
  - 4 failures were the specs looking for nodes among blocks rather than in
    the graph. I fixed the specs and re-ran: **5 passed**.
  - 1 was a navigation timeout under load (load average 25–30). Re-run in
    isolation: passed.
  - 10 are the known local-data `thesis-record` set: this database's theses
    have no file or Khmer title, which the CI seed sets.

**Risks and follow-ups**

- **The college's `@id` changed** from `https://library.ptec.edu.kh/#organization`
  to `https://www.ptec.edu.kh/#org`, as the approved plan specifies. A
  consumer that cached the old id sees a new entity under the same name, URL
  and `sameAs`. Google resolves organisations by those, not by `@id`, so I
  expect no visible effect. The test that pinned the old value now pins the
  new one with the reason.
- **No literal snapshot files.** Each template's structure is asserted by
  its builder's existing unit test (`book-seo`, `thesis-seo`,
  `publication-seo`, `learning-path-seo`, `posts-seo`) and by the graph test.
  I preferred these to snapshots, which pass when re-recorded without
  anyone reading them.
- **The `Course` rich result was retired by Google** (June 2025) and FAQ
  results (May 2026). Those nodes are kept for understanding, not snippets,
  as the plan says.
- **Production verification** after deploy: see the runbook section
  "Phase 4: checking the structured data after deploy".

**Decisions needed:** none new. P2-1, P2-2 and P3-1 remain open.

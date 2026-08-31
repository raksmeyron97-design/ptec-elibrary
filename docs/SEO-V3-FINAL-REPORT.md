# SEO V3 — Final Report

**Date:** 2026-08-31
**Branch:** `feat/seo-v3-entity-graph` (`91eeee1`, `a7e9a9c`)
**Scope delivered:** Phases 0–2 and 12 of the brief's execution order, plus the
parts of 3–5 and 10 the data supports.

Companion documents:
[SEO-V3-AUDIT.md](SEO-V3-AUDIT.md) ·
[SEO-V3-ARCHITECTURE.md](SEO-V3-ARCHITECTURE.md) ·
[PTEC-ENTITY-MAPPING.md](PTEC-ENTITY-MAPPING.md) ·
[SEO-V3-PARAMETER-POLICY.md](SEO-V3-PARAMETER-POLICY.md) ·
[SEO-V3-SEARCH-INTENT-MAP.md](SEO-V3-SEARCH-INTENT-MAP.md)

---

## 1. Executive summary

The audit was run against **live production HTML**, not just the repository,
and that changed the whole shape of the work.

**What it found.** The SEO layer is genuinely strong — canonicals, reciprocal
hreflang, a real `@id`-anchored site graph, first-class Khmer, a validated
sitemap, an opt-in indexing gate at three layers. But every rendered resource
page described PTEC **twice**: once correctly, and once as an anonymous node
carrying the *library's* URL as the institution's. Breadcrumbs pointed at a
URL that 308-redirects, at filtered listings the site tells crawlers to ignore,
and — on Khmer pages — at English URLs. None of it was visible in code review;
all of it was one `curl` away.

**What V3 did.** Made a second declaration of the institution *unrepresentable*,
made breadcrumbs locale-correct and canonical by construction, gave the
"faculty" ambiguity a name and a test, and localized the Khmer facet labels that
were hardcoded English. Then encoded each defect class as a source-scanning
test — one of which immediately caught a **fourth** hand-rolled organization
node that manual grepping had missed.

**What V3 refused to do, and why.** The brief asks for faculty, department,
programme and lecturer landing pages. Production publishes **3 books, 0 theses,
0 publications, 0 learning paths**. Those pages would be exactly the thin (§27)
doorway (§67) pages the same brief forbids. The entity layer is built and
tested; the pages are gated until content earns them.

**The headline finding, and its correction.** The audit reported SEO V2 as
unmerged and undeployed: `/subjects` and `/authors` returned 404 in production
and ten empty subject pages were still in the live sitemap. The measurement was
right; half the diagnosis was wrong. V2 had been **squash-merged** by PR #103,
so its commit is not an ancestor of `main` while its content is — `git branch
--contains` was the wrong instrument. The real cause was **deploy lag**: the
GHCR publish plus the box's 5-minute poll had not yet delivered #103. It has
since, and all four symptoms are gone. See `docs/SEO-V3-AUDIT.md` §0.1.

---

## 2. Institutional integration

`www.ptec.edu.kh` was inspected directly, including its open WordPress REST API.
It publishes **3 faculties, 7 departments, 27 academic papers, 4 declared
journals, 147 lecturer profiles, 33 partners**, and it already links to
`library.ptec.edu.kh/books` from its homepage.

The relationship is asserted through data, not through metadata theatre:

```
EducationalOrganization  @id .../#organization
  url      https://www.ptec.edu.kh      ← the institution's OWN site
  sameAs   official site, Facebook, YouTube, Telegram
  logo · address · telephone · email
        ▲
        │ parentOrganization  (bare @id reference)
Library  @id .../#library
  url      https://library.ptec.edu.kh
        ▲
        │ provider
  every Book / ScholarlyArticle / Course / Article
```

**What was corrected:** `provider.parentOrganization.url` previously resolved to
`https://library.ptec.edu.kh` on every resource page, contradicting the
`#organization` node in the same document.

**What was refused:** no fabricated relationship. PTEC's department and journal
taxonomies exist but are **unpopulated** — its academic papers store department
as an opaque postmeta integer and journal as free text — so no instance-level
machine linking is possible in either direction, and none was invented.

---

## 3. Entity architecture

| Entity | Status |
|---|---|
| PTEC (institution) | **One** `@id`, referenced everywhere. Fixed. |
| PTEC Library | `Library`, `parentOrganization` → the institution. Fixed. |
| Faculty | **Documented, not modelled.** Vocabulary conflict named and tested. |
| Department | **Documented, no public page.** Table holds only `(id, name, slug)`. |
| Programme / track | Exists as thesis metadata; facet relabelled "Faculty / Major". |
| Lecturer ↔ Author | **No automatic matching** — names are the only shared signal. |
| Subject | Working topic layer (V2), bilingual, populated, gated when empty. |
| Resource | `Book` / `ScholarlyArticle` / `Course` / `Article`, `@id`-anchored. |
| Learning path | Route exists; 0 published. |

The "faculty" conflict, stated once: **PTEC's site** uses *faculty* for its 3
academic units; **`research_faculties`** holds 5 tracks inside a degree
programme. Labelling the latter "Faculty" publishes a claim PTEC's own website
contradicts.

---

## 4. Internal link graph

Implemented in this release:

```
Book ─┬─ Subject hub   /subjects/<slug>   ← now also the breadcrumb waypoint
      ├─ Author hub    /authors/<slug>
      └─ Library       @id reference
```

The book breadcrumb's third crumb was `/books?dept=…` (a `noindex` filtered
listing). It now resolves through V2's `resolveSubjectLinks()`, which returns a
link **only** when the subject has public resources — so the crumb can never
point at an empty hub, and is omitted when nothing resolves. The visible `<nav>`
uses the same target, so the trail and the structured data now agree; they
previously disagreed outright.

---

## 5. Technical SEO — verified, not assumed

Checked live on `https://library.ptec.edu.kh`:

| Check | Result |
|---|---|
| `/`, `/km`, `/books`, `/theses`, `/publications`, `/paths`, `/posts`, `/catalogs` | 200 |
| `/subjects`, `/authors` | **404 — SEO V2 not deployed** |
| Canonicals | correct, self-referential |
| hreflang | reciprocal `en` / `km` / `x-default` |
| `<h1>` | exactly one per page |
| Khmer localization | real — title, description, H1, body |
| `/books?dept=…` | `noindex, follow`, canonical `/books` ✓ |
| `/home` | 308 → `/` ✓ |
| `/logo.png` | 200 `image/png` ✓ |
| `robots.txt` | **Cloudflare-overridden, contradictory** (unresolved, dashboard-side) |
| `sitemap.xml` | 37 URLs; **10 are empty subject pages** (pre-V2 build) |

Verified in rendered HTML against a local dev server, both locales:

```
[EducationalOrganization] @id=…/#organization   url=https://www.ptec.edu.kh   ← once only
[Book] provider: {"@id":"…/#library", …, "parentOrganization":{"@id":"…/#organization"}}
[BreadcrumbList] @id=…/km/books/foundations-of-education#breadcrumb
   1. 'ទំព័រដើម'  -> …/km
   2. 'សៀវភៅ'     -> …/km/books
   3. 'Education' -> …/km/subjects/education
   4. 'Foundations of Education' -> (current page, no item)
```

---

## 6. Structured data

Active types: `EducationalOrganization`, `Library`, `WebSite` (+`SearchAction`),
`Book`, `ScholarlyArticle`, `Course`, `Article`, `Event`, `CollectionPage`,
`ItemList`, `Person`, `BreadcrumbList`, `FAQPage`.

`@id` anchoring: `#organization`, `#library`, `#website`, `<url>#book`,
`<url>#thesis`, `<url>#course`, `<url>#person`, and now `<url>#breadcrumb`.

**Not validated externally.** No Rich Results Test or Schema.org validator run
was performed — the changes are not deployed, so there is no public URL serving
them. §70 forbids claiming validation that did not happen.

---

## 7. Localization

- Khmer verified first-class on production: title, description, H1, body.
- **Fixed:** `/theses` applied-filter chips were hardcoded English on a
  bilingual page. Eight labels added to both catalogues.
- **Fixed:** Khmer breadcrumbs emitted English URLs on 7 detail routes.
- **Remaining gap:** subject *names* come from `categories.name`, which has no
  Khmer column — an English-named subject stays English under `/km`. Schema
  change, out of scope.

---

## 8. Performance

No measurable regression expected and none introduced by construction:

- `organizationNode()` / `libraryNode()` are pure and now emit *fewer* fields
  (a reference instead of a nested duplicate) — JSON-LD payload shrinks slightly.
- The one added query path, `resolveSubjectLinks()` on the book page, reads
  `getSubjectIndex()` — a cache that already backs `/subjects` and the sitemap —
  so it costs **zero** additional database round trips.
- No new synchronous metadata queries; no change to caching or revalidation.

Production build: **exit 0, 111/111 static pages** — the same count as before.
No Lighthouse comparison was run (the changes are not deployed).

---

## 9. Tests

Real numbers from this branch:

```
TypeScript (tsc --noEmit)        PASS — 0 errors
ESLint                           PASS — 0 errors (157 pre-existing warnings)
Unit tests (vitest run)          PASS — 2293 passed, 42 skipped, 168 files
Production build (next build)    PASS — exit 0, 111/111 static pages
Rendered-HTML verification       PASS — JSON-LD + breadcrumbs, en and km
```

Baseline before this work was 2259 passing; **+34 tests** added.

| New test | Rule |
|---|---|
| `lib/seo/entity-graph.test.ts` | one declaration of the institution site-wide; correct institution URL; bare `@id` references; RootShell uses the shared anchors |
| `lib/seo/breadcrumbs.test.ts` | locale correctness, no redirecting paths, no query strings, `@id` anchoring, plus a call-site scan |
| `lib/seo/institution.test.ts` | PTEC's real faculty/department names; no bare "Faculty"; no hardcoded English filter labels; Khmer parity |

**Also run:** the Playwright **e2e suite passed on PR #106** (23m15s, against a
real local Supabase stack with the full migration chain and seed) — closing the
verification gap SEO V2 had recorded as outstanding. Full PR CI: secret-scan,
dependency-review, test, e2e, CodeQL and the Vercel preview all green.

---

## 10. Remaining work

### Implemented
Entity-graph deduplication · correct institution URL · `@id`-anchored
breadcrumbs · locale-correct breadcrumbs · redirect/query-free structured data ·
subject-hub breadcrumb waypoint · institutional vocabulary + tests · Khmer facet
labels · three invariant tests · six documents · upgraded `seo-optimizer` skill.

### Partially implemented
- **Lecturer ↔ author** — the data model supports it (`contributors` with a
  unique ORCID index); the cross-system mapping is refused by design and there
  is no admin mapping UI.
- **Search-intent coverage** — documented; several tiers are "gated" or "thin"
  purely because the collection is nearly empty.

### Future opportunity
- Canonical-model cutover so `contributors` / `subjects` / `resource_keywords`
  become the public read source (audit D-11, `docs/CANONICAL-RESOURCES.md`).
  Today a three-author thesis renders as one `Person` whose name is all three.
- `categories` schema: description + Khmer name, which unblocks real subject
  landing-page prose.
- Search Console ingestion (audit D-12).
- `/posts` empty-state fix (audit D-9).

### Requires action outside this repository
- ~~Merge and deploy SEO V2 + V3.~~ **Done** — V3 merged as PR #106; the
  self-hosted deploy is automatic (GHCR publish on push to `main` + a 5-minute
  poll from the box).
- **Cloudflare `robots.txt` override** — dashboard-side; the app is the decided
  source of truth.
- **Editorial content** — the binding constraint on nearly everything above.

### Explicitly not done, with reasons
Faculty / department / programme landing pages (would be doorway pages at
current volume) · automatic person matching (names are the only shared signal) ·
generated subject descriptions (no source data) · a single SEO score (§42) ·
any backlink acquisition (§39).

---

## 11. Honest limits of this report

- Every "verified live" line in §5 describes production **at audit time**,
  before the pending deploy landed. The V2 symptoms listed there have since
  cleared; the V3 changes reach production through the same automatic pipeline.
- No external validator was run. No Search Console data exists.
- No traffic, ranking, CTR or search-volume figure appears in any SEO V3
  document, because none was measured.
- The e2e suite **was** executed, on PR #106's CI run: **pass, 23m15s**. This
  closes the verification gap SEO V2 had recorded.
- One finding in the audit (D-9) was **recorded wrongly at first** and is
  corrected in place, with the corrected diagnosis and the evidence for it.

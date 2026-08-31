# SEO V3 — Audit (Phase 0)

**Date:** 2026-08-31
**Branch:** `feat/roles-workspace-and-paths-explorer`
**Method:** repository inspection + **live production HTTP/HTML inspection** +
inspection of the official institutional site `www.ptec.edu.kh` (including its
open WordPress REST API).

Companion documents:
[PTEC-ENTITY-MAPPING.md](PTEC-ENTITY-MAPPING.md) ·
[SEO-V3-ARCHITECTURE.md](SEO-V3-ARCHITECTURE.md) ·
[SEO-V3-SEARCH-INTENT-MAP.md](SEO-V3-SEARCH-INTENT-MAP.md) ·
[SEO-V3-PARAMETER-POLICY.md](SEO-V3-PARAMETER-POLICY.md)

Predecessors, still accurate and **preserved**:
[SEO-ARCHITECTURE.md](SEO-ARCHITECTURE.md) ·
[SEO-V2-AUDIT.md](SEO-V2-AUDIT.md) ·
[SEO-V2-FINAL-REPORT.md](SEO-V2-FINAL-REPORT.md) ·
[SEO-V2-URL-POLICY.md](SEO-V2-URL-POLICY.md)

---

## 0. The two findings that reframe the brief

Read these before anything else. Both were invisible from the repository and
both change what SEO V3 should be.

### 0.1 SEO V2 is written but **not deployed**

`git rev-list --count origin/main..HEAD` = **6**. The SEO V2 commit
(`7d95a78 feat(seo): SEO V2 …`) is contained by `feat/roles-workspace-and-paths-explorer`
**only** — not by `main`. Live production is running pre-V2 code. Verified over HTTP:

| Check | Expected after V2 | **Live production today** |
|---|---|---|
| `GET /subjects` | 200 (hub page) | **404** |
| `GET /authors` | 200 (hub page) | **404** |
| Empty `book-<epoch>` subjects in `sitemap.xml` | excluded | **10 of 15 subject URLs still advertised** |
| `robots.txt` disallow list | derived, includes `/km/admin`, `/km/auth`, `/km/api` | **hand-written pre-V2 copy** — still disallows the nonexistent `/login`, still omits `/km/admin`, `/km/auth`, `/km/api` |

Every P0 that SEO V2 closed is **still live**. No amount of V3 work changes
that: the fix is a merge and a deploy, and it is worth more than the entire
rest of this document.

### 0.2 Content, not architecture, is still the binding constraint

Measured on production, 2026-08-31:

| Collection | Published items |
|---|---|
| Books | **3** |
| Theses | **0** |
| Publications | **0** |
| Learning paths | **0** |
| Posts | **0** in the listing (1 detail URL is live and in the sitemap — see D-9) |
| Physical catalog | listing renders, no countable public items |
| Subjects (`categories`) | 15 rows, **10 empty**, 5 with resources |

The brief (§9–§13) asks for faculty, department, program and lecturer landing
pages. **Building them today would produce exactly the thin, near-empty landing
pages §45 and §67 forbid** — a "Faculty of Science Education" page whose entire
inventory is two books is a doorway page with an institutional name on it.

SEO V3 therefore ships the **entity layer** (identity, relationships,
structured data, vocabulary, validation, diagnostics) and deliberately
**withholds the entity landing pages** behind a content threshold, exactly as
V2 did for empty subjects. The plumbing is built and tested; the pages appear
when the data earns them.

---

## 1. Current architecture

### 1.1 What exists

```
lib/seo/
  indexing.ts          three-layer opt-in indexing gate + PRIVATE_PATH_PREFIXES
  site.ts              SITE_URL / absoluteUrl(), validated single origin
  production-origin.ts leaf constant (no cycles)
  alternates.ts        localeAlternates() → canonical + en/km/x-default
  schema.ts            breadcrumbSchema()
  org-nodes.ts         organizationNode() / libraryNode()
  book-seo.ts          Book metadata + JSON-LD
  thesis-seo.ts        Thesis metadata + JSON-LD
  publication-seo.ts   ScholarlyArticle metadata + JSON-LD
  learning-path-seo.ts LearningResource / Course metadata + JSON-LD
  posts-seo.ts         Article / Event metadata + JSON-LD
  listing-metadata.ts  buildListingMetadata() for /books, /theses, …
  open-graph.ts        OG image resolution
  citation.ts          Highwire/Dublin Core citation_* meta
  identifiers.ts       ISBN/DOI/ISSN normalisation + validation
  references.ts        reference parsing
  health.ts            per-record SEO completeness scoring
  validate.ts          8 deterministic validators (V2)
components/seo/
  JsonLd.tsx           <script type="application/ld+json">
  ResourceConnections.tsx  resource → subject/author link block (V2)
components/layout/RootShell.tsx
  buildSiteGraph()     the site-wide @graph: #organization / #library / #website
app/robots.ts, app/sitemap.ts, app/root-metadata.ts, middleware.ts
```

Test coverage is real: `alternates`, `book-seo`, `citation`, `health`,
`identifiers`, `indexing`, `learning-path-seo`, `open-graph`, `publication-seo`,
`references`, `site`, `thesis-seo`, `validate` all carry `.test.ts` siblings.

### 1.2 Verified strengths — preserve all of these

Confirmed by fetching live HTML, not by reading source:

- **Canonicals** correct and self-referential on `/`, `/km`, and resource pages.
- **hreflang reciprocal and complete** — `en`, `km`, `x-default` on every page checked.
- **Khmer is genuinely localized**, not a translated shell: `/km` serves a Khmer
  `<title>`, Khmer `meta description` and a Khmer `<h1>`.
- **Exactly one `<h1>` per page** on every page checked.
- **A real `@id`-anchored site graph already exists** — `#organization`,
  `#library` (with `parentOrganization` → `#organization`), `#website` (with
  `publisher` → `#organization` and a `SearchAction`). This is a stronger
  starting point than the brief assumes.
- **`EducationalOrganization` already carries `sameAs`** (official site,
  Facebook, YouTube, Telegram), `logo` (verified 200 `image/png`), `telephone`,
  `email`, `address`. §6's "canonical PTEC organization entity" is **already
  built** — in `RootShell.buildSiteGraph()`, from published system settings.
- **Filtered listings are handled correctly**: `/books?dept=…` serves
  `robots: noindex, follow` with `canonical: /books`. §33 is already satisfied
  for the parameters in use.
- **Accuracy discipline**: unknown facts are omitted rather than defaulted;
  PTEC is `provider`, never `publisher`, for hosted items; `lastmod` is real or
  absent.
- **Sitemap is validated before it is served** and drops entries that would be
  silently wrong.

### 1.3 Institutional substrate that already exists in the database

The brief assumes these entities must be created. Most already exist:

| Concept | Table | Reality |
|---|---|---|
| Organization | `organizations` (0104) | exists, org-scopes the canonical model |
| Contributor / author | `contributors` + `resource_contributors` (0105) | exists, backfilled from all three legacy author models, carries `orcid`, `affiliation`, `name_km` |
| Subject taxonomy | `subjects` + `resource_subjects` (0107) | exists, **hierarchical** (`parent_id`), EN/KM, slugged |
| Keywords | `resource_keywords` (0107) | exists, normalised one-per-row |
| Relations | `resource_relations`, `resource_references` (0108) | exists |
| Files | `storage_objects`, `resource_files` (0106) | exists |
| Department | `departments` | exists — but see D-6 |
| Degree program | `research_programs` (0055) | exists, seeded, EN + KM |
| Program track | `research_faculties` (0055) | exists, seeded, EN + KM — but see D-7 |

**The knowledge graph the brief asks for is largely already modelled.** What is
missing is that almost none of it is *read by the public site* — the legacy
tables remain the read source (`docs/CANONICAL-RESOURCES.md`), so the
normalised graph is invisible in the HTML.

---

## 2. Findings

Severity: **P0** critical · **P1** high impact · **P2** medium · **P3** future.

### D-1 · P0 · SEO V2 is unmerged and undeployed

See §0.1. Every V2 P0 remains live.

**Fix:** merge `feat/roles-workspace-and-paths-explorer` to `main` and deploy.
Not a code change; **owner action required**.

---

### D-2 · P0 · Every resource page emits a **second, contradictory** Organization entity

`RootShell.buildSiteGraph()` carries this comment:

> *"Nothing else may declare an Organization/Library/WebSite node — duplicates
> with diverging names/URLs read as conflicting entities to search engines."*

`lib/seo/org-nodes.ts` does exactly that. Captured from **live production
HTML** on a book page, in the same document:

```jsonc
// block 1 — RootShell site graph (correct)
{ "@type": "EducationalOrganization",
  "@id": "https://library.ptec.edu.kh/#organization",
  "url": "https://www.ptec.edu.kh" }          // ← the institution's real URL

// block 2 — Book node, provider chain (wrong, and anonymous)
{ "provider": { "@type": "Library",
                "name": "PTEC Library",
                "parentOrganization": {
                  "@type": "EducationalOrganization",
                  "name": "Phnom Penh Teacher Education College",
                  "url": "https://library.ptec.edu.kh" } } }  // ← WRONG URL
```

One document, one institution, **two `url` values**. The second node has no
`@id`, so a consumer cannot merge it with the first — it reads as a *different*
organization that happens to share a name, whose website is the library.

This is the precise failure §28 (entity consistency) and §29 ("avoid duplicate
anonymous entities") exist to prevent, and it is on **every** book, thesis,
publication, learning-path, post, subject and author page — 14 call sites.

**Root cause:** `OrgIdentity.url` is `SITE_URL` (the library origin) and
`org-nodes.ts` uses it for the *institution*. `orgIdentityFrom()` never carries
`cfg.links.website`, so the institution's own URL is unreachable from the
synchronous builders.

**Fix:** add `institutionUrl` to `OrgIdentity`; make `organizationNode()` /
`libraryNode()` emit `@id` references into the site graph instead of inline
duplicates. One change, all 14 call sites corrected. → implemented in Phase 1.

---

### D-3 · P1 · Breadcrumb locale leakage — Khmer pages emit English breadcrumb URLs

`breadcrumbSchema()` prepends `SITE_URL` to a raw path. Seven of eight detail
routes pass unprefixed paths:

```ts
// app/[locale]/(public)/theses/[slug]/page.tsx
breadcrumbSchema([
  { name: tNav("home"),   path: "/" },        // → https://library.ptec.edu.kh/
  { name: tNav("theses"), path: "/theses" },  // → …/theses
  { name: report.title },
]);
```

On `/km/theses/<slug>` the emitted `BreadcrumbList` points entirely at
**English** URLs. The Khmer page declares a navigation path that leaves its own
locale. Affects `/theses`, `/publications`, `/catalogs`, `/posts`, `/paths`,
`/subjects`, `/authors` detail pages.

**Fix:** make breadcrumb paths locale-aware at the builder, not per call site.

---

### D-4 · P1 · The book breadcrumb points `Home` at a **redirecting** URL

`app/[locale]/(public)/books/[slug]/page.tsx:259`:

```ts
{ name: t("home"), path: `${localePrefix}/home` },
```

`GET https://library.ptec.edu.kh/home` → **308** → `/`. Confirmed live: every
book page's `BreadcrumbList` advertises a redirect as position 1. `/home` was
retired to a 308 in middleware; this call site was never updated.

It is also the *only* route using `localePrefix` — so the codebase carries two
mutually inconsistent breadcrumb conventions, and both are wrong (D-3, D-4).

---

### D-5 · P1 · Breadcrumb waypoints point at `noindex` query URLs

```ts
// books/[slug]
{ name: book.department, path: `${localePrefix}/books?dept=${…}` }
// publications/[slug]
{ name: pub.journal_name, path: `/publications?journal=${…}` }
```

Both targets serve `robots: noindex, follow` and `canonical: /books` (verified
live). Structured data is therefore advertising, as a navigational waypoint, a
URL the same site tells crawlers not to index and canonicalises away.

The correct waypoint for the book case already exists after V2:
`/subjects/<slug>`. → Phase 5.

---

### D-6 · P1 · `departments` cannot support a public page

`public.departments` is `(id, name, slug, created_at)`. No description, no
`name_km`, no faculty link, no ordering. It is read **only by admin code** —
`app/(admin)/…/books/actions.ts`, `ManageDepartmentsModal`, `lib/admin/*` — plus
one search filter in `lib/books-data.ts`. There is no public `/departments`
route and nothing links to a department.

A department landing page today would have: a name, and a filtered list of
whichever of the 3 published books carry that `department_id`. That is a thin
page (§27) and a doorway page (§67).

**Decision:** do **not** create department landing pages in V3. Record the
vocabulary alignment (PTEC-ENTITY-MAPPING.md) and the schema work that would be
required, and gate the pages behind a content threshold. → P3.

---

### D-7 · P1 · "Faculty" means two different things

| | Meaning | Values |
|---|---|---|
| **www.ptec.edu.kh** | academic unit | 3: Pedagogy & Research · Science Education · Social Sciences Education |
| **`research_faculties`** (0055) | specialisation *within* a degree programme | 5: Primary Education · Lower Secondary Education · Early Childhood Education · School Management · Educational Management and Leadership |

`research_faculties` rows are what the institution calls **programme tracks**;
the institution's own "faculties" are the three academic units, which the
e-Library does not model at all. Rendering `research_faculties` under the label
"Faculty" on a public page would publish a claim about PTEC's structure that
contradicts PTEC's own website — the opposite of §28.

**Fix:** treat this as a **vocabulary** problem, documented and asserted by a
test, not as a data migration. → PTEC-ENTITY-MAPPING.md §3.

---

### D-8 · P1 · Cloudflare injects a contradictory `robots.txt`

Live `robots.txt` is `[Cloudflare managed block] + [app output]`. The managed
block emits `Disallow: /` for `GPTBot`, `ClaudeBot`, `CCBot`, `Google-Extended`,
`Amazonbot`, `Applebot-Extended`, `Bytespider`, `meta-externalagent`, plus
`Content-Signal: search=yes,ai-train=no,use=reference`.

`app/robots.ts` emits, for several of the same agents, an explicit
`Allow: /books/ …`. The file therefore states both positions for one agent, and
the resolved behaviour depends on each parser's group-merge and
longest-match rules rather than on a decision anyone made.

Already tracked (`docs/SEO-V2-FINAL-REPORT.md` §7, memory
`cloudflare-robots-override`). **Owner action in the Cloudflare dashboard**;
the app is the decided source of truth. Unchanged by V3, restated here because
it now also contradicts V3's AI-surface intent.

---

### D-9 · P2 · A sitemap URL the listing does not show

`sitemap.xml` advertises
`/posts/សិក្ខាសាលាស្តីពី-ការផ្សារភ្ជាប់រវាងការស្រាវជ្រាវអប់រំ-និងសហគមន៍` (returns
**200**), while `/posts` renders *"Showing 1–0 of 0 results"*.

The sitemap filters `is_published = true AND visibility = 'public'`; the
listing applies at least one further condition. Either the post is
`unlisted`/scheduled and should not be in the sitemap, or it is public and the
listing is dropping it. Both are defects; which one requires reading the row.

**Fix:** reconcile the two filters behind one helper so they cannot diverge.
→ P2, needs a DB read to classify.

---

### D-10 · P2 · `BreadcrumbList` and `FAQPage` are anonymous

Neither carries an `@id` (verified live). §29 asks for consistent `@id` use so
nodes can be referenced and merged rather than duplicated. Cheap to fix at the
builder.

---

### D-11 · P2 · The normalised graph is invisible in the HTML

`contributors`, `subjects`, `resource_subjects`, `resource_keywords`,
`resource_relations` are populated but the public site still reads the legacy
tables. Consequences for SEO specifically:

- multi-author theses render as one free-text byline, so `author` in JSON-LD is
  a single anonymous `Person` holding three people's names in one string
  (visible in the live capture: `"សន សុយៀម ស៊្រុន សៀងហួរ និង ឈឺន ឈាន"` as **one**
  `Person.name`);
- `orcid` and `affiliation` exist in `contributors` and reach no page;
- the subject hierarchy (`subjects.parent_id`) is not used for topic clustering.

This is the largest *remaining* structural opportunity, and it is blocked on
the canonical-model cutover, not on SEO. → P3, tracked in
`docs/CANONICAL-RESOURCES.md`.

---

### D-12 · P3 · No search-performance data layer

There is no Search Console ingestion, so §40's grouping by resource type cannot
be computed. `app_events` and the admin analytics stack could host it. Recorded
as an opportunity; **no numbers are invented anywhere in these documents**.

---

## 3. What the brief asks for that the data does not support

Stated plainly, with the reason, per §67 and §68:

| Brief section | Asked for | Status | Reason |
|---|---|---|---|
| §9 Faculty SEO | faculty landing pages | **withheld** | 3 published books; would be doorway pages (§67). Vocabulary conflict D-7 unresolved at the source. |
| §10 Department SEO | department landing pages | **withheld** | D-6 — the table holds a name and a slug; nothing to say on a page. |
| §11 Program → Learning Path | program landing pages | **withheld** | 0 published learning paths. |
| §12–13 Lecturer ↔ Author | identity resolution | **partial** | `contributors` supports it; **no automatic name matching is implemented** — §13 requires explicit mapping under ambiguity and there is no admin mapping UI yet. Documented, not guessed. |
| §23 Educational guides | evergreen content hub | **out of scope for engineering** | Publishing system is complete; the team authors content directly (decided 2026-08-31, `docs/SEO-V2-CONTENT-STRATEGY.md` §7). |
| §40 Search Console layer | query/CTR reporting | **not built** | D-12. No data source connected. |

---

## 4. Priority queue

| ID | Sev | Finding | Disposition |
|---|---|---|---|
| D-1 | P0 | SEO V2 unmerged/undeployed | **owner action** — merge + deploy |
| D-2 | P0 | duplicate contradictory Organization entity | **fix** — Phase 1 |
| D-3 | P1 | breadcrumb locale leakage | **fix** — Phase 1 |
| D-4 | P1 | breadcrumb → redirecting `/home` | **fix** — Phase 1 |
| D-5 | P1 | breadcrumb → `noindex` query URLs | **fix** — Phase 1 |
| D-6 | P1 | `departments` too thin for a page | **document + gate** |
| D-7 | P1 | "faculty" vocabulary conflict | **document + assert** |
| D-8 | P1 | Cloudflare robots.txt override | **owner action** (unchanged) |
| D-9 | P2 | sitemap/listing filter divergence | fix behind one helper |
| D-10 | P2 | anonymous `BreadcrumbList`/`FAQPage` | **fix** — Phase 1 |
| D-11 | P3 | canonical model invisible in HTML | tracked in CANONICAL-RESOURCES.md |
| D-12 | P3 | no Search Console data layer | opportunity |

**No P0 regression exists in the V2 code itself.** D-2 predates V2 and V2 did
not touch it.

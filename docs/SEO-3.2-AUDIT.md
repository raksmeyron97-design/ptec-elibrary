# SEO 3.2 — Contributor Consumer Audit

**Date:** 2026-09-12
**Branch base:** `main` @ `b3bd588` (SEO 3.1 merged)
**Production database read:** `https://supabase.storage-ptec.online`, read-only,
service role, via `scripts/audit-contributor-graph.ts` and
`scripts/audit-contributors.ts`. Every production number below is from that
read or from live HTTP; nothing is estimated.

SEO 3.0 fixed *what a page claims about an entity*. SEO 3.1 fixed *how
contributor data enters the canonical model*. This audit asked the only
question left: **does the rest of the application actually consume it?**

---

## 0. Production state, first

The canonical resource model exists in production and is **empty**.

| Table | Production rows |
| --- | --- |
| `contributors` | **0** |
| `resource_contributors` | **0** |
| `resource_files` | 0 |
| `resource_subjects` | 0 |
| `authors` | 157 |
| `books` | 298 (296 published) |
| `research_reports` | 1 |
| `publications` | 0 |
| `catalog_books` | 6 |

The tables answer queries, so migrations `0104`–`0109` **are applied**. What did
not happen is their BACKFILL: the self-hosted Supabase instance was created
fresh at the 2026-09-06 cutover and the migration chain ran against an empty
database, so 0105's `INSERT … SELECT FROM authors` had nothing to read. The
content was imported afterwards. SEO 3.1's write path only fires on a book
save, and no book has been saved since.

**Consequence for this phase, stated plainly:** every canonical read in
production currently resolves to `legacy`, and the SEO 3.2 fallback is what
serves the site today. The activation is correct and inert. It becomes visible
the moment a backfill runs — see §7 of the final report.

## 0.1 Contributor expressions in production

From `scripts/audit-contributors.ts` against the live `authors` table, with the
institution identity resolved from published System Settings:

| Category | Count | Share |
| --- | --- | --- |
| `SAFE_SINGLE` — one person | 85 | 54.1% |
| `SAFE_MULTIPLE` — several people, deterministically separable | **43** | 27.4% |
| `ORGANIZATION` — a corporate body | 27 | 17.2% |
| `INSTITUTION` — PTEC itself | 2 | 1.3% |
| `AMBIGUOUS` | 0 | 0.0% |
| `EMPTY` | 0 | 0.0% |
| **Total** | **157** | |

16 rows carry a cataloguer role marker inside the stored name. All 157 have a
populated `slug`, so all 157 have a live, routable `/authors/<slug>` URL.

The composite count is **43**, not the 42 SEO 3.1 recorded — one author row has
been added since. The deterministic classifier is the source of truth and the
number moves with the catalogue; it is not a correction of 3.1.

---

## 1. Consumer audit

| Consumer | Data source before 3.2 | Canonical available? | Used it? | Fallback | SEO impact | Action taken |
| --- | --- | --- | --- | --- | --- | --- |
| `/books/[slug]` JSON-LD + byline | `getPublicResourceAuthors()` → **strings** → re-parsed | yes | partly | legacy `books.author` | **C-1** | resolved views, no re-parse |
| `/theses/[slug]` JSON-LD + `citation_*` | same | yes | partly | legacy `author_names` | **C-1** | resolved views, no re-parse |
| `/publications/[slug]` | `authorList(pub)` → comma-joined byline → re-parsed | via `publication_authorships` | no | byline | **C-1** | authorships → views |
| `/catalogs/[slug]` | `catalog_books.author` → `contributorNodes()` | **no** — `catalog` is not a `ResourceType` | n/a | raw string | none | documented, unchanged |
| `/posts/[slug]` | `post.author` → `contributorNodes()` | **no** — posts are not a resource type | n/a | raw string | none | documented, unchanged |
| `/authors/[slug]` entity type | `contributorNodes(name)[0]` | yes | no | name heuristic | **C-2, C-5** | stored kind; one-entity rule |
| `/authors/[slug]` works | `books.author_id` (singular) + `ILIKE` on free text | yes | no | — | **C-4** | unioned with the graph edge |
| `/authors` hub | `contributorNodes(name)[0]` | yes | no | name heuristic | **C-5** | one-entity rule |
| Thesis citations (APA/MLA/BibTeX/RIS) | private `.split(",")` | yes | no | — | **C-3** | `citationNames()` |
| Book citations | private `.split(",")` | yes | no | — | **C-3** | `citationNames()` |
| Publication citations | `authorships`, else private `.split(",")` | yes | partly | — | **C-3** | `citationNames()` |
| Google Scholar `citation_author` | private `splitAuthorNames()` | yes | no | — | **C-3** | `citationNames()` |
| OAI-PMH / metadata exports | private `splitNames()` with its own delimiters | yes | no | — | **C-3** | `citationNames()` |
| `/theses` listing byline | inline `.split(",")` | n/a | no | — | **C-3** | `citationNames()` |
| `/api/search/native` | `authors.name`, `author_names` | yes | no | — | none today | **deferred**, see C-6 |
| `app/sitemap.ts` author URLs | `authors` + `publication_authors` | yes | no | — | none today | **deferred**, see C-6 |
| Ingestion (`books/actions.ts`) | `recordResourceContributors()` | — | **yes** (3.1) | — | — | unchanged |

---

## 2. Findings

### C-1 — The graph was read, then thrown away *(fixed)*

`getPublicResourceAuthors()` returned `string[]`. No id, no kind, no role, no
sequence. `/books/[slug]` and `/theses/[slug]` read canonical credits, then
handed the strings to `contributorNodesFor()`, which ran `normalizeByline()`
over them **again**.

Two consequences, both live:

* **A stored type could be overruled by a keyword heuristic.** A contributor the
  database records as an organisation, whose name happens to contain no
  vocabulary `looksLikeOrganization()` knows, came back out of the renderer as
  a `Person`. Two sources of truth for one fact; whichever answered last won.
* **A canonical row could be re-split.** A row is already one entity — the split
  happened at ingestion. Running a byline splitter over `"Smith, John"` turns
  one stored contributor into two people who do not exist.

Fixed by `lib/resources/contributor-view.ts` (the read model) and
`contributorNodesFromViews()` (a projection that classifies nothing). Pinned by
`lib/resources/contributor-consumers.test.ts` §16.

### C-2 — `/authors/[slug]` had no access to the stored type *(fixed)*

The profile page asked the NAME what an entity is, even where the graph held
the answer. `getAuthorProfile()` now resolves the canonical contributor records
for the identity and exposes `contributorKind`; the page spends it and falls
back to the name only when the graph has no record — or when its records
disagree, which returns `null` rather than picking the first row.

### C-3 — Six private author splitters *(fixed)*

`lib/seo/citation.ts`, `lib/citations.ts`, `lib/books/citation.ts`,
`lib/theses/citation.ts`, `lib/metadata-exports/works.ts` and the two thesis
pages each carried their own `.split(",")`. A comma is also how a single name
is inverted, so every one of them published **"Smith, John" as two people** —
in a `citation_author` meta tag Google Scholar indexes, in an APA reference a
student pastes into a bibliography, and in an OAI-PMH record harvesters mirror.

`lib/metadata-exports/works.ts` was the worst: its delimiter set was
`/[,;]| and | និង /`, splitting Khmer bylines that have no spaces to verify the
segments with.

All now call `citationNames()` — the one splitter, which separates only where
every segment is a full name and otherwise emits the byline whole. Pinned by a
source scan that fails on a new one.

### C-4 — An author's works were matched by name *(fixed, additively)*

`books.author_id` is a **singular** foreign key, so a three-author book credits
exactly one of them and the other two have a profile that omits the book they
wrote. Theses and the physical catalog were matched with `ILIKE '%name%'` over
free text.

`resource_contributors` is the edge those lack. `lib/authors/canonical-works.ts`
reads it and the results are **unioned** with the legacy legs, deduped by
`(type, id)`. Additive on purpose: the graph is still filling, and switching
wholesale would drop works from pages that list them today.

### C-5 — A composite URL published one person *(fixed)*

Verified live on 2026-09-12:

```
GET /authors/bert-p-m-creemers-leonidas-kyriakides-pam-sammons-editors
  mainEntity: {"@type":"Person","name":"Bert P.M. Creemers", "@id":"…#person"}
```

SEO 3.0 stopped this page asserting a `Person` for a byline it could **not**
separate. It did not cover the case where the byline separates *perfectly*:
`contributorNodes()` returns three nodes, and the page took `[0]`. So a URL
denoting three editors published one of them as its identity and silently
dropped the other two. **43 of 157 production rows are that shape.**

`soleContributorNode()` is the rule: one URL, one entity, or no claim. Applied
on the profile page and the hub.

### C-6 — Search and sitemap: deliberately not switched

* **Search** (`/api/search/native`) reads `authors.name` and `author_names`.
  The canonical graph holds *the same strings* — `recordResourceContributors()`
  writes the names the byline states — so switching buys no recall today and
  costs a join on the hot path. With production's graph empty it would cost
  recall outright. Revisit when coverage is measured, not before.
* **`app/sitemap.ts`** derives author URLs from `authors` + `publication_authors`
  via `addressableAuthorSlug()`. The canonical graph has no slug column and no
  URL contract, so switching would advertise URLs the middleware gate hard-404s
  — the exact defect `docs/SEO-2.0-AUTHOR-URL-REPAIR.md` fixed. Unchanged.

Both are recorded here rather than silently skipped.

---

## 3. What this audit did NOT change

Per the phase's own constraints: no canonical/hreflang/sitemap/robots/metadata
rework, no new URL families, no `/authors` rename, no split of the 43 composite
rows, no new tables, no removal of a legacy table or column.

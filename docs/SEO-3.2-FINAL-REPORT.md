# SEO 3.2 — Contributor Graph Activation: final report

**Date:** 2026-09-12 · **Base:** `main` @ `b3bd588`

---

## 1. Executive summary

SEO 3.0 fixed *what a page claims about an entity*. SEO 3.1 fixed *how
contributor data enters the canonical model*. SEO 3.2 fixes **how the rest of
the application consumes it**.

What was activated:

* **One shared contributor read model** (`lib/resources/contributor-view.ts`,
  pure) with one explicit read policy — canonical, legacy, none, or
  `unavailable`. The two sources are never blended.
* **JSON-LD stopped re-parsing what the graph already decided.** Books, theses
  and publications now hand *resolved views* to their schema builders instead
  of strings the builder re-classified.
* **Six private author splitters collapsed into one.** Every citation, Google
  Scholar meta tag and OAI-PMH export now uses `citationNames()`.
* **An author's works are read through the relation**, unioned with the legacy
  name-matching legs so nothing is lost while the graph fills.
* **A contributor URL asserts one identity or none.** The composite-author
  defect found live in production (§5) is closed.
* **A read failure is no longer indistinguishable from "no authors".**

And one finding that outweighs the code: **production's canonical contributor
graph is empty.** The architecture is correct and currently inert.

## 2. Before

```
book row ──► getPublicResourceAuthors() ──► string[] ──► contributorNodesFor()
                (drops id, kind, role, sequence)         (re-parses the strings)
```

* A contributor the database typed `organization` could be re-typed `Person` by
  a keyword heuristic over its name.
* A canonical row could be *re-split*: `"Smith, John"` became two people.
* `role` and `contributor_id` were written at ingestion and read by nothing.
* Five citation surfaces and two page files each split bylines on their own
  comma.
* `/authors/[slug]` asked the NAME what an entity is, and took `[0]` of however
  many the byline resolved to.
* `/authors/[slug]` found works with a singular FK and two `ILIKE` searches.

## 3. After

```
resource ──► getPublicResourceContributors() ──► resolveContributors()
                                                  │  canonical | legacy |
                                                  │  none | unavailable
                                                  ▼
                                        ResourceContributorView[]
                        id · kind · name · nameKm · role · sequence ·
                        source · typeConflict
                                                  │
             ┌────────────────┬──────────────────┼─────────────────┐
             ▼                ▼                  ▼                 ▼
        JSON-LD          visible byline      citations        author link
   contributorNodes-                       citationNames()
     FromViews()
   (classifies nothing)
```

Full architecture: `docs/SEO-3.2-CONTRIBUTOR-GRAPH.md`.

## 4. Consumers updated

| Subsystem | Change |
| --- | --- |
| **SEO / JSON-LD** | `BookSeoInput`/`ThesisSeoInput`/`PublicationSeoInput` take `contributors`; `contributorNodesFromViews()` maps kind to node and classifies nothing |
| **`/books/[slug]`** | one resolution spent by byline *and* JSON-LD |
| **`/theses/[slug]`** | same, in `generateMetadata` and the page |
| **`/publications/[slug]`** | `publication_authorships` projected to views (`lib/publications/contributors.ts`) |
| **`/authors/[slug]`** | stored `contributor_kind` outranks the name; one-entity rule; works read through `resource_contributors` |
| **`/authors` hub** | one-entity rule; type-correct `@id` fragment |
| **Citations** | thesis, book, publication builders on `citationNames()` |
| **Google Scholar `citation_author`** | `lib/seo/citation.ts` on `citationNames()` |
| **Metadata exports / OAI-PMH** | `lib/metadata-exports/works.ts` on `citationNames()` |
| **Listing pages** | `/theses` byline on `citationNames()` |
| **Search** | unchanged — deliberate, see §11 |
| **Sitemap** | unchanged — deliberate, see §11 |
| **Ingestion** | unchanged (SEO 3.1) |

## 5. Production findings

All verified 2026-09-12 against `https://library.ptec.edu.kh` (HTTP) and
`https://supabase.storage-ptec.online` (read-only service-role query).

**P-1 — The canonical graph was empty in production, and has since been
backfilled.** Measured 2026-09-12 **before** the backfill: `contributors` 0
rows, `resource_contributors` 0 — against 298 books and 157 author rows. The
tables answered queries, so `0104`–`0109` were applied; their BACKFILL produced
nothing, because the self-hosted instance was created fresh at the 2026-09-06
cutover and the migration chain ran against an empty database before the
content was imported.

**The backfill was executed the same day and is production-verified:
`contributors` 162 rows, `resource_contributors` 303 edges, 0 duplicate edges,
0 orphan references, and canonical coverage of 299/299 published resources
(100%).** Full re-measurement, and the regression it exposed, are in
`docs/SEO-3.2-FINAL-PRODUCTION-VERIFICATION.md`.

**P-2 — A composite author URL published one person.** Live before this change:

```
/authors/bert-p-m-creemers-leonidas-kyriakides-pam-sammons-editors
  → {"@type":"Person","name":"Bert P.M. Creemers"}
```

Three editors, one `Person`, two silently dropped. 43 of 157 contributor rows
are that shape. Fixed by `soleContributorNode()`.

**P-3 — 3.0/3.1 are live and correct on resource pages.** Verified:

| URL | `author` in JSON-LD |
| --- | --- |
| `/books/moeys-capacity-development-platform` | `[{"@type":"Organization","name":"Ministry of Education, Youth and Sport"}]` |
| `/books/action-research-series-volume-1` | `[{"@id":"https://library.ptec.edu.kh/#organization"}]` |
| `/books/handbook-of-methodological-approaches-to-community-based-research` | two separate `Person` nodes |
| `/authors/phnom-penh-teacher-education-college` | `{"@id":"…/#organization"}` — no second node |

**P-4 — `authors.slug` is fully populated (157/157) and every published book
carries an `author_id` (296/296, 156 distinct, 0 orphans).** The slug gap
recorded in earlier notes is closed on this database.

**P-5 — Migration `0143` is production-verified** (§8).

## 6. Metrics

Production, 2026-09-12, `scripts/audit-contributor-graph.ts` +
`scripts/audit-contributors.ts`:

```
canonical contributor coverage: 299 of 299 resources (100%)  PRODUCTION VERIFIED
  books:                        298 / 298
  theses:                         1 / 1
  publications:                   0 / 0  (no publications exist)
legacy fallback resources:        0                          PRODUCTION VERIFIED
resources with no contributor:    0                          PRODUCTION VERIFIED

contributor records:            162                          PRODUCTION VERIFIED
  person:                        89
  organization:                  27
  institution:                    2
  composite (row still names several entities):  44
  unknown / no usable name:       0
  stored type disagrees with the name:          29

resource edges:                 303                          PRODUCTION VERIFIED
  book / thesis:                298 / 5
  roles: author 302, advisor 1
  duplicate edges:                0
  orphan contributor refs:        0
  orphan resource refs:           0

duplicate canonical identities:   0                          PRODUCTION VERIFIED
conflicts:                        1 partial, 0 disagreements PRODUCTION VERIFIED

contributor expressions (authors table): 157                 PRODUCTION VERIFIED
  person (SAFE_SINGLE):            85   54.1%
  composite (SAFE_MULTIPLE):       43   27.4%
  organizations:                   27   17.2%
  institutions:                     2    1.3%
  ambiguous / empty:                0
  role marker inside the name:     16
```

All figures are post-backfill and measured directly. The 44 composite
contributor rows are a backfill artefact — 0105 copied composite `authors` rows
verbatim — and are expanded by the read model at render time, so they are not a
live SEO defect; they measure how much of the graph still needs splitting **at
the source**.

## 7. Historical composite authors

**Not migrated.** 43 rows (not 42 — one author row was added since 3.1; the
deterministic classifier is the source of truth and the count moves with the
catalogue).

Every one has a live, indexed `/authors/<slug>` URL and 42 of the 43 have at
least one published book. Splitting one row into three mints three URLs and
retires one, and **a URL denoting three people has no single 301 target** —
redirecting to one asserts the work is theirs. Compounding it, `books.author_id`
is singular, so splitting before `resource_contributors` carries the credits
would *lose* authorship.

Full report, categories and per-row table:
`docs/SEO-3.2-HISTORICAL-CONTRIBUTOR-MIGRATION.md`.

What SEO 3.2 does instead: those 43 URLs now assert **no identity** rather than
publishing their first name as a `Person`. The untrue claim is gone without a
single URL moving.

## 8. URL safety

**Migration 0143 — PRODUCTION VERIFIED**, 2026-09-12, over HTTP:

```
/subjects/book-1781239299098        → 301 → /subjects/កញ្ជប់គណិតវិទ្យា
/subjects/កញ្ជប់គណិតវិទ្យា             → 200, ItemList numberOfItems: 18
/subjects/<unknown>                 → 404   (the SEO 3.0 gate is live)
```

The redirect target exists in the production database and serves real content;
the old slug is not redirected into a 404.

**Contributor URL policy — unchanged.** `/authors/<slug>` remains the contract.
No route renamed, no new URL family (`/contributors`, `/people`,
`/organizations` — none introduced), no slug regenerated, no author URL
retired. The canonical graph has no slug column and no URL contract by design;
the sitemap therefore still derives author URLs from `authors` /
`publication_authors` via `addressableAuthorSlug()`, which is the mechanism that
stops a URL the middleware gate 404s from being advertised.

## 9. Tests

```
npx tsc --noEmit                 PASS  (0 errors)
npm run lint                     PASS  (0 errors, 172 pre-existing warnings)
npx vitest run                   PASS  292 files, 4766 tests, 89 skipped
npm run build  (clean .next)     PASS  115 static pages, 0 errors
```

Baseline before this work was 4699 passing; **+67 tests**, none weakened or
deleted. New and extended:

| File | Covers |
| --- | --- |
| `lib/resources/contributor-view.test.ts` *(new, 26)* | kind from the row not the name · sequence order · dedupe · canonical-wins · legacy fallback · conflict observable · failure ≠ empty · roles |
| `lib/resources/contributor-consumers.test.ts` *(new, 10)* | one byline splitter · one public graph reader · the projection classifies nothing · institution never mints a second node · one URL one entity |
| `lib/resources/contributor-write.test.ts` *(+5)* | the §34 ingestion fixtures — 3 editors in order, a ministry as one organisation, EN/KM institution parity |

Negative-control checked: reverting `lib/seo/citation.ts` to a local
`.split(",")` makes the splitter invariant fail with the offending file and
line, then passes again when restored.

**End-to-end proof of the canonical path** (local stack, disposable, fixtures
removed afterwards): a contributor named `"Angkor Collective"` — a name with no
organisational vocabulary at all — stored as `contributor_type = 'organization'`
and linked to a book, renders as:

```json
"author": [{"@type":"Organization","name":"Angkor Collective"},
           {"@type":"Person","name":"Vann Sophal"}]
```

with the visible byline reading "Angkor Collective, Vann Sophal" and the legacy
byline ("Chan Sophea") **not** blended in. Under the pre-3.2 round trip the
first would have been published as a `Person`. That is C-1, demonstrated with
real data through a real render.

## 10. Deployment status

| Stage | Status |
| --- | --- |
| Code merged | **NO** — this work is on the working tree, not merged |
| Local verified | **YES** — tsc, lint, 4766 tests, clean build, rendered JSON-LD on a running server |
| CI verified | **NO** — not yet run |
| Production deployed | **NO** |
| Production HTTP verified | **PRE-CHANGE ONLY** — production was read to find the defects (P-2, P-3) and to verify 0143 (P-5). No post-change page has been served from production |
| Production database verified | **YES, read-only** — P-1 and P-4 were measured directly. No production write of any kind was made |

## 11. Remaining work — evidence-backed only

1. ~~**Backfill the production contributor graph (P-1).**~~ **DONE and
   production-verified 2026-09-12** — 162 contributors, 303 edges, 100%
   coverage. Re-measurement and the regression it exposed:
   `docs/SEO-3.2-FINAL-PRODUCTION-VERIFICATION.md`.
2. ~~**Re-audit conflicts after the backfill.**~~ **DONE** — 1 partial, 0 true
   disagreements over 299 resources.
3. **Split the 44 composite contributor ROWS at the source.** The read model
   expands them correctly, so nothing is wrong on the page; but until the rows
   are split, those credits carry no `contributorId` and cannot be linked to a
   contributor page. Same URL question as the 43 composite `authors` rows, and
   deferred with them.
3. **Search (audit C-6).** The graph holds the same strings search already
   indexes, so switching buys no recall today and would cost it outright while
   the graph is empty. Revisit once coverage is measured.
4. **Sitemap (audit C-6).** Unchanged for the same reason plus a harder one: the
   canonical graph has no slug column, so it cannot supply a URL.
5. **The "More by this author" surface** on the book detail page still reads
   `books.author_id`. That is correct for a *link* (it targets a real author
   page) but means a second author of a multi-author book is not offered there.
   Resolvable only after (1), and only with a contributor URL strategy.
6. **The 43 composite URLs.** Deferred by design; a possible later strategy is
   recorded in the migration report but not adopted.
7. **Catalog and posts contributors.** `catalog_books` and `posts` are not
   `ResourceType`s and have no canonical edge. Documented rather than forced
   into the abstraction.

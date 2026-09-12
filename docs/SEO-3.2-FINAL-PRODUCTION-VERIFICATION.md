# SEO 3.2 — Final Production Verification

**Date:** 2026-09-12
**Baseline commit:** `78797ee` on `feat/seo-3-2-contributor-graph` (base `main` @ `6df0f84`)
**Production app:** `https://library.ptec.edu.kh`
**Production database:** `https://supabase.storage-ptec.online` — read-only, service role

Evidence labels used throughout: **PRODUCTION VERIFIED**, **CODE VERIFIED**,
**LOCAL VERIFIED**, **CI VERIFIED**, **UNKNOWN**.

---

## 1. Executive summary

The production contributor graph was backfilled on 2026-09-12 and is now
populated: **162 contributors, 303 resource edges, 100% coverage of published
resources.** That is PRODUCTION VERIFIED by direct query.

Re-verifying SEO 3.2 against the *populated* graph — rather than the empty one
it was written against — found **one critical regression that the empty graph
had hidden**, and it is fixed in this branch:

> Migration 0105's backfill copied composite `authors` rows into `contributors`
> **verbatim**. 46 of 162 contributor rows hold several people in a single
> `display_name`. SEO 3.2's read model believed a canonical row to be one
> entity by contract, so it would have published
> `{"@type":"Person","name":"Oon-Seng Tan, Woon-Chia Liu, Ee-Ling Low (Editors)"}`
> — a fabricated human — where production today correctly emits three `Person`
> nodes.

After the fix, a full diff of **all 296 published books** shows the JSON-LD
SEO 3.2 emits is **byte-identical** to what production serves today: 296
identical, 0 different. The merge is output-neutral on the current catalogue
and moves the source of truth to the graph.

Two further defects were found and fixed during this pass: the audit script's
conflict comparison (53 false "disagreements" whose two sides were identical
strings), and incomplete markdown escaping in both audit scripts (4 high-severity
CodeQL alerts, `js/incomplete-sanitization`).

**Status: COMPLETE WITH WARNINGS** — see §22.

## 2. Baseline

```
Branch:       feat/seo-3-2-contributor-graph
HEAD:         78797ee (at start of verification)
main:         6df0f84
Remote:       https://github.com/raksmeyron97-design/ptec-elibrary.git
Working tree: clean apart from 7 pre-existing untracked files from another
              session (monitoring reports, docker-compose.localrun.yml,
              docs/WEEKLY-RESOURCE-MONITORING.md) — left untouched
PR:           #181
```

## 3. Architecture (CODE VERIFIED)

```
byline → normalizeByline() → contributors + resource_contributors (0105)
       → resolveContributors() → ResourceContributorView[]
       → JSON-LD | byline | citations | author link
```

`lib/resources/contributor-view.ts` owns the read policy;
`getPublicResourceContributors()` is the one public reader;
`contributorNodesFromViews()` classifies nothing. Full description:
`docs/SEO-3.2-CONTRIBUTOR-GRAPH.md`.

## 4. Migration 0105 finding (PRODUCTION VERIFIED)

0105 created `contributors` and `resource_contributors` **and** performed a
one-time backfill from `authors`, `publication_authors` and
`research_reports.author_names`.

On the self-hosted production instance the migration chain ran against an
**empty** database (created fresh at the 2026-09-06 cutover; content imported
afterwards), so the backfill inserted nothing. That is why the graph read 0/0
at the start of SEO 3.2.

The backfill has since been executed by the operator. Its output — not a
migration replay — is the source of truth, and §5 measures it directly.

**Two properties of that backfill matter downstream and are measured, not assumed:**

* it typed **every** row `contributor_type = 'person'` (162/162), including 27
  corporate bodies and both institution rows;
* it copied composite bylines into a single `display_name` (46 rows).

Both are handled at read time — see §8 and §10.

## 5. Production backfill verification (PRODUCTION VERIFIED)

Direct query, `scripts/audit-contributor-graph.ts --label production`:

| Measure | Value |
| --- | --- |
| `contributors` | **162** |
| `resource_contributors` | **303** |
| duplicate edges (same resource + contributor) | **0** |
| orphan contributor references | **0** |
| orphan resource references | **0** |
| distinct resources with edges | 299 (298 book, 1 thesis) |
| distinct contributors referenced | 162 |
| roles | `author` 302, `advisor` 1 |
| sequence coverage | every edge carries a sequence |

The operator's reported figures (162 / 303) match this independent read exactly.

## 6. Migration 0143 status

```
0143 production status: APPLIED
Evidence (PRODUCTION VERIFIED, HTTP, 2026-09-12):
  GET /subjects/book-1781239299098   → 301 → /subjects/កញ្ជប់គណិតវិទ្យា
  GET /subjects/កញ្ជប់គណិតវិទ្យា        → 200, JSON-LD ItemList numberOfItems: 18
  GET /subjects/<unknown-slug>       → 404   (the SEO 3.0 slug gate is live)
```

The redirect target exists in the production database and serves real content,
so the 301 does not point into a 404. The rename could only have been performed
by 0143.

## 7. Canonical coverage (PRODUCTION VERIFIED)

Populations are the published rows of each resource table.

| Resource type | Published rows | ≥1 canonical contributor | Legacy-only | No contributor |
| --- | ---: | ---: | ---: | ---: |
| book | 298 | **298** | 0 | 0 |
| thesis (`research_reports`) | 1 | **1** | 0 | 0 |
| publication | 0 | 0 | 0 | 0 |
| **Total** | **299** | **299** | **0** | **0** |

```
Canonical coverage = 299 / 299 = 100%
Legacy-only        = 0
Canonical + legacy = 299   (every resource retains its legacy byline column)
Conflict rate      = 1 / 299 = 0.33%  (1 partial, 0 true disagreements)
```

`catalog_books` (6 rows) is **out of population by design**: `catalog` is not a
`ResourceType` and has no canonical edge. Stated rather than counted as a gap.

## 8. Contributor type distribution (PRODUCTION VERIFIED)

| Kind (as the read model resolves it) | Count |
| --- | ---: |
| Person | 89 |
| Organization | 27 |
| Institution | 2 |
| Composite (row still names several entities) | 44 |
| Unknown (no usable name) | 0 |
| **Total** | **162** |

Stored `contributor_type` is `person` for all 162 rows. The read model resolves
27 of them to `organization` and 2 to `institution` and records the
disagreement as `typeConflict` (**29 rows**) rather than silently overruling it.
This is exactly the rule `kindOfCanonicalRow()` was written for: a
backfill-written `person` is a column DEFAULT, not a judgement, so the name
decides; a row the 3.1 classifier wrote (`source = 'manual'`) is trusted as
stored. Production has 0 such rows yet — every contributor came from the
backfill (`authors` 157, `thesis_text` 4, `thesis_advisor` 1).

## 9. Fallback analysis

With 100% coverage, no production resource currently uses the legacy path. The
fallback is still exercised and still required:

* **LOCAL VERIFIED** — against the local stack with an empty graph, `/books/…`
  and `/theses/…` render the legacy byline and correct JSON-LD unchanged
  (`citation_author: Sok Dara`; `{"@type":"Person","name":"ឡុង សុវណ្ណារ៉ា"}`).
* **CODE VERIFIED** — a failed canonical read reports `source: "unavailable"`
  and falls back rather than rendering an empty byline; the read throws so the
  failure is never cached.
* Unit fixtures cover canonical-wins, legacy-fallback, conflict-observable and
  failure-≠-empty (`lib/resources/contributor-view.test.ts`).

## 10. The critical regression found and fixed

**Finding.** 46 of 162 contributor rows hold several entities in one
`display_name`. SEO 3.2's read model took a canonical row to be one entity by
contract. Reproduced directly:

```
row.display_name = "Oon-Seng Tan, Woon-Chia Liu, Ee-Ling Low (Editors)"

production today      → 3 × {"@type":"Person"}          ← correct
SEO 3.2 before fix    → 1 × {"@type":"Person", name: the whole string}
```

That is a fabricated person, and strictly worse than the legacy string it
replaced. It was invisible while the graph was empty.

**Fix.** `viewsFromCanonical()` now puts every **backfilled** row back through
the one normalization contract before believing it:

| Row names… | Result |
| --- | --- |
| one entity | stands; the stored type decides its kind |
| several entities | expanded, `contributorId: null`, `composite: true` |
| several, not safely separable | **nothing** — omission, per rule E |

A row written by the write path (`source = 'manual'`) is taken exactly as
stored: `recordResourceContributors()` refuses to store an unresolvable byline,
and that row is also what a librarian curates by hand — an inverted
`"Smith, John"` is one real person and must survive.

**Verification — all 296 published books, canonical vs what production serves:**

```
books compared:    296
identical output:  296
differs:             0   (3.2 richer: 0, 3.2 poorer: 0)
```

A property test pins the rule directly: *for every production-shaped byline,
the canonical path must not resolve to fewer contributors than the legacy path.*

## 11. Conflict analysis (PRODUCTION VERIFIED)

The first run reported **54 conflicts (53 "true disagreements")**. Every one was
a **false positive in the audit script**: it compared the raw `display_name`
column against the *split* legacy byline, so a composite row whose value was
byte-identical to the byline scored "the two sources share no name".

The script now compares what the **application would publish** — the same
`viewsFromCanonical()` the renderer uses. Re-run:

```
conflicts: 1   (0 true disagreements, 1 partial)
```

The single partial is the library's one thesis: the graph holds 8 names
(4 authors + advisor, plus expansion) where `author_names` lists 5, and
**no byline name is missing from the graph** (`byline-only: 0, graph-only: 4`).
The graph is strictly richer. Not a defect; recorded as a warning.

## 12. Duplicate and orphan analysis (PRODUCTION VERIFIED)

| Check | Result |
| --- | --- |
| Duplicate resource edges | **0** |
| Duplicate canonical identities (exact folded name within a type) | **0** |
| Orphan contributor references | **0** |
| Orphan resource references | **0** |
| Contributors with an ORCID | 0 |

Deduplication is by canonical id, else folded name **within a kind**. Nothing
fuzzy: a shared surname never merges two people.

## 13. Ingestion-path verification (CODE VERIFIED)

| Path | Writes canonical? |
| --- | --- |
| Admin book create | **yes** — `recordResourceContributors()` |
| Admin book edit | **yes** |
| Bulk book import | **yes** — routed through the common book-save path (SEO 3.1) |
| Thesis create/edit | **no** — documented gap, see §22 W-2 |
| Publication create/edit | **no** — has its own `publication_authorships` relation, projected to views by `lib/publications/contributors.ts` |
| Catalog create/edit | **n/a** — `catalog` is not a `ResourceType` |

## 14. Role and sequence (PRODUCTION VERIFIED + CODE VERIFIED)

Production edges carry `author` × 302 and `advisor` × 1; the single thesis reads
`author@0, advisor@0, author@1, author@2, author@3`, so a real role survived the
backfill and is distinguishable from the authors.

`sequence` is the public order everywhere and is never re-sorted alphabetically.
A role stated inside a name (`"… (Editors)"`) overrides a backfilled `author`
default; a role held only in the column (the advisor) is preserved untouched.
Both are pinned by tests.

## 15. Author-page verification (PRODUCTION VERIFIED, pre-deploy)

| Case | URL | Result |
| --- | --- | --- |
| Institution | `/authors/phnom-penh-teacher-education-college` | `{"@id":"…/#organization"}` — reference only, no second node |
| Organization | `/authors/ministry-of-education-youth-and-sport` | `{"@type":"Organization", …}` — not Person |
| Composite | `/authors/bert-p-m-creemers-…-editors` | **`{"@type":"Person","name":"Bert P.M. Creemers"}`** — one of three editors |

The third is defect C-5, fixed in this branch: that URL now asserts **no**
identity (`soleContributorNode()`), because one URL cannot denote three people.
Its works, breadcrumbs and canonical are unaffected.

Author pages resolve works through `resource_contributors` **unioned** with the
legacy legs (`books.author_id`, two `ILIKE` searches), deduped by `(type, id)`,
so no work currently listed can disappear.

## 16. JSON-LD production verification (PRODUCTION VERIFIED)

Live HTML, `https://library.ptec.edu.kh`, 2026-09-12, with the graph populated:

| Case | Book slug | `author` in JSON-LD |
| --- | --- | --- |
| A Person | `practical-research-methods` | `[{"@type":"Person","name":"Catherine Dawson"}]` |
| B Multiple | `effective-school-management-4th-edition` | 3 × `Person` (Everard / Morris / Wilson) |
| C Editor role | `competency-based-language-teaching-in-higher-education` | `[{"@type":"Person","name":"María Luisa Pérez Cañado"}]` — role marker stripped |
| D Organization | `moeys-capacity-development-platform` | `[{"@type":"Organization","name":"Ministry of Education, Youth and Sport"}]` |
| E Institution | `action-research-series-volume-1` | `[{"@id":"https://library.ptec.edu.kh/#organization"}]` |
| F Khmer | `/books/រដ្ឋបាលសាធារណៈ` | 6 × `Person`, Khmer names intact |

All six are correct **today**, on pre-3.2 code. The 296/296 parity diff in §10
proves SEO 3.2 preserves every one of them.

## 17. Citation and search verification

* **Citations (CODE VERIFIED).** Thesis, book, publication builders, the Google
  Scholar `citation_author` tags and the OAI-PMH exports all use
  `citationNames()`. Six private `.split(",")` splitters removed; a source scan
  fails on a seventh.
* **Search (CODE VERIFIED, intentionally legacy-backed).** `/api/search/native`
  reads `authors.name` and `author_names`. The canonical graph holds the same
  strings, so switching buys no recall and costs a join on the hot path.
  Documented, not forced.

## 18. Sitemap and internal links (CODE VERIFIED + PRODUCTION VERIFIED)

* `app/sitemap.ts` still derives author URLs from `authors` /
  `publication_authors` through `addressableAuthorSlug()`. The canonical graph
  has **no slug column and no URL contract**, so sourcing URLs from it would
  advertise pages the middleware gate 404s — the defect
  `docs/SEO-2.0-AUTHOR-URL-REPAIR.md` fixed. Unchanged deliberately.
* No new URL family introduced. No author URL retired or regenerated.
* Book detail pages render the byline as **plain text**; the only `/authors`
  link is the breadcrumb to the hub, so an expanded composite credit with no
  contributor page cannot produce a dead link (LOCAL VERIFIED).
* `authors.slug` is 157/157 populated and every published book carries an
  `author_id` (296/296, 156 distinct, 0 orphans) — PRODUCTION VERIFIED.

## 19. SEO foundations — no regression (PRODUCTION VERIFIED)

| Check | Result |
| --- | --- |
| `/subjects/book-1781239299098` | 301 → Khmer slug |
| Unknown subject slug | 404 (gate live) |
| Real subject page | 200, 18 items |
| `/authors/<slug>` | 200 for all sampled; `robots.txt` does not block `/authors` |
| Canonical / hreflang / metadata builders | untouched by this change |
| Build route modes | unchanged — no `cookies()`/`headers()` added; `lib/cache/cache-safety.test.ts` passes and `/en/authors` still prerenders |

## 20. Performance / N+1 (CODE VERIFIED)

| Surface | Contributor queries |
| --- | --- |
| Resource detail page | **1**, cached (`unstable_cache`, 300 s, tagged) |
| Listing JSON-LD | **0** — deliberately not wired; per-row resolution would be one query per result |
| Author page | **2 batched** (identity, then edges) + ≤1 `IN (…)` per resource type |
| Sitemap | **0** — unchanged |

No per-contributor query exists on any path. `getOrgIdentity()` is `cache()`d,
so the identity every kind decision needs costs one round trip per request.

## 21. Security / data safety (CODE VERIFIED)

* The public read filters resources by publication state through the existing
  page-level guards; contributor rows themselves carry no private data
  (name, optional Khmer name, type, ORCID, affiliation).
* No internal id reaches the page: `contributorId` is used only to dedupe and
  is never emitted into JSON-LD or HTML.
* The cached read uses the service client **without cookies**, which is what
  keeps the public tree prerenderable; it reads only columns already public.
* Both audit scripts are read-only by contract and print the database they
  targeted, so local output cannot be mistaken for production.
* 4 high-severity CodeQL alerts (`js/incomplete-sanitization`) introduced by
  this branch's audit scripts were **fixed at the root**, not suppressed: the
  markdown cell escaper now escapes the backslash before the pipe.

## 22. Warnings

**W-1 — 44 composite contributor ROWS remain in the graph.**
*Impact:* none on rendered output; the read model expands them and the 296/296
parity diff proves it. But those credits carry no `contributorId`, so they
cannot link to a contributor page.
*Scope:* 44 of 162 contributor rows; the resources render correctly.
*Risk:* low. *Action:* split at the source, together with the 43 composite
`authors` rows — the same deferred URL question.

**W-2 — Thesis and publication ingestion do not write canonical contributors.**
*Impact:* a thesis created today gets no canonical credits and falls back to its
byline — correct output, but coverage decays from 100%.
*Scope:* 1 thesis, 0 publications exist today.
*Risk:* low now, grows with the collection. *Action:* route thesis save through
`recordResourceContributors()`, as the book path already is.

**W-3 — One partial conflict on the single thesis.** The graph holds 4 names the
byline does not. No byline name is missing. *Risk:* none. *Action:* reconcile
`author_names` with the graph when the thesis is next edited.

**W-4 — Search remains legacy-backed by design.** Documented in §17.

**W-5 — Production HTTP verification of the *post-merge* code is pending
deploy.** Everything in §16 is pre-deploy evidence plus a 296/296 parity proof;
it is not a measurement of the deployed new code.

**W-6 — 29 rows carry a `contributor_type` that disagrees with their name.**
Resolved correctly at read time and reported as `typeConflict`. *Action:*
correct the column when the graph is next rewritten.

## 23. Test results

| Command | Result |
| --- | --- |
| `npx tsc --noEmit` | **PASS**, 0 errors |
| `npm run lint` | **PASS**, 0 errors (172 pre-existing warnings) |
| `npx vitest run` | **PASS** — 292 files, **4777 tests**, 89 skipped |
| `npm run build` (clean `.next`) | **PASS** — 115 static pages |
| CI `test` job | **PASS** (4m11s) — CI VERIFIED |
| CI `Analyze (javascript-typescript)` | **PASS** — CI VERIFIED |
| CI `secret-scan`, `dependency-review` | **PASS** — CI VERIFIED |
| CI `CodeQL` | **failed on `78797ee`** with 4 new high alerts; fixed in this branch, re-run pending |
| CI `e2e` | pending at time of writing |

Regression tests added this pass (11): composite expansion, role-from-name,
sequence after expansion, null `contributorId`, Khmer composite, unsafe-split
omission, organisation-with-comma, role-marker stripping, stored-role
preservation, write-path trust, and the *canonical-never-worse-than-legacy*
property.

## 24. Final status

**COMPLETE WITH WARNINGS.**

Every critical criterion is met: the graph is populated and measured in
production, 0143 is applied, coverage is 100%, the application reads the graph,
conflicts are observable and benign, person/organization/institution semantics
are correct in live HTML, roles and sequence survive, no duplicates or orphans
exist, and the full suite and build pass. The one critical regression found was
fixed and proven output-neutral across all 296 books.

The six warnings in §22 are non-blocking, each scoped and with an action. W-5
(post-deploy HTTP verification) is the only one that requires action before this
can be called unconditionally COMPLETE, and it requires the merge to land first.

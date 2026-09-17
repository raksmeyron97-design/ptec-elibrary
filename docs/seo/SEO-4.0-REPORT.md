# SEO 4.0 — Final Report

**Date:** 2026-09-16 · **Branch:** `main` (working tree)
**Audit:** [`docs/seo/SEO-4.0-AUDIT.md`](./SEO-4.0-AUDIT.md)

---

## 1. Executive summary

PTEC e-Library's technical SEO was **already strong** when this pass started,
and most of it is unchanged. Six prior phases (V2, V3, 3.0–3.3) built canonical
URLs, reciprocal hreflang, a derived robots policy, an entity graph keyed by
`@id`, IA-shaped breadcrumbs, a depth-gated subject hub and a contributor graph
— and pinned nearly all of it with invariant tests. This pass verified that work
against production rather than rebuilding it.

What it found is that **the library grew ~5.6× (≈296 → 1,695 books) and crossed
two thresholds that turned latent bugs into live ones**:

1. **`sitemap.xml` became non-deterministic.** Once `books` passed 1,000 rows,
   the sitemap's paged sweeps — ordered by a non-unique `created_at` — began
   losing rows. Two fetches one revalidation apart, against an unchanged
   collection, returned **1,690** and **1,695** books. On the generation observed, five
   published books were withheld from crawlers. Frequency: `UNKNOWN`.
2. **Four listings published an unbounded family of indexable `?page=N` URLs.**
   `/catalogs?page=50` rendered 0 of 6 books as an indexable, self-canonical
   page; `/theses?page=50` and `/journals?page=50` re-served page 1's rows under
   their own indexable URLs.

Both are now fixed, and — more importantly — both are now **pinned by invariant
tests that fail on the source**, because in both cases a test already existed
and was weaker than the rule it documented:

- `lib/db/paginated-sweep.test.ts` documented "orders on a **UNIQUE** key" but
  asserted only that `.order(` appeared anywhere in the chain.
- `buildListingMetadata` has always accepted `outOfRange`; nothing required a
  call site to pass it, and 4 of 6 did not.

A third fix was needed to finish the audit at all: `scripts/audit-crawl-depth.ts`
— the only instrument that measures click depth and orphans — **crashed** on a
dropped connection partway through the now-6,000-URL graph, and a capped run
reported its orphan count as if it were a finding. Hardened, the completed crawl
says **0 orphans, 0 broken links, 100% of sitemap URLs reachable by clicking**;
the capped run had said **198 orphans**. It also surfaced the one thing scale has
broken that is *not* fixed here: the deepest books are **48 clicks** from the
homepage (§8, audit F-6) — a listing-UI decision, reported with the measurement
rather than decided unilaterally.

**Nothing was rebuilt.** No URL changed, no canonical changed, no hreflang
changed, no schema type changed, no new page was created.

---

## 2. Audit summary

| Priority | Finding | Status |
|---|---|---|
| **Critical** | — none — | |
| **High** | F-1 `sitemap.xml` silently omits published books (non-deterministic generation) | **DONE** |
| **Medium-High** | F-2 unbounded indexable `?page=N` on `/catalogs`, `/theses`, `/theses/summary`, `/journals` | **DONE** |
| **Medium** | F-4 crawl-depth instrument aborts on a dropped socket; capped runs report orphan counts as findings | **DONE** |
| **Medium** | F-6 the deepest books are **48 clicks** from the homepage (median 3; 218 books ≥4) | **Reported, not fixed** — a listing-UI decision, §8 |
| **Low** | F-3 journal issue + issues-list pages emit no `og:image` | **DONE** |
| **Low** | F-5 2 author pages are indexable, carry works, and are advertised nowhere | **Reported, not fixed** — inside pinned contributor logic |
| Observation | O-1, O-3…O-6 (see audit §3) | **Reported, not changed** |

### Already strong — verified, not touched

hreflang reciprocity · canonical correctness · robots.txt derivation ·
single-hop legacy redirects · real 404s on every entity type · `noindex` on
search · tracking/filter parameter canonicalisation · JSON-LD type accuracy ·
IA-shaped breadcrumbs matching the visible nav · book-page title/description
uniqueness (60/60 sampled) · Google Scholar `citation_*` tags and DOI on
articles · cover `alt` text · **EN/KM count parity**.

Full evidence table: audit §0.

---

## 3. Changes made

| File | Change | Why |
|---|---|---|
| `app/sitemap.ts` | Added `const TIEBREAK = 'id'` and appended `.order(TIEBREAK)` to **all 8** paged sweeps (7 × `created_at`, 1 × author name) | F-1. A `.range()` sweep over a non-unique sort key loses rows. `id` is the primary key on every swept source (verified against the initial schema and the `team_members_public` view). |
| `lib/db/paginated-sweep.test.ts` | New `describe` block: the **last** `.order()` term of every sweep must be a declared-unique key; `requiresFilters` covers a key unique only within a pinned scope; dynamic orderings must be named with a reason | F-1's root cause. The file documented "orders on a UNIQUE key" but asserted only that `.order(` appeared. |
| `lib/seo/listing-metadata.ts` | New pure `isPageOutOfRange(page, total, pageSize)` | F-2. One rule, one place; `null` total = UNKNOWN, never out-of-range. |
| `app/[locale]/(public)/{theses,theses/summary,catalogs,journals}/page.tsx` | Pass `outOfRange`, derived from the cached `getCollectionStats()` | F-2. |
| `lib/seo/listing-metadata.test.ts` | 6 unit tests for the helper + a **source scan** requiring every `buildListingMetadata` call site to pass `outOfRange` or `isEmpty` | F-2. The helper always accepted the guard; 4 of 6 call sites never passed it. |
| `lib/seo/journal-seo.ts` | `buildIssuesListMetadata` and `buildIssueMetadata` now emit `og:image` + `twitter: summary_large_image`, preferring the journal's own cover | F-3. |
| `lib/seo/journal-seo.test.ts` | 3 tests covering both surfaces and cover preference | F-3. |
| `scripts/audit-crawl-depth.ts` | Classify a mid-body connection drop as transport (`unknown`) instead of rethrowing; add `.catch()` to the crawl pump; report unexpected rejections; print an **INCOMPLETE RUN** banner when the `--max` cap is hit | F-4. |

**No production writes were performed.** All production access was read-only
(`GET`).

---

## 4. Tests added

| Test | What it pins | Negative-controlled |
|---|---|---|
| `paginated sweeps end on a unique key` | Every `.range()` sweep ends its ORDER BY on a declared-unique key. 7 of the 8 guarded files are scanned; the 8th (`audit-resource-health.ts`) builds its ordering at runtime and is listed in `DYNAMIC_ORDERING` with the name of the assertion that already covers it, so it is an accounted exemption rather than a silent one. | ✅ removing the sitemap's tiebreaker fails naming the file, line and offending column; changing `lib/oai/records.ts` from `id` to `title` fails the same way |
| `keeps the sitemap's tiebreaker on the primary key` | `TIEBREAK === 'id'` and every sitemap sweep uses it | ✅ |
| `isPageOutOfRange` (6 cases) | Page 1 never out of range; boundary at `ceil(total/size)`; **a `null` count is in-range** (a failed read must never `noindex`); no divide-by-nonsense | ✅ |
| `every paginated listing declares where its collection ends` | Source scan: every `buildListingMetadata` call site passes `outOfRange` or `isEmpty` | ✅ removing it from `/catalogs` fails by name |
| `every journal surface has a social card` (3 cases) | Issues list and issue page emit an image + large card; the journal's own cover wins over the fallback | — |

---

## 5. Verification

### 5.1 What was proven, and how

| Check | Result |
|---|---|
| `npx tsc --noEmit` | **Clean** (run 3×, after each edit) |
| `npx eslint` on all 11 changed files | **Clean** (one `require()` violation found and fixed) |
| `npx vitest run` (full suite) | **PASSED — exit 0.** 331 files, **6,870 tests passed**, 0 failed, 89 skipped, on a quiet machine (load ~19). Two earlier runs at load 100+ and 42+ each showed one timeout in `lib/settings-consistency.test.ts`; see 5.3. |
| `npm run build` (clean `.next`, webpack) | **PASSED — exit 0.** Compiled in 3.1 min, TypeScript in 43 s, 117/117 static pages generated. Zero errors; the only warnings are pre-existing Edge-Runtime notices from `node_modules`. `/sitemap.xml` and `/robots.txt` build as static with a 1 h revalidate, and all four changed listings remain dynamic (`ƒ`) exactly as before — no rendering-mode regression. |
| New/changed test files | `paginated-sweep` 18 ✓ · `listing-metadata` 24 ✓ · `journal-seo` 17 ✓ |
| Negative controls | 3 of 3 — each new invariant was **proven to fail** when its rule is broken (see §4) |
| **Every sweep accepted by a real PostgREST** | 9 of 9. The failure mode that matters for F-1 is *naming a column PostgREST does not have*: the query 400s, `fetchAllRows` reports that as "no rows", and an entire resource family silently leaves the sitemap — the exact trap `fetchAuthorRows()` already carries a two-attempt retry for. Each of the 9 rewritten sweeps was executed against a live PostgREST with `.order(<primary>) .order('id') .range(0,4)` and all 9 returned rows, including the `team_members_public` **view**. |

### 5.2 End-to-end verification of F-2, against a running app

Not a unit test — the dev server on local Supabase (3 catalogs, 4 theses,
7 publications, 6 books, i.e. one page each) rendering real metadata:

| URL | robots before | robots after |
|---|---|---|
| `/catalogs` | index | **index** (unchanged) |
| `/catalogs?page=2` | index | **noindex, follow** |
| `/catalogs?page=50` | index | **noindex, follow** |
| `/theses` | index | **index** (unchanged) |
| `/theses?page=50` | index | **noindex, follow** |
| `/journals?page=2` | index | **noindex, follow** |
| `/theses/summary?page=9` | index | **noindex, follow** |
| `/books`, `/posts` | — | **unchanged** |

Page 1 of every listing stays indexable — the guard bounds the space without
withdrawing the collection.

**Boundary control.** The helper's arithmetic was checked against production's
own pagination: 1,695 books ÷ 18 per page = **95 pages**, which is exactly what
`/books` reports ("Page 1 of 95"). `isPageOutOfRange(95, 1695, 18) === false`
and `(96, …) === true`.

### 5.2b Performance cost of the change

The F-2 fix makes `generateMetadata` read a count. That is exactly the kind of
change that quietly adds a database round-trip per request, so it was checked
rather than assumed:

| Page | `getCollectionStats()` call sites **before** | New DB work |
|---|---|---|
| `/journals` | 1 (already awaited for `isEmpty`) | **none** — the existing `stats` is reused |
| `/theses` | 2 (page body) | **none** — same `unstable_cache` entry |
| `/catalogs` | 1 (page body) | **none** — same entry |
| `/theses/summary` | 0 | one **cached** read |

`getCollectionStats()` is `unstable_cache`d for 300 s under the
`collection-stats` tag and is the repo's mandated count source — using it is
also what keeps these pages compliant with
`lib/resource-stats-consistency.test.ts`, which forbids a page running its own
count query. Three of the four pages therefore add no work at all; the fourth
adds one shared cached read.

Nothing else in this pass touches a render path: the sitemap change adds one
ORDER BY term, and the journal change adds two static metadata fields.

### 5.2c Journal issue routes, verified end to end

F-3 touches `lib/seo/journal-seo.ts`, a different code path from the listings,
so it was verified through real HTTP rather than on its unit tests alone:

| Route | `og:image` | `twitter:card` | JSON-LD |
|---|---|---|---|
| `/journals/<j>` | ✅ | `summary_large_image` | `Periodical` |
| `/journals/<j>/issues` | ✅ **(was NONE)** | `summary_large_image` **(was NONE)** | `CollectionPage` |
| `/journals/<j>/issues/<issue>` | ✅ **(was NONE)** | `summary_large_image` **(was NONE)** | `PublicationIssue` |

Checked on two different journals. "was NONE" is the live production reading
taken during the audit.

### 5.2d A stale cache made the guard look broken — and proved the fail-open rule

Worth recording, because it will happen again. After restarting local Supabase,
every out-of-range listing came back **indexable**, exactly as if the fix had
been reverted. It had not been: `getCollectionStats()` was returning `null`
from a `unstable_cache` entry written while the database was down.
`unstable_cache` persists to `.next/dev/cache`, so the poisoned entry **survived
a dev-server restart**; only deleting that directory cleared it. Instrumented,
the metadata call read `stats: null → outOfRange: false`; with a clean cache,
`stats: {physicalCatalogs: 3} → outOfRange: true → noindex, follow`.

That is the `isPageOutOfRange(page, null, size) === false` rule doing its job:
**a failed count must never `noindex` a real page**, so the guard fails OPEN.
The observable cost is the one this pass accepts by design — while the count is
unavailable, out-of-range pages are indexable again, which is the pre-existing
behaviour and not a regression.

### 5.3 The one test that timed out under load

`lib/settings-consistency.test.ts` hit the 5,000 ms per-test limit in two
full-suite runs taken while a production crawl and a build were in flight
(load average 100+ and 42+). It is **pre-existing and unrelated to this pass**,
and the final run settles it:

| Run | Machine | Result |
|---|---|---|
| Full suite, crawl + build running | load 100.69 | 1 timeout |
| Full suite, build running | load 42.84 | 1 timeout |
| Isolated, this pass's changes | — | 13/13 pass, 6.65 s |
| **Isolated, clean tree (`git stash`)** | — | **13/13 pass, 5.83 s** |
| **Full suite, quiet machine** | **load 19.29** | **331 files / 6,870 tests, 0 failed** |

The file spends ~5.8 s in test bodies against a 5,000 ms *per-test* limit even
with every change stashed, so its slowest test sits on the limit and crosses it
whenever the machine is busy. It is a source scan over `app/` and touches
nothing this pass changed.

**Recommended, not done:** give that file an explicit `testTimeout`, or make the
scan cheaper. Out of scope here, and which of the two is right is the team's
call.

### 5.4 Production verification performed (read-only)

- 29 representative URLs across **every** public template, both locales
- 60 randomly sampled book pages
- 18 parameter/pagination variants
- 15 redirect and 404 probes
- 3 `sitemap.xml` fetches (2 distinct ISR generations)
- Full `robots.txt`
- A breadth-first crawl of the link graph

All `GET`. **No production writes.**

### 5.5 What is NOT verified

| | |
|---|---|
| F-1 fix in production | Cannot be proven locally: the defect needs a table above `PAGE_SIZE = 1000`, and local Supabase holds 6 books. Verify after deploy — see §7. |
| Search Console impact | No GSC access. |

---

## 6. Remaining risks

| Risk | Assessment |
|---|---|
| The F-1 fix targets the sweep, not the author-roster fallback | If `getListedAuthors()` comes back empty, `app/sitemap.ts` emits the **unfiltered** author set rather than filtering against an empty roster — which would drop every author URL. That fallback is deliberate and correct, but it means the author section can still vary between generations (290 vs 288 observed). "The sitemap is now deterministic" is true of the **book/resource sweeps**; the author section's variance has a different, documented cause. |
| F-2 depends on `getCollectionStats()` being accurate | If a count is wrong, the boundary is wrong. Mitigated two ways: the count is the repo's single source of truth (`public_resource_statistics`, exact, tag-invalidated), and a `null` read is treated as in-range so a failed read can never `noindex` a real page. |
| A filtered listing is still `noindex` regardless of page | Unchanged behaviour, and intended — filter permutations should not be indexed. |
| `?page=N` on a listing whose collection shrinks | Now self-correcting: the count is live, so a page that falls out of range starts answering `noindex` on the next request. |
| The Next 16 `middleware` → `proxy` deprecation | Surfaced by the build. **Out of scope** — `middleware.ts` carries the split CSP, locale rewriting and canonical-host redirect; migrating it is a security-sensitive change that deserves its own pass. |

---

## 7. Next steps

### DONE — in the working tree
- F-1 sitemap determinism + a strengthened invariant that fails on the source
- F-2 `outOfRange` on all four unguarded listings + a call-site invariant
- F-3 social cards on journal issue surfaces
- F-4 crawl instrument hardened; incomplete runs now declare themselves
- `docs/seo/SEO-4.0-AUDIT.md`, this report

### READY FOR DEPLOY
All of the above. No migration, no URL change, no config change.

### NEEDS PRODUCTION VERIFICATION (after deploy)
1. **F-1.** Fetch `/sitemap.xml` on two separate ISR generations (check
   `x-nextjs-cache`, or wait out `revalidate = 3600`) and confirm **1,695 of
   1,695** books both times. Cross-check against the `/books` total, which is
   the independent count:
   ```bash
   curl -s https://library.ptec.edu.kh/sitemap.xml | grep -c '<loc>.*/books/'
   ```
2. **F-2.** `curl -s "https://library.ptec.edu.kh/catalogs?page=50" | grep 'name="robots"'`
   → expect `noindex, follow`. Repeat for `/theses?page=50`, `/journals?page=50`,
   `/theses/summary?page=9`. Confirm `/catalogs` and `/theses` (page 1) are
   still indexable.
3. **F-3.** Confirm `og:image` on `/journals/<slug>/issues` and an issue page.
4. In Search Console, watch **Pages → Discovered/Crawled – currently not
   indexed** for the `?page=` families to fall away, and total indexed book
   URLs to settle at the real collection size.

### FUTURE IMPROVEMENT (not done, deliberately)
| | Why it is worth doing, and why not now |
|---|---|
| **Khmer composite bylines** — `normalizeByline()` does not split on the conjunction **និង**, so a two-person Khmer byline publishes one `Person` node for two humans (audit F-5) | This is the defect SEO 3.2 removed for Latin bylines. Fixing it changes author identity, slugs and the 0147 split — it needs its own migration and audit, not a metadata edit. |
| **F-5** — reconcile `getAuthorDirectory()` with `getAuthorProfile()` so the 2 authors with works are advertised | 2 URLs; the fix is inside heavily-pinned contributor logic. |
| **O-1** — give author pages a social card | An editorial decision the code documents; the team should make it, not an audit. |
| **F-6 — shorten the tail of `/books`** (audit F-6, report §8): a wider pagination window, a paginated A–Z / by-subject index, deeper hub listings, or a larger default page size | The measurement is done and repeatable; choosing the remedy is a listing-UI and content-architecture decision with real UX trade-offs, which an audit should not make unilaterally. Re-measure with `npx tsx scripts/audit-crawl-depth.ts --concurrency 4 --max 9000`. |
| Give `lib/settings-consistency.test.ts` an explicit `testTimeout`, or make its scan cheaper | Pre-existing: it spends ~5.8 s against a 5,000 ms per-test limit on a clean tree (§5.3). |

---

## 8. The internal link graph, measured

A complete crawl of production — 7,780 fetches, queue drained, no cap reached,
no transport failures — run **after** the F-4 fix made a complete crawl possible:

```
reachable by CLICKING from /        2048 / 2048  (100.0%)
ORPHANS (no path of any kind)       0
broken internal links               0
indexable dead ends                 0
```

Every URL the sitemap promises, the link graph delivers. Nothing is orphaned,
nothing is broken, and no indexable page is a dead end.

Click depth from `/`:

| family | n | min | median | max | ≥4 clicks |
|---|---|---|---|---|---|
| `/books` | 1,696 | 1 | **3** | **48** | 218 (12.9%) |
| `/authors` | 289 | 1 | 2 | 2 | 0 |
| `/subjects` | 25 | 1 | 2 | 2 | 0 |
| `/paths` | 10 | 1 | 2 | 2 | 0 |
| `/journals` | 5 | 1 | 2 | 3 | 0 |
| `/theses` | 3 | 1 | 2 | 2 | 0 |

Entity hubs are excellent — every author, subject and path is 2 clicks from the
homepage. Books are fine at the median and **poor in the tail**: see audit F-6
for why (a barbell pagination window over 94 pages) and what the options are.
It is reported, not fixed: every remedy is a listing-UI decision.

**How much this pass changed the answer.** The same script, on the same site, an
hour apart:

| | capped at 4,000 fetches | run to completion |
|---|---|---|
| Orphans | **198** | **0** |
| Max book depth | **5** | **48** |
| Books ≥4 clicks | 19 (1.3%) | 218 (12.9%) |

Every headline number was wrong, and none of them looked wrong. That is the
whole argument for F-4's INCOMPLETE-RUN banner.

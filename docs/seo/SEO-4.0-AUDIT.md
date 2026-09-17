# SEO 4.0 — Audit

**Date:** 2026-09-16
**Target:** `https://library.ptec.edu.kh` (production, read-only)
**Scope:** full technical-SEO audit of the public tree — indexability, canonical,
hreflang, robots, sitemap, parameters, structured data, breadcrumbs, internal
link graph, duplicate/thin content, images, and locale data consistency.

Every finding below carries an evidence class:

| Class | Meaning |
|---|---|
| `VERIFIED_PRODUCTION` | Observed on the live site, reproduced |
| `VERIFIED_LOCAL` | Proven in the repository (source, test, typecheck) |
| `INFERRED` | Deduced from code + observation; not directly observed |
| `UNKNOWN` | Could not be established with the access available |

---

## 0. What this audit did NOT find

Stating this first, because the largest risk in a fourth-generation SEO pass is
"fixing" something that is already right.

The technical SEO here is **in good shape**. SEO V2, V3, 3.0, 3.1, 3.2 and 3.3
have already built and pinned most of what such an audit normally recommends.
The following were each checked against production and found **correct — no
change made**:

| Area | Evidence |
|---|---|
| hreflang | 3 reciprocal links (`en`, `km`, `x-default`) on **every** template checked, both locales, self-consistent. `VERIFIED_PRODUCTION` |
| Canonical | Self-referential and correct on all 29 probed routes, including Khmer. `VERIFIED_PRODUCTION` |
| robots.txt | Derived from one source (`PRIVATE_PATH_PREFIXES`), 32 rules, both locales, sitemap declared, AI crawlers handled explicitly. `VERIFIED_PRODUCTION` |
| Redirects | `/home`→`/`, `/km/home`→`/km`, `/en*`→unprefixed, `/publications*`→`/journals*` — every one a **single hop**, locale preserved. `VERIFIED_PRODUCTION` |
| 404s | Unknown slugs return real 404s on books, subjects, authors, paths, journals, articles, and unknown paths in both locales. `VERIFIED_PRODUCTION` |
| Search pages | `/search` and `/search?q=` are `noindex, follow`. `VERIFIED_PRODUCTION` |
| Tracking/filter params | `?utm_*`, `?fbclid`, `?subject=`, `?lang=`, `?rows=` all canonicalise to the clean URL; `?sort=` is `noindex`. `VERIFIED_PRODUCTION` |
| Structured data | Accurate per template — `Book`, `ScholarlyArticle`, `Periodical`, `PublicationIssue`, `Course`, `ProfilePage`, `CollectionPage`, `Event`, `AboutPage` — with the Organization/Library/WebSite graph referenced by `@id`. `VERIFIED_PRODUCTION` |
| Breadcrumbs | Reflect **information architecture, not URL segments** (`Home › Books › <Subject> › <Book>`), and the visible nav matches the `BreadcrumbList` exactly. `VERIFIED_PRODUCTION` |
| Book pages | 60-page random sample: 60/60 unique titles, 60/60 unique descriptions, 60/60 `index, follow`, 60/60 `og:image`, 60/60 full `Book` JSON-LD. `VERIFIED_PRODUCTION` |
| Image alt | Covers carry `Book cover: <title> by <author>`. `VERIFIED_PRODUCTION` |
| Locale data parity | EN and KM homepages report **identical** counts (1,697 digital resources, 1 thesis, 6 physical, 15 paths). `VERIFIED_PRODUCTION` |

**A note on method.** An early probe reported "hreflang MISSING" on the
homepage. That was the *probe* being case-sensitive — Next serialises the
attribute as `hrefLang`. A second probe reported `/km/subjects/គណិតវិទ្យា` as
HTTP 520; three retries answered 200. Both were withdrawn rather than reported.
Neither is a finding.

---

## 1. The collection changed scale, and that is the context for everything below

| | Previous docs assume | Measured 2026-09-16 |
|---|---|---|
| Books | ~270–296 | **1,695** |
| `/books` pages | 17 | **95** |
| Sitemap URLs | ~508 | **2,048** |
| Author URLs | 157 | **290** |
| Theses | — | 1 |
| Journal articles | — | 1 |

`VERIFIED_PRODUCTION` (sitemap.xml, `/books` listing, homepage stats).

The library grew ~5.6× in books. Two of the three defects below are latent bugs
that **only become reachable past a threshold the collection has now crossed**,
which is why previous passes could not have found them.

---

## 2. Findings

### F-1 — `sitemap.xml` silently omits published books; two generations of the same collection disagreed
**Severity: HIGH · behaviour `VERIFIED_PRODUCTION` · mechanism `VERIFIED_LOCAL` in the source, `INFERRED` as to which rows tie**

Two fetches of `/sitemap.xml`, one revalidation apart, against a collection
that did not change in between:

```
fetch 1    2,045 URLs   1,690 of 1,695 books
fetch 2    2,048 URLs   1,695 of 1,695 books
```

The five books absent from fetch 1 each answer **200**, `index, follow`, with a
correct self-canonical, and each is listed on `/books`:

```
/books/chicken-raising
/books/ការចិញ្ចឹមបីបាច់កុមារតូច-រូបភាពសន្លឹកផ្ទាត់
/books/ជីវវិទ្យា-ថ្នាក់ទី៧-មេរៀនទី-២-ផ្នែកផ្សេងៗនៃប្រដាប់រំលាយអាហារ
/books/រូបវិទ្យា-1
/books/ឯកសារជំំនួយស្មាតីស្ដីពី-ការអភិវឌ្ឍនិញ្ញាសាប្រលងឆមាស-នៅកម្រិតមធ្យម
```

**The divergence runs both ways**, which rules out "new content published
between fetches": fetch 1 carried two author URLs that fetch 2 dropped
(`/authors/វិទ្យាស្ថានគរុកោសល្យរាជធានីភ្នំពេញ` — PTEC itself — and
`/authors/ល-ក-ស-ល-នដ-ន-ង-ជន-ស-គន-ធ-រ`), both of which answer 200 `index, follow`.
The sitemap is **non-deterministic**, not stale.

**How many generations were actually observed: two, and they disagreed.** A
third fetch matched the second byte for byte and returned `x-nextjs-cache: HIT`,
so it is very likely the same ISR render rather than an independent sample. The
finding is therefore "two generations of the same collection produced different
URL sets", which is sufficient to establish non-determinism. **How often it
happens, and which rows are affected on any given generation, is `UNKNOWN`.**

The two halves have **different causes**, and only one is fixed here:

- The five **books** are the paged-sweep defect described below. Fixed.
- The two **authors** are the documented degraded fallback in `app/sitemap.ts`:
  when `getListedAuthors()` comes back empty the file emits the UNFILTERED
  author set rather than dropping every author URL. Fetch 1 shows 290 author
  URLs, fetch 2/3 show 288 — consistent with that fallback having fired once.
  That fallback is working as designed and is **not** changed. See F-5.

**Mechanism.** `app/sitemap.ts` sweeps each table with `.range()` over
`ORDER BY created_at` — a non-unique key with no tiebreaker. A `.range()` sweep
is a sequence of *independent* LIMIT/OFFSET queries and Postgres promises
nothing about how two of them break a tie, so a row can be returned by two
pages (then dropped by the file's own `seen` de-duplication) or by none.
`created_at` is not unique here because `now()` is transaction-scoped and this
library is bulk-imported. **The symptom only appears once a table exceeds
`PAGE_SIZE = 1000`** — which `books` did as the collection passed 1,000.

**Why no test caught it.** `lib/db/paginated-sweep.test.ts` exists for exactly
this rule and lists `app/sitemap.ts` in its scan. Its documented rule is
"a `.range()` loop … must carry an `.order()` on a **UNIQUE** key". Its
assertion was:

```ts
const unordered = chains.filter(({ chain }) => !chain.includes(".order("));
expect(unordered).toEqual([]);
```

It checked that an `.order()` *exists*, never that the key is unique. All eight
sitemap sweeps (seven on `created_at`, one on an author name) passed it while
production lost rows.

---

### F-2 — Four listings publish an unbounded family of indexable `?page=N` URLs
**Severity: MEDIUM-HIGH · `VERIFIED_PRODUCTION`**

`buildListingMetadata` self-canonicalises `?page=N` — deliberately, so the whole
collection can be indexed instead of collapsing onto page 1. The cost of that
choice is that a page *past the end* is also indexable and self-canonical, at
any N, forever — unless the page tells the builder where its collection ends via
`outOfRange`. Only `/books` and `/posts` did.

Measured:

| URL | Results rendered | robots | canonical |
|---|---|---|---|
| `/catalogs?page=50` | **0 of 6** | *(absent → index)* | `/catalogs?page=50` |
| `/theses?page=50` | 1 — page 1's row again | *(absent → index)* | `/theses?page=50` |
| `/journals?page=50` | 2 — page 1's rows again | *(absent → index)* | `/journals?page=50` |
| `/books?page=999` | 0 | `noindex, follow` | — |
| `/posts?page=2` | 0 | `noindex, follow` | — |

Two shapes of the same defect: `/catalogs` does **not** clamp, so it ranges past
the end and renders an empty grid — a soft-404 advertised as its own search
result. `/theses`, `/theses/summary` and `/journals` **do** clamp, so they serve
page 1's content under the title "… — Page 50" at a distinct indexable URL — a
duplicate. Both are what `outOfRange` exists to refuse.

`/authors?page=99` and `/subjects?page=9` are **not** affected: they do not
paginate (byte-identical to page 1) and carry a static canonical to the hub, so
the duplicate is already consolidated. No change made there.

---

### F-3 — Journal issue surfaces have no social card
**Severity: LOW · `VERIFIED_PRODUCTION`**

`/journals` and `/journals/<slug>` carry an `og:image`. In the same file,
`buildIssuesListMetadata` and `buildIssueMetadata` set neither `images` nor
`twitter`, so `/journals/<slug>/issues` and
`/journals/<slug>/issues/<issue>` emit no `og:image` at all and share as bare
links. This is the same defect the listing helper was written to remove from
`/theses`, `/catalogs`, `/journals` and `/paths`; these two surfaces were missed.

---

### F-4 — The internal-linking instrument aborts on a dropped connection
**Severity: MEDIUM (tooling) · `VERIFIED_PRODUCTION`**

`scripts/audit-crawl-depth.ts` is the only instrument that measures click depth
and orphans — the Phase 15 deliverable. Run against the now-6,100-URL graph it
**crashed** after ~400 pages:

```
TypeError: terminated
  [cause]: Error: read ECONNRESET
```

`fetchPage()` reads the body with `await res.text()` and rethrows anything that
is not `HttpStatusError` or `TransportError`. undici surfaces a mid-body
connection drop as a bare `TypeError`, so it fell through to `throw`, and the
pump's `void fetchPage(url).then(…)` has **no `.catch()`** — one dropped socket
ends the run. `lib/verify/http.ts`'s `fetchText()` already classifies exactly
this case correctly one layer up; the crawler bypassed it.

Second, related: a run that stops at its `--max` cap reported its orphan count
with no indication that it was capped. The first capped run reported
**198 orphans**; run to completion, the true figure is **0**.
An orphan count from a partial crawl is an upper bound, not a finding — the same
"an incomplete run is never reported as a result" rule the repo already applies
to its production verifiers.

---

### F-5 — Two author pages are indexable, carry works, and are advertised nowhere
**Severity: LOW (2 URLs) · `VERIFIED_PRODUCTION` · NOT FIXED — see why**

```
/authors/វិទ្យាស្ថានគរុកោសល្យរាជធានីភ្នំពេញ   200  index, follow  ProfilePage  3 works listed
/authors/ល-ក-ស-ល-នដ-ន-ង-ជន-ស-គន-ធ-រ            200  index, follow  ProfilePage  1 work listed
```

Neither appears in the `/authors` directory, and neither is in the current
sitemap generation. Their own pages decline to withdraw (correctly — the
documented rule is `noindex` only when `works.length === 0`, and these have
works). So `getAuthorDirectory()` and `getAuthorProfile()` disagree about
whether these two rows have works.

This is the mirror image of the SEO 3.3 §5.5 defect (there: *advertised but
workless*; here: *has works but unadvertised*). The rule "the sitemap asks the
directory's question" is being honoured — the question simply returns a
different answer than the page does for these two rows.

**The directory's other exclusions are correct.** `/authors` links 329 authors
and the sitemap carries 288; the difference is exactly the **41 composite
bylines** (`…-editors`, `alan-crawford-wendy-saul-samuel-r-mathews-james-makinster`),
which the sitemap excludes by design because a composite URL answers
`noindex, follow` as a disambiguation signpost while staying linked so the crawl
reaches the individuals. 329 − 41 = 288. That is the #199/#200 design working.

**Not fixed here**, deliberately: the cause is inside the contributor/directory
work-counting logic, which is pinned by `composite-split.test.ts`,
`sitemap-filter.test.ts` and `contributor-view.test.ts`, and touches author
identity rather than page metadata. Two URLs do not justify changing that
surface inside an SEO metadata pass; it deserves its own audit, as 0147 had.

**Related, and worth its own ticket:** `ល-ក-ស-ល-នដ-ន-ង-ជន-ស-គន-ធ-រ` renders
`<h1>លុក សូលីនដា និង ជន សុគន្ធារី</h1>` — two people joined by the Khmer
conjunction **និង** ("and"). `normalizeByline()` does not split on it, so the
page answers `index, follow` and publishes **one `Person` node for two humans**
— exactly the fabricated-human defect SEO 3.2 removed for Latin composites. The
fix is a change to `normalizeByline()` plus a split migration in the shape of
0147, not a metadata edit. `VERIFIED_PRODUCTION`.

---

### F-6 — The deepest books are 48 clicks from the homepage
**Severity: MEDIUM · `VERIFIED_PRODUCTION` · NOT FIXED — it is a listing-UI decision**

A **complete** crawl (7,780 fetches, queue drained, no cap, no transport
failures) measured the link graph:

```
reachable by CLICKING from /        2048 / 2048  (100.0%)
ORPHANS                             0
broken internal links               0
indexable dead ends                 0

family        n   min  median  max   ≥4 clicks
/books      1696     1       3    48    218 (12.9%)
/authors     289     1       2     2      0
/subjects     25     1       2     2      0
/paths        10     1       2     2      0
```

**The good news is unambiguous**: every sitemap URL is reachable by clicking,
nothing is orphaned, nothing is broken, and the median book is 3 clicks deep.

**The tail is not.** `/books` is 94 crawled pages and its pagination links
first / prev / next / last plus near neighbours, so reachability is a barbell:
page 2 is one click from page 1, page 95 is one click from page 1, and the
**middle** of the range is the far end of both chains. Depth to page *N* is
about `min(N−1, 1+(95−N))`, which peaks near page 48 — exactly the measured
maximum. 218 books (12.9%) sit at 4+ clicks.

**Phase B's hubs do not rescue this at the current scale.** The counterfactual
— the same graph with every edge leaving `/subjects/*` and `/paths/*` removed —
changes nothing: median depth 3 either way, and only **5 books (0.3%)** have a
shortest path running through a hub or a learning path. That is not a criticism
of Phase B; it is arithmetic. Subject hubs list ≤12 items per type, so 25 hubs
can shorten the path for a few hundred books at most, against 1,695.

**Not fixed here.** Every remedy is a listing-UI or content-architecture
decision with real trade-offs — a wider pagination window, a paginated A–Z or
by-subject index, deeper hub listings, or raising the default page size. Picking
one is the team's call, not an audit's. What this pass contributes is the
measurement and a repeatable way to re-take it:

```bash
npx tsx scripts/audit-crawl-depth.ts --concurrency 4 --max 9000
```

**This finding was invisible until F-4 was fixed.** The capped run reported
`max 5, 19 books ≥4 clicks` because it stopped before reaching deep pagination —
and reported 198 orphans that do not exist.

---

## 3. Observations — reported, deliberately NOT changed

| # | Observation | Why no change |
|---|---|---|
| O-1 | Author pages emit **no `og:image`** and `twitter:card: summary`. 290 URLs share as bare links. | The code documents this as a decision ("a portrait is a square thumbnail, not a large_image hero"). Changing it is the team's editorial call, not a defect fix. |
| O-3 | `sitemap.xml` `<loc>` carries raw UTF-8 Khmer; page canonicals carry the percent-encoded form. | The two are the same URL under RFC 3986 and Google normalises them. Cosmetic. |
| O-4 | Thesis, post and catalog detail pages carry ~0 outbound entity links. | Affects 1 + 1 + 6 pages. Real, but below the threshold where it changes anything. |
| O-5 | Only **1 thesis** and **1 journal article** are published. | A content fact, not a technical defect. The templates are correct and ready. |
| O-6 | `/books?subject=…&lang=…&sort=…&page=2` is `noindex` yet canonicalises to `/books?page=2`. | `noindex` already settles it; a canonical on a noindex page is inert. Not worth a change. |

---

## 4. Not established

| Question | Status |
|---|---|
| Whether `books.created_at` actually holds ties in production | `UNKNOWN` — `.env.local` targets local Supabase; no read-only production DB access was used. The mechanism is `INFERRED` at high confidence; the *behaviour* is `VERIFIED_PRODUCTION` and the fix is correct regardless of whether ties or plan variance cause the instability. |
| Search Console coverage impact of F-1 | `UNKNOWN` — requires GSC access. |
| Why `getAuthorDirectory()` and `getAuthorProfile()` disagree about the two authors in F-5 | `UNKNOWN` — both read works, by different routes (canonical credits + legacy FK vs the profile's own union). Not diagnosed further; see F-5. |
| How often a sitemap generation diverges | `UNKNOWN` — two generations observed, one divergent. |

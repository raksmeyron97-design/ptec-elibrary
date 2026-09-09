# SEO Production Pass — Verification Report

| | |
|---|---|
| **Repository** | `raksmeyron97-design/ptec-elibrary` |
| **Branch** | `fix/production-validation-2026-09-09` |
| **Commit at audit start** | `d47ac62` (working tree clean) |
| **Base at commit time** | `3549f01` — three unrelated commits landed on the branch from concurrent work during this pass; `getPathBySlug()` was re-checked against the current tree and still hard-filters `status = 'published'`, so the gate assumption holds |
| **Production host** | `https://library.ptec.edu.kh` |
| **Deployment** | self-hosted Docker on ZimaOS behind Cloudflare Tunnel |
| **Date** | 2026-09-09 |
| **Baseline** | `docs/SEO-PRODUCTION-PASS-BASELINE.md` |
| **Search Console** | `docs/SEO-SEARCH-CONSOLE-CHECKLIST.md` — **NOT VERIFIED**, no access |

Status vocabulary: **PASS / WARN / FAIL / NOT VERIFIED / DEFERRED**.
No claim below is made from source reading alone — every production statement
comes from an inspected HTTP response.

---

## 1. Executive summary

The SEO architecture was already sound. 478 sitemap URLs, 478 HTTP 200s, zero
canonical errors, zero hreflang errors, zero orphan pages, zero JSON-LD parse
failures, and the Cloudflare `robots.txt` override that once broke every
Lighthouse run is gone. Fourteen previously recorded findings were re-tested
against live production; **thirteen are fixed or were never reproducible today,
one is deferred by owner decision.**

This pass found **four new defects that source review could not see**, all of
them a single class: *a page that exists but has nothing behind it, telling
crawlers to index it.*

| ID | Defect | Sev | Status |
|---|---|---|---|
| N-1 | `/paths/<unknown>` served **HTTP 200 + `index, follow`** for any string | P0 | **FIXED** |
| N-2 | `/publications` and `/paths` advertised as indexable while empty | P0 | **FIXED** |
| N-3 | `/paths` was the only listing on the site with no `og:image` | P1 | **FIXED** |
| N-4 | The homepage emitted no `og:url` | P1 | **FIXED** |
| N-5 | No regression test bound `app/robots.ts` to its private-path source | P1 | **FIXED** |

Nothing was rebuilt. No migration was written. No URL was renamed. No
permission, storage, download, reader or admin behaviour was touched.

## 2. Measurements

### Production, as audited (before the fix)

| Measure | Value |
|---|---|
| Sitemap URLs | **478** |
| Sitemap URLs returning 200 | **478 / 478** |
| Sitemap URLs redirecting | **0** |
| Sitemap URLs 404 / 5xx | **0** (one transient 502, 200 on retry) |
| Duplicate sitemap URLs | **0** |
| Private URLs in sitemap | **0** |
| Pages analysed for markup | **478** |
| Pages missing a canonical | **0** |
| Canonical errors (origin / scheme / query / fragment) | **0** |
| Pages missing `en` + `km` + `x-default` hreflang | **0** |
| Khmer alternates sampled → 200 | **40 / 40** |
| JSON-LD blocks parsed | **1412** |
| JSON-LD parse failures | **0** |
| Pages declaring a duplicate Organization/Library/WebSite node | **0** |
| Breadcrumb items with an off-origin or query-bearing URL | **0** |
| **Orphan public pages (0 non-chrome inbound links)** | **0 / 478** |
| Author URLs returning 200 | **157 / 157** |
| Subjects in sitemap | 23, all populated |
| Empty subjects in sitemap | **0** |

### Collection sizes (live)

books **270** · theses **1** · publications **0** · learning paths **0** ·
posts **1** · physical catalog **6** · subjects **23** · authors **157**

### Internal link graph

Crawled all 478 sitemap pages, extracted every same-origin `href`, and excluded
"site chrome" (any destination linked from ≥90% of pages — the header, footer
and hub nav) so the counts measure *editorial* links only.

| Group | Pages | Orphans | Exactly 1 inbound | Median | Max |
|---|---:|---:|---:|---:|---:|
| `/books/*` | 270 | **0** | 46 | 4 | 73 |
| `/authors/*` | 157 | **0** | 0 | 2 | 66 |
| `/subjects/*` | 23 | **0** | 0 | 8 | 89 |
| `/catalogs/*` | 6 | **0** | 0 | 3 | 4 |
| `/theses/*` | 2 | **0** | 1 | 3 | 3 |
| `/posts/*` | 1 | **0** | 0 | 2 | 2 |
| All hubs + informational | 19 | **0** (site chrome) | — | — | — |

**Every public entity is reachable by an editorial link.** The entity graph
(`lib/resources/connections.ts`) is doing its job in both directions: a book
links to its author and subject, a subject links back to its books and to
related subjects, an author links to their works.

### Test and build results (after the fix)

| Gate | Before | After | Status |
|---|---|---|---|
| `npx tsc --noEmit` | 0 errors | **0 errors** | **PASS** |
| `npm run lint` | 0 errors / 172 warnings | **0 errors / 172 warnings** | **PASS** — identical count; none of the changed files appear in the output |
| `npx vitest run` | 4054 passed, 50 skipped (at `d47ac62`) | **4109 passed, 50 skipped, 0 failed** | **PASS** — **+52 from this pass**, +3 from the concurrent commits |
| `npm run build` (clean `.next`) | — | **exit 0** | **PASS** |

## 3. Re-verification of previously recorded findings

| ID | Finding | Status |
|---|---|---|
| F-1 | Empty subjects in sitemap | **PASS** — 23/23 populated; `getIndexableSubjects()` gates it |
| F-2 | Cloudflare `robots.txt` override | **PASS** — live file is the app's output; no managed `Disallow: /` |
| F-3 | Duplicate private-path lists | **PASS** — derived from `getLocalizedPrivateSeoPaths()`; now pinned by a test (N-5) |
| F-4 | Missing `/subjects` hub | **PASS** — 200, indexable, CollectionPage, 23 crawlable links |
| F-5 | Breadcrumb links | **PASS** — 0 bad breadcrumb URLs across 468 BreadcrumbLists |
| F-6 | False Khmer hreflang on subjects | **PASS** — `/km/subjects/*` fully Khmer (title, description, H1, breadcrumbs) |
| F-7 | Thin subject pages | **PASS** — real resources and counts, no invented prose |
| F-8 | Dynamic learning paths | **PASS** — `/paths` is ISR (`revalidate = 3600`); progress is client-side |
| F-9 | Book publication-date naming | **PASS** — real `datePublished`; PTEC is `provider`, not `publisher` |
| F-10 | Timestamp subject slugs | **DEFERRED** — see §7 |
| F-11 | Page-level SEO health reporting | **PASS (partial)** — `lib/seo/validate.ts` validates every sitemap entry at serve time |
| F-12 | Theses summary orphan | **PASS** — reserved gate segment, 200, sitemapped, breadcrumbed |
| F-13 | Search entry-point architecture | **PASS** — `/search` and filtered listings `noindex, follow` |
| F-14 | Homepage SEO settings behaviour | **PASS** — env gate ∧ admin kill switch reach robots.txt, sitemap and metadata |
| — | Author URL repair | **PASS** — 157/157 return 200, Khmer slugs included; NULL-slug rows dropped, never advertised |

## 4. What was fixed, and why it was invisible

### N-1 · `/paths/<unknown>` was an indexable soft-404 — **P0, FIXED**

**Evidence (before):** `GET /paths/not-a-real-path-xyz` → `200`,
`<title>PTEC Library</title>`, `<meta name="robots" content="index, follow">`.

The page calls `notFound()`. It never mattered: every `(public)` route streams
`loading.tsx` first, so the 200 is committed before the lookup runs. That is
precisely why `lib/resource-slug-gate.ts` exists — and `paths` was the one
public resource type never added to it, leaving an unbounded crawlable URL
space on a route that answers `index, follow` to every string.

**Fix.** `learning_paths` already has `slug`, `is_published` and an anon
`select` policy (0063), so it fits the existing gate shape exactly:

- `RESOURCE_GATES.paths = { table: "learning_paths", publishedColumn: "is_published" }`
- one line in middleware's dispatch loop
- `generateMetadata` now returns `noindex, follow` instead of `{}` on a miss —
  the gate **fails open by design**, and `{}` inherited the layout's indexable
  robots value during that window

`is_published`, not `status`: it is the trigger-maintained mirror (0111), it is
a boolean the gate's `=eq.true` filter can bind to, and it is the column the
anon RLS policy predicates on — so the edge snapshot and the policy agree by
construction. No session-cookie skip is needed (unlike posts): `getPathBySlug()`
hard-filters `status = 'published'`, so there is no signed-in preview to break.

**Verified after (local production build):**

| URL | Before | After |
|---|---|---|
| `/paths/not-a-real-path-xyz` | 200 | **404** |
| `/km/paths/not-a-real-path-xyz` | 200 | **404** |
| `/paths`, `/km/paths` | 200 | 200 |

### N-2 · Empty collection hubs advertised as indexable — **P0, FIXED**

**Evidence (before):** `/publications` rendered *"No publications found. No
publications are currently available."* with no `robots` meta (indexable) and a
sitemap entry. `/paths` rendered *"No learning paths published yet. Check back
soon"* with `index, follow` and a sitemap entry. Both tables hold zero rows.

`app/sitemap.ts` already applies the correct rule — and states it — for the two
hubs it was taught about (`subjectHubUrls`, `authorHubUrls` are emitted only
when non-empty). The other six sat in an unconditional `staticUrls` array.

**Fix, in two layers:**

1. **Sitemap.** Every collection hub now goes through
   `hub(path, count, opts)`, gated on the row arrays `buildEntries()` *already
   fetched* — **no additional query.** `/theses/summary` rides on the thesis
   count, being a view over exactly those rows. `/` and the informational pages
   (`/about/*`, `/contact`, `/policy`, `/privacy`) stay unconditional: each is
   real content regardless of holdings. (`/about/team` was checked — it carries
   editorial content even with 0 individual profiles.)
2. **Page metadata.** `buildListingMetadata()` gained an `isEmpty` flag, and
   `buildPathsListingMetadata()` its own. Both resolve from
   `getCollectionStats()` — one row from `public_resource_statistics`, cached
   under the `collection-stats` tag, already read by both page bodies.
   A `null` stats read means *unknown*, not *empty*: only a hard `0` withholds
   the index entry, so a failed read can never de-index a populated collection.

`isEmpty` is deliberately independent of `hasFilters`. "This filter matched
nothing" was already handled; "this collection has no rows" is the different
claim. Conflating them would `noindex` `/books` the first time someone
mistyped a search.

**Verified after:** `/publications`, `/km/publications`, `/paths`, `/km/paths`
all emit `noindex, follow`; sitemap output confirmed in §6.

### N-3 · `/paths` was the only listing with no `og:image` — **P1, FIXED**

`buildListingMetadata()` gained a shared social-card fallback precisely because
five listings were sharing as bare links. `/paths` uses
`buildPathsListingMetadata()` — a separate builder in `lib/seo/learning-path-seo.ts`
that never received it. Verified live: every other listing emitted
`og-default.png`; `/paths` and `/km/paths` emitted no `og:image` tag at all.
The module already exported `FALLBACK_OG_IMAGE`; the listing builder now uses
it for both Open Graph and Twitter.

### N-4 · The homepage emitted no `og:url` — **P1, FIXED**

`/` and `/km` were the only `openGraphBase()` callers that never set
`openGraph.url`; all ten others do. `openGraphBase()` cannot supply it — it does
not know the page's path. The homepage now reuses the `localeAlternates("/",
locale)` object it already builds for `alternates.canonical`, so the canonical
and `og:url` cannot drift.

### N-5 · Regression tests — **FIXED (+52 tests)**

| File | What it now pins |
|---|---|
| `lib/seo/robots-sitemap-policy.test.ts` *(new, 30 tests)* | `app/robots.ts` derives from `getLocalizedPrivateSeoPaths()` and **hard-codes no private prefix**; the AI/search allow-list contains no private path; the sitemap reference survives; every collection hub is emitted through `hub()` and **never** through a bare `entry()`; `/` and the informational pages stay unconditional; the subject/author gates stay; `validateSitemapEntry` is still called |
| `lib/resource-slug-gate.test.ts` *(+9)* | **every** `RESOURCE_GATES` entry is dispatched in middleware, and every middleware dispatch names a real gate — a gate declared but not wired is silent; plus the `paths` gate's table/column |
| `lib/seo/listing-metadata.test.ts` *(+5)* | `isEmpty` ⇒ `noindex, follow`; populated ⇒ robots omitted; independent of `hasFilters`; canonical and hreflang survive |
| `lib/seo/learning-path-seo.test.ts` *(+5)* | `/paths` always carries a social image in both locales; `isEmpty` ⇒ noindex; canonical + `og:url` per locale |

Every source scan strips comments first, so the prose documenting a defect
cannot trip the rule that prevents it.

## 5. Status by area

| Area | Status | Basis |
|---|---|---|
| Robots (code) | **PASS** | Single source of truth, now test-pinned |
| Robots (production edge) | **PASS** | Live `robots.txt` is the app's output; no Cloudflare override |
| Sitemap | **PASS** (was WARN) | 478/478 → 200; empty hubs now withheld |
| Canonical | **PASS** | 0 errors across 478 pages |
| Hreflang | **PASS** | 0 pages missing `en`+`km`+`x-default`; 40/40 Khmer alternates → 200 |
| Subject SEO | **PASS** | Hub + 23 populated pages, bilingual, breadcrumbed, CollectionPage |
| Author SEO | **PASS** | Hub + 157/157 resolving, ProfilePage, breadcrumbs → `/authors` |
| Book SEO | **PASS** | Book JSON-LD with real ISBN/author/`datePublished`; PTEC as `provider` |
| Thesis SEO | **PASS** | ScholarlyArticle; PTEC as `publisher` (it genuinely is) |
| Publication SEO | **PASS** | Correct while empty — now `noindex` and out of the sitemap |
| Learning Path SEO | **PASS** (was FAIL) | Slug gate, empty-hub noindex, og:image |
| Posts SEO | **PASS** | Article/Event JSON-LD, breadcrumbs, bilingual |
| Internal link graph | **PASS** | 0 orphans across 478 pages |
| Structured data | **PASS** | 1412 blocks, 0 parse failures, 0 duplicate org nodes |
| Pagination / parameters | **PASS** | Self-canonical per page; `?page=999` and filters `noindex, follow`; `hasFilters` matches the params each page actually reads |
| 404 behaviour | **PASS** (was WARN) | All detail routes 404 on an unknown slug; `/subjects` documented below |
| Performance | **PASS** | No new query added; both `isEmpty` reads are cached rows the pages already fetch |
| Security | **PASS** | Private surfaces 307/404 with `noindex, nofollow`; no auth, storage, download or reader change |

## 6. Production smoke test

**Before the fix — against live `https://library.ptec.edu.kh`:** all 478
sitemap URLs, the route inventory, private surfaces, invalid slugs, pagination
and parameter policy, and the full markup analysis in §2. Results above.

**After the fix — against a clean production build served locally** (`npm run build`
with `.next` removed, then `next start`, reading the production database):

| Check | Result |
|---|---|
| `/paths/not-a-real-path-xyz` | **404** ✅ (was 200) |
| `/km/paths/not-a-real-path-xyz` | **404** ✅ (was 200) |
| `/paths`, `/km/paths` still serve | **200** ✅ |
| `/books`, `/subjects` still serve | **200** ✅ |
| `/paths` + `/km/paths` robots | **`noindex, follow`** ✅ (empty) |
| `/publications` + `/km/publications` robots | **`noindex, follow`** ✅ (empty) |
| `/paths` + `/km/paths` `og:image` | **present** ✅ (was absent) |
| `/` and `/km` `og:url` | **present** ✅ (was absent) |
| Sitemap hub entries | see below |

**Sitemap, rebuilt with `SEO_INDEXING=on` and diffed against the live production
sitemap URL-for-URL:**

| Measure | Before | After |
|---|---:|---:|
| Total `<loc>` entries | 478 | **476** |
| `xhtml:link` alternates | 956 | **952** (exactly 2 per entry) |
| URLs **removed** | — | **2** — `/publications`, `/paths` |
| URLs **added** | — | **0** |
| Any other URL changed | — | **0** |

| Hub | In sitemap | Why |
|---|---|---|
| `/books`, `/theses`, `/theses/summary`, `/catalogs`, `/posts`, `/subjects`, `/authors` | **present** | populated |
| `/publications`, `/paths` | **absent** | 0 rows — gated |

**No regression in the existing gates** — real resources (Khmer slugs included)
still resolve, unknown slugs still 404:

| Route | Real slug | Unknown slug |
|---|---|---|
| `/books/*` | 200 | 404 |
| `/authors/*` (incl. `/authors/johnny-saldaña`, Khmer names) | 200 | 404 |
| `/catalogs/*` | — | 404 |
| `/theses/*`, `/theses/summary` | 200 | 404 |
| `/publications/*` | — | 404 |
| `/posts/*` | — | 404 |
| `/paths/*` | — | **404 (new)** |


**NOT VERIFIED:** none of this has been deployed. The production host still
serves `d47ac62` until this branch is merged and released.

## 7. Deferred, with reasoning

### F-10 · `book-<epoch>` subject slugs — **DEFERRED** (owner decision)

Nine of the 23 indexable subjects carry a timestamp slug, because
`asciiSlug()` of a Khmer name is the empty string. This is a **recorded owner
decision** (it needs a migration plus 301s) and §49 of the brief forbids
renaming a live URL without one, so nothing was changed. What *has* changed
since it was deferred is the stakes, and the numbers should be on the record:

| Slug | Subject | e-books |
|---|---|---:|
| `book-1781238023578` | ស្រាវជ្រាវ (Research) | 66 |
| `book-1781238033853` | គរុកោសល្យ (Pedagogy) | 42 |
| `book-1781238024978` | ស្រាវជ្រាវប្រតិបត្តិ (Action research) | 18 |
| `book-1781238124806` | វិទ្យាសាស្ត្រ (Science) | 16 |
| `book-1781238075501` | គណិតវិទ្យា (Mathematics) | 13 |
| `book-1781238041127` | ភាសាអង់គ្លេសសិក្សា (English studies) | 13 |
| `book-1781238035277` | ស្រាវជ្រាវបែបគុណភាព (Qualitative research) | 13 |
| `book-1781238028353` | ស្ថិតិ និងវិភាគទិន្នន័យ (Statistics) | 12 |
| `book-1781238123460` | កម្មវិធីសិក្សា (Curriculum) | 7 |

These nine hold **200 of the library's 270 books** and are the site's
highest-value topic landing pages. They were deferred when they were empty and
excluded from the sitemap; they are now populated, `index, follow`, in the
sitemap, and cited in book breadcrumbs. The deferral is still correct — a
rename without 301s would lose them — but it is now a **migration worth
scheduling**, not a cosmetic backlog item.

### `/subjects/<unknown>` returns 200 — **WARN, deferred**

It answers `200` with `noindex, follow` and *"Nothing here yet"*, so it cannot
be indexed, but it is a soft-404 by status code and Search Console may report
it as one. It is not gated because a subject "slug" is a **matching rule over
`categories`**, not a column — there is no edge-safe published view for the gate
to query, so closing it means either a migration or a lookup this gate's
one-table shape cannot express. Out of scope for a no-migration pass.

### Author → subject edges — **DEFERRED (P2)**

An author page links to their works but not to the subjects those works sit in.
Adding it means aggregating subjects per author; the brief forbids new N+1
queries, and each of the author's works already links onward to its subject.
An enhancement, not a defect.

### `/paths/[slug]` remains dynamically rendered — **DEFERRED**

It reads the signed-in user's progress. Splitting public content from learner
progress is a real improvement but a risky one (leaking per-user state into a
shared cache), it has **no SEO symptom** — the served HTML is complete — and
with zero published paths there is nothing to measure. `/paths` itself is
already ISR, which is what F-8 asked for.

### Top-level pages carry no BreadcrumbList — **observation, no change**

Ten pages (`/`, `/books`, `/theses`, `/catalogs`, `/publications`, `/paths`,
`/about`, `/about/committee`, `/contact`, `/policy`) emit no breadcrumb, where
one would only say "Home → X". `/subjects` and `/authors` do emit one. Harmless
inconsistency; changing it adds markup without adding information.

## 8. Remaining risks

1. **Not deployed.** Every fix is verified on a local production build only.
2. **The `/paths` gate fails open** — by design, like every gate here. If the
   edge cannot reach Supabase, unknown paths return to 200; the
   `noindex, follow` in `generateMetadata` is the second layer for that window.
3. **The Cloudflare `robots.txt` override can return.** It is a dashboard
   setting, outside this repository. Its signature is a uniform Lighthouse SEO
   score across every URL with no variance.
4. **`/publications` and `/paths` will re-enter the index automatically** when
   their first row is published — sitemap within the hour (`revalidate = 3600`),
   page metadata immediately (`force-dynamic` / cache-tag invalidation). No
   manual step, and no risk of them staying hidden.
5. **The nine `book-<epoch>` slugs keep accruing links** the longer the
   migration waits.

## 9. Actions outside this repository

| Action | Owner | Why it cannot be done in code |
|---|---|---|
| Verify Cloudflare AI Crawl Control injects no `robots.txt` rule | infra | CDN dashboard setting |
| Search Console: submit sitemap, inspect the 15 URLs in the checklist, watch Soft-404 fall after this ships | librarian/admin | Requires GSC access; none was available |
| Schedule the `book-<epoch>` subject-slug migration (+ 301s) | product | Renames live indexed URLs — an owner decision |
| Publish the first learning path / publication | librarians | Content, not code |

## 10. Files changed

| File | Change |
|---|---|
| `lib/resource-slug-gate.ts` | `paths` gate added |
| `middleware.ts` | one dispatch line |
| `app/[locale]/(public)/paths/[slug]/page.tsx` | `noindex` instead of `{}` on a miss |
| `app/sitemap.ts` | collection hubs gated on their contents |
| `lib/seo/listing-metadata.ts` | `isEmpty` ⇒ `noindex, follow` |
| `lib/seo/learning-path-seo.ts` | listing `og:image` + `isEmpty` |
| `app/[locale]/(public)/publications/page.tsx` | passes `isEmpty`; metadata reads parallelized |
| `app/[locale]/(public)/paths/page.tsx` | passes `isEmpty`; metadata reads parallelized |
| `app/[locale]/(public)/(home)/page.tsx` | `og:url` |
| 4 test files (1 new) | +52 regression tests |
| `docs/SEO-PRODUCTION-PASS-BASELINE.md` | new |
| `docs/SEO-PRODUCTION-PASS-VERIFICATION.md` | this file |
| `docs/SEO-SEARCH-CONSOLE-CHECKLIST.md` | new |

No migration. No renamed URL. No change to authentication, authorization,
storage, download permission, reader behaviour, admin, search or localization.

### A note on the two `generateMetadata` parallelizations

Adding the `isEmpty` read initially serialized it behind an independent `await`
in both listing routes (caught by `react-doctor --staged`). Both now start every
`locale`-independent read together, so the new read costs no extra latency as
well as no extra query. In `/publications` that also folded in the pre-existing
`searchParams` / `routeParams` pair.

One `react-doctor` finding is left standing in that file and is a **false
positive**: `getTranslations({ locale, … })` is flagged as an "independent"
await, but `locale` is bound by the `Promise.all` destructuring immediately
above it, so it cannot start earlier. It was not suppressed, and the code was
not contorted to silence it.

# SEO Production Pass — Baseline

**Repository:** `raksmeyron97-design/ptec-elibrary`
**Branch:** `fix/production-validation-2026-09-09`
**HEAD at audit start:** `d47ac62` (working tree clean)
**Production host:** `https://library.ptec.edu.kh`
**Date:** 2026-09-09
**Method:** live HTTP inspection of production (`curl` + HTML/JSON-LD parsing),
read against the current source. No production data was written.

This is a *verification* baseline, not a design document. The SEO architecture
described in `docs/SEO-ARCHITECTURE.md`, `docs/SEO-V2-FINAL-REPORT.md` and
`docs/SEO-V3-FINAL-REPORT.md` already exists and is enforced by source-scanning
tests. Nothing here proposes rebuilding it.

---

## 1. Production data snapshot

Derived from the live sitemap and the rendered listing pages; the two agree
exactly, which is itself the check.

| Collection | Published / public | Detail URLs in sitemap |
|---|---:|---:|
| Books | 270 | 270 |
| Theses (`research_reports`) | 1 | 1 |
| Publications | **0** | 0 |
| Learning paths | **0** | 0 |
| Posts (public visibility) | 1 | 1 |
| Physical catalog (`is_active`) | 6 | 6 |
| Subjects (indexable) | 23 | 23 |
| Authors (addressable slug) | 157 | 157 |
| Team profiles | 0 advertised | 0 |

**Sitemap totals:** 478 `<loc>` entries, 956 `xhtml:link` alternates
(exactly 2 per entry — `en` + `km`).

## 2. Sitemap ↔ production consistency

Every one of the 478 sitemap URLs was requested.

| Measure | Result |
|---|---|
| HTTP 200 | **478 / 478** |
| Redirects (3xx) | 0 |
| 404 | 0 |
| 5xx | 0 (one transient 502 on `/authors/សិត-សេង`, 200 on immediate retry) |
| Duplicate URLs | 0 |
| Private URLs present | 0 |
| Malformed URLs | 0 |
| Wrong origin / non-HTTPS | 0 |

Three long Khmer URLs failed to pass through `xargs` in the first sweep (shell
argument handling, not a site defect) and were re-probed individually — all 200.

## 3. Route inventory

`I` = indexable, `C` = self-canonical, `H` = reciprocal hreflang + x-default,
`LD` = JSON-LD beyond the shared org graph, `SM` = in sitemap.

| Route | Public | I | Metadata | C | H | LD | SM | Notes |
|---|---|---|---|---|---|---|---|---|
| `/`, `/km` | ✅ | ✅ | ✅ | ✅ | ✅ | FAQPage | ✅ | **no `og:url`** |
| `/books` | ✅ | ✅ | ✅ | ✅ | ✅ | CollectionPage | ✅ | |
| `/books/[slug]` | ✅ | ✅ | ✅ | ✅ | ✅ | Book + Breadcrumb | ✅ | ISBN/author/date real |
| `/theses` | ✅ | ✅ | ✅ | ✅ | ✅ | CollectionPage | ✅ | |
| `/theses/summary` | ✅ | ✅ | ✅ | ✅ | ✅ | CollectionPage + Breadcrumb | ✅ | |
| `/theses/[slug]` | ✅ | ✅ | ✅ | ✅ | ✅ | ScholarlyArticle + Breadcrumb | ✅ | |
| `/publications` | ✅ | ✅ | ✅ | ✅ | ✅ | CollectionPage | ✅ | **empty collection** |
| `/publications/[slug]` | ✅ | — | — | — | — | — | — | no rows |
| `/paths` | ✅ | ✅ | ✅ | ✅ | ✅ | none | ✅ | **empty + no `og:image`** |
| `/paths/[slug]` | ✅ | — | — | — | — | — | — | **unknown slug → 200** |
| `/subjects` | ✅ | ✅ | ✅ | ✅ | ✅ | CollectionPage + Breadcrumb | ✅ | |
| `/subjects/[slug]` | ✅ | cond. | ✅ | ✅ | ✅ | CollectionPage + Breadcrumb | cond. | empty → noindex |
| `/authors` | ✅ | ✅ | ✅ | ✅ | ✅ | CollectionPage + Breadcrumb | ✅ | |
| `/authors/[slug]` | ✅ | ✅ | ✅ | ✅ | ✅ | ProfilePage + Breadcrumb | ✅ | |
| `/posts` | ✅ | ✅ | ✅ | ✅ | ✅ | CollectionPage | ✅ | |
| `/posts/[slug]` | ✅ | ✅ | ✅ | ✅ | ✅ | Event / Article + Breadcrumb | ✅ | |
| `/catalogs` | ✅ | ✅ | ✅ | ✅ | ✅ | CollectionPage | ✅ | |
| `/catalogs/[slug]` | ✅ | ✅ | ✅ | ✅ | ✅ | Book + Breadcrumb | ✅ | |
| `/about/*` (7) | ✅ | ✅ | ✅ | ✅ | ✅ | varies | ✅ | |
| `/contact`, `/policy`, `/privacy` | ✅ | ✅ | ✅ | ✅ | ✅ | — | ✅ | |
| `/search` | ✅ | ❌ `noindex, follow` | ✅ | ✅ | ✅ | — | ❌ | correct |
| `/admin`, `/dashboard`, `/profile`, `/lists`, `/auth/*`, `/api/*` | ❌ | ❌ | — | — | — | — | ❌ | `X-Robots-Tag: noindex, nofollow` |

## 4. Re-verification of previously recorded findings

Each was re-tested against production today. **No finding was carried forward
on the strength of a prior document.**

| ID | Finding | Status | Evidence |
|---|---|---|---|
| F-1 | Empty subjects in sitemap | **PASS (fixed)** | 23/23 sitemap subjects have ≥1 public resource; `getIndexableSubjects()` gates it; empty subject → `noindex, follow` |
| F-2 | Cloudflare `robots.txt` override | **PASS (cleared)** | Live `robots.txt` is byte-for-byte the app's output; no managed `Disallow: /`; sitemap declared |
| F-3 | Duplicate private-path lists | **PASS (fixed)** | `app/robots.ts` derives from `getLocalizedPrivateSeoPaths()`; no literal array |
| F-4 | Missing `/subjects` hub | **PASS (fixed)** | `/subjects` 200, `index, follow`, CollectionPage, 23 crawlable links, in sitemap |
| F-5 | Breadcrumb links | **PASS** | All sampled breadcrumbs resolve 200, no query strings, locale-correct |
| F-6 | False Khmer hreflang on subjects | **PASS (fixed)** | `/km/subjects/*` title, description, H1, breadcrumbs and chrome are Khmer |
| F-7 | Thin subject pages | **PASS** | Subject pages list real resources + related subjects; counts, not invented prose |
| F-8 | Dynamic learning paths | **PASS (fixed)** | `/paths` is `export const revalidate = 3600` (ISR); progress is client-side |
| F-9 | Book publication-date naming | **PASS** | `datePublished` is a real publication date (`2021-01-01`); PTEC is `provider`, not `publisher` |
| F-10 | Timestamp subject slugs | **WARN — DEFERRED** | 9 of 23 indexable subjects are `book-<epoch>`; now indexed and sitemap-advertised (was: empty). Owner decision: needs migration + 301s |
| F-11 | Page-level SEO health reporting | **PASS (partial)** | `lib/seo/validate.ts` validates every sitemap entry at serve time and logs per-rule issues |
| F-12 | Theses summary orphan | **PASS (fixed)** | `/theses/summary` is a `reserved` gate segment, 200, in sitemap, breadcrumbed |
| F-13 | Search entry-point architecture | **PASS** | `/search` is `noindex, follow`; filtered listings `noindex, follow`; entity hubs indexable |
| F-14 | Homepage SEO settings behavior | **PASS** | Env gate ∧ admin kill switch; both reach `robots.txt`, sitemap and page metadata |
| — | Author URL repair (`SEO-2.0`) | **PASS (fixed)** | 157/157 author URLs return 200. NULL-slug rows are dropped by `addressableAuthorSlug()` rather than advertised. Khmer author slugs resolve (`/authors/សិត-សេង` → 200) |

## 5. Findings opened by THIS pass

All four were found by inspecting live production output, not source review.

### N-1 — `/paths/<unknown-slug>` is an indexable soft-404 · **P0**

`GET /paths/not-a-real-path-xyz` → **HTTP 200**, `<title>PTEC Library</title>`,
`<meta name="robots" content="index, follow">`.

The page *does* call `notFound()`, but every `(public)` route streams its
`loading.tsx` first, so the 200 status is already committed — the exact defect
`lib/resource-slug-gate.ts` was built to close for theses, publications, posts,
catalogs, authors and team profiles. `paths` was never added to
`RESOURCE_GATES`, and `generateMetadata` returns `{}` on a miss, which inherits
the layout's indexable robots value. Unbounded crawlable URL space.

`learning_paths` already has `slug` + `is_published` and an anon `select`
policy (`0063`), so it fits the existing gate shape with no migration.

### N-2 — Empty collection hubs are advertised as indexable · **P0**

- `/publications` renders *"No publications found. No publications are currently available."* — `robots` absent (indexable), in the sitemap.
- `/paths` renders *"No learning paths published yet. Check back soon"* — `index, follow`, in the sitemap.

`app/sitemap.ts` already applies exactly the right rule to the two hubs it was
taught about (`subjectHubUrls`, `authorHubUrls` are emitted only when non-empty)
and the comment there states the principle — *"an empty hub is the same
soft-404 as an empty subject page"* — but the other six hubs sit in an
unconditional `staticUrls` array.

### N-3 — `/paths` is the only listing with no `og:image` · **P1**

`buildListingMetadata()` gained a `LISTING_FALLBACK_OG_IMAGE` default
specifically because five listings were sharing as bare links.
`/paths` uses `buildPathsListingMetadata()` in `lib/seo/learning-path-seo.ts`,
a separate builder that never received the fallback. Verified live: every other
listing emits `og-default.png`; `/paths` and `/km/paths` emit no `og:image` tag
at all.

### N-4 — The homepage emits no `og:url` · **P1**

`/` and `/km` are the only `openGraphBase()` callers that never set
`openGraph.url`; all ten others do. `openGraphBase()` cannot supply it (it does
not know the path).

### N-5 — No regression test binds `app/robots.ts` to the private-path source · **P1 (test gap)**

`getLocalizedPrivateSeoPaths()` is unit-tested, but nothing reads
`app/robots.ts` to prove it still *uses* it. The drift this replaced
(a hand-maintained second array) can silently return.

## 6. Observations recorded, deliberately NOT changed

| Observation | Why not changed |
|---|---|
| `/subjects/<unknown>` returns 200 with `noindex, follow` and *"Nothing here yet"* | Already mitigated at the metadata layer. A subject "slug" is a matching rule over `categories`, not a column, so there is no edge-safe published view to gate against. Fixing it means either a migration or a query the gate's one-table shape cannot express. WARN, not FAIL. |
| 9 `book-<epoch>` subject slugs | Recorded owner decision (migration + 301s). Now higher-stakes than when deferred — they are indexed and sitemap-advertised — so the evidence is recorded, but renaming live URLs is out of scope for this pass (§49). |
| `/publications` is `force-dynamic` | Correct today: it reads `searchParams` for filtering. Revisiting it is a perf task with no SEO symptom — the page renders complete server-side HTML. |
| Author → subject edges absent | Would need a per-author subject aggregation; the brief forbids new N+1 queries and the author's works already link to subject-bearing detail pages. P2 enhancement, not a defect. |
| Listing pages emit no `robots` meta when unfiltered | Deliberate (`robots: … : undefined`). Absent = indexable. The admin kill switch still reaches them through `robots.txt` (`Disallow: /`) and an empty sitemap. |

## 7. Security / permission surfaces (unchanged, verified)

| Surface | Result |
|---|---|
| `/admin`, `/dashboard`, `/profile`, `/km/dashboard` | 307 to auth, `X-Robots-Tag: noindex, nofollow` |
| `/lists` | 404, `noindex, nofollow` |
| `/auth/login`, `/api/health` | 200, `noindex, nofollow` |
| Invalid slugs (books, authors, theses, publications, posts, catalogs) | real 404 |
| `book_files.file_url` exposure | not in scope of this pass; no change made |

## 8. Scope for the implementation stage

Fix, in order: **N-1**, **N-2**, **N-3**, **N-4**, **N-5**.
Defer with documented reasoning: **F-10**, `/subjects` soft-404 status code,
author→subject edges.

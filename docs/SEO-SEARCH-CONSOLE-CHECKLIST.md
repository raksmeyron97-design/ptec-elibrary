# Search Console Checklist — PTEC e-Library

**Property:** `https://library.ptec.edu.kh`
**Written:** 2026-09-09, alongside `docs/SEO-PRODUCTION-PASS-VERIFICATION.md`

> **Mostly NOT VERIFIED.** This is an instruction list, not a results list. The
> audit that wrote it had no Search Console access and makes no claim about
> indexing, impressions or coverage — do not restate anything here as a finding.
>
> **One exception, 2026-09-10:** a Live Inspection WAS run after the robots.txt
> fix (#166) and reported *URL is available to Google*, with **Breadcrumbs** and
> **ProfilePage** valid. That is a real result. Everything else remains a to-do.

---

## 0. Before you start

Two things shipped in this pass change what Search Console will report, and
both need a re-crawl before the old signals disappear:

| Change | What GSC showed before | What to expect after |
|---|---|---|
| **`Disallow: /auth` no longer blocks `/authors`** (#166) | the author hub + **157 profiles** reported *Blocked by robots.txt* | crawlable; **verified 2026-09-10** — see the banner above |
| `/paths/<unknown>` now 404s at the edge | arbitrary `/paths/*` URLs indexable at 200 | "Not found (404)" — correct |
| `/publications`, `/paths` withheld from the sitemap while empty | 2 indexable hubs with no content | dropped from the sitemap; `noindex, follow` on the page |

Neither is an error to "fix" in GSC. Both are the intended new state.

## 1. Property setup

- [ ] Confirm a **Domain property** exists for `ptec.edu.kh`, or at minimum a URL-prefix property for `https://library.ptec.edu.kh/`.
- [ ] Confirm ownership verification is still valid (DNS TXT survives a Cloudflare change; an HTML-file method does not survive a redeploy).
- [ ] Add the librarian(s) who will actually read this as users — an unread property is worse than none.

## 2. Sitemap

- [ ] Submit `https://library.ptec.edu.kh/sitemap.xml` (declared in `robots.txt`).
- [ ] Confirm **Discovered URLs ≈ 476** and status *Success*.
      The count moves with the collection; the *shape* is the check —
      270 books, 157 authors, 23 subjects, 6 catalog items, 1 thesis, 1 post,
      plus hubs and informational pages. Empty collections are deliberately
      absent, so `/publications` and `/paths` will NOT appear until they have
      rows.
- [ ] If a hub you expect is missing, check whether its collection is empty
      before treating it as a bug — that is the designed behaviour.

## 3. robots.txt

- [ ] Open **Settings → robots.txt** and confirm the fetched file matches the app's output.
- [ ] Confirm every private `Disallow` is **anchored** (`/auth$`) or a descendant
      rule (`/auth/`). An unanchored `/auth` is a PREFIX match and blocks
      `/authors` — that shipped, and cost the author hub plus 157 profiles until
      #166. `docs/SEO-PRODUCTION-PASS-VERIFICATION.md` §11 has the detail.
- [ ] Confirm there is **no** Cloudflare-injected `Disallow: /`.
      This was a real, shipped incident (`docs/…cloudflare-robots-override`) and
      the symptom is unmistakable: a uniform Lighthouse/SEO score across every
      URL with zero variance means one site-wide rule, not per-page content.
      Cleared as of 2026-09-09; re-check after any Cloudflare AI Crawl Control change.

## 4. URL Inspection — run these specific URLs

Inspect **live**, not just the index cache. For each: crawl allowed, indexing
allowed, canonical matches, and the rendered HTML carries the expected title/H1.

| # | URL | Expect |
|---|---|---|
| 1 | `/` | indexable; canonical `https://library.ptec.edu.kh` |
| 2 | `/km` | indexable; canonical `…/km`; `lang="km"` |
| 3 | `/books` | indexable; CollectionPage |
| 4 | `/subjects` | indexable; 23 crawlable subject links |
| 5 | `/km/subjects` | indexable; Khmer title, H1 and breadcrumbs |
| 6 | `/authors` | indexable; CollectionPage |
| 7 | one English book detail | Book JSON-LD; real ISBN/author/`datePublished` |
| 8 | one Khmer-slugged book detail | 200, not a soft-404 (percent-encoded slug) |
| 9 | one populated subject, e.g. `/subjects/អប់រំ` | indexable; breadcrumb → `/subjects` |
| 10 | one Khmer author, e.g. `/authors/សិត-សេង` | 200; ProfilePage; breadcrumb → `/authors` |
| 11 | the single thesis detail | ScholarlyArticle |
| 12 | the single post detail | Article/Event |
| 13 | `/paths/anything-invalid` | **404** (was 200 before this pass) |
| 14 | `/search?q=test` | *Excluded by ‘noindex’ tag* — this is correct |
| 15 | `/admin`, `/dashboard` | *Excluded by ‘noindex’ tag* — correct |

## 5. Indexing report — what each bucket should mean here

- [ ] **Excluded by ‘noindex’ tag** — expect `/search`, `/admin`, `/auth`, `/dashboard`, `/profile`, `/lists`, filtered listings, out-of-range pages, empty subjects, and (while empty) `/publications` and `/paths`. All intended.
- [ ] **Soft 404** — expect this to *fall* after the `/paths` gate ships. Any remaining entry is worth reading: `/subjects/<unknown>` still answers 200 with `noindex` (documented, deferred), so it may appear here legitimately.
- [ ] **Duplicate, Google chose a different canonical** — should be empty. If not, compare the reported canonical against `localeAlternates()`.
- [ ] **Alternate page with proper canonical tag** — expect the `/km` half of every bilingual pair. Normal, not an error.
- [ ] **Crawled – currently not indexed** — normal for a small collection; not actionable on its own.
- [ ] **Not found (404)** — expect invalid slugs and, newly, invalid `/paths/*`.

## 6. International targeting

- [ ] Check **hreflang** errors: "no return tag" should be zero. Every public page emits reciprocal `en`/`km` plus `x-default` (verified live).
- [ ] Spot-check that a `/km` URL is not being served as the English canonical.

## 7. Enhancements / structured data

- [ ] **Breadcrumbs** — should be valid site-wide; visible breadcrumbs and JSON-LD are generated from the same `breadcrumbSchema()` call.
- [ ] **Books / Articles** — validate a sample in the Rich Results Test. Do not chase "missing recommended field" warnings for data the library does not hold: omitting an unknown ISBN or page count is deliberate.
- [ ] Confirm the `EducationalOrganization` / `Library` / `WebSite` nodes appear **once** per document, declared only by `RootShell`.

## 8. Ongoing monitoring

- [ ] Core Web Vitals — track separately from the post-deploy Lighthouse CI run (`lighthouse.yml`), which uses lab data; GSC uses field data (CrUX) and will lag or stay "insufficient data" at this traffic level. Say so rather than reporting a blank as a pass.
- [ ] Crawl stats — watch for a spike in `/paths/*` 404s right after the gate ships. That is the fix working.
- [ ] Re-check `robots.txt` after any Cloudflare configuration change.

## 9. Things to deliberately NOT do

- Do **not** request indexing for `/publications` or `/paths` while they are empty.
- Do **not** submit `/search` or filtered listing URLs.
- Do **not** "fix" the 9 `book-<epoch>` subject slugs by renaming them in the CMS: those URLs are indexed, and a rename without 301s loses them. That migration is tracked separately.

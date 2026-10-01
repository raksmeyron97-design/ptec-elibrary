# Audit verification — F1 to F16

**Phase 0.5 of the 2026-09-30 SEO programme.** Each finding of the outside-in
audit of 2026-09-30, checked against the code at `622db9d` and against
production on the same day. Phase 0 changed no application code or
configuration: it wrote only `docs/seo/**` and `scripts/seo-*`.

**Evidence labels.** LIVE = a GET against `https://library.ptec.edu.kh` on
2026-09-30, sequential and paced (production answered 502 under six concurrent
requests on 2026-09-24). CODE = file:line at `622db9d`. INFERRED = reasoned from
LIVE and CODE, not observed. UNKNOWN = not established.

**Companion documents.** [`ARCHITECTURE.md`](ARCHITECTURE.md) (0.1),
[`ROUTES.md`](ROUTES.md) (0.2), [`evidence/`](evidence/) (0.3),
[`baseline-2026-09-30.txt`](baseline-2026-09-30.txt) (0.4), and earlier audits
this one builds on, in particular [`SEO-CORPUS-AUDIT-2026-09.md`](SEO-CORPUS-AUDIT-2026-09.md)
("CA", 2026-09-23).

---

## 1. Verdicts

| ID | Audit priority | Status | One-line evidence | Proposed fix (phase) | Effort | Risk |
|---|---|---|---|---|---|---|
| F1 | High | **Not reproduced** | 40/40 sequential `/books` requests (2 UAs, SIN and HKG POPs) returned 1,956 and the current footer; `private, no-store` + `cf-cache-status: DYNAMIC`; no layer in the stack can hold HTML for weeks | Instrument rather than re-architect: a build-fingerprint header, `data-results-total`, a parity check, and two box-side checks (1) | S | Low |
| F2 | High | **Partly** | Every page has exactly one H1 in the server HTML, but on 52/52 indexable URLs it sits inside a hidden streaming container (`<div hidden id="S:n">`); the footer has six `<h2>` on every page; subject hubs have a Khmer-only English title, counts-only description, no intro, and 12 books with no pagination | Footer labels (1); lift the H1 and intro out of the streamed boundary (1, **D9**); subject hub content and pagination (2) | M | Medium |
| F3 | High | **Confirmed** | Khmer book descriptions share one template and are cut at 157 characters with "..."; `citation_publication_date = 2026-01-01`; bare `រលក · PTEC Library` titles | Stop the year default (1, **D11**); title pattern (2); description tooling (5) | M–L | Medium |
| F4 | High | **Confirmed, details changed** | Every `citation_pdf_url` (books, theses, articles) is under robots-blocked `/api/` and outside the abstract's directory (books and theses also answer 401 anonymously); the thesis now emits 8 `citation_author` tags, but they mix the cohort label and advisors with the authors; `inLanguage: "en"` for a Khmer work; thesis/post cards ARE real links | Phase 3 (research model, tags, full-text route outside `/api/`) | L | Medium |
| F5 | High | **Partly (mostly not reproduced)** | Head hreflang `en`/`km`/`x-default` present and reciprocal on 51/51 indexable URLs; `<html lang>` right on 60/60; the sitemap lacks `x-default`; descriptions are the same in both locales (by design: record text is monolingual); noindex pages still carry hreflang | Sitemap `x-default` and no hreflang on noindex pages (1); D1 unchanged | S | Low |
| F6 | Medium | **Confirmed** (coverage verified) | One `urlset` of 2,395 URLs; 1 placeholder `lastmod` (the thesis); 51 without `lastmod`; no `x-default`; 1,851 `<loc>` in raw Unicode while canonicals are percent-encoded; book count = `/books` total (1,956) | Sitemap index per type, encoded `<loc>`, `x-default`, real `lastmod`, count script (1) | M | Low |
| F7 | Medium | **Confirmed** | 10 of 60 descriptions end in `...`/`…`, cut mid-word; the article `<title>` is cut to 60 characters + "…"; at least eight private truncation helpers, none grapheme-aware | One `Intl.Segmenter` helper (1) | M | Low |
| F8 | Medium | **Confirmed** | `/authors/a-michael-huberman`: 1 work, `index, follow`, in the sitemap; about 287 of 408 listed authors have one work | Threshold (2, **D2**) | S | Medium |
| F9 | Medium | **Confirmed** | `og:type=article` on 5/5 book URLs; `YYYY-01-01` dates; catalogue title `"Teacher Noticing : …"` + raw inverted name + English "by"; 22/22 `/km` titles end in "PTEC Library" | `og:type=book`, date precision, Khmer brand, catalogue punctuation, name CSV (1) | M | Low |
| F10 | Medium | **Partly** | JSON-LD exists, parses and has no empty values on 60/60 URLs; gaps vs the Phase 4 target: `SearchAction` 60/60, 2–4 blocks on 49/60, `EducationalOrganization` not `CollegeOrUniversity`, no `Thesis` type, English names/URLs on `/km` | Phase 4 | M | Low |
| F11 | Medium | **Confirmed** (content) | 1 thesis, 1 article, 2 posts; `/theses`, `/theses/summary`, `/posts` have no empty-state gate | Phase 3.8 | S | Low |
| F12 | Low | **Confirmed, extended** | Catalogue records are `noindex, follow` and absent from the sitemap (protect); `llms.txt` links 8 of them and says "The English URL is canonical" (false); no digital-twin link exists | Phase 2.7 + 7.3 | S | Low |
| F13 | Low | **Partly** | `sort`/`view`/filter URLs are `noindex, follow` + canonical to the base list on every listing except `/paths`, whose filtered views are `index` | `/paths` filters noindex (1); D6 unchanged | S | Low |
| F14 | Low | **Partly** | "Deposit your thesis"/"Request a book" are `<h3>` on the cards and `<h2>` inside a closed `<dialog>` in the server HTML; the empty `alt` on the emblem and the partner logo are deliberate (decorative, inside `aria-hidden`) | Lazy-render the dialog body or demote its heading (1) | S | Low |
| F15 | Unknown | **Not measured** (Phase 6) | Known: book and article detail pages render per request; production 502s under light concurrency | Phase 6 | M | Medium |
| F16 | Low | **Confirmed** | The thesis URL is 953 characters percent-encoded; 320 sitemap URLs exceed 500; `unicodeSlug()` has no cap | Cap new slugs (2, D8) | S | Low |

**New findings** (N1–N7) are in §3. The **baseline** (§4) shows 0 phase-0
failures: everything the master prompt's §3 says works does work in
production today.

---

## 2. Findings in detail

### F1 — Stale `/books` (intermittent) · **Not reproduced**

**What was measured (LIVE).** `scripts/seo-live-checks.sh`, output in
`evidence/live-checks-2026-09-30.txt`:

- 20 sequential GETs of `/books` with `Mozilla/5.0` and 20 with a Googlebot UA,
  0.5 s apart, spread across Cloudflare's SIN and HKG POPs. All 40 returned
  "of 1,956", the current footer ("Get help"), `cache-control: private,
  no-cache, no-store, max-age=0, must-revalidate` and `cf-cache-status: DYNAMIC`.
  Cloudflare did not challenge the spoofed Googlebot UA.
- `/books`, `/books?page=1`, `/km/books` and `/km/books?page=1` all report 1,956.
  `seo-check totals-parity` passes.

**Dating the stale copy.** The footer it showed ("Explore", "Help and
Information", "Visit PTEC") was replaced on 2026-09-12 (`936691b`, #176). Its
count of 215 books predates the 2026-09-06 self-hosting cutover: the Supabase
Cloud snapshot frozen at the cutover already held 270. So the copy was **at
least 24 days old**, and built by an older deployment against an older
database.

**Every layer in our path, ruled out** (details in `ARCHITECTURE.md` §7):

| Layer | Why it cannot be the source |
|---|---|
| Cloudflare edge | `DYNAMIC` on every HTML response, including `s-maxage` ISR pages: no cache rule stores HTML |
| Origin (Next) | `/books` has never exported `revalidate` (git history) and is rendered per request; the container is `read_only`, `.next/cache` is a tmpfs, and each deploy is a fresh image |
| Service worker | navigation cache: 24 h max age, 16 entries (`app/sw.ts:194-207`); not in a crawler's or `curl`'s path |
| Cloudflare Always Online | serves Wayback Machine copies; the Wayback Machine holds **no** snapshot of `/books` |
| Vercel | still builds Production deployments on every merge, but `ptec-elibrary.vercel.app` 308s to the canonical host and per-deployment URLs require Vercel SSO |

**Root cause: UNKNOWN.** Two hypotheses remain, and each has a check.

- **(A) A cache in the auditor's own fetch path**, keyed by exact URL. This
  fits the pattern: only the bare `/books`, the URL a previous session was most
  likely to have fetched, was stale; `/books?page=1` and `/km/books` were fresh,
  and later re-checks were fresh. Check: ask for the stale response's raw
  headers. Ours carry `cf-ray`, `date` and `cf-cache-status`, and a copy without
  them never came from this origin.
- **(B) A second origin behind the same hostname**, i.e. an old container or a
  second tunnel connector serving an old build against the frozen Cloud
  database. Check (box and Cloudflare dashboard, `RUNBOOK.md`): list the
  tunnel's connectors, and list the running containers from the app image.

**Proposed fix (Phase 1.1, revised).** There is no cache to re-architect. The
listing data is already cached by tag (`unstable_cache` in `lib/books-data.ts`,
revalidated by `lib/cache/revalidate.ts`). Instead:

1. Add a build-fingerprint response header (for example `x-ptec-build:
   <sha>`) so any future stale response can be attributed in one request. Today
   nothing identifies a build from outside.
2. Add `data-results-total` to the listing count (the harness already prefers
   it over text parsing).
3. `seo-check` keeps asserting parity across the three variants and on every run.

### F2 — Hubs lack an H1 and copy · **Partly**

- **"No `<h1>` in the server HTML": not reproduced.** Every template measured
  has exactly one non-empty H1 in the document (LIVE `h1-single` 52/52
  indexable URLs; component per template in `ROUTES.md`).
- **The actual defect: the H1 is hidden until JavaScript runs.** On all 52
  indexable URLs in the final baseline the H1, and the whole page body with it, arrives inside
  `<div hidden id="S:n">` and is swapped in by an inline `$RC` script. The
  first-painted HTML is the `loading.tsx` skeleton plus the footer, whose six
  `<h2>` are the only headings a non-rendering reader sees (measured on `/books`:
  headings outside the hidden container = footer `h2` × 6). Google renders and
  sees the H1. The auditor's HTML-to-text conversion did not, and neither do
  most AI crawlers. Root cause: every public route has a `loading.tsx` (a
  documented design choice), and pages await their data, so Next streams the
  body behind that Suspense boundary. `htmlLimitedBots: /.*/`
  (`next.config.ts:69`) makes only the *metadata* blocking. One more
  observation for Phase 1: an earlier sample of `/about/rules` (10:27 UTC)
  had its H1 inline, and every sample after a runtime ISR regeneration had it
  hidden. So a build-time prerender may inline resolved content where a
  runtime regeneration streams it (INFERRED, two samples). Phase 1 settles this
  before choosing the D9 fix.
- **Header brand is an `<h2>`: not reproduced.** It is a `<span>` in a link
  (`components/layout/Navbar.tsx:168-169`). The audit saw the **footer** brand,
  which is an `<h2>` (`components/layout/Footer.tsx:259`).
- **Footer column titles are `<h2>`: confirmed** (`Footer.tsx:91`).
- **Subject pages: confirmed.** The English title is the Khmer name only
  (`categories.name`, the only name column; `messages/en.json` `metaTitle` =
  `"{subject}"`, used at `subjects/[slug]/page.tsx:79`). The description is
  counts only (69 characters on `/subjects/គណិតវិទ្យា`). The intro is one static
  sentence. There is no pagination: `ITEMS_PER_TYPE = 12`
  (`lib/subjects/index.ts:126`), so the Mathematics hub links 12 of its ~440
  books, and "Browse all" links to the **unfiltered** `/books`
  (`subjects/[slug]/page.tsx:46-51, 345`).

**Proposed fix.** Phase 1.2: footer titles become non-heading labels with
`aria-labelledby`. Phase 1.2, per **D9**: render each page's header (H1 +
intro) outside the streamed boundary, measured on CLS. Phase 2.1: subject hub
name, intro and pagination (needs a migration; see **D14**).

### F3 — Templated Khmer record metadata · **Confirmed**

- **Descriptions: data.** CA measured 1,483 of 1,956 book descriptions as
  fill-in-the-blank templates (62 templates; one carries 1,043 books). They come
  from the bulk-import CSV `summary` column, copied verbatim
  (`BulkUploadForm.tsx:320` → `books/actions.ts:397, 552`). No generator for the
  template exists in the repo. The meta description then cuts them at 157 UTF-16
  code units + "..." (`lib/seo/book-seo.ts:107-153`). LIVE on `/books/រលក`:
  "…ការពិសោធន៍ និងក...".
- **`citation_keywords`: data.** `books.tags` joined with "; "
  (`lib/seo/citation.ts:120-121`), from the CSV `keywords` column.
- **`citation_publication_date = 2026-01-01`: a code defect.** `validatedYear()`
  returns the **current year when the year is blank**
  (`app/(admin)/admin/(protected)/books/actions.ts:41-52`), and every write
  stores `${year}-01-01` (`:558, :958`). The meta emits the raw date
  (`citation.ts:117`), which also feeds JSON-LD `datePublished` and
  `article:published_time`. The same defect was hand-repaired for 62 books in
  July (`scripts/fix-metadata-2026-07-11.mjs:117-119`); the September bulk
  import recreated it at scale. LIVE: `2026-01-01` on both Khmer sample books;
  `2016-01-01` on the English one.
- **Titles: confirmed.** `seo_title ‖ title` + the site suffix
  (`book-seo.ts:199-201`); LIVE `រលក · PTEC Library` (18 graphemes).

**Proposed fix.** Phase 1.7: stop defaulting a blank year and store date
precision (**D11**). Phase 2.4: title pattern. Phase 5: the description audit
and review queue; drafts never auto-publish.

### F4 — Research tagging and Google Scholar · **Confirmed; the details changed since the audit**

The thesis page was redesigned on 2026-09-29 (#276) and became cached on
2026-09-30 (#282), so part of the audit describes the old page.

| Claim | LIVE now | Code |
|---|---|---|
| `citation_author` holds 1 of 8 names | **8 tags now**, but the first is the cohort label "គរុនិស្សិត ១២+៤ ជំនាន់ទី២", and advisors are listed as authors | names joined then re-split (`theses/[slug]/page.tsx:76-79` → `citation.ts:141-163`); advisors not filtered by role (`lib/resources/contributor-view.ts:467-469`; `authorRoleContributors` exists and is unused here) |
| Language shows English for a Khmer work | JSON-LD `inLanguage: "en"`; the facts grid reads "Language English"; no `citation_language` on theses | **data**: `research_reports.language` |
| `citation_publication_date = 2023/01/01` | confirmed; also the sitemap `lastmod` `2023-01-01T00:00:00+00:00` | `formatScholarDate` forces day precision (`citation.ts:26-40`) |
| The page shows a sign-in notice | the abstract **is** visible without signing in (57 words); the access panel asks for sign-in only for the full text. The abstract reads like one study's abstract, not the compilation's | needs librarian review |
| `citation_pdf_url` → `/api/…`; `/api/` disallowed | **confirmed for all three types**: books `/api/books/{uuid}/file` (401 anonymous), thesis `/api/theses/{uuid}/file` (401), article `/api/publications/{slug}/file` (200 PDF anonymous). All three are robots-blocked, carry `X-Robots-Tag: noindex, nofollow` from middleware, and are outside the abstract page's directory | `citation.ts:111-113, 154, 174`; `lib/seo/indexing.ts:128-137`; `middleware.ts:164-178`. The thesis and article tags are emitted without checking the file exists |
| Thesis/post cards have no `<a href>` | **not reproduced**: real links everywhere (`ThesisListItem.tsx:106-111`, `PostCard.tsx:56`, …); `seo-check card-links` passes on all listings | — |
| Later cohorts are filed under `/books`; research lives on the old Google Site | not verifiable from code | librarian list (Phase 3.6) |

**Proposed fix.** Phase 3: author and advisor roles from the contributor graph,
never the cohort label; language from librarian-checked data; a full-text route
outside `/api/` for `open` items only (**D4**, **D12**); remove
`citation_pdf_url` wherever the file needs a sign-in. Scholar impact stays small
until the migration list (3.6) brings more research in: production publishes
1 thesis and 1 article.

### F5 — Language duplicates · **Partly**

- **Head hreflang: not reproduced.** Every indexable URL measured carries
  `<link rel="alternate" hrefLang>` for `en`, `km` and `x-default` (= en), and
  every target answers 200, is indexable and links back (LIVE 51/51). The
  audit's grep was almost certainly case-sensitive: React writes `hrefLang`, and
  the master prompt's own §7 command returned `hreflang=[]` for the same reason
  (annotated in the evidence file).
- **`<html lang>`: correct** (60/60).
- **Sitemap has no `x-default`: confirmed** (`app/sitemap.ts:24-31`; deliberate
  per `lib/seo/validate.ts:149-150`).
- **Same description in both locales: confirmed, by design.** A record's text is
  monolingual (one `books.description` column), and only the fallback sentence
  is localised. This is **D1**.
- **Also found**: six noindex URLs (filtered listings, out-of-range pages,
  search, reader, catalogue record) still carry hreflang. Phase 1.4 removes it.

### F6 — Sitemap hygiene · **Confirmed**

LIVE: one `<urlset>`, 2,395 URLs, 1.43 MB (limits fine). Sections: books 1,957,
authors 362, subjects 31, about 19, paths 10, journals 5, theses 3, posts 3,
singles 6.

- **Placeholder `lastmod`**: exactly one, the thesis
  (`2023-01-01T00:00:00+00:00`), because theses take `published_at`, an academic
  date, before `updated_at`, which is not even selected (`app/sitemap.ts:299-305`).
  51 entries omit `lastmod` (subjects and a few statics), which is correct when
  unknown.
- **No `x-default`**: 2,395 of 2,395.
- **Encoding**: 1,851 `<loc>` carry raw Khmer while canonicals are
  percent-encoded. Next writes sitemap strings verbatim and resolves metadata
  URLs through `new URL()`. Sampled pages: 9 of 29 `<loc>` differ in bytes from
  the page canonical (the same URL after normalisation).
- **Coverage: verified.** 1,956 book records = the `/books` total; every `<loc>`
  is on-site, unique, query-free and robots-allowed; 29 sampled URLs (3 per
  section) answer 200, are indexable and self-canonical, and their sitemap
  alternates equal the page's hreflang.

**Proposed fix.** Phase 1.5 as specified (index + children per type, encoded
`<loc>`, `x-default`, thesis `lastmod` from `updated_at`, per-type count script).

### F7 — Truncation · **Confirmed**

LIVE: descriptions end in "..." or "…" on 10 of 60 URLs ("…analysis and wr...",
"…polypyrrole (Pp...", "…និងក...", "…Action Rese…"). The article `<title>` is
"Development of a Handmade Conductivity Measurement Device… · PTEC Library".
CODE: at least eight private helpers, all cutting at a fixed count of UTF-16
code units (so they can split a Khmer cluster), none using `Intl.Segmenter`:
`book-seo.ts:107-115` (also reused as the JSON-LD `description`, `:305`),
`thesis-seo.ts:131-139`, `publication-seo.ts:115-135` (60-character title
clamp), `journal-seo.ts:29, 82-84`, `catalogs/[slug]/page.tsx:133-137`,
`posts/[slug]/page.tsx:135-139`, `authors/[slug]/page.tsx:42-45`,
`subjects/[slug]/page.tsx:54-57`, `lib/team/public.ts:185-189`. Separately,
`/paths/[slug]` has **no** cap (259 and 329 characters).

**Proposed fix.** Phase 1.6: one tested helper, grapheme-safe, ending on a
sentence or word boundary, no ellipsis in meta descriptions; titles never cut
the item name.

### F8 — Thin author pages indexed · **Confirmed**

LIVE: `/authors/a-michael-huberman` has 1 work, about 50 words, `index, follow`,
and is in the sitemap. CODE: noindex only for composite bylines, unidentified
names and zero works (`authors/[slug]/page.tsx:96-126`); the sitemap requires
`workCount > 0 && identified` (`lib/authors/sitemap-filter.ts`). Scale (LIVE,
parsed from the `/authors` hub): about 287 of 408 listed authors have 1 work,
24 have 2 and 49 have 3 or more. The sitemap carries 362 author URLs. CA
recorded the same finding (F-A4) as "do not fix yet". **D2** decides it.

### F9 — Metadata details · **Confirmed**

- `og:type=article` on every book URL (5/5 LIVE; `book-seo.ts:217`). The
  catalogue uses `book` but emits no `book:*` properties.
- Year-only dates padded: `2016-01-01`, `2026-01-01` (books), `2023/01/01`
  (thesis). See F3.
- Catalogue title `"Teacher Noticing : Bridging and Broadening … "` keeps ISBD
  ` : ` and uses the raw inverted author with an English "by"
  (`catalogs/[slug]/page.tsx:131`). Neither importer tidies the punctuation.
- **22 of 22** `/km` titles end in the Latin "PTEC Library". There is one title
  template for both locales (`app/[locale]/layout.tsx:27-30`), although the
  Khmer brand is already in settings (`libraryName.km`, `defaults.ts:33-36`).
  `og:site_name` is English on `/km` as well.

**Proposed fix.** Phase 1.7 as specified. Names are not auto-inverted;
`name-cleanup.csv` goes to the librarians.

### F10 — Structured data · **Partly**

Validated in the harness rather than assumed: every `ld+json` block on 60/60
URLs parses, the template's expected types are present, and no node carries a
null, blank or `"undefined"` value. The serializer escapes `<`
(`components/seo/JsonLd.tsx:20`). Gaps against the Phase 4 target:
`SearchAction` on 60/60; 2–4 blocks on 49/60 (the site graph is a separate block
in `<body>`); `EducationalOrganization` instead of `CollegeOrUniversity`; the
thesis is a `ScholarlyArticle`; `FAQPage` on `/`, `/policy` and articles with
FAQs; English breadcrumb names on `/km` About pages; English `url`s in the
catalogue `Book` and post `NewsArticle` on `/km`; missing `@id`s on several
breadcrumb and profile nodes. **Phase 4.**

### F11 — Empty hubs · **Confirmed (content)**

1 thesis, 1 article, 2 posts. Also: `/theses`, `/theses/summary` and `/posts`
have no empty-state noindex gate (only `/journals` has one). **Phase 3.8.**

### F12 — Catalogue records · **Confirmed, and `llms.txt` is wrong in three places**

Catalogue records are `noindex, follow` (`lib/catalogs/indexability.ts:102-152`)
and absent from the sitemap (LIVE: only the `/catalogs` hub). Keep that.
`llms.txt` (`app/llms.txt/route.ts`, last changed 2026-09-20, before the
catalogue gate in #231):

1. It links the 8 newest catalogue records, all `noindex`.
2. It says "The English URL is canonical; the Khmer URL carries the…" — false,
   because `/km` pages self-canonicalise.
3. It says licence information is in the structured data
   (`license` + `isAccessibleForFree`), but no `Book` or thesis node emits
   `license`.

No digital-twin link exists: `digitalBookSlug` is never populated, and there is
no shared key between the catalogues (`CLAUDE.md`). **Phase 2.7 + 7.3.**

### F13 — Facet crawl · **Partly**

Every listing that uses `buildListingMetadata` is `noindex, follow` on its
filters with a canonical to the base list (LIVE on `/books`, `/km/books`).
`/paths` does not: `/paths?level=grade-1&sort=title` is `index, follow` with
canonical `/paths`, because its metadata never sees `searchParams`
(`lib/seo/learning-path-seo.ts:141-174`). Crawl waste is unmeasured (needs
Search Console). **D6** stands. `/paths` filters get noindex in Phase 1.

### F14 — Headings and alt · **Partly**

- The duplicate headings are real: `<h3>` on the two cards
  (`components/ui/home/GrowTheCollection.tsx:89-91, 110-112`) and `<h2>` inside
  `ContributeDialog`, a native `<dialog>` that is in the server HTML while closed.
- The empty `alt`s are deliberate and conform to WCAG. The boot emblem
  (`components/pwa/PTECBootScreen.tsx:203`, rationale `:194-196`) is decorative,
  and the partner thumbnail `/sva.jpg` sits inside an `aria-hidden` span next to
  its text label (`DigitalLibraryDropdown.tsx:75-91`). The same pattern holds for
  cover images on cards, whose link text names the book. Record pages carry
  descriptive cover `alt` ("Book cover: រលក by លឹង ថុល"), which is the §3
  protect item, and it holds.

**Proposed fix.** Phase 1.8: render the dialog body lazily, or give its title a
non-heading element.

### F15 — Performance · **Not measured in Phase 0**

Facts that shape Phase 6. Book and article detail pages are dynamic per request
(session reads inside streamed sections, and no `generateStaticParams` on the
article). The six other detail routes became ISR on 2026-09-30 (#284). Listing
HTML is large (CA: `/books?page=N` median 526 KB uncompressed; `/authors`
1.27 MB). Production answered 502 under six concurrent requests on 2026-09-24.
Google throttles its crawl rate after 5xx responses, so this is a crawl-capacity
risk as well as a user one.

### F16 — Very long slugs · **Confirmed**

`unicodeSlug()` has no length cap (`lib/slug.ts:46-56`; books, theses and posts
use it); catalogue slugs are capped at 100 characters (`lib/catalog.ts:501-503`).
LIVE: the thesis URL is 118 characters raw, 320 bytes UTF-8, and **953
characters** percent-encoded. Among sitemap URLs, the percent-encoded median is
250 characters, 320 exceed 500 and the maximum is 1,219.
`scripts/seo/rename-khmer-book-slugs.mjs` makes slugs longer (it replaced
`book-<epoch>` slugs with full titles); it is not the cause. **D8.**

---

## 3. New findings (not in the audit)

| ID | Priority | Finding | Evidence | Phase |
|---|---|---|---|---|
| N1 | Medium | `/~offline` (the PWA offline shell) is **indexable**: `index, follow`, no canonical, no hreflang, bare title "PTEC Library", `s-maxage=86400` | LIVE; layout default robots (`app/root-metadata.ts`) | 1 |
| N2 | Medium | **English on Khmer pages.** `/km/theses/summary` title and description are hard-coded English. `/about` has a hard-coded Khmer title on the English URL, with the brand twice ("… — PTEC e-Library · PTEC Library"). Catalogue titles use English "by". The reader suffix " — Read online" is English. The About breadcrumb JSON-LD uses English names. `og:locale=en_US` on `/km/search`. The article H1 is always English, while its `/km` `<title>` is Khmer | LIVE + CODE (ROUTES.md) | 1–2 |
| N3 | Medium | **A book with no year is stored as the current year**, and the tags publish it (`validatedYear()`, F3). A code defect that recreates bad data on every import | CODE `books/actions.ts:41-52` | 1 (D11) |
| N4 | Low | `/paths` filtered views are indexable (F13) | LIVE | 1 |
| N5 | Low | `<title>` and H1 disagree on hubs ("Authors — People Behind the Collection" / "People & organizations behind the collection"; "Teacher Learning Paths" / "Learn with purpose, not just search") | LIVE | 2 |
| N6 | Info | ISR pages are served `stale-while-revalidate=~1 year`. Harmless while Cloudflare stores no HTML; **if a Cloudflare HTML cache rule is ever added, it would serve year-old pages under SWR.** Put the rule's TTLs in the runbook before anyone adds one | LIVE headers | 7 (runbook) |
| N7 | Info | Production ISR is probably **memory-only**: the container's root filesystem is read-only and `FileSystemCache` writes pages under `.next/server/app`. Every restart re-renders from the build-time prerender | INFERRED (`docker-compose.yml:44-51`); confirm in the box log | 6 |

---

## 4. The check harness (0.4)

`scripts/seo-check.ts` implements the master prompt's §6 with a real HTML parser
(jsdom, already installed) and no browser:

```sh
npx tsx scripts/seo-check.ts --base http://localhost:3100            # a local production build
npx tsx scripts/seo-check.ts --base http://localhost:3100 --phase 1  # gate phases 0..1
npx tsx scripts/seo-check.ts --base https://library.ptec.edu.kh      # production: baselines only
npx tsx scripts/seo-check.ts --base <url> --json out.json --sitemap-sample 3 --inventory
```

- **Every check carries the phase that makes it true.** Phase 0 is what already
  works (§3 of the master prompt); `--phase N` gates phases 0..N and reports
  later ones as `todo`. Content-length checks are `warn` and never fail a run.
  `unknown` (no answer) is never counted as a pass or a failure
  (`lib/verify/http.ts` vocabulary).
- **Production-safe by construction**: sequential, 400 ms between requests
  (500 ms for the baseline), aborts on the second 5xx.
- **URL list**: `scripts/seo-urls.json`, 69 URLs covering one or more per
  template in both locales, percent-encoded Khmer slugs, 5 missing-slug probes
  and 4 redirect probes. Plus 3 sitemap samples per section and every hreflang
  target.
- **Negative controls**: `scripts/seo-check.test.ts` (16 tests) pins the
  robots.txt semantics (prefix match, `$`, `*`, longest match, Allow on tie,
  per-agent groups) and the lastmod/ellipsis/total parsers, each beside the case
  it must refuse. Switching the matcher to first-match fails 3 of them. Live: a
  URL list with deliberately wrong expectations produced 8 errors and exit 1.

**Baseline, production, 2026-09-30** (`baseline-2026-09-30.txt`):
104 requests, 0 5xx, 80 s.

| Phase | Failing checks | What they are |
|---|---:|---|
| 0 — protect | **0** | canonicals, robots, hreflang (set + reciprocal), `<html lang>`, one H1, JSON-LD parses and types, Scholar required tags, `og:url`, card links, robots.txt (protected set, AI group, public allowed), `llms.txt`, sitemap fetch/limits/locs/lastmod format, book count = listing, sampled sitemap URLs, `/books` totals parity, 404s, redirects |
| 1 | 176 | footer headings (59), H1 hidden without JS (52), `/km` brand (22), description ellipses (10), sampled `<loc>` bytes (9), hreflang on noindex (6), titles cut/mismatched (6), `og:type` book (5), sitemap index/encoding/`x-default`/placeholder (4), `data-results-total` (2), `/~offline` robots (1) |
| 2 | 1 | thin author indexed (F8) |
| 3 | 11 | `citation_pdf_url` (7), citation locale (4) |
| 4 | 167 | `SearchAction` (60), target types (58), single `@graph` block (49) |

---

## 5. Plan for Phases 1–7

Scope changes against the master prompt are in **bold**.

**Phase 1: quick technical fixes** (branch `seo/phase-1-quick-fixes`)
- 1.1 F1: **instrument, don't re-architect**: build-fingerprint header,
  `data-results-total`, parity check; box-side checks in `RUNBOOK.md`.
- 1.2 F2: footer titles become labels; **H1 + intro rendered outside the
  streamed boundary, per D9** (the larger piece; measured on CLS/LCP).
- 1.3 F4 links: **nothing to do**: cards are already links; `card-links` stays
  a phase-0 assertion.
- 1.4 F5: head hreflang already correct; **remove hreflang from noindex pages**;
  `<html lang>` already correct.
- 1.5 F6: sitemap index per type, encoded `<loc>`, `x-default`, **thesis
  `lastmod` from `updated_at`**, per-type count script (read-only).
- 1.6 F7: one grapheme-safe truncation helper replacing **eight** private ones.
- 1.7 F9: `og:type=book` + `book:*` when known; **stop the blank-year default
  (D11)**; Khmer brand from the existing `libraryName.km` setting; catalogue ` : `
  normalisation; `docs/seo/name-cleanup.csv`.
- 1.8 F14: dialog heading.
- **Added:** N1 `/~offline` noindex; N4 `/paths` filters noindex; the smaller
  N2 English-on-`/km` strings (theses index, About title, catalogue "by",
  reader suffix, breadcrumb names).
- **Added:** `scripts/seo-urls.local.json` for the seeded local stack. A local
  production build reads `http://127.0.0.1:54331` (`.env.local`), where
  production slugs 404, so phase exits need their own URL list (**D13**).

**Phase 2: hubs, titles, internal links.** As specified. Subject hubs need a
data home for `name_en`/`intro_*` (**D14**, a migration). Pagination
(`/subjects/{slug}?page=N`) replaces today's 12-per-type cap and the unfiltered
"Browse all". Author threshold per D2 (the sitemap goes from 362 author URLs
to about 49 at 3 works). Catalogue ↔ digital linking has no key today, so ISBN
or normalised title + author matching is new work. N5 title/H1 alignment.

**Phase 3: research and Scholar.** As specified, plus the thesis-specific
defects above (cohort label and advisors in `citation_author`, the
`language = en` data value, the abstract that needs review). Full text outside
`/api/` only for `open` items (**D4, D12**). Honest scale: 1 thesis and
1 article today; the value arrives with the 3.6 migration list.

**Phase 4: structured data.** One `@graph` per page, merging the site graph
(today a separate `<body>` block); `CollegeOrUniversity`; drop `SearchAction`;
`Thesis`; localised names and URLs on `/km`; `@id` everywhere; a snapshot test
per template. Existing `FAQPage` per **D10**.

**Phase 5: content quality tooling.** As specified. CA's template-clustering
method (1,483 / 62 templates) is the starting point for `description-quality`.
D3 and D7.

**Phase 6: performance.** As specified. **Likely first target: make book and
article detail pages ISR** like #284 did for six routes (they render per request
today), and confirm N7.

**Phase 7: monitoring and handover.** **`seo-check` in CI runs against the e2e
job's local build with the local URL list.** Vercel previews are behind SSO and
production is not a CI target. Publish hooks mostly exist
(`lib/cache/revalidate.ts`); verify coverage per type. `llms.txt` fixes (F12).
Runbook, `CLAUDE.md` invariants.

---

## 6. Decisions needed

| ID | Question | Recommendation |
|---|---|---|
| D1 | Single-language records: keep both locales indexable with hreflang, or canonicalise to the book's language? | **Keep both (default).** The chrome differs per locale and the hreflang pairs are clean. Revisit after 4–6 weeks of Search Console data |
| D2 | Author threshold | **noindex below 3 works without an approved bio (default)**, knowing it takes about 313 of 362 author URLs out of the sitemap. Organisations clear it easily (MoEYS, UNESCO, OECD). Page rule and sitemap filter change together |
| D3 | Indexing gate for records with no file and a templated description | **Default on, after librarian sign-off**, and only after Phase 5.1 has counted how many books it would remove |
| D4 | Public full text for theses and reports | **Restricted by default (default)**; `open` only with a recorded licence and consent |
| D5 | Anonymous preview of first pages | **Design and measurement plan only (default)** |
| D6 | Block `sort`/`view` in robots.txt | **No (default).** They are already `noindex` + canonical, and blocking them would hide that signal. Never block `page` |
| D7 | LLM-assisted description drafts | **Off (default)**; cost estimate first |
| D8 | Existing very long slugs | **Leave them (default)**; cap new slugs only. 320 URLs exceed 500 characters, but renaming ~1,850 Khmer URLs costs redirects and ranking churn |
| **D9** (new) | How to make the H1 and intro visible without JavaScript (F2) | **Render each page's header outside the Suspense boundary**: remove the route-level `loading.tsx` from ISR routes, where a cached page has no loading state worth showing, and wrap only the data sections in inner `<Suspense>` on dynamic routes. This reverses a documented design ("every public route owns its `loading.tsx`"), so it needs your approval; measured on CLS/LCP before and after |
| **D10** (new) | Existing `SearchAction` and `FAQPage` | **Remove `SearchAction`** (Google retired the sitelinks search box in 2024; it is on 60/60 pages). **Keep existing `FAQPage` where the Q&A is visible, add none**, or drop it to simplify the single `@graph`. Your call |
| **D11** (new) | Blank publication year | **Stop defaulting to the current year; store no date when none is known**, and add date precision (a year-only flag or a `published_year` column: a migration). Export books whose date is `YYYY-01-01` with YYYY = their import year for librarian review; never guess |
| **D12** (new) | Where Scholar full text lives | **`/theses/{slug}/fulltext.pdf` and `/journals/articles/{slug}/fulltext.pdf`, outside `/api/`, anonymous 200 only for `open` items**, and no crawler-only exception (serving crawlers what readers cannot get risks being read as cloaking) |
| **D13** (new) | Where phase exits run `seo-check` | **A local production build against the local Supabase stack with `scripts/seo-urls.local.json`**, plus a read-only production re-baseline after each deploy. The alternative, a local build pointed at production data so `seo-urls.json` runs unchanged, suits one-off diffs (e.g. a sitemap before/after) but not routine exits: `/search` and a few other routes write logs to the database they read |
| **D14** (new) | Where subject intros and English names live | **Additive columns on `categories`** (today's read source: `name_en`, `intro_en`, `intro_km`, `intro_status`) rather than cutting over to the canonical `subjects` table mid-programme. Needs your OK (a migration) |

---

## 7. Not verified, and why

- **F1's root cause** needs the auditor's raw response headers, or a look at
  the tunnel's connectors and the box's containers (`RUNBOOK.md`).
- **N7** (memory-only ISR) needs the box's container log.
- **Search Console** data (crawl stats, canonical choices): none was available.
  D1 and D6 depend on it.
- **Which data row produced the audit's "1 of 8" thesis authors**: moot now
  that the page emits 8, but the mixed roles remain.
- **Research outside the library** (the old Google Site, later cohorts under
  `/books`) needs a librarian inventory (Phase 3.6).

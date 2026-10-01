# SEO programme: final report

The programme ran Phases 0–7 on stacked branches, `seo/phase-0-recon` through
`seo/phase-7-handover`. Nothing is merged, pushed or deployed. Every phase
exited on a local production build reading the local Supabase stack (D13),
and production was read only for baselines, one request at a time.

- Per-phase detail: `PHASE-1-REPORT.md` … `PHASE-7-REPORT.md`.
- Evidence ledger: `AUDIT-VERIFICATION.md`.
- Steps outside the repository: `RUNBOOK.md`.
- Rules for future changes: "SEO invariants" in `CLAUDE.md`.

## F1–F16

**Status** means what is true of the code on `seo/phase-7-handover`. Nothing
here is live until it is deployed.

| ID | Finding | Status | What changed (phase) | What remains |
|---|---|---|---|---|
| F1 | Stale `/books` (intermittent) | **Not reproduced; instrumented** | Every response carries `X-PTEC-Build`; every listing says `data-results-total`; `seo-check` compares the totals (1) | Two hypotheses (the auditor's copy, a second origin) take minutes to settle on the box: RUNBOOK "F1" |
| F2 | Hubs lack an H1 and copy | **Fixed in code** | H1 in the shell, no route `loading.tsx` on indexable pages (1, D9); footer headings are labels (1); subject hubs with English names, introductions and pagination, hub intros on the listing pages (2) | English subject names and introductions publish when a librarian approves the drafts (RUNBOOK "Phase 2") |
| F3 | Templated Khmer record metadata | **Fixed in code; content is librarian work** | Record titles name subject, grade and format (2); no invented year, and import placeholder dates publish nothing (1, 5); description review queue, rule-built drafts and an indexing gate (5) | 1,530 books share a description template with four or more others. The queue lists them by traffic. The gate (off) withholds 2 books |
| F4 | Research tagging and Google Scholar | **Fixed in code** | Citation authors are the authors (not advisors or the cohort); tags on one locale; theses restricted by default with a librarian-controlled open access that requires consent and a licence; open full texts at `…/fulltext.pdf` outside `/api` (3, D4, D12); theses are `Thesis` (4) and carry their licence when open (7) | Scholar shows a PDF only once a librarian opens a thesis; the old Google Site items are a librarian list (`research-migration.csv`) |
| F5 | Language duplicates | **Mostly not reproduced; fixed where real** | `x-default` in the sitemap; no hreflang on noindex pages (1); D1 keeps both locales indexable | Revisit D1 after 4–6 weeks of Search Console data |
| F6 | Sitemap hygiene | **Fixed** | Sitemap index per type, percent-encoded `<loc>`, `x-default`, real `lastmod` (1); a publish reaches the sitemaps on the next request (7) | — |
| F7 | Truncation | **Fixed** | One grapheme-safe fitter replaced eight truncators; titles are never cut (1) | — |
| F8 | Thin author pages indexed | **Fixed** | `noindex, follow` and out of the sitemap below 3 works unless the bio is approved (2, D2) | Approving bios is librarian work |
| F9 | Metadata details | **Fixed** | `og:type=book`, date precision, Khmer brand on `/km`, catalogue punctuation (1); placeholder dates hidden (5) | `name-cleanup.csv` (1,022 possibly inverted catalogue names) is for librarians; nothing is changed automatically |
| F10 | Structured data | **Fixed** | One `@graph` per page, `CollegeOrUniversity`, no SearchAction, empty values pruned, `Thesis`, ordered path steps (4); thesis licence (7) | The college's `@id` moved to `https://www.ptec.edu.kh/#org` (4); ask the main site to use the same id (RUNBOOK §6) |
| F11 | Empty hubs | **Fixed in code; the collection is thin** | `/journals` and `/posts` with fewer than 5 items show the "Grow the collection" panel and `/theses`' notice gains its links; `/theses`, `/theses/summary` and `/posts` go `noindex` when empty; thesis browse pages appear only above a minimum (3) | 1 thesis, 1 article and 2 posts in production; that changes as content is published |
| F12 | Catalogue records | **Fixed; two choices open** | Records with a digital twin link to it and are noindex; no catalogue record in a sitemap; `llms.txt` corrected (2), and again after Phases 3–6 (7) | P2-1, P2-2 |
| F13 | Facet crawl | **Fixed where it leaked; D6 waits on data** | Filtered `/paths` views are noindex (1). Sort/view/filter URLs stay crawlable, `noindex, follow` with a canonical (D6) | No crawl data was available (no Search Console access). RUNBOOK §8 sets the rule: over 20% of Googlebot requests on parameter URLs for two months brings D6 back |
| F14 | Headings and alt | **Fixed** | The closed dialog renders no heading; footer headings are labels (1) | — |
| F15 | Performance | **Measured; two fixes; timing after deploy** | Production baseline (6). The record cover's LCP image is 56 → 22 KB; `/books` and `/catalogs` script is 366 → 299 KB (6) | Timing on production after deploy (`perf-baseline.md` states what to expect); P6-1, P6-2 |
| F16 | Very long slugs | **Fixed for new records** | New slugs capped at 8 words / 60 characters (2, D8); existing URLs unchanged | — |

The Phase 0 audit's extra items: N1 (offline page indexable), N2 (English on
Khmer pages) and N4 (`/paths` filters) were fixed in Phase 1; N3 (no year
stored as the current year) by D11 in Phase 1; N5 (hub title vs H1) in
Phase 2; N6 (year-long `stale-while-revalidate`) and N7 (ISR memory-only?)
are runbook checks.

## Decisions waiting for you

| ID | Question | Recommendation |
|---|---|---|
| P2-1 | A described catalogue record without an e-book is `index` but not in the sitemap | (a) make every catalogue record noindex |
| P2-2 | 40 catalogue/e-book pairs share a title but cannot be confirmed as one work | (a) leave them unlinked until a librarian checks them |
| P3-1 | Remove the dormant verified-Google-crawler exception from `/api/books/*/file` and `/api/theses/*/file` (it touches file access) | Yes |
| P5-1 | Switch the description gate on | Yes, after deploy; it withholds 2 books, both without a file |
| P5-2 | Run the description draft generator on production | A dry run of `--limit 50` on the box first |
| P6-1 | `/contact`: load the map on click (~420 KB less) | Yes, if the map is not why people open that page |
| P6-2 | Replace `BookRequestForm` with the homepage's `ContributeDialog` | Yes, as its own change |
| P7-1 | Make the CI `seo-check` job gating | Yes, after its first green run on GitHub |
| P7-2 | Switch IndexNow on (`INDEXNOW_KEY`) | Yes, after Bing Webmaster Tools is set up |
| P7-3 | A missing root file with a dot (`/ads.txt`) answers 500, not 404 (found in Phase 7; predates the programme) | Fix with `dynamicParams = false` on `[locale]`, as its own change |

## Follow-ups found along the way (not done)

- **`scripts/audit-rights-exposure.ts` now reports "not downloadable" for
  every book.** It used `citation_pdf_url` as its signal, which books no
  longer carry (Phase 3). The public HTML has no other signal (a signed-out
  visitor gets no download link), so the script needs either a database
  signal or a redefinition of the question ("readable online" is the larger
  exposure). Either way it is a redesign of a review tool, listed rather than
  made.
- **Khmer review.** Every new Khmer string is in `docs/seo/KM-REVIEW.md`,
  marked `TODO(km-review)`.
- **Migrations 0161–0164** are applied only to the local stack. They reach
  production through the box's `migrate.sh` on deploy.

## How to ship it

1. Merge the eight branches in order, or `seo/phase-7-handover` alone (it
   contains all of them). Your call; nothing is pushed.
2. Deploy, then follow `RUNBOOK.md` "Phase 7" §1. The migrations come first
   in that list.
3. Then the external steps (RUNBOOK §2–§9) and the decisions above.

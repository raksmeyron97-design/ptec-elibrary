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

## Decisions (all approved 2026-10-01)

| ID | Decision | Outcome |
|---|---|---|
| P2-1 | No catalogue record is indexed | **Done** — `CATALOG_RECORDS_INDEXABLE = false`; every record is a `noindex, follow` finding aid; the editor's search-visibility check is gone |
| P2-2 | Leave the 40 same-title pairs unlinked | **No change needed** — they stay unlinked until a librarian checks them |
| P3-1 | Remove the crawler exception from the book and thesis file routes | **Done** — both require a signed-in reader for everyone; open full texts are only served at `…/fulltext.pdf` |
| P5-1 | Switch the description gate on | **Done** (2026-10-01) — `SEO_DESCRIPTION_GATE=on` on the box; the two file-less books with copy-paste descriptions answer `noindex, follow`, a control book with a file stays `index, follow` |
| P5-2 | Dry run of the draft generator | **Done** (2026-10-01) — 50 most-viewed candidates, nothing stored: 2 drafts, and the Khmer one was built from broken extraction. Fixed in #289 (broken Khmer refused, Khmer digits); re-run with the fix: 1 draft, 3 `unreadable_contents`, 1 too few headings, 45 no contents page. **Do not `--apply`** before #289 is merged; the yield is low either way |
| P6-1 | `/contact` map on click | **Done** — a same-height placeholder with "Show the map"; nothing is fetched from Google until pressed |
| P6-2 | "Request a book" is the homepage's dialog | **Done** — `RequestBookButton` renders `ContributeDialog`; `BookRequestForm` deleted |
| P7-1 | Make the CI `seo-check` job gating | **Done** — first green run on a fresh seed on `main` (a27a279): 1,541 ok, 0 failing; `continue-on-error` removed and the job required on `main` |
| P7-2 | Switch IndexNow on | **Done** (2026-10-01) — `INDEXNOW_KEY` on the box; `/<key>.txt` answers the key, any other key 404s. Bing Webmaster Tools registered and `sitemap.xml` submitted (status: Success) |
| P7-3 | A missing root file answers 404, not 500 | **Done, differently from the proposal** — `dynamicParams = false` on `[locale]` would have 404'd every book, thesis and article page not prerendered at build time (Next ANDs it across all segments of a route). The fix is in `i18n/request.ts`: an invalid locale segment resolves to the default locale instead of reading cookies |

Also added for the deploy: migrations 0161–0164 now `SET LOCAL lock_timeout = '10s'`, so on a database as slow as production was on 2026-10-01 a migration fails cleanly (and the next deploy tick retries) instead of queueing every read of `books` behind its lock.

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
- **The thesis SEO title.** One thesis's admin-entered SEO title override
  shortens its title (`seo-check`'s only remaining production error). Edit or
  clear it in the thesis's SEO fields.

## Deployed (2026-10-01)

- Merged as #285 (`a27a279`, 07:01 UTC); image built 07:47 UTC. The site
  serves it (`x-ptec-build: 2026-10-01T07:47Z`).
- Migrations 0161–0164 are live: each new column answers on production with
  its default, and `book_description_drafts` exists and refuses anon
  (`permission denied`).
- Production was unreachable from about 11:40 Phnom Penh time (the app and
  file storage; by 14:05 its database too), hours before this merge. By 14:54
  everything answered again, with the new image already serving. Whether the
  box recovered first or the deploy's restart helped is not visible from
  outside; the cause is on the box and still unknown.
- #288 merged (`bfecc91`): `seo-check` is a required check on `main`.
- Box steps (16:20 Phnom Penh time), through `ssh -J root@100.96.43.103
  p565sanet@10.1.1.146`: `.env` backed up to `.env.bak-seo-20261001-102057`,
  `SEO_DESCRIPTION_GATE=on` and `INDEXNOW_KEY` set, the app recreated under
  `deploy.sh`'s lock and healthy. No IndexNow ping has been sent yet: one goes
  out on the next save of a book, thesis, article, post or path.
- `seo-check` against production (sequential): 1,590 ok and 5 errors.
  - 3 were books whose only date is the import placeholder: since Phase 5.5
    they publish no citation date (D11), and the harness now treats that as a
    warning for books.
  - 2 are one thesis whose admin-entered SEO title override shortens its
    title (already failing in the 2026-09-30 baseline). Content: edit or clear
    the SEO title on that thesis.

## What remains

Everything in the repository has shipped. What is left is content and
accounts, all with steps in `RUNBOOK.md`:

- **Librarians.**
  - Descriptions in Admin → Data Quality → Book descriptions (1,530 books,
    by traffic).
  - The subject and hub introductions and English subject names (RUNBOOK
    "Phase 2").
  - The Khmer strings in `KM-REVIEW.md`.
  - The year corrections in `suspect-publication-years.csv` and the names in
    `name-cleanup.csv`.
  - The thesis SEO title above.
- **Search Console** (RUNBOOK §3): domain property, the sitemap index,
  requests for indexing, and the Pages report every two weeks for two months.
- **The college website** (RUNBOOK §6): a Library link in its menu and
  footer.
- **The old Google Site** (RUNBOOK §7): link each migrated item to its new
  record, and unpublish it once the new record is indexed.
- **Google Business Profile** (RUNBOOK §9).
- **Monthly:** the Crawl stats export, against the F13 rule for D6
  (RUNBOOK §8).

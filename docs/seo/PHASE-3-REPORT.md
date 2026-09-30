# Phase 3 report: research and Google Scholar

Branch `seo/phase-3-research`, stacked on `seo/phase-2-hubs` (no SEO branch is
merged or pushed). Verified against a local production build reading the local
Supabase stack (D13).

## Phase 3 report

**Findings addressed:** F4 (research tagging and Google Scholar) and F11
(sparse hubs), under decisions D4 (theses restricted by default) and D12
(public full text outside `/api`, no crawler-only exception).

**Changes**

| Commit | Item | What changed |
|---|---|---|
| `feat(seo): F4 thesis Scholar tags name authors only …` | 3.1, 3.3 | **0163** (additive): `research_reports.access` (`restricted` by default or `open`), `access_consent_at`/`_by`, `report_number`. A CHECK constraint refuses `open` without a recorded licence and consent. `citation_author` now uses author-role credits minus a cohort label. Production's first "author" was the cohort label "គរុនិស្សិត ១២+៤ ជំនាន់ទី២", followed by the advisors; the visible byline and JSON-LD authors follow the same rule. `citation_*` go on one locale per work, with `citation_language`, `citation_abstract_html_url`, and the technical-report tags for a `research_report`. `citation_pdf_url` appears only for a public full text. |
| `feat(seo): F4 open-access theses at /theses/<slug>/fulltext.pdf` | 3.4 | The route sits in the abstract page's directory, outside `/api`. It serves an anonymous inline PDF with ranges, ETag/Last-Modified, 304 and HEAD, but only for an open thesis. Every other thesis gets a small 403 page, `noindex`, linking back to its record. There is no crawler exception. |
| `feat(seo): F4 librarians open a thesis's full text …` | 3.1 | A "Public full text" card on the thesis edit page. It records consent and opens or closes access, and it is audited. |
| `feat(seo): 3.2 thesis title page links its authors and advisors` | 3.2 | Exact-name links to author pages. The full abstract, facts table, "Cite this" and related research were already public. Only the PDF was behind sign-in. |
| `feat(seo): 3.5 research browse pages …` | 3.5 | `/theses/year/<yyyy>` and `/theses/program/<programme>`. A page exists only with ≥ 5 works (`THESIS_BROWSE_MIN_WORKS`), and the hub and sitemap link exactly those. |
| `chore(seo): 3.6 list research candidates …` | 3.6 | `docs/seo/research-migration.csv` lists 33 `/books` candidates plus the six Google Site items. Nothing moves. |
| `feat(seo): F4 citation_pdf_url only for a full text anyone can fetch` | 3.7 | Articles name `/journals/articles/<slug>/fulltext.pdf` (a new public route) only when their licence allows redistribution. Books name no PDF, because their files need a sign-in. `llms.txt` is updated to match. |
| `feat(seo): F4 one Scholar record per work for books and articles too` | 3.3 | One rule, `citationLocale()`, for theses, books and articles: Khmer on `/km`, every other language on the English page. |
| `feat(seo): F11 sparse hubs …` | 3.8 | `/journals` and `/posts` with fewer than 5 items show the homepage's "Grow the collection" panel: purpose, deposit link and other collections. `/theses`' existing notice gains the same links. `/theses`, `/theses/summary` and `/posts` go `noindex` when empty, as `/journals` already did. |
| `chore(seo): 3.4 report which thesis PDFs Google Scholar would refuse` | 3.4 | `scripts/seo-scholar-pdf-report.ts` checks size against 5 MB and, with the service key, the text layer. |
| harness commits | — | `citation-required` looks for the tags on the other-language version when a page has none. `citation-locale` puts non-Khmer works on the English page. Local entries can mark a check `unverifiable` with a reason. |

**Evidence**

- `seo-check --phase 3`, local build, local list: **0 failing in phases 0–3**
  (1,383 ok, 6 advisory warnings, 0 5xx). Phase 3 had 11 failing at the
  Phase 2 exit. The first Phase 3 run showed 4 phase-0 failures, which were the
  intended one-locale change; the check was updated to verify it instead.
- Build route table: the four new routes are added and every existing route
  keeps its mode (theses and articles stay as they were).
- `tsc` 0 errors; `lint` 0 errors (172 warnings, unchanged); `vitest`
  **9,002 passed** (54 new); `next build` exit 0 from a clean `.next`.
- Routes, probed locally:

  | Request | Result |
  |---|---|
  | Restricted thesis `fulltext.pdf` (English and Khmer) | 403, localized page, `X-Robots-Tag: noindex, follow` |
  | Unknown slug | 404 |
  | CC BY article | 404 "File not found in storage" (no storage server locally) |
  | CC BY-NC article | 403, because the existing download rule does not count NC as redistributable |
  | Year and programme browse pages (threshold set to 1 for the check) | Render with self-canonicals and reciprocal hreflang |
  | A year with no page | 404 |

- The thesis page emits authors only, and Scholar tags on its English page only.
- E2E (Chromium; seo, thesis-record, thesis-abstract-reader, thesis-redirect,
  journals, journal-article, catalogs, learning-paths, featured-books,
  mobile-shell, footer-mobile): **141 passed**, 11 skipped, 12 failed. The
  failures are the same local-data set as Phase 1:
  - thesis-record ×10: this database's theses have no file or Khmer title,
    which the CI seed sets.
  - catalogs ×2: the PMB import.

  I checked that the CI seed leaves the readable thesis's language unset, so
  its English page keeps the `citation_title` that spec asserts.
- Production, read-only: 1 published thesis, 2.7 MB, restricted; its text layer
  needs the service key (`docs/seo/scholar-pdf-report.csv`). There are 33
  research candidates under `/books`.

**Drafts awaiting review**

- `docs/seo/research-migration.csv`: librarians decide each row.
- `docs/seo/KM-REVIEW.md`: 7 new composed Khmer strings (the 403 page, the
  browse titles and descriptions, "browse by").
- Nothing is opened: every thesis stays restricted until a librarian opens it.

**Runbook items added:** "Phase 3: research, open access and Google Scholar".
It covers opening a thesis, the Scholar PDF check, the research moves, and the
after-deploy checks.

**Risks and follow-ups**

- **Scholar shows no PDF until a librarian opens a thesis.** That is D4 by
  design. The tags are now correct: real authors, one locale, a real abstract
  URL.
- **Books no longer name a PDF to Scholar.** The old URL returned 401 and was
  robots-blocked, so Scholar lost nothing it could use.
  `scripts/audit-rights-exposure.ts` read that tag as its "downloadable"
  signal, so it now reads "no" for every book. Signed-in downloads still exist
  and need a database-side signal, which is a natural fit for Phase 5.
- **The `/api/books` and `/api/theses` file routes still admit a DNS-verified
  Google crawler.** It is unused now (robots-blocked, and nothing points
  there). Removing it touches file access, so I left it; see P3-1.
- **The article rule** counts an article with no licence and no outside
  publisher as PTEC's own, and therefore open. That is the existing download
  rule, deliberately mirrored so the button and the route agree.
- **No open thesis could be served end to end locally**, because there is no
  storage server here. The helper is unit-tested (validators, 304) and the
  route's gate order is pinned. Verify after deploy on the first thesis a
  librarian opens (runbook).

**Decisions needed**

- **P3-1.** Should the dormant verified-Google-crawler exception come out of
  `/api/books/*/file` and `/api/theses/*/file`, to match D12? I recommend
  yes, in Phase 7's cleanup. It changes file access, so I need your go-ahead.
- P2-1 and P2-2 from the Phase 2 report are still open.

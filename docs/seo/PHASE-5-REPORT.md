# Phase 5 report: record content

Branch `seo/phase-5-content`, stacked on `seo/phase-4-structured-data`
(nothing merged or pushed). Verified against a local production build (D13).

## Phase 5 report

**Findings addressed:** F3 (templated record descriptions), with the F9 date
detail, under D7 (no model-written drafts) and D11 (a blank or placeholder
year is null; never guessed).

**What existed (audit, 5.1).** `scripts/seo-description-quality.ts` read
every published book from production (anon, read-only, sequential). Full
rows are in `docs/seo/description-quality.csv`, the summary in
`docs/seo/description-quality.md`:

| Measure | Books |
|---|---:|
| Published | 1,956 |
| With a file a reader can open | 1,910 |
| Sharing a description template with 4 or more others | **1,530** |
| Largest single template (one Khmer sentence, title swapped in) | 330 |
| Empty description | 1 |
| Date that is an import placeholder | **948** |
| No file AND empty or templated (what the 5.4 gate withholds) | **2** |

A template is what remains once the title, subject, author and numbers are
removed, then shingled and hashed (`lib/seo/description-template.ts`). The
biggest clusters are generic Khmer and English sentences ("…is an essential
academic and learning resource in the field of…") applied across whole
subjects. Nothing in the app could hold a better description in review, and
nothing distinguished a placeholder date from a real one.

**Changes**

| Commit | What changed |
|---|---|
| `feat(seo): 5.1 description audit …` | The audit script and its CSV/summary. Read-only. |
| `feat(seo): F3 book description review queue (Phase 5.2)` | Migration **0164**: `books.description_status` (`none`/`draft`/`approved`, default `none`), `description_reviewed_by`/`_at`. The draft TEXT lives in a new table, `book_description_drafts`, RLS-on and revoked from anon and authenticated, because `books` is anon-readable and an unreviewed draft must not be. `/admin/data-quality/descriptions` lists empty and templated descriptions by traffic (views templated / drafts / all, 20 a page). Save, approve and discard go through one registry action, `books.description.review` (`books: write`), are rate-limited, and each writes an audit row. **Only approval writes the live description**: the draft in the book's own language, the same rule that places Scholar tags. Approval refuses a draft that still carries `TODO`, `needs_review` or `TBD`. |
| `fix(seo): F3/F9 never publish an import placeholder …` | The book page reads `trustedPublicationDate()`: the stored date unless it is the import placeholder (the `created_at` instant, or 1 January of the import year), in which case nothing. The metadata and detail caches are re-keyed. |
| `feat(seo): F3 description indexing gate, off by default (Phase 5.4)` | `SEO_DESCRIPTION_GATE=on` (unset = off): a book with **no readable file** and an empty or templated description is `noindex, follow` and leaves the books sitemap until a description is approved. A book with a file is never withheld. One cached set (tag `books`) feeds both the page's robots and the sitemap; a failed read withholds nothing. |
| `feat(seo): F3 rule-built description drafts, off by default (Phase 5.3)` | `scripts/seo-draft-book-descriptions.ts` + `lib/seo/description-draft.ts`. No model (D7). Each sentence states a database fact (byline through the contributor-trust filter, publisher, trusted year, subject, page count, whether it can be read or downloaded), plus the fact that makes it this book's: the chapter headings on its **own contents page**, read from `book_pages` (already extracted by the indexer and the Khmer OCR batch; no PDF is fetched again). A run of consecutive chapter numbers is required, so a page number cannot pose as a chapter. Fewer than three informative headings means **no draft**: the book stays in the queue for a librarian, so the generator cannot recreate the template problem. Short drafts are reported, never padded. Khmer drafts begin with `TODO(km-review)`, which approval refuses. |
| `fix(seo): F3 review row empties its fields on discard …` and `… not labelled 'Unique text'` | Found by React Doctor and by driving the page: a discard left the removed text on screen; the status line is now an always-mounted live region; an empty description no longer reads "Unique text". The queue, the generator and the audit share `TEMPLATED_CLUSTER_MIN`. |
| `chore(seo): F6 seo-check --description-gate …` | With the gate on, withheld books stay on `/books` but leave the sitemap, so the exact count check would fail the day the gate is switched on. With `--description-gate` the sitemap may hold fewer and the gap is printed. |
| `test(seo): F3 the page and the sitemap read one withheld set …` | Source scan, negative-controlled, plus the measured timing in the RUNBOOK. |

**Generator safety rails.** Without `--limit` it prints its header and exits.
The default is a dry run into `content/drafts/book-descriptions.json` (every
entry `needs_review`). `--apply` writes only to the drafts table with
`source = 'extracted'`, never over an existing draft, and moves
`description_status` from `none` to `draft` only. A non-local database needs
`--confirm-host <host>`, and more than 50 writes there need
`--approved-over-50`. It prints the request count and estimated time before
starting. No paid API is used.

**Evidence**

- `seo-check --phase 5`, local build, local list, **gate off: 0 failing in
  phases 0–5** (1,545 ok, 8 advisory warnings, 0 5xx; identical to the Phase 4
  exit).
- **Gate on**, same build restarted with `SEO_DESCRIPTION_GATE=on`:
  - The 8 local books with no file and no description answer
    `noindex, follow` in both locales.
  - A book with a unique description and one with a file stay
    `index, follow`.
  - The books sitemap regenerated with 6 records: exactly the indexable ones.
  - `seo-check --description-gate`: **0 failing**. Without the flag the count
    check fails ("6 book records in the sitemap vs 14 on /books"), which is
    the negative control.
- **The review queue driven in Chromium** on the production build: admin
  sign-in with TOTP, then the steps below. No page or console errors. The
  local rows and audit rows were restored afterwards.
  - An English draft saved, then approved: `books.description` set,
    `description_status = approved`, reviewer timestamp set.
  - A Khmer draft carrying `TODO(km-review)` refused at approval; the
    description is untouched.
  - Discard empties the fields.
  - Four audit rows, one per successful mutation.
- **Generator**, local only:
  - Without `--limit`: exit 2.
  - Dry run: 8 candidates, all skipped as `no_contents` (this database has
    almost no page text).
  - With one contents page seeded: 1 drafted and stored with
    `source = 'extracted'`.
  - Re-run: the stored draft was left alone. The page count of 1 it first
    printed exposed a bad local value, and a page count below a page we hold
    text for is now dropped.
  - Test rows removed.
- Unit tests for the heading reader use the **real production contents pages**
  already pinned in `lib/ai/page-quality.test.ts`:
  - *Research Methods in Education* p.10 → "Sampling", "Sensitive
    educational research"; its 12.1–12.10 sections are skipped.
  - The Khmer contents shape → វិធីសាស្ត្រ, លទ្ធផល, ការពិភាក្សា; the
    introduction, conclusion and references are dropped.
  - An unnumbered contents page and one whose page numbers are 7, 9, 15, 42…
    → nothing.
- Build route table: **identical** to Phase 4 plus the new admin page
  (`ƒ`, dynamic like its siblings).
- `tsc` 0 errors; `lint` 0 errors (172 warnings, unchanged); `vitest`
  **9,101 passed** (89 skipped); `next build` exit 0 from a clean `.next`;
  e2e `seo` + `smoke`: **37 passed, 1 skipped**.

**Risks and follow-ups**

- **0164 must land before the queue is used.** The page and the gate read
  with a fallback when the columns are missing; saving a draft without the
  table answers an error rather than pretending to succeed.
- **The sitemap lags the gate by up to two hours.** A book page follows on
  its next render. The books sitemap's entries are cached for an hour inside
  a route that revalidates hourly. Until both turn over, a withheld book is
  still listed while its page says noindex. Google tolerates this; the
  RUNBOOK says to check two hours after switching.
- **A real date on 1 January of the import year is now hidden** along with
  the placeholders, because the two cannot be told apart from the row. D11
  prefers nothing to a guess; a librarian can correct the date, and the date
  CSV from Phase 1 lists the suspects.
- **The generator's yield on production is unmeasured.** `book_pages` is
  service-role only, so the anon audit cannot see it. A dry run on the box
  (RUNBOOK, Phase 5) gives the real number before anyone stores a draft.
- **Observed, not caused here.** On the local build, after I deleted
  `.next/cache` by hand to force the sitemap to regenerate, the first request
  to nine runtime-ISR detail pages (authors, journals, a thesis, a catalogue
  record) went out with **no `cache-control`**. The second request was
  cacheable. The gate touches none of those pages, and a fresh build did not
  show it. Whether a cold data cache after a production deploy does the same
  is an F1/F15 question; I am carrying it into Phase 6, which measures exactly
  those pages.

**Decisions needed**

- **P5-1. When to switch the gate on.** On today's data it withholds 2 books,
  both without a file. Recommendation: switch it on after this ships; it
  cannot touch a book a reader can open.
- **P5-2. Running the draft generator on production.** Recommendation: a dry
  run of `--limit 50` on the box. Store drafts (`--apply`) only if the dry run
  shows enough books with readable contents pages to be worth a librarian's
  review. More than 50 needs your go-ahead (`--approved-over-50`).
- **Khmer review**: the Khmer draft sentences and two new admin strings are
  in `docs/seo/KM-REVIEW.md`.
- Still open from earlier phases: P2-1, P2-2, P3-1.

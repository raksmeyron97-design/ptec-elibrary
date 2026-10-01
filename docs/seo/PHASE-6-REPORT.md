# Phase 6 report: performance

Branch `seo/phase-6-performance`, stacked on `seo/phase-5-content` (nothing
merged or pushed). Verified against a local production build (D13);
baseline measured on production, read-only and sequential.

## Phase 6 report

**Finding addressed:** F15 (performance, unmeasured until now).

**What existed (baseline, 6.1).** Full tables in
`docs/seo/perf-baseline.md`. On production, mobile Lighthouse 13.5, medians
of three sequential rounds:

| Template | Perf | FCP | LCP | CLS | LCP element |
|---|---:|---:|---:|---:|---|
| home | 49 | 2.1 s | 5.2 s | 0 | hero image |
| `/books` | 60 | 1.8 s | 5.3 s | 0 | first card's cover |
| record | 62 | 1.8 s | 5.5 s | 0 | cover, 220×293 slot |
| subject | 68 | 1.7 s | 3.9 s | 0 | a section H2 |
| path | 64 | 2.1 s | 4.8 s | 0 | header image |
| thesis | 60 | 1.8 s | 4.7 s | 0 | the H1 |

CLS is 0 everywhere. Every page paints first at about 2 s and largest at
4–7 s. TBT on my machine varied 0.5–4.5 s between rounds of the same page
(load average 7–18), so for TBT the CI runner's numbers stand (66–204 ms on
everything but `/`).

**What the data showed, and what I did (6.2)**

| Signal | Decision |
|---|---|
| Record page: the LCP cover sits in a 220 px slot, but `sizes` said `100vw`, so a phone fetched the 828w file; Lighthouse counted 48 of 65 KB wasted | **Fixed.** `sizes` describes the slot. The tablet clause is `calc(100vw - 6rem)`, because a bare `NNvw` anywhere makes next/image drop every srcset width below 640 (the first attempt fetched 640w for that reason). Pinned by a test that uses next/image's own regex. |
| `/books` and `/catalogs` ship 67 KB of Supabase browser client no other page does, only so "Request a book" can decide whether its dialog shows a sign-in prompt | **Fixed.** The form reads `useSession()` (one shared `/api/me` read, as the homepage dialog does). The import-graph test fails if either page reaches the client again; it is negative-controlled both ways (its first version passed the regression, because a `/*` inside a line comment swallowed the imports). |
| Thesis and subject: text LCP with 0.8–1.0 s render delay | **No new change.** On production the H1 is still inside the hidden streaming container that Phase 1 removed (D9). Re-measure after deploy. |
| Home: the 3.2 s TBT in CI | **Not pursued.** `/` and `/km` run the same chunks, each about twice as slow on `/`; `/` is the first URL of every run. Ordering artefact. |
| The first-load boot screen covers every page of a new session | **Kept.** A paired experiment (5 alternating pairs, throttled) gave the same LCP with and without it (home 2,308 vs 2,280 ms; record 2,160 vs 2,184 ms). |
| Preconnect to the storage host (named in the plan) | **Not added.** Every request goes to the site's own origin; covers come through `/_next/image`. A preconnect would open an unused connection. |
| Khmer fonts (named in the plan) | **No change.** Already `next/font`, swap, Khmer subset, display faces not preloaded, no bold Khmer loaded. All four files are used on every template. |
| `/contact`: ~420 KB of Google Maps JavaScript | **Your decision (P6-1).** The iframe is already lazy and out of process (TBT 121 ms). |

**Changes**

| Commit | What changed |
|---|---|
| `perf(seo): F15 the record cover's sizes describes its 220px phone slot` | `components/ui/reader/PDFCover.tsx` `sizes`; `components/ui/reader/pdf-cover-sizes.test.ts`. |
| `perf(seo): F15 'Request a book' reads the shared session, not the Supabase client` | `components/ui/books/BookRequestForm.tsx`; `lib/seo/listing-js.test.ts`. |
| `chore(seo): F15 sequential Lighthouse runner and median summary` | `scripts/seo-lighthouse.sh` (pinned one-off `npx lighthouse@13.5.0`, nothing added to `package.json`; one page at a time; stops after two failures) and `scripts/seo-lighthouse-summary.ts` (per-metric medians, LCP element and split, before/after deltas). |
| `docs(seo): Phase 6 …` | `docs/seo/perf-baseline.md`, this report. |

**Evidence (6.3)**

- **Bytes**, two local production builds of the same database, phone viewport:
  - **Record cover (the LCP image): 56 KB → 22 KB** (828w → 448w file).
  - **`/books` script: 366 → 299 KB.** **`/catalogs` script: 365 → 297 KB.**
  - The 67 KB saved is exactly the three Supabase chunks. Their content
    hashes are the same as production's, so the saving carries over.
- **Timing could not be measured locally.** Lighthouse failed with
  `NO_NAVSTART` at a load average of 67, later 181. I did not substitute a
  number; the post-deploy production run (RUNBOOK Phase 7 §1) gives it, and
  `perf-baseline.md` states what to expect.
- **The "Request a book" dialog driven in Chromium** on the build. Anonymous:
  the sign-in prompt and no form, on `/books` and on an empty `/catalogs`
  search. Signed in as the seeded reader: the form, on both. No page errors.
- **axe** (WCAG 2.1 A/AA), without the test's 30 s cap:
  - empty `/catalogs` search with the dialog open: none
  - `/books`, dialog closed: none
  - `/books`, dialog open: 7 colour-contrast nodes, all navbar text behind
    the dimmed backdrop. The modal does not make the page behind it inert;
    the markup is unchanged, so this predates Phase 6. Follow-up P6-2.
- **`seo-check`, every phase: 0 failing** (1,545 ok, 8 advisory warnings,
  0 5xx).
- Build route table: **identical** to Phase 5.
- `tsc` 0 errors; `lint` 0 errors (172 warnings, unchanged); `vitest`
  **9,107 passed** (89 skipped); `next build` exit 0 from a clean `.next`.
  A first full run under load average 95 took 93 minutes and reported 7
  timeouts and 3 workers that never started; those files pass alone, and the
  rerun at load 20 passed in 5 minutes.
- **E2E** (smoke, catalogs, featured-books): 18 passed, 3 failed, all
  explained:
  - 2 are the known local-data catalogue specs. This database holds the
    2,638-record catalogue import where the specs expect the seed's three
    records (recorded in the Phase 1 report).
  - The `/catalogs` accessibility scans timed out *inside* axe at load
    average 170 on that same large page. The direct axe run above found
    nothing on the page Phase 6 touched.

**Risks and follow-ups**

- **The dialog's signed-in state now comes from `/api/me`** rather than the
  browser's stored session. A visitor whose session cookie has expired now
  sees the sign-in prompt at once, instead of a form whose submit the server
  would refuse. That is the intended behaviour.
- **The production LCP gain is an estimate until the deploy is measured**:
  about 0.17 s on the record page from bytes alone, more on `/books` from
  less script. Phase 1's H1 change should move thesis and subject.
- **P6-2 (not a Phase 6 change):** `BookRequestForm` hand-rolls its modal
  without an inert background, which is what axe flags while it is open. The
  homepage's `ContributeDialog` is the native-`<dialog>` version of the same
  form and could replace it. That is a UI change, so it is listed rather than
  made.

**Decisions needed**

- **P6-1.** `/contact`: replace the Google Maps iframe with a static
  placeholder that loads the map on click, saving about 420 KB on that page.
  Recommendation: yes, if the map is not the reason people open that page;
  otherwise leave it.
- **P6-2.** Replace `BookRequestForm` with `ContributeDialog` on `/books` and
  `/catalogs`. Recommendation: yes, as its own small change.
- Still open: P2-1, P2-2, P3-1, P5-1, P5-2.

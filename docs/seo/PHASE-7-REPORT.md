# Phase 7 report: monitoring and handover

Branch `seo/phase-7-handover`, stacked on `seo/phase-6-performance` (nothing
merged or pushed). Verified against a local production build (D13). The
programme's summary of F1–F16 is `FINAL-REPORT.md`.

## Phase 7 report

**Findings addressed:** F6 (sitemap freshness), F12 (`llms.txt`), F13 (crawl
data and D6), with monitoring and handover (7.1–7.7).

**Changes**

| Commit | Item | What changed |
|---|---|---|
| `ci(seo): seo-check on a production build of every PR …` | 7.1 | A `seo-check` job in `ci.yml`: boots the seeded local Supabase, builds this commit with `SEO_INDEXING=on`, starts it, runs `scripts/seo-check.ts` over every phase with the seed-backed URL list, and uploads the JSON report. **Non-gating** (`continue-on-error`) until its first green run on GitHub, because the list has only run on a developer database holding the seed plus more. |
| `feat(seo): F6 a publish reaches the sitemaps at once; IndexNow …` | 7.2 | **Sitemaps.** Their entries were cached under a tag nothing fired, so a published record reached the sitemap only once two hour-long caches had turned over. Every record helper in `lib/cache/revalidate.ts` (books, theses, articles, journals, posts, paths, authors, team, taxonomy) now fires `TAGS.sitemap`. Hubs already followed through the `books`/`categories` tags. **IndexNow** (off until `INDEXNOW_KEY` is set): each record change announces that record's English and Khmer URLs, encoded as the canonicals are, after the response. It sends only from an indexable environment and only while the System Settings indexing switch is on. A failed ping is a log line. `/{key}.txt` answers the configured key through an `afterFiles` rewrite and 404s anything else. |
| `fix(seo): F12 llms.txt says what is true …` | 7.3 | Four claims corrected: catalogue records (most noindex, none in a sitemap; a described one may be indexed — P2-1), hreflang (indexable pages only), licences (journal articles **and open-access theses**), JSON-LD types (`Thesis` since Phase 4). It adds that citation tags appear once, in the work's own language. The Thesis node now carries `license`, only for an open-access thesis with a licence deed, which is what `llms.txt` tells consumers a licence means. |
| `docs(seo): SEO invariants in CLAUDE.md; RUNBOOK …` | 7.4, 7.6 | CLAUDE.md: one "SEO invariants" section and table rows for the programme's source-scanning tests. RUNBOOK "Phase 7": deploy verification, Cloudflare, Search Console, Bing, IndexNow, the college site's menu, the old Google Site, Google Business Profile, and the F13 rule. |
| `docs(seo): Phase 7 report and final report` | 7.5, 7.7 | This report and `FINAL-REPORT.md`. |

**F13 (7.5).** There is no crawl data to summarise. The repository has no
Search Console access, Cloudflare's logs are not available here, and the app
does not log crawler requests. The state is unchanged since Phase 1:
- Sort, view and filter URLs answer `noindex, follow` with a canonical to the
  base list.
- Filtered `/paths` views are noindex.
- No parameter is blocked in `robots.txt` (D6).

RUNBOOK §8 sets the rule for bringing D6 back from the monthly Crawl stats
export: more than 20% of Googlebot requests on parameter URLs for two months,
or record pages growing in "Discovered – currently not indexed" at the same
time. Changing a `Disallow` rule stays your decision.

**Evidence**

- **Sitemap freshness, end to end**, on the production build with the gate
  on:
  - The books sitemap still served its build-time entry: 14 records.
  - I approved one description through the admin UI.
  - The next request served the stale copy (`revalidateTag(…, "max")`
    semantics). From the second request on it held **7 records**: the six
    indexable books plus the newly described one.
  - That book's page now answered `index, follow`.
  - Without the tag, the 14-record copy would have stood for up to two hours.
  - Local rows and audit entries restored afterwards.
- **IndexNow key file** on the build, with a key set:
  - the key returns 200 `text/plain`, `X-Robots-Tag: noindex`;
  - another key and `/km/<key>.txt` return 404;
  - `/robots.txt` and `/llms.txt` are unchanged.

  No record was saved while the key was set, so nothing was sent. The send
  path is covered by unit tests with a mocked `fetch`: each of the three
  switches, negative-controlled.
- Unit tests: `revalidate.test.ts` (every record helper fires the sitemap
  tag; nothing loaded without a key; each record announces its own path),
  `indexnow.test.ts` (13), `thesis-seo.test.ts` (licence rule and its page
  gate), `llms-txt.test.ts` (the new claims).
- Final checks on a clean build of this branch: see "Exit" below.

**Found while verifying (not changed)**

- **`/abc.txt` answers 500, not 404.**
  - Any missing root path with a dot (e.g. `/ads.txt`,
    `/apple-touch-icon-precomposed.png`) skips the middleware's locale
    rewrite, as static assets must, and reaches the `[locale]` route with the
    filename as its locale. Locale resolution then falls back to cookies, and
    Next refuses to turn the prerendered tree dynamic.
  - By code reading this predates the programme: the dotted-path bypass and
    the cookie fallback are unchanged since `main`. I could not confirm on
    production, because it stopped answering (even `/robots.txt` timed out)
    while I checked.
  - Bots that probe for root files then log server errors in Search Console.
  - A likely fix is `dynamicParams = false` on the `[locale]` segment, so an
    unknown locale is a 404 before anything renders. It changes routing for
    every public page, so it is a decision (P7-3), not a quiet edit at the
    end.
- **`scripts/audit-rights-exposure.ts`** reports every book as not
  downloadable (see `FINAL-REPORT.md`).

**Decisions needed**

- **P7-1.** Make the CI `seo-check` job gating after its first green run.
  Recommendation: yes.
- **P7-2.** Switch IndexNow on. Recommendation: after Bing Webmaster Tools is
  set up (RUNBOOK §4–§5).
- **P7-3.** Fix the 500 on unknown dotted root paths with
  `dynamicParams = false` on `[locale]`, plus a test per path shape.
  Recommendation: yes, as its own change.
- Still open: P2-1, P2-2, P3-1, P5-1, P5-2, P6-1, P6-2.

## Exit

On a clean production build of `seo/phase-7-handover`, local Supabase (D13):

- **`seo-check`, every phase: 0 failing** (1,545 ok, 8 advisory warnings,
  0 5xx).
- Build route table: identical to Phase 6, plus `ƒ /api/indexnow-key/[key]`.
- `tsc` 0 errors; `lint` 0 errors (172 warnings, unchanged since Phase 0);
  `vitest` **9,139 passed** (89 skipped); `next build` exit 0 from a clean
  `.next`.
- E2E (seo, smoke, journals): **61 passed, 1 skipped**.


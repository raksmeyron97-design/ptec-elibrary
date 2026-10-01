# Phase 1 report — quick technical fixes

Branch `seo/phase-1-quick-fixes`, stacked on `seo/phase-0-recon` (neither is
merged). Verified against a local production build (`SEO_INDEXING=on npm run
build && next start`) reading the local Supabase stack, per decision D13.

## Phase 1 report

**Findings addressed:** F1 (instrumentation), F2, F4 (links: already correct,
now asserted), F5, F6, F7, F9, F14, plus N1, N2, N4 and decision D11.

**Changes**

| Commit | Finding | What changed |
|---|---|---|
| `fix(seo): F2 render the H1 in the shell` | F2, D9 | 32 route-level `loading.tsx` removed from indexable public routes; `/search`, the reader and private pages keep theirs; `lib/seo/no-route-loading.test.ts`; CLAUDE.md rule rewritten |
| `fix(seo): keep the homepage prerendered` | D9 follow-up | the homepage calls `setRequestLocale()` and passes its locale explicitly; without the boundary, next-intl's header read had turned `/` into a per-request render |
| `fix(seo): F2/F14/N1 …` | F2, F14, N1 | footer titles and brand are labels (`role=group` + `aria-labelledby`); the closed contribute dialog renders no heading; `/~offline` is noindex |
| `feat(seo): F6 sitemap index …` | F6, F12 | `/sitemap.xml` is an index of `/sitemaps/<type>.xml`; `<loc>` and hreflang hrefs percent-encoded like canonicals; `x-default`; thesis `lastmod` from `updated_at`; catalogue records no longer advertised; middleware skips `.xml`; every sitemap reader follows the index; `scripts/seo-sitemap-counts.ts` |
| `feat(seo): F1 a build stamp …` | F1 | `X-PTEC-Build: <build time>` on every response; `data-results-total` on every listing's result line |
| `fix(seo): F5 F7 F9 N2 N4 D11 …` | F5, F7, F9, N2, N4, D11 | one grapheme-safe fitter (`lib/seo/text-fit.ts`) replacing eight private truncators; titles never cut, brand dropped first; Khmer brand in `/km` titles and `og:site_name` from settings; `og:type=book` + `book:*`; dates at known precision (`lib/seo/dates.ts`); blank year stays null; no hreflang on noindex pages; filtered `/paths` noindex; localized strings on the theses index, `/about`, the reader, About breadcrumbs; catalogue display titles without ISBD spacing |
| `chore(seo): D11 export …` | D11 | `docs/seo/suspect-publication-years.csv` (948 of 1,956 books carry the import year) |
| harness commits | — | local URL list (`scripts/seo-urls.local.json`); `cacheable` protect check; bilingual record titles accepted when the full translated title is shown |

**Evidence**

- `seo-check` against the local build, `--phase 1`, same URL list:
  **before 154 failing → after 0**; phase 0 stays at 0, and a new phase-0
  `cacheable` check passes on all 27 ISR/static URLs.
- Route rendering modes: the before and after build route tables list the
  same prerendered and dynamic routes (the first after-build had lost `/en`
  and `/km`; fixed, rebuilt, re-compared).
- `scripts/seo-sitemap-counts.ts`: books 14/14, theses 4/4, articles 5/5,
  posts 2/2, paths 9/9 — every compared type matches.
- Timing (local, warm, median of 5): dynamic pages' time to first byte now
  equals their old total time (article 95 → 106 ms, path 62 → 71 ms, post
  60 → 69 ms), as expected: the bytes arrive complete instead of as a shell.
  Cached pages are unchanged (home 15 → 17 ms, subjects 9 → 19 ms, a thesis
  10 → 11 ms; noise at load average 15–60). On production the content arrived
  20–30 ms after the shell (measured before the change), so the expected cost
  there is of that order.
- `tsc --noEmit` 0 errors; `npm run lint` 0 errors (172 pre-existing warnings,
  none in files this phase touched); `vitest run` 8,876 passed (one
  expectation updated deliberately: a stored year publishes as `"2010"`);
  `next build` exit 0.
- E2E against the build (Chromium, 25 public-page specs, 301 tests): all pass
  except 12 that depend on seed fixtures this machine's local database does
  not have (it predates migration 0160 and holds the 2,643-record PMB import:
  thesis-record ×10, catalogs ×2; CI boots a fresh seeded stack). Two specs
  were changed because D9 changed what they observed:
  - `footer-mobile` (no JavaScript): the homepage's real content now renders
    without JavaScript instead of staying a skeleton, so the spec presses End
    until the page stops growing.
  - `mobile-shell` "Home on Home": its request filter also caught prefetches
    of OTHER pages' links, which are now `?_rsc=` requests; it now counts only
    requests for the page you are on, which is what its assertion states.
  Two further specs failed once at load average > 100 (other sessions on this
  machine) and pass on rerun: `a11y` dark book detail and `mobile-motion`
  view transitions.

**Drafts awaiting review**

- `docs/seo/KM-REVIEW.md`: three Khmer strings composed from existing site
  copy (the `/km` catalogue fallback description and byline, the `/km/about`
  description).
- `docs/seo/name-cleanup.csv`: 1,022 catalogue author strings that may be
  surname-first, from production (read-only). Nothing is inverted
  automatically; the `decision` column is for librarians.
- `docs/seo/suspect-publication-years.csv`: 948 published books whose stored
  year equals their import year. Since this phase such a date publishes as the
  year alone; a librarian's correction replaces it.

**Runbook items added:** none new. After deploy, Search Console keeps reading
`/sitemap.xml` (now an index); no resubmission is needed, but its coverage
report will now split by child.

**Risks and follow-ups**

- **Client navigation on dynamic routes** now waits for the server's first
  bytes instead of showing a route skeleton at once (book, article, post and
  path pages, and the dynamic listings). `NavigationProgress` animates only
  after a navigation commits. Measured cost is small (production content came
  20–30 ms after the shell), but if navigations feel slower on the box, the
  remedy is inner `<Suspense>` around slow sections below the H1, never a
  route-level boundary. Phase 6 makes book and article pages ISR, which
  removes most of it.
- **Local image optimizer stall.** During e2e runs at load average ~60, one
  `/_next/image` request (the footer logo at `w=96`) hung inside the
  long-running server until restart; production answered the same request.
  Environmental, recorded because it can look like a regression.
- **The thesis's admin `seo_title`** in production ("… | របាយការណ៍…") is a
  shortened title the librarian set; the `title-contains-item` rule will flag
  it on production. By design an admin override wins; left for the librarians.
- **Production verification** (after deploy, read-only, sequential):
  `npx tsx scripts/seo-check.ts --base https://library.ptec.edu.kh --phase 1`
  — expected: phases 0–1 pass except the thesis override above;
  `curl -sI https://library.ptec.edu.kh/ | grep -i x-ptec-build`.

**Decisions needed:** none new.

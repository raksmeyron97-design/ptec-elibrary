# Homepage information architecture

The homepage is `app/[locale]/(public)/(home)/page.tsx`, served at `/` (English)
and `/km` (Khmer). This document is the reference for **what is on it, why, and
what may not be added back**.

## The problem it was rebuilt to solve

The page ran eleven bands, five of which were grids drawn from the same
~114-item collection. Measured on the built page:

| Signal | Before | After |
|---|---|---|
| Top-level sections | 11 | 8 |
| Resource links | 33 | see below |
| Distinct resources linked | 19 | equal to link count |
| Worst repeat | `/books/pisa-d` × 4 | none possible |
| Statistics blocks | 2 | 1 |

Alongside the repetition:

- Two stats blocks sat six sections apart and labelled the same underlying
  figures differently. The second led with `1 theses` and `1 publications` —
  counts of one, presented as headline proof.
- A tabbed "Browse the Collection" grid sat directly above a "Browse by Subject"
  grid offering the same taxonomy, and its "Recently Added" tab duplicated the
  "Just added to the library" band two sections down.
- Three conversion moments competed: hero CTAs, a mid-page "sign in free" strip,
  and a closing "Begin Your Learning Journey Today" banner.
- The headline addressed trainee teachers. The three facts that let anyone else
  use the library — free, no account needed, bilingual — appeared only inside a
  collapsed FAQ accordion at section eight.

## The eight sections

| # | Section | Component | Absorbs |
|---|---|---|---|
| 1 | Hero | `page.tsx` + `AskLibraryHero`, `HeroTrustPoints`, `HeroStatStrip` | hero, "PTEC Library at a glance", "PTEC Library in numbers" |
| 2 | Start with your goal | `StartWithGoal` | "What do you want to do today?" |
| 3 | Featured from the collection | `FeaturedCollection` | "Featured", "Popular with PTEC students", Browse→Trending, "New and noteworthy"'s editor's pick, "Trending Research" |
| 4 | Browse by subject | `CategoryGrid` | "Browse by Subject", Browse→per-department tabs |
| 5 | Read online, or visit us | `LibraryNow` | unchanged, plus the physical-collection figure |
| 6 | News & new arrivals | `NewsAndArrivals` | "New and noteworthy", "Just added to the library", Browse→Recently Added |
| 7 | FAQ | `FaqSection` | unchanged, trimmed 6→5 and reordered |
| 8 | Closing CTA | `SignupCta` | closing banner + the mid-page sign-in strip |

Nothing was dropped. Every retired band's capability has a destination in the
table above.

## Rule 1 — no resource appears twice

`lib/home/exclusions.ts` is a single set threaded through the sections in render
order. Each section takes what it needs from its own ranking, skips anything an
earlier section claimed, and backfills from further down its own list.

Ranking each shelf by a *different* signal (downloads / views / recency) was the
previous mitigation. It is not a fix — it only makes collisions less likely, and
it stops working as a collection's usage flattens out, which is what a small
library looks like.

The set is keyed on `type:slug`, not the database id: the same work legitimately
reaches the page through two fetchers, and slugs are what links are built from.
A book and a thesis may share a slug and are correctly treated as distinct.

`lib/home/payload.test.ts` asserts zero duplicate keys across the whole composed
page, including the case where all three rankings return identical lists.
`e2e/home-ia.spec.ts` asserts it again on the rendered DOM, in both locales.

### Candidate pools are sized for the worst overlap

A section's candidate list must be **longer than the grid it fills**, or the
exclusion set starves it. `getMostViewedBooksCached` was capped at 8 — the same
size as the featured grid — so when the download and view rankings agreed, the
hero claimed every candidate and the grid rendered six cards into an eight-card
layout. It is 24 now. Apply the same reasoning to any new pool.

## Rule 2 — one query layer

`lib/home/payload.ts` fetches everything in parallel and hands each section its
props. Sections are pure. This is what makes rule 1 have exactly one
implementation, and what lets the composition be unit-tested without a database.

`getHomePayload()` reads no cookies and no headers, so the route still
prerenders (`● /en`, `● /km`, ISR 60 s). Per-user behaviour lives in client
islands fed by `SessionProvider` — see the note at the top of `page.tsx`.

## Rule 3 — one statistics surface

`HeroStatStrip` is the only component on the page that renders a resource count.
It shows three figures:

- **Digital resources** — `getCollectionStats().totalDigitalResources`
- **Subjects** — `payload.subjects.length`, i.e. the length of the very list
  section 4 renders, so the number and the grid cannot disagree
- **Serving PTEC since {year}** — `FOUNDING_YEAR`

Deliberately absent:

- **Physical copies** → section 5, one line above the button that opens the
  catalogue. A figure a reader cannot act on does not belong in a hero.
- **Per-type counts** → `/theses` and `/publications`, where a count of one is
  context rather than a headline.

`lib/resource-stats-consistency.test.ts` pins that exactly one place mounts
`HeroStatStrip`, and that `SignupCta` states no figure at all.

### The 111-vs-114 reconciliation

Subject counts summed to 111 against a 114-item collection. That was two things:

1. `getDepartmentCountsCached` truncated the taxonomy to **7** departments while
   the library has **8**, dropping one book from the visible total. The cap is
   12 now and is documented as a layout bound; "All subjects" is the honest
   overflow beyond it.
2. The remaining 2 are the thesis and the publication. They are not books, have
   no department, and are correctly absent from a subject grid.

Every published book has exactly one department, so 8 departments sum to 112
books, and 112 + 1 + 1 = 114. The arithmetic is now visible on the page.

## Goal-card routing

`lib/home/goals.ts`. Two rules, both load-bearing:

1. **Match on name fields only** — `title`, `title_km`, `subject`, `tags`. Never
   `description` or `audience`. Matching prose sent "Prepare for PISA" to
   `/paths/classroom-and-school-management` (its description contains "fair
   assessment") and "Develop as a teacher" to the same path (its audience is
   "In-service Teacher").
2. **Claim once** — a path matched by an earlier goal leaves the pool. An
   unmatched goal takes its curated search/listing fallback, which always
   resolves; it never takes a near-miss path.

Declaration order in `GOALS` is both the render order and the claim order, so
reordering that array can change destinations. It is a deliberate edit.

There is **no PISA learning path** in the collection. The PISA-D materials are
books, so that card points at the search that finds them.

## Card rules

One component, `components/ui/home/ResourceCard.tsx`, for both grids.

- Fixed 3:4 cover box with a skeleton — the page holds CLS at 0.00 and must.
- Covers are decorative: `alt=""` + `aria-hidden`. The title is visible text
  inside the same link, so an `alt` repeating it announces the book twice.
- At most **two** metadata items under the title.
- Reader-activity counts are hidden below `MIN_VISIBLE_ACTIVITY` (25). On a
  young collection "4 views" is anti-proof.
- Titles clamp to two lines and carry a `title` attribute: Khmer has no
  inter-word spaces and truncates mid-phrase.

## Counts and announcements

Activity figures render as a pair — `<span aria-hidden>38</span>` plus
`<span class="sr-only">38 views</span>`. Extracting the DOM's raw *text*
concatenates that to `3838 views`, which reads like a duplication bug and is
not one: the accessibility tree sees the sr-only phrase only, and announces it
once. `lib/home/metrics-announcement.test.tsx` pins both halves, so neither can
be removed by someone "fixing" the text extraction.

## Things deliberately not done

- **A sticky mobile search bar.** The app already has a bottom navigation with a
  Search entry; a second persistent search affordance on the same screen edge
  competes with it.
- **Tabs anywhere on the homepage.** The tabbed browse grid was the page's
  largest duplicate. If tabs return, they need the full ARIA tabs pattern and a
  polite live region for the swap — which is why they are not worth it here.
- **A per-section Suspense boundary per data source.** Every fetcher in
  `lib/home-data.ts` already catches its own error and returns an empty result,
  and every section returns `null` when empty. A failed source degrades that
  section only, without a boundary per source.

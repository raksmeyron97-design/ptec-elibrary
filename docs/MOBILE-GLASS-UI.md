# Mobile Glass UI — "solid academic content, glass interaction layer"

Status: implemented on `feat/mobile-glass-ui`. This file is the audit, the
implementation map, and the rules the next change has to respect.

## 1. What the audit found (production, 390 × 844, 2026-09-14)

Measured on `https://library.ptec.edu.kh` with a touch-emulated iPhone
viewport, before any change on this branch.

| Surface | Finding |
|---|---|
| Bottom nav | Flat full-width bar: Home · Digital Library · **Search FAB** · **News** · Profile. Learning Paths — the product's differentiator — was not reachable from it at all; theses and publications were three taps deep in the ☰ drawer. |
| AI assistant | The gold FAB sat on top of page content on every route and collided with the theses "Filters" pill. Its offset was a hand-written `76px + 14px`, one of six copies of the bottom-nav height (`64px`, `4.5rem`, `5.5rem` …) that had already drifted by 8 px. Unreachable from the reader. |
| Search `/search` | ~250 px of heading before the field. The H1 and subtitle were **hard-coded English**, so a Khmer reader saw "Library Search". Controls stacked on three rows (Advanced · Sort · Filter). Each result carried five 32 px buttons plus up to five match chips: **256–342 px per result** for "education". |
| Form fields | **17 public fields** under 16 px (search, hero, assistant, reviews, notes, book-request form, listing sort selects). iOS Safari zooms the whole page into such a field on focus. |
| Books grid | Every card carried a "View" button that is a `<span>` inside the card link — purely visual, ~46 px per card. Category pill over covers at **8 px**, illegible for Khmer. |
| Book detail | The primary **Read online** button sat at **y = 1,816 px** — the third screen. |
| Reader `/read` | The reader already has glass HUDs (navy plate, blur, auto-hide, `inert` when hidden). The shell problem: the site's bottom nav stayed under the reader's own bottom bar — two stacked bottom bars, ~74 px of page lost. |
| Learning path | Its docked "Start learning" and the sticky progress card's identical button were on screen together through the whole steps list. |
| Home | Band order already matched a discovery-first brief (the Sep-10 UX pass). The trust band stacked three figures (~250 px). The hero's constellation printed trending terms **behind** the description and chips — permanently for reduced-motion readers. |
| Authors | 269 authors at ~100 px each: a ~27,000 px page with no way to narrow it (the filter strings existed, unused, since #104). |
| Physical library | Hours and directions appeared only while the catalogue was EMPTY. |
| Error pages | **11 of 14** public `error.tsx` drew a "Try again" button with **no `onClick`**; the other 3 called `reset`, which in Next 16.3 re-renders the same failed server payload. 13 were English-only; one printed `error.message`. |

What was already right and is deliberately **not** rebuilt: the reader HUD,
the page-aware assistant (retrieval scopes to the book you are on, citations
are verified), the dashboard as a personal library, search's retrieval /
suggestions / recents / facets / typo fallback / full-text page hits, the
focus system, the status tokens, dark mode, and the homepage band order.

## 2. What changed, and what it reused

| Area | Reused | Added / changed |
|---|---|---|
| Tokens | `--ptec-*` colour tokens, status surfaces, focus tokens, Tailwind's 4 px spacing scale and radius scale | `--ptec-glass-*` (light + dark, three strengths) and `--ptec-mobile-nav-*` in the first `:root` / `:root.dark` blocks of `app/globals.css`; `.glass-surface`, `--strong`, `--sheet`, `.glass-ink` in `@layer components`, with no-backdrop-filter, `prefers-reduced-transparency` and forced-colours fallbacks. |
| Sheet | `useFocusTrap`, `useMountTransition` | `components/ui/glass/GlassSheet.tsx` — the one bottom sheet, portalled to `<body>`. |
| Dock | — | `components/ui/glass/FloatingDock.tsx` — a page's primary action above the tab bar, shown only while the in-page control it stands in for is off screen, never over the footer. Used by the book page (`MobileReadDock`) and the learning-path page. |
| Shell | `MobileBottomNav` session/avatar logic, `DIGITAL_LIBRARY_ITEMS`, `FooterOpenStatus`'s resolver, `MobileAboutAccordion` | Floating glass tab bar, reworked 2026-09: Home · Explore · Search · Saved · More. *Search* is the raised centre tab and opens a one-tap overlay (`MobileSearchOverlay`, `lib/search/open.ts`) whose field is focused inside the tap, so the phone keyboard comes up — a link to /search could not do that. *Explore* is the former Library sheet with Learning Paths first; *Saved* holds the dashboard, saved books, reading lists and this device's downloads; *More* holds the account, notifications, News, every About page, appearance, language, contact details and the install button. That is everything the ☰ drawer carried, and the drawer is gone below `lg` (`components/layout/mobile-shell-parity.test.ts`). The active indicator is one pill that slides between slots by transform. The phone top bar is sticky, steps aside on scroll-down and returns on scroll-up (`.site-header` in `app/globals.css`, state written by `NavbarStickyWrapper` onto `<html>`); page-level sticky bars offset by `--ptec-sticky-top`. `lib/nav/shell-routes.ts` is the one definition of which tab owns a route and where the bar and FAB step aside. |
| Footer (< md) | `Footer.tsx`, `FooterOpenStatus`, `LanguageSwitcher` | One compact block below 768 px, reworked 2026-09: brand, a one-line mission (`footer.taglineShort`), About · Contact · Privacy · language (44 px targets; `LanguageSwitcher size="touch"`), social icons, then one "More links" disclosure (`FooterMoreLinks`) holding every other link plus the legal pair, and the copyright. The four groups are plain headed lists — no per-column `<details>`, no inline opener script — and every link stays in the DOM while folded. From 768 px up the footer is the unchanged grid. Pinned by `e2e/footer-mobile.spec.ts`. |
| Assistant | `AskWidget` (retrieval, grounding, quota untouched) | `lib/ask/open.ts` opens it pre-filled — never sent. Entry points: search results and no-results, the book dock, the reader's ⋯ menu. The FAB is not rendered on reading routes; the panel opens there on request. |
| Search | `SearchPageClient`, `SearchFacets` | Localised compact header; one control row; phone facets in a `GlassSheet` (one `SearchFacets` instance, placed by `useMediaQuery`); a compact result card built as one grid; "Ask the library"; 16 px fields. |
| Books | `BookCard`, `ActionButtons` | View CTA hidden on phones; legible category pill; the read dock. |
| Reader | Reader HUD untouched | Tab bar hidden on `/books/[slug]/read`; "Ask about this book" in the ⋯ menu. |
| Home | `TrustBar`, `AskLibraryHero`, `HomeSection` | One-row trust band on phones; glass quick-access row; icon-only submit on phones; no constellation labels below `lg`. |
| Utility pages | `getListedAuthors`, `resolveLibraryStatus` | Author filter (progressive, server list untouched); physical-library visit strip; dashboard puts a path in progress beside Continue Reading. |
| Errors | — | `components/ui/core/ErrorRecovery.tsx` for all 14 public boundaries: localised, `retry()`, three ways out. |

## 3. Measurements

All LOCAL unless marked. "Same data" means branch and base served from the
same local Supabase.

| Measure | Before | After |
|---|---|---|
| Book page, first primary action (390 × 844) | y = 1,816 (PRODUCTION) | always on screen (dock) |
| Search result card height, phone | 256–342 px (PRODUCTION, "education") | 222–289 px (LOCAL data) |
| First search result, top | y = 622 (PRODUCTION) | y ≈ 528 |
| Homepage trust band, phone (same data) | 252 px | 150 px |
| Homepage height, phone (same data) | 11,843 px | 11,644 px |
| Public fields under 16 px | 17 | 0 (guarded) |
| Public error boundaries with a working retry | 0 of 14 (3 wired to `reset`) | 14 of 14 (guarded) |
| ESLint warnings in the 63 touched files | 20 | 7 |

Performance before/after is recorded in the pull request.

## 4. Rules

1. **Glass is for controls, never for content.** Navigation, toolbars,
   floating actions, sheets. Book covers, PDF pages, result cards and long
   text stay on solid surfaces.
2. **Text on glass uses `--strong`; secondary text needs `--sheet`.** Their
   opacities are chosen so label colours keep ≥ 4.5:1 over the worst
   backdrop (pure black under light glass, pure white under dark glass).
   The generic 0.68 recipe gives body text 3.4:1 over the homepage hero.
   `--ptec-text-muted` never sits on `--strong`.
3. **Nothing hand-writes the tab bar's height.** Anything fixed to the bottom
   of a phone reserves `var(--ptec-mobile-nav-clearance)` (0 px from `lg`).
4. **One sheet, one dock.** New bottom sheets use `GlassSheet`; a docked
   primary action uses `FloatingDock` and names the control it stands in for.
5. **A route that hides the tab bar or the FAB says so in
   `lib/nav/shell-routes.ts`.**
6. **Fields are 16 px on phones** (`text-base`, original size from `sm:`).
7. **Every public `error.tsx` renders `ErrorRecovery`,** which calls `retry`.
8. **A page-level sticky bar sits at `--ptec-sticky-top`,** never at a
   hand-written `top-0`. Below `lg` the site header is sticky and steps aside
   on scroll-down; the token is its height while it is shown and 0 while it
   is not (and 0 from `lg` up).
9. **Nothing the ☰ drawer carried may drop out of the sheets.** The drawer is
   gone below `lg`; Explore, Saved and More carry its destinations.

Pinned by `lib/glass-tokens.test.ts`, `lib/nav/shell-routes.test.ts`,
`lib/mobile-field-zoom.test.ts`, `lib/error-boundaries.test.ts`,
`components/ui/core/ErrorRecovery.test.tsx`,
`components/layout/mobile-shell-parity.test.ts` and `e2e/mobile-shell.spec.ts`.

## 5. Not done here

- The `/books` and `/posts` filter sheets still hand-roll their sheet; they
  are candidates for `GlassSheet`.
- `ThesisSidebar` has no translations at all (its mobile "Filters" pill is
  English on `/km`).
- The PWA "new version" toast in `UpdateAvailable` is English-only.
- A reduced-motion-only hydration warning on the homepage (a framer-motion
  initial `opacity: 0`) predates this branch.

# Mobile Glass UI — "solid academic content, glass interaction layer"

Status: implemented on `feat/mobile-glass-ui`. This file is the audit, the
implementation map, and the rules the next change has to respect.

## 1. What the audit found (production, 390 × 844, 2026-09-14)

Measured on `https://library.ptec.edu.kh` with a touch-emulated iPhone
viewport, before any change on this branch.

| Surface | Finding |
|---|---|
| Bottom nav | Flat full-width bar: Home · Digital Library · **Search FAB** · **News** · Profile. Learning Paths — the product's differentiator — was not reachable from it at all; theses and publications were three taps deep in the ☰ drawer. |
| AI assistant | The gold FAB sat on top of page content on every route and collided with the theses "Filters" pill. Its offset was a hand-written `76px + 14px`, one of six copies of the bottom-nav height (`64px`, `4.5rem`, `5.5rem` …) that had already drifted by 8 px. |
| Search `/search` | ~250 px of heading before the field. The H1 and subtitle were **hard-coded English**, so a Khmer reader saw "Library Search". Controls stacked on three rows (Advanced · Sort · Filter). Each result carried five 32 px buttons plus up to five match chips — about 270 px per result, ~2.5 results per screen. Inputs at 15 px trigger iOS focus-zoom. |
| Books grid | Every card carried a "View" button that is a `<span>` inside the card link — purely visual, ~46 px per card. Category pill over covers at **8 px**, illegible for Khmer. |
| Book detail | The primary **Read online** button sat at **y = 1,816 px** — the third screen — below a long title, badges and an uncollapsed summary. |
| Reader `/read` | The reader already has glass HUDs (navy plate, blur, auto-hide, `inert` when hidden). The shell problem: the site's bottom nav stayed under the reader's own bottom bar, so phones had two stacked bottom bars and lost ~72 px of page. |
| Home | Order already matched the discovery-first brief (the Sep-10 UX pass). The trust band stacked three figures vertically (~230 px) before the first goal card. |

What was already right and is deliberately **not** rebuilt: the reader HUD,
the page-aware assistant (retrieval scopes to the book you are on, citations
are verified), the dashboard as a personal library, search's suggestions /
recents / facets / typo fallback / full-text page hits, the focus system,
the status tokens, dark mode, and the homepage band order.

## 2. Implementation map

| Area | Reused | Added / changed |
|---|---|---|
| Tokens | `--ptec-*` colour tokens, status surfaces, focus tokens, Tailwind's 4 px spacing scale | `--ptec-glass-*` (light + dark) and `--ptec-mobile-nav-*` in the first `:root` / `:root.dark` blocks of `app/globals.css`; `.glass-surface` / `.glass-surface--strong` in `@layer components` with no-backdrop-filter, `prefers-reduced-transparency` and forced-colours fallbacks. Pinned by `lib/glass-tokens.test.ts`. |
| Sheet | `useFocusTrap`, `useMountTransition` | `components/ui/glass/GlassSheet.tsx` — the one bottom sheet (scrim, focus trap, Escape, scroll lock, `inert` while closing, safe area). Three hand-rolled copies existed; new surfaces use this one. |
| Shell | `MobileBottomNav` session/avatar logic, `DIGITAL_LIBRARY_ITEMS` | Floating glass tab bar: Home · Search · Library · Paths · Profile. *Library* opens a sheet built from the same nav config the desktop mega-menu reads. *News* moved into the Profile sheet (still in the ☰ drawer, footer and homepage). One clearance token replaces six hand-written offsets. |
| Assistant | `AskWidget` (unchanged behaviour) | `lib/ask/open.ts` — `openLibraryAssistant({ prompt })` event, so search and book pages can open the assistant pre-filled (never auto-sent: a question spends quota). FAB steps aside on phone book pages, where the read dock carries the entry point. |
| Search | `SearchPageClient`, `SearchFacets`, suggestion/recents/facet logic untouched | Localised compact header; one control row; mobile facets in a `GlassSheet` (single `SearchFacets` instance, media-query placed); compact result card (one grid, no duplicated links); 16 px inputs; "Ask the library" entry. |
| Books | `BookCard`, `SmartBookCover`, `ActionButtons` | View CTA hidden on phones (the card is the link); legible category pill; `MobileReadDock` — a glass bar that appears only when the in-page actions scroll out of view. |
| Reader | Reader HUD untouched | Site tab bar hidden on `/books/[slug]/read`; `ReaderViewportFill` reserves nothing there. |
| Home | `TrustBar`, `AskLibraryHero`, `HomeSection` | Trust figures in one row on phones; glass quick-access row in the hero; icon-only submit on phones. |

## 3. Rules

1. **Glass is for controls, never for content.** Navigation, toolbars,
   floating actions, sheets. Book covers, PDF pages, result cards and long
   text stay on solid surfaces.
2. **Text on glass uses `--strong`.** Its opacity is chosen so label colours
   keep ≥ 4.5:1 over the worst backdrop (pure black under light glass, pure
   white under dark glass); `lib/glass-tokens.test.ts` computes it.
3. **Nothing hand-writes the tab bar's height.** Anything fixed to the bottom
   of a phone reserves `var(--ptec-mobile-nav-clearance)`, which is `0px` from
   `lg` up.
4. **One sheet.** New bottom sheets use `GlassSheet`.
5. **A route that hides the tab bar says so in `lib/nav/shell-routes.ts`**, the
   one predicate the tab bar, the assistant and the reader agree on.

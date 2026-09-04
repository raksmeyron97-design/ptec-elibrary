# PDF reader — acceptance criteria

Each criterion names how it is checked: **unit** (`npx vitest run`),
**component** (`components/ui/reader/PDFViewer.test.tsx`, react-pdf mocked),
**e2e** (`e2e/reader-ux.spec.ts`, real pdf.js against a generated PDF),
**manual** (recorded in the verification document). A criterion with no
automated check is listed as manual on purpose; nothing here is assumed.

## A. Preserved capabilities (regression gates)

| # | Criterion | Check |
|---|---|---|
| A1 | Range requests, `disableAutoFetch`, 512 KB chunks, self-hosted worker/cMaps/fonts unchanged | unit: `hooks/pdf-options.test.ts` pins the option object |
| A2 | Scroll mode never mounts more than visible + overscan pages (500-page doc → ≤ 12 mounted) | component |
| A3 | Exact-page resume from localStorage; server % only as tiebreak; a more recent server position wins | unit: `lib/reader/resume.test.ts` |
| A4 | Progress autosave stays debounced (no server call per scroll frame); flush on `visibilitychange` | component (fake timers) |
| A5 | `offline` → zero calls to server actions or `/api/reader-events` | component (mocked actions asserted not called) |
| A6 | `allowDownload={false}` → no download control anywhere in the UI | component |
| A7 | Bookmarks persist under `ebook:bm:<id>`, no duplicates | component |
| A8 | Search: sequential, cancellable, capped at 500 matches, results per page | unit (search-matches) + component |
| A9 | Annotations CRUD through existing server actions; no double submit | component |
| A10 | Text-layer ARIA sanitiser still runs | component (dangling `aria-owns` removed) |
| A11 | Khmer digits on every page number when locale is `km` | component |
| A12 | Existing offline e2e passes unchanged | e2e |

## B. Reader HUD & auto-hide

| # | Criterion | Check |
|---|---|---|
| B1 | Controls visible on open; hidden after 3 s of inactivity in every mode | component (fake timers) |
| B2 | Pointer move, touch, or any key reveals them | component |
| B3 | Open panel / menu / dialog / selection popup / focus inside HUD pauses hiding | component |
| B4 | Hidden HUD is `inert` (not focusable) and `aria-hidden` | component |
| B5 | `prefers-reduced-motion` → no fade transition (`motion-reduce:transition-none`) | source check in component test |
| B6 | Page 1 top edge is not under the top bar at scrollTop 0 (content inset) | unit: `lib/reader/virtual.test.ts` |

## C. Mobile

| # | Criterion | Check |
|---|---|---|
| C1 | No horizontal overflow at 320 / 360 / 375 / 390 / 414 px | e2e (viewport loop, `scrollWidth <= clientWidth`) |
| C2 | Every HUD control ≥ 44 × 44 px on phones | e2e (bounding boxes) |
| C3 | Bottom bar honours `env(safe-area-inset-bottom)` in focus mode | source check |
| C4 | Panel opens as a bottom sheet below `md`, side panel at `md+` | e2e (viewport) |
| C5 | Body scroll locked in focus mode; viewport has `overscroll-behavior: contain` | component + source |

## D. Navigation & progress

| # | Criterion | Check |
|---|---|---|
| D1 | Page indicator opens "Go to page"; Enter submits, Esc closes, out-of-range clamps, Khmer digits accepted | unit (`page-input`) + component |
| D2 | Prev/next, swipe (single mode), keyboard ←→↑↓ Home End PageUp PageDown | component (keys) + manual (swipe) |
| D3 | Progress bar reflects current/max; percent localised | component |
| D4 | "Welcome back" prompt appears only when resuming beyond page 1; "Start from beginning" goes to page 1; never overwrites a newer position | component |

## E. Zoom & layout

| # | Criterion | Check |
|---|---|---|
| E1 | Presets: Fit width, Fit page, 75, 100, 125, 150, 200 %; ± steps through levels; 50–300 % clamp | unit (`zoom.test.ts`) + component |
| E2 | Double-tap toggles fit-width ↔ zoomed; pinch previews with CSS only | manual (touch) + unit (`doubleTapTarget`) |
| E3 | Focus mode maximises the reader, traps focus, Esc exits, restores focus | component |
| E4 | Settings dialog edits the same persisted preferences (no second store) | component (localStorage keys) |

## F. Panels

| # | Criterion | Check |
|---|---|---|
| F1 | Tabs: Pages, Contents, Bookmarks, Search, Highlights (last only signed-in) | component |
| F2 | Contents: numbered top level, nested indent, current section marked, empty state | unit (`outline.test.ts`) + component |
| F3 | Bookmarks show nearest section title when the outline resolves one | unit + component |
| F4 | Search input debounced (≥ 300 ms), Enter cycles matches, stale results discarded | component (fake timers) |
| F5 | Selection popup: Highlight (one tap, default colour), Note, Copy | component |
| F6 | Citation dialog offers APA 7 / MLA / Chicago only when title + (author or year) exist; page reference copies "(Author, Year, p. N)" | unit (`citations.test.ts`) + component |
| F7 | Shortcut help lists exactly the bindings the handler implements | unit (`shortcuts.test.ts` cross-checks handler source) |

## G. Loading, errors, offline

| # | Criterion | Check |
|---|---|---|
| G1 | Loading shell shows title and a page-shaped placeholder sized from the persisted aspect ratio | component |
| G2 | Error kinds (missing / permission / invalid / network / offline / unknown) each render their own copy and actions | unit (`errors.test.ts`) + component |
| G3 | Report-broken-file link contains no query string or storage host | unit (`telemetry.test.ts`) |
| G4 | Offline badge shown when served from cache | component |

## H. Performance

| # | Criterion | Check |
|---|---|---|
| H1 | Overscan is 0 until page 1 paints, then the network tier's value (slow 1 / normal 2 / fast 3; `saveData` → 1) | unit (`preload.test.ts`) + component |
| H2 | Scroll handler is rAF-throttled: 20 scroll events in one frame → 1 state update | component |
| H3 | Unmount removes window/document listeners, observers and timers | component (spy counts) |
| H4 | First page paint on a 3-page generated PDF < 3 s in e2e (dev server) | e2e |
| H5 | No literal colour outside the reader token block; chrome colours come from `--reader-*` | source check |

## I. Accessibility & i18n

| # | Criterion | Check |
|---|---|---|
| I1 | axe: no critical/serious violations on the reader (existing `e2e/a11y.spec.ts`) | e2e |
| I2 | Every dialog: `role="dialog"`, `aria-modal`, labelled, focus trapped, Esc closes, focus restored | component |
| I3 | Every new string exists in `messages/en.json` and `messages/km.json` | unit (`i18n-parity.test.ts`) |
| I4 | No `locale === "km" ? … : …` string branches remain in reader components | source check in component test |

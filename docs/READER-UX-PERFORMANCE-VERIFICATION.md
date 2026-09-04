# PDF reader — UX & performance verification

Companion to [READER-UX-PERFORMANCE-AUDIT.md](./READER-UX-PERFORMANCE-AUDIT.md)
(what was found) and [READER-UX-ACCEPTANCE.md](./READER-UX-ACCEPTANCE.md)
(what "done" means). This document records what changed, what was verified,
how, and what remains open. Every PASS below names the command or test that
produced it; anything not verified says so.

Verified on 2026-09-04 against the local stack (`npm run dev`, local Supabase
on 54331, Chromium via Playwright — Desktop Chrome and Pixel 5 projects).

---

## 1. Architecture

**Before:** one 3,205-line `PDFViewer.tsx` holding ~45 state variables, three
toolbars with duplicated menu rows, gestures, search, annotations and
persistence.

**After:** `PDFViewer.tsx` is a 1,000-line orchestrator that owns state and
composition only. Responsibilities moved to:

| Layer | Files | Tests |
|---|---|---|
| Pure logic (`lib/reader/`) | `geometry`, `virtual`, `preload`, `resume`, `page-input`, `outline`, `errors`, `shortcuts`, `telemetry`, plus additions to `zoom` | one `*.test.ts` each — 111 tests, no DOM |
| Hooks (`components/ui/reader/hooks/`) | `useResolvedPdfFile`, `useReaderTelemetry`, `useReaderPreload`, `useAutoHideControls`, `useTextLayerA11y`, `useReaderGestures`, `useReaderKeyboard`, `useFocusModeTrap`, `useReaderProgress`, `useReaderSearch`, `useReaderOutline`, `useReaderAnnotations`, `useSelectionPopup`, `useMediaQuery`, `useLatest` | exercised through the component suite |
| Components | `ReaderHUD` (top + bottom bars), `ReaderPanel` + `panels/*`, `ReaderMenu`, `ReaderModal`, `ReaderPageNavigator`, `ReaderMoreMenu`, `ReaderSettings`, `ReaderShortcuts`, `ReaderCitation`, `ReaderContinuePrompt`, `ReaderLoadingState`, `ReaderErrorState`, `ReaderSelectionPopup`, `ReaderPage`, `ReaderViewportFill`, rewritten `ZoomControl` | `PDFViewer.test.tsx` (40 tests, react-pdf mocked at the module boundary), `ReaderViewportFill.test.tsx` |
| Options | `pdf-options.ts` — the pdf.js document options, pinned | `pdf-options.test.ts` |
| Citations | `lib/citations.ts` gained generic `mla()`, `chicago()`, `inTextReference()`; `lib/books/citation.ts` adapters | `lib/books/citation.test.ts` |

Rules that held: high-frequency handlers (scroll, touch, wheel, pointermove)
read refs via `useLatest` and are bound once; pure modules import no React;
components receive values and callbacks. `ThemeControl.tsx` and the old
`useAutoHideControls.ts` were removed (superseded). `ThumbnailsPanel` kept its
virtualiser and only changed colour classes.

Props are a superset of the old ones; thesis and publication callers work
unchanged. New: `backHref`, `onClose`, `fullReaderHref`, `citation`, `layout`,
`initialProgressAt`.

## 2. UX

- **HUD**: a top bar (back/close · title · offline badge · search · panel ·
  theme · bookmark · ⋯) and a bottom bar (prev · page · next · progress ·
  zoom) overlaid on the document; scroll content is inset by their heights
  (`HUD_INSET_TOP/BOTTOM`, mirrored into CSS custom properties) so page 1's
  first lines and the last page's last lines are never covered.
- **Auto-hide in every mode**: visible on open, hidden after 3 s idle; pointer
  movement, touch or any key reveals; panels, menus, dialogs, the selection
  popup, the welcome-back card, pointer hover over a bar and focus inside a
  bar all pause hiding; opening any of those also reveals. Hidden bars are
  `inert` + `aria-hidden`. Reduced motion: no transition.
- **Page navigator**: the indicator opens "Go to page" (Enter, Esc, clamping,
  Khmer numerals).
- **Welcome back**: shown only after the reader has already been positioned,
  only when the page is > 1, auto-dismisses; "Start from beginning" is the
  one alternative.
- **Panel**: side column on `md+`, bottom sheet below; tabs Pages / Contents /
  Bookmarks / Search / Highlights (signed-in). Contents is numbered, nested,
  marks the current section; bookmarks are labelled with the nearest heading.
- **Search**: debounced (350 ms, ≥ 2 chars), "n of m", previous/next, Enter
  cycles, one row per page.
- **Selection**: colour chips · Highlight · Note · Copy, anchored on the
  selection's own box (works for touch selections).
- **Citation**: APA 7 / MLA / Chicago from the same `CitationWork` the book
  page uses, plus a page reference and DOI copy; offered only when title and
  an author or year exist.
- **Settings** (same persisted preferences), **shortcut help** (generated from
  the one binding list), **error screens** per failure kind with only the
  actions that help, **Focus reading** (F) as a modal, focus-trapped surface.
- All strings through `next-intl`; 86 keys added to both catalogues; the six
  inline `locale === "km" ? …` branches are gone (source-scanned).

## 3. Mobile

- Phone layout: `‹ 42/245 ⋯` above, `🔖 − 100% + ☰` below; every HUD control
  ≥ 44 × 44 px (e2e asserts bounding boxes on Pixel 5).
- Bottom sheet for the panel, focus-trapped, `env(safe-area-inset-bottom)`.
- `overscroll-behavior: contain` on the viewport; body scroll locked in
  focus mode; `touch-action: pan-x pan-y` kept so the custom pinch handler
  still receives events.
- No horizontal overflow at 320 / 360 / 375 / 390 / 414 px (e2e loop).
- **Dedicated routes fill the free viewport** (`ReaderViewportFill`): the
  public layout keeps a sticky navbar above and a fixed tab bar below `lg`;
  the reader is sized to what is left, so its own bottom bar is on screen.
  Found from screenshots during verification, not from tests — see §9.

## 4. Performance

What was measured, and how:

| Measure | Method | Result |
|---|---|---|
| Time to first painted page (generated 40-page PDF, dev server, stubbed file route) | the reader's own `pdf_first_page` beacon captured in e2e | `durationMs` < 10 000 asserted; 1 request, 1 beacon per document |
| Pages mounted for a 40-page document | e2e `[data-page]` count | < 20 (visible + ≤ 3 overscan per side) |
| Pages mounted for a 500-page document | component test | ≤ 12 |
| Scroll handler | component test — one state update per frame | PASS |
| Listener/observer/timer cleanup on unmount | component test — `addEventListener` vs `removeEventListener` spies | PASS |
| pdf.js network shape | `pdf-options.test.ts` | unchanged: 512 KB ranges, `disableAutoFetch`, streaming, no CDN |

What changed:

- **First-page priority**: overscan is 0 until page 1 paints
  (`preloadPolicy(hints, firstPagePainted)`), and the overscan rows render in
  a `useDeferredValue` pass after the visible window, so the page the reader
  is looking at is first in pdf.js's queue.
- **Adaptive preload** (`lib/reader/preload.ts`): slow 1 / normal 2 / fast 3
  rows per side, `Save-Data` → 1, Network Information only where present.
  The ceiling is 3 because every mounted page holds a canvas at up to DPR 2.
- **Stable anchoring**: a row-height change (page 1's real aspect replacing
  the A4 placeholder, or rotation) re-anchors the viewport on the current
  page at the same fraction; a programmatic scroll is ignored as a page
  change until it *arrives* at its target, not until a timer expires.
- **No persistence before load**: nothing is written to localStorage or the
  server until the document has loaded — the placeholder page derived from
  the `pages` column used to be saved 400 ms after mount, over the real
  position (a 12-page file recorded as 120 pages saved "page 120, 100%").
- **Resume from the real page count**: the server percentage is applied to
  `pdf.numPages`, not the metadata count. Whichever position is newer wins:
  the device record now carries a timestamp and the server row's
  `last_read_at` is passed in (`initialProgressAt`).

Not measured (and not claimed): memory over a long session in a real
browser; zoom latency on a low-end phone; behaviour on a 100 MB scanned book
against production storage. The pdf.js options and the proxy that govern
those were not changed, so the LARGE-PDF measurements stand.

## 5. Offline

- `offline` still derives `isLoggedIn = prop && !offline`; the component
  test "offline mode" asserts zero calls to any server action and zero
  telemetry beacons after navigation and after the autosave window.
- `useResolvedPdfFile` (Cache Storage, `ignoreSearch`) is unchanged; the
  object URL is revoked on unmount.
- `e2e/offline-reading.spec.ts`: the reader-level specs pass (save/verify,
  library, reader from Cache Storage with `/api/**` aborted, page
  navigation, phone viewport); the two true-offline-navigation specs skip
  under `npm run dev` as before (they need the service worker, i.e. a
  production build).
- The offline reader passes `backHref` and `layout="fill"`; the "Available
  offline" badge is shown in the top bar when the bytes came from cache.

## 6. Accessibility

- `e2e/a11y.spec.ts` "PDF reader" (axe, light + dark): PASS.
- Dialogs: `role="dialog"`, `aria-modal`, labelled, focus trapped, Escape
  closes, focus restored (component tests for navigator, settings,
  shortcuts, focus mode).
- Menus: `role="menu"`, roving arrow keys, Home/End, Escape restores focus
  to the trigger, tap-outside closes.
- Tabs: real `tablist`/`tab`/`tabpanel` with arrow-key movement.
- Live regions: page position and status announcements kept; progress bar
  carries `aria-valuetext`.
- pdf.js text-layer ARIA sanitiser kept and extended to handle a mutated
  node that itself carries the attribute (component test).
- Focus colour inside the reader is retargeted to the brand accent via the
  focus-system tokens (the site's blue ring is invisible on navy); no
  component paints its own ring, so the one-indicator rule holds.

## 7. Security

- No route, action or policy changed. `allowDownload={false}` hides every
  download control (component test); the server gate
  `/api/books/[slug]/download` and the `?download=1` redirect are untouched.
- The reader never receives `book_files.file_url`; the report-a-problem
  mailto carries the PDF's path only (`safePdfPath`, unit-tested: no query,
  no non-web scheme). Telemetry payloads carry counts and enums only.
- `useFocusTrap` gained an optional `initialFocus` selector; no behaviour
  change for existing callers.
- CSP unchanged; no new dependencies; no CDN.

## 8. Testing

```
npx tsc --noEmit                                   clean
npx eslint <touched files>                         0 errors, 0 warnings in touched files
                                                   (the full `npm run lint` reports 8 errors,
                                                   all in .claude/worktrees/bulk-import-v1/public/* —
                                                   a leftover worktree's generated files, untracked
                                                   by CI)
npx vitest run                                     see "Final counts" below
npx playwright test e2e/reader-ux.spec.ts \
  e2e/offline-reading.spec.ts e2e/a11y.spec.ts \
  --grep "PDF reader|offline|reader"               36 passed, 6 skipped, 0 failed (3.2 min, final run)
                                                   the 6 skips: two true-offline-navigation specs
                                                   (need the service worker, i.e. a production
                                                   server) and project-specific viewport specs
npm run build (webpack, after rm -rf .next)        see "Final counts" below
```

New test files: `lib/reader/{geometry,virtual,preload,resume,page-input,
outline,errors,shortcuts,telemetry}.test.ts`, `lib/books/citation.test.ts`,
`components/ui/reader/{PDFViewer,ReaderViewportFill}.test.tsx`,
`components/ui/reader/pdf-options.test.ts`, `e2e/reader-ux.spec.ts`.
`e2e/offline-reading.spec.ts` was updated for the new page control.

Final counts are appended at the bottom of this file after the last run.

## 9. Defects found and fixed during verification (not in the audit)

These were found by tests or by looking at the running reader, and each is
now pinned by a test:

1. **Placeholder position persisted before load** (§4) — real, pre-existing
   in spirit; the new code made it visible. Fixed + test.
2. **Resume used the metadata page count** — a 12-page file with `pages=120`
   resumed at the last page. Fixed + test.
3. **Stale server position beat a newer device position** whenever they
   differed by > 2 points (the `pagehide` flush is a plain server-action
   fetch and is cancelled by navigation). Timestamped rule + test.
4. **Row-height change drifted the viewport** by up to eight pages on
   landscape documents. Re-anchor effect.
5. **Programmatic smooth scroll read as a page change** after a fixed 700 ms.
   Arrival-based guard.
6. **`/` stopped propagation before the auto-hide listener saw it**, so a
   hidden HUD stayed hidden when the search panel opened. Capture-phase
   listener + reveal-on-pause + test.
7. **First-page telemetry could fire twice / the "slow" beacon could fire
   spuriously** when a child reported a load before the parent's effect ran.
   Document-keyed guard, render-started clock + test.
8. **MLA/Chicago emitted "n.d.."**; **a 4G label with a measured mid-range
   downlink was "fast"**. Both caught by the first unit run.
9. **Dedicated reader routes overflowed the viewport** behind the site's
   fixed tab bar (screenshots). `ReaderViewportFill`.

## 10. Remaining risks

- ~~**The `pagehide` flush is best-effort.**~~ **Closed** — see §11.
- **Real-device gestures** (pinch, double-tap, swipe) were not exercised
  by automation; the gesture code was moved, not rewritten, and the pure
  decisions (`doubleTapTarget`, `isAtFitWidth`) are unit-tested.
- **Memory on a 500-page scanned book in a real browser** was not measured
  in this pass; the mounted-window bound is what the tests pin.
- **Environment flakiness observed**: `ERR_NETWORK_IO_SUSPENDED` when the
  machine suspended network I/O mid-run, and 90 s timeouts when the full
  unit suite ran alongside e2e on the dev server. Neither reproduced in
  isolation.
- Two `react-hooks/set-state-in-effect` warnings are suppressed with
  comments where the documented reset pattern is used.

---

## 11. Follow-up: reliable teardown flush + lint/database cleanup

Both remaining items from the first report were closed on 2026-09-04.

### 11.1 The position now survives the tab closing

`saveReadingProgress` is a Server Action, invoked through a `fetch()` this
code does not own and cannot set `keepalive` on, so the browser cancelled it
when the document went away — losing the last page turn in exactly the case
that matters, a reader finishing a session and closing the tab.

| Piece | What it does |
|---|---|
| `lib/reading-progress.ts` | `upsertReadingProgress(userId, bookId, pct)` — the one definition of the write, including the `max_progress_pct` high-water rule. Both transports call it, so they cannot drift. |
| `app/api/reader/progress/route.ts` | `POST` with the session cookie deciding whose row is written. Same-origin guard, 1 KB body cap, UUID + number validation, per-user rate limit (`readerProgress`, 60/min, `RL_READER_PROGRESS_PER_MIN`), 204 on success. |
| `app/actions/reading-progress.ts` | Still the DEBOUNCED autosave path; now delegates to the shared core. |
| `useReaderProgress` | The teardown flush (`visibilitychange` → hidden and `pagehide`) posts to the endpoint with `keepalive: true`. |
| `lib/http/same-origin.ts` | The origin check extracted from `app/api/push/_utils.ts` so both writers share it, including its hard-won Cloudflare-Tunnel handling. Push keeps its own error shape. |

Two decisions worth recording:

- **The endpoint is a new authenticated write surface, so it is guarded like
  one.** The user comes from the session and never from the body, a
  cross-origin POST is refused *before* authentication, the body is validated
  before any query, and the service client is opened only after the caller is
  known. `app/api/reader/progress/route.test.ts` proves each of those by
  calling the route directly.
- **The sync marker is written BEFORE the request on this path only.** The
  autosave marks when the save resolves; the teardown flush cannot, because a
  `.then()` does not run once the document is gone. localStorage is
  synchronous so it completes during teardown, and `keepalive` is the
  platform's guarantee that the request will be sent, so recording it up front
  is honest. If the server refuses it anyway, `s` names a value the server does
  not hold and `resolveResumePage` falls through to its timestamp/tolerance
  branches — the behaviour that stood before the marker existed.

Tests added: 8 route tests, plus 4 in `PDFViewer.test.tsx` (the flush uses the
keepalive endpoint and not the action; `pagehide` writes the marker
synchronously; no flush when nothing moved; a fetch that throws during teardown
does not break the page). The offline test now also asserts that firing
`visibilitychange` and `pagehide` with `offline` set produces no fetch at all.

### 11.2 The legacy-R2 500 on a checkout with no R2

Opening the one seeded readable book locally answered **500**, not a reader.
`supabase/seed.sql` gives it a `book_files` row whose `file_url` is a bare
legacy R2 key (`books/seed/foundations-of-education.pdf`). That is not an
`http(s)://` URL, so the file route fell through to the legacy R2 branch and
presigned with `Bucket: process.env.R2_BUCKET_NAME!` — which is an **empty
string** in every local checkout. The AWS SDK threw `No value provided for
input HTTP label: Bucket` and the throw escaped unhandled.

Two things were wrong and both are fixed:

- **A missing bucket is not a crash.** `app/api/books/[slug]/file/route.ts` and
  `app/api/theses/[id]/file/route.ts` now check the R2 configuration before
  presigning and answer the same honest 404 the Zima branch already returns for
  an object storage does not have, with the presign and fetch wrapped in a
  `try/catch`. This is not a new pattern:
  `app/api/publications/[slug]/file/route.ts` already carried exactly this
  guard, so the fix was to bring the other two routes up to it rather than
  invent anything. R2 is the *legacy* fallback, so a deployment holding no R2
  credentials at all is an ordinary configuration, not an error.
- **The reader is openable locally again.** Only outside production, and only
  once real storage has been ruled out, the books route serves a
  clearly-labelled placeholder PDF (`lib/dev/placeholder-pdf.ts`). It prints
  "Development placeholder — not library content" on every page, so it cannot
  be mistaken for a book; it is gated on `NODE_ENV !== "production"` so it is
  impossible in a build; it logs a warning every time; and
  `DEV_PLACEHOLDER_PDF=off` restores the plain 404 for anyone working on the
  reader's error states. It honours `Range`, so the reader exercises the same
  byte-range path it uses against real storage.

Verified end to end, with **no** file-route stub, against the seeded book:
`/api/books/<id>/file` answered `200` carrying `X-Ptec-Placeholder:
development`, pdf.js rendered, and the reader reported "Page 1 of 8".

Tests: `lib/dev/placeholder-pdf.test.ts` (the generated document is a real PDF
— every cross-reference offset is checked to land on its object — plus range,
escaping and the production lock) and six cases added to
`app/api/books/[slug]/file/route.test.ts` covering never-500, the 404 with the
placeholder off, the 404 in production, the labelled 200 in development, the
inline-only rule still holding for a placeholder, and an anonymous caller still
refused before storage is reached.

### 11.3 Lint and the local database

- `eslint.config.mjs` ignores `.claude/**`. Those are full second checkouts
  with their own `node_modules` and their own generated `public/sw.js` and
  bundled PDF.js workers; every one of the 8 errors came from that vendored
  build output, none from code on this branch. It mirrors the exclusion
  `vitest.config.ts` already carries. `npm run lint` now reports **0 errors**
  (140 warnings, all pre-existing and configured as warnings on purpose).
- The `reading_progress` rows the Playwright runs wrote for the seeded
  `@ptec.local` accounts were deleted, scoped by email in a transaction.
  `supabase/seed.sql` seeds no rows in that table, so the local database is
  back to its seeded state (0 rows).

### 11.4 Two e2e tests were wrong, and the keepalive flush proved it

Making the flush reliable exposed real test defects rather than causing them:

- **The resume test read another test's position.** A `keepalive` beacon
  deliberately outlives its page, so the one fired as the *search* test's page
  closed landed while the resume test was setting up — leaving the shared
  account at page 7 of 40 (17.5%), exactly where that search test ends. This is
  the feature behaving correctly: close a tab at page 7, reopen, resume at page
  7. The test now takes an account no other test touches.
- **The auto-hide test assumed the HUD was up when it started looking.**
  Opening the reader can itself take longer than the 3 s idle delay, and the
  reveal was asserted with a retrying matcher that, when starved under four
  parallel workers, observed the *next* hide. It now establishes the visible
  state with a deliberate act and reads the revealed state once, and it reveals
  with the gesture the device actually has — a phone has no hover, so it taps.
  Confirmed by instrumenting the events the reader root receives on a Pixel 5:
  a tap fires `pointerdown`/`touchstart` and the HUD returns.

Offline specs run clean serially (22 passed, 2 service-worker skips); the four
failures seen under four parallel workers on a dev server were contention, and
did not reproduce.

---

## Final counts (last run, 2026-09-04)

| Check | Result |
|---|---|
| `npx tsc --noEmit` | clean |
| `npx vitest run` | 223 files passed, 2 skipped · 3,445 tests passed, 50 skipped, 0 failed (baseline before this work: 3,321 passed) |
| `npx playwright test` (reader, offline, a11y reader) | 36 passed, 6 skipped, 0 failed |
| `npm run build` (webpack, after `rm -rf .next`) | exit 0, 114 static pages |
| `git diff --check` | clean |

# PDF reader — UX & performance audit

**Scope:** `components/ui/reader/*`, `lib/reader/*`, the routes and actions
that feed the reader (`/books/[slug]/read`, `/books/[slug]`, the protected
file route, reading-progress, annotations, download, reader telemetry), the
offline reader and the service-worker rules that make it work.

**Method:** source read in full (`PDFViewer.tsx` was 3,205 lines), git history
of the reader, the two existing large-PDF documents, the message catalogues,
the CSS token system, the unit and e2e suites. Baseline before any change:
`tsc --noEmit` clean, `vitest run` 3,321 passed / 50 skipped.

Companion documents: [READER-UX-ACCEPTANCE.md](./READER-UX-ACCEPTANCE.md)
(what "done" means, measurably) and
[READER-UX-PERFORMANCE-VERIFICATION.md](./READER-UX-PERFORMANCE-VERIFICATION.md)
(what was verified after the change).

---

## 1. Architecture as found

```
/books/[slug]/read (auth-gated server page)
  └─ <PDFViewerClient>  ── next/dynamic ssr:false ──▶ <PDFViewer>   (3,205 lines)
/books/[slug] (detail page)
  └─ <PDFReaderLauncher> (click-to-mount preview) ──▶ <PDFViewerClient>
/offline-reader?id=…
  └─ <OfflineBookReader> (Cache Storage → Blob → object URL) ──▶ <PDFViewerClient offline>
theses / publications
  └─ FullTextSection / PDFPreviewSection ──▶ <PDFViewerClient allowDownload={false|true}>

PDFViewer
  ├─ react-pdf <Document options={cMaps, standard fonts, isEvalSupported:false,
  │              disableAutoFetch:true, rangeChunkSize:512 KB}>
  ├─ scroll mode: fixed-row virtualizer (visible + 2 overscan), spacer divs
  ├─ single mode: current page + off-screen prev/next preload
  ├─ pinch preview (CSS transform, rAF), commit on release, focal-point effect
  ├─ ctrl/⌘+wheel zoom, double-tap, swipe, keyboard (capture-phase)
  ├─ localStorage: theme/view/fit/zoom (global), rotation/pos/bookmarks/aspect (per book)
  ├─ server: saveReadingProgress (1.5 s debounce + visibilitychange flush),
  │          annotations CRUD, incrementDownloadCount, /api/reader-events beacon
  ├─ in-document search: sequential getTextContent, per-page cache, seq cancel
  ├─ pdf.js text-layer ARIA sanitiser (MutationObserver)
  └─ side panel (overlay): pages / outline / bookmarks / search / notes
```

Everything in that tree is real, measured work. The 512 KB range size, the
cached book row in the file route, the `fileRange` rate bucket and the
`pdf_first_page` telemetry all came out of
[LARGE-PDF-PERFORMANCE-AUDIT.md](./LARGE-PDF-PERFORMANCE-AUDIT.md); the offline
resolution (`caches.match` with `ignoreSearch`) and the `offline` prop came out
of [PWA-OFFLINE-READING.md](./PWA-OFFLINE-READING.md). None of it is touched
by this work except to move it into a file whose name says what it does.

## 2. Strengths worth preserving (and why each exists)

| Mechanism | Why it exists | Kept |
|---|---|---|
| `rangeChunkSize: 512 KB`, `disableAutoFetch` | every range is a fully authorised proxy round-trip; 64 KB blew the 30/min limit before page 1 | yes, unchanged |
| Self-hosted worker + cMaps + standard fonts | offline reading, Khmer/CID fonts, no CDN | yes |
| Cache-Storage-first source (`ignoreSearch`) | saved book opens with the radio off | yes |
| `isLoggedIn = prop && !offline` | one place switches off every server call offline | yes |
| Row virtualiser with spacers | 500-page books never mount 500 canvases | yes, extended |
| `MAX_RENDER_DPR = 2` | retina phones otherwise raster 4× canvases | yes |
| pdf.js `pageColors` for dark theme | no CSS invert; images and highlights stay usable | yes |
| Pinch = CSS preview, commit on release | no canvas re-raster per finger move | yes |
| Focal-point scroll adjustment on width change | zoom keeps the point under the finger/pointer still | yes |
| Exact-page localStorage resume, server % as tiebreak | server stores a rounded %, ~5 pages off on a 500-page book | yes |
| Search per-page text cache + sequence token + yield every 10 pages | cancels stale searches, keeps low-end phones responsive | yes |
| `aria-owns` / prohibited `aria-label` stripping | axe critical violations from pdf.js's structure tree | yes |
| `pdf_first_page` with request/byte counts from Resource Timing | the number the large-PDF work optimises | yes |
| Capture-phase `/` handler | navbar binds `/` site-wide | yes |

## 3. Weaknesses found

### 3.1 Structure
- **One 3,205-line component** holding ~45 `useState`s, ~12 refs mirroring
  state, gesture code, search, annotations, three toolbars and two menus that
  duplicate every item. Every change risks the wrong closure.
- Menu rows are copied between the desktop `⋯` menu and the mobile `⋯` sheet
  (view mode, rotate, bookmark, save, download, fullscreen appear twice).
- Hard-coded English/Khmer branches inside JSX (`locale === "km" ? "…" : "…"`)
  in six places bypass `next-intl` — "pages left", the annotation note
  placeholder, Save/Cancel, the empty-annotations copy, "Page".
- `PDFViewerClient`'s dynamic `loading` says "Loading document..." in English
  only.

### 3.2 UX
- **Toolbar is always visible** except in fullscreen: on a phone the document
  gets `76vh` minus a 44 px bar, and on desktop a dense two-row bar
  (title, sidebar, search, notes, pagination, zoom cluster, theme, progress,
  fullscreen, more) competes with the page.
- Page navigation is a bare `<input type=number>` — no clamping feedback, no
  Khmer digits in the field, spin buttons hidden by CSS.
- No "welcome back" — the reader silently lands mid-book, which readers report
  as "it opened on the wrong page".
- Bookmarks are page numbers only ("Page 42"); the outline is not used to
  label them.
- Outline is an unnumbered tree with no current-section indication.
- Search runs only on Enter; results show a page and a snippet but the
  match counter and prev/next are cramped into one row.
- Selection popup is a card with colour dots, a note field and Save/Cancel —
  no quick "Highlight" or "Copy".
- No citation from inside the reader although `lib/books/citation.ts`
  already formats APA/BibTeX/RIS from real metadata.
- No settings surface; preferences are spread across the zoom menu, the `⋯`
  menu and the theme toggle. No keyboard-shortcut help beyond a hover hint.
- Error state is a red paragraph with two buttons for every kind of failure.

### 3.3 Mobile
- Bottom toolbar has seven 40 px-wide controls in a 320 px viewport with
  `gap-0.5`; the page `<input>` is 40 px wide.
- Safe-area inset is applied only in fullscreen.
- The side panel is a left drawer at 85 % width on phones — usable, but a
  bottom sheet is the platform idiom and leaves the page partly visible.
- No body-scroll lock in fullscreen; `overscroll-behavior` unset, so
  pull-to-refresh can fire mid-read on Android.

### 3.4 Performance
- **Overscan pages mount in DOM order**, so on load the two pages *above* the
  resume position (when resuming) queue ahead of the visible one in pdf.js's
  worker. First page speed is not explicitly prioritised.
- Overscan is a constant `2` regardless of connection or `Save-Data`.
- `virtualRange` / `visiblePages` are recomputed from `scrollTop` state that
  updates once per animation frame — fine — but `scrollTop` also drives a
  re-render of the whole 3,205-line component on every frame of scrolling
  (all memoised subtrees bail out, but the parent still runs).
- `annotations.some(...)` runs per mounted page per render to decide whether a
  custom text renderer is needed.
- Every mounted `<Page>` keeps its canvas at up to DPR 2; at a 1,000 px page
  width that is ~11–22 MB per page, so overscan is a memory knob, not a free
  preload.
- The active-match scroll uses a 150 ms `setInterval` poll (bounded at 12
  tries) — acceptable, but noted.

### 3.5 Accessibility
- Hidden fullscreen toolbar gets `aria-hidden` and `pointer-events-none` but
  remains in the tab order (`inert` not used) — a keyboard user can focus an
  invisible control.
- Overlay menus are plain `<div>`s with a backdrop; no `role="menu"`, no
  roving focus, no focus restore (the zoom menu does this correctly; the two
  `⋯` menus do not).
- The side panel has no focus management on phones; Escape works via the
  global handler only.
- The document viewport announces "Page N / M" on every page change through a
  live region — correct — but zoom announcements and page announcements share
  the same politeness and can interleave.
- `title` attributes duplicate `aria-label` on every tool button (harmless,
  noisy for some screen readers).

### 3.6 Security posture (no defects found)
- `allowDownload` only hides UI; the server gate is `/api/books/[slug]/download`
  (0131) and `?download=1` on the file route redirects into it. Verified
  unchanged by this work.
- `book_files.file_url` never reaches the client (`bookFileHref()` only);
  the report-broken-file mailto uses `safePdfPath()` (path, no query).
- Telemetry sends counts and enums only.

## 4. Proposed architecture

```
components/ui/reader/
  PDFViewer.tsx            orchestrator — state ownership + composition only
  PDFViewerClient.tsx      ssr:false wrapper (localised loading shell)
  ReaderHUD.tsx            top bar (back · title · bookmark · ⋯) + bottom bar
                           (page indicator · progress · prev/next · zoom)
  ReaderPanel.tsx          desktop side panel / mobile bottom sheet + tabs
  panels/                  ReaderOutline, ReaderBookmarks, ReaderSearchPanel,
                           ReaderAnnotations (ThumbnailsPanel unchanged)
  ReaderPageNavigator.tsx  "Go to page" dialog
  ReaderMoreMenu.tsx       overflow menu (role=menu, roving focus, restore)
  ReaderSettings.tsx       appearance / layout / page / reading
  ReaderShortcuts.tsx      keyboard help, generated from lib/reader/shortcuts
  ReaderCitation.tsx       APA 7 / MLA / Chicago + page reference (+DOI)
  ReaderContinuePrompt.tsx "Welcome back" card
  ReaderLoadingState.tsx / ReaderErrorState.tsx
  ReaderSelectionPopup.tsx Highlight · Note · Copy
  ReaderModal.tsx          accessible dialog primitive (focus trap, Esc, restore)
  ReaderPage.tsx           one virtualised scroll page (was ScrollPage)
  hooks/
    useResolvedPdfFile.ts  useReaderTelemetry.ts  useReaderGestures.ts
    useReaderKeyboard.ts   useReaderSearch.ts     useReaderProgress.ts
    useReaderOutline.ts    useReaderAnnotations.ts useSelectionPopup.ts
    useTextLayerA11y.ts    useReaderPreload.ts    useAutoHideControls.ts
lib/reader/
  zoom.ts (existing)       search-matches.ts (existing)
  geometry.ts              page width / aspect / row height (pure)
  virtual.ts               visible + overscan ranges, page-at-scroll (pure)
  preload.ts               network-aware overscan/neighbour policy (pure)
  resume.ts                local-vs-server resume decision (pure)
  page-input.ts            page-number parsing incl. Khmer digits (pure)
  outline.ts               flatten/number outline, current section (pure)
  errors.ts                classifyPdfError (pure)
  shortcuts.ts             the one list the handler and the help dialog share
  telemetry.ts             sendReaderEvent / measurePdfTransfer / safePdfPath
```

Rules for the split:
- A hook owns a *responsibility* (gestures, search, progress), not a slice of
  JSX. Components receive values and callbacks; they do not reach for refs.
- High-frequency handlers (scroll, touch, wheel, pointermove) read refs and
  never close over state.
- Pure modules have no React import so they run in the existing unit runner
  without a DOM.

## 5. Risk assessment

| Risk | Likelihood | Mitigation |
|---|---|---|
| Regressing the resume position while adding the prompt | medium | the prompt is shown *after* the existing resume logic positions the reader; "Start from beginning" is the only alternative action |
| Overlay HUD covers the top of page 1 | high without care | scroll content gets a top/bottom inset equal to the HUD heights; `lib/reader/virtual.ts` carries the inset in every calculation |
| Auto-hide hides controls a keyboard user is about to use | medium | hidden HUD is `inert`; any keydown reveals it; focus inside the HUD pauses the timer |
| Side panel in flow changes page width → re-raster | expected | focal-point effect already re-anchors on width change; panel is overlay on phones |
| Adaptive overscan increases requests on fast links | low | fast tier is +1 page per side, capped; overscan is 0 until page 1 paints |
| `inert` unsupported in old browsers | low | Safari ≥ 15.5, Chrome ≥ 102; fallback is today's behaviour (`aria-hidden` + `pointer-events-none`) |
| Component tests with react-pdf in jsdom | — | `react-pdf` is mocked at the module boundary; the pure modules are tested directly |

## 6. Compatibility constraints (must not change)

- Props of `PDFViewer` remain a superset of today's (`title`, `pdfUrl`, `bookId`,
  `totalPages`, `initialProgressPct`, `initialMaxProgressPct`, `allowDownload`,
  `isLoggedIn`, `offline`, `reportEmail`). Thesis and publication callers keep
  working without edits.
- localStorage keys (`ebook:reader:v2:*`, `ebook:pos:*`, `ebook:bm:*`,
  `ebook:ar:*`) are unchanged so existing readers keep their positions.
- `/api/reader-events` event types are unchanged.
- The offline reader passes `offline` and receives zero server calls.
- `e2e/offline-reading.spec.ts` selectors: `canvas` first, the level-1 heading
  outside the viewer, the "available offline" badge.
- `e2e/a11y.spec.ts` waits for `.react-pdf__Page`.

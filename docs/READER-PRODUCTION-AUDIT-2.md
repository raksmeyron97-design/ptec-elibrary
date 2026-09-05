# PDF reader — production performance audit (phase 2)

Audit of `main` at `2c615f3` on 2026-09-05, before any change. Companion to
[READER-UX-PERFORMANCE-AUDIT.md](./READER-UX-PERFORMANCE-AUDIT.md) (the UX
rebuild) and [LARGE-PDF-PERFORMANCE-AUDIT.md](./LARGE-PDF-PERFORMANCE-AUDIT.md)
(the range-request work). Those documents describe what was *intended*; this one
records what the code and the bundled libraries *actually do*, from reading
`react-pdf@10.4.1` and the `pdfjs-dist@5.4.296` it bundles
(`node_modules/react-pdf/node_modules/pdfjs-dist` — the browser build; the
top-level `pdfjs-dist@6.2.108` is the server-side text extractor) as shipped,
not from their documentation. Line references below are into the 6.2.108
build, which is easier to read; every cited code path was re-checked in the
5.4.296 build (`pdf.mjs:12842`, `pdf.worker.mjs:3178/3269/58239`,
`pdf.mjs:14696`) and is identical in behaviour.

What changed as a result is in
[READER-PRODUCTION-PERFORMANCE-VERIFICATION.md](./READER-PRODUCTION-PERFORMANCE-VERIFICATION.md);
the caching model is in [READER-CACHING-STRATEGY.md](./READER-CACHING-STRATEGY.md).

---

## 1. Current architecture

```
/books/[slug]/read (server, auth-gated)        /offline-reader?id= (static shell)
        │                                                │
        ▼                                                ▼
PDFViewerClient (next/dynamic, ssr:false) ── PDFViewer.tsx (1,276 lines, orchestrator)
        │
        ├─ useResolvedPdfFile      Cache Storage lookup → object URL, else the URL
        ├─ useReaderTelemetry      pdf_first_page / load_error / render_error → /api/reader-events
        ├─ useReaderPreload        navigator.connection → { overscan, neighbours }
        ├─ useReaderProgress       localStorage exact page + server % (Server Action / keepalive POST)
        ├─ useReaderSearch         sequential getTextContent, cached per page, 500-match cap
        ├─ useReaderOutline, useReaderAnnotations, useSelectionPopup, useTextLayerA11y
        ├─ useReaderGestures       pinch (CSS preview → commit), double-tap, swipe, ctrl+wheel
        ├─ useReaderKeyboard, useFocusModeTrap, useAutoHideControls
        │
        ├─ <Document options=PDF_DOCUMENT_OPTIONS>          (react-pdf)
        │     scroll mode:  spacer · ReaderPage × mountedPages · spacer
        │     single mode:  <Page current> + hidden <Page prev/next>
        ├─ ReaderHUD (top/bottom), ReaderPanel (Pages/Contents/Bookmarks/Search/Highlights)
        └─ pure maths in lib/reader/*: geometry, virtual, preload, resume, zoom, …

/api/books/[id]/file  ── auth per request · fileRead/fileRange buckets · book row via tagged cache
                          · proxies Zima with the Range header · 200/206, Accept-Ranges, Content-Range
                          · Cache-Control: private, no-store
```

Callers of `PDFViewer` today: the dedicated read page (`layout="fill"`), the
book detail page through `PDFReaderLauncher` (embedded preview), and the
offline reader (`offline`, `blob:` URL). Theses and publications use the same
viewer through their own file routes.

## 2. Existing optimisations (verified present in code)

| Area | Mechanism | Where |
|---|---|---|
| Virtualisation | equal-height rows; visible window mounted at normal priority, overscan in a `useDeferredValue` pass; ≤ 12 pages for a 500-page book (component test) | `lib/reader/virtual.ts`, `PDFViewer.tsx` |
| First-page priority | overscan 0 and neighbours 0 until `onRenderSuccess` of the first page | `lib/reader/preload.ts` |
| Adaptive preload | `navigator.connection` → slow 1 / normal 2 / fast 3 rows per side, `saveData` → slow | `lib/reader/preload.ts` |
| Canvas density | DPR capped at 2; scroll-mode page width capped at 1,000 px | `lib/reader/geometry.ts` |
| Range requests | 512 KB chunks, self-hosted worker/cMaps/fonts, `isEvalSupported: false` | `pdf-options.ts` |
| Proxy cost | book row through a `books`-tagged cache; ranged requests metered on their own bucket | `app/api/books/[slug]/file/route.ts` |
| Thumbnails | windowed (± 3 rows), DPR 1, no text/annotation layers | `ThumbnailsPanel.tsx` |
| Search | 350 ms debounce, ≥ 2 chars, sequence token cancellation, yield every 10 pages, 500-match cap | `useReaderSearch.ts` |
| Pinch | CSS transform preview, rAF-throttled, commit on release around the midpoint | `useReaderGestures.ts` |
| Resume | timestamp-aware device-vs-server rule; nothing persisted before load | `lib/reader/resume.ts`, `useReaderProgress.ts` |
| Offline | Cache Storage read with `ignoreSearch`; SW never writes a book file | `useResolvedPdfFile.ts`, `app/sw.ts` |
| Cleanup | `pdf.destroy()` on unmount; window listeners removed (component test) | `PDFViewer.tsx` |

## 3. Findings

Ordered by severity. Each names the evidence.

### F1 — The reader downloads the whole file, every time (HIGH)

`pdf-options.ts` sets `disableAutoFetch: true, disableStream: false` and
comments "Fetch only what is rendered — the reader's whole large-book
strategy". That is not what pdf.js does with those two values.

Evidence in the bundled build:

* `pdf.mjs:13474` (fetch transport) — the initial full-document request is
  cancelled **only** when `!this._isStreamingSupported && this._isRangeSupported`.
  With `disableStream: false` streaming *is* supported, so the full request is
  never cancelled.
* `pdf.worker.mjs:64236–64290` (`getPdfManager`) — `readData()` loops
  `fullReader.read()` until `done`, feeding every chunk to
  `sendProgressiveData`. Range requests are issued *in addition* for
  out-of-order needs (xref at the end, a page far from the stream head).
* `pdf.worker.mjs:64246` — `disableAutoFetch ||= fullReader.isStreamingSupported`:
  auto-fetch is *implicitly* disabled whenever streaming is on, which is why
  the option appeared to do something. pdf.js's own documentation for
  `disableAutoFetch` says it "is also necessary to disable streaming … in
  order for disabling of pre-fetching to work correctly".

Consequence: opening a 100 MB book streams 100 MB through
`/api/books/[id]/file` and Zima whether the reader looks at one page or all
of them. The proxy pays for it (one long-lived connection per open, plus the
ranges), the reader's data plan pays for it, and every measure in §9/§10/§12
of the brief ("performance should scale with the pages actually being read",
"do not cache entire 100 MB books") is currently false. The earlier audit's
"8 requests for the first 4 MB" measured the ranges and did not notice the
stream continuing underneath.

The fix is one line (`disableStream: true`) and its cost is one extra
round-trip on first paint (chunk 0 arrives by range instead of by the
initial body, which pdf.js discards on cancel). Both are measured in the
verification document with a real range-serving test server.

### F2 — A failed range request breaks its chunk for the life of the document (HIGH)

`pdf.worker.mjs:3059–3140`, `ChunkedStreamManager._requestChunks`:

```js
const requestIds = this._requestsByChunk.getOrInsertComputed(chunk, () => { chunksToRequest.push(chunk); return []; });
…
this.sendRequest(begin, end).catch(capability.reject);
```

`_requestsByChunk` is only cleared in `onReceiveData`. When `sendRequest`
rejects (offline, 429, 5xx, tunnel reset) the failing request's promise
rejects — the page that needed it fails to load — but the chunk stays
registered as in-flight. Every later request for the same chunk finds it
"already requested", appends itself, and waits for an `onReceiveData` that
never comes: it **hangs silently**, it does not reject. Only a new
`getDocument()` (a new worker-side stream manager) recovers.

Today's reader has no handling for this at all: `ReaderPage` passes no
`onLoadError`, so a page that fails during a network blip shows react-pdf's
default English "Failed to load the page." forever, the `pdf_render_error`
beacon never fires (it is a load error, not a render error), and the offline
badge appears only when `navigator.onLine` flips — which it does not for a
tunnel outage, a captive portal, or a 429.

Recovery therefore has to be a *document reload that preserves reader
state*, triggered only after connectivity is confirmed, and only when a
failure actually happened during the outage.

### F3 — pdf.js page objects are never cleaned up after a page leaves the DOM (HIGH for scanned books)

`react-pdf/dist/Page/Canvas.js` calls `page.cleanup()` **before** rendering
("ensures the canvas will be re-rendered from scratch") and zeroes the
canvas on unmount, but nothing calls `cleanup()` *after* a page unmounts.
`PDFDocumentProxy.getPage()` caches every `PDFPageProxy` for the document's
life, and each proxy retains its operator list and its `objs` — where pdf.js
keeps the decoded `ImageBitmap` of every image the page drew
(`pdf.mjs`, `PDFPageProxy.#tryCleanup` clears `_intentStates` and
`objs`). For a scanned textbook that is one full-resolution bitmap per page
visited: the DOM is bounded at 12 pages, the pdf.js retention is bounded
only by how far the reader scrolled. Nothing on the worker side
(`GlobalImageCache`, xref cache) is released either, because
`pdf.cleanup()` is never called.

pdf.js's own viewer handles both: `PDFPageView.destroy()` calls
`pdfPage.cleanup()` when a view leaves its 10-entry buffer, and
`PDFViewerApplication._cleanup()` calls `pdfDocument.cleanup()` after 30 s of
rendering idleness. The reader needs the same two hooks.

### F4 — Background work competes with the page being read (MEDIUM)

All overscan rows are mounted in one deferred commit, so up to six extra
canvases start rendering at once. pdf.js renders on the main thread in 15 ms
slices per animation frame (`pdf.mjs:10457`, `EXECUTION_TIME`), shared across
every in-flight `render()`; six neighbours therefore take frames from the
visible page. On zoom or rotation every mounted page re-rasterises in the
same burst, so the visible page is not the first to become sharp. In
single-page mode the two hidden neighbours are full-DPR rasters started at
the same time as the current page.

Overscan is also symmetric: reading forward mounts as many rows behind as
ahead.

### F5 — Adaptive preload is Chromium-only in practice (MEDIUM)

`navigator.connection` does not exist in Safari or Firefox, so every reader
on an iPhone gets the "normal" tier regardless of the link. The reader
already measures the one thing that would tell it (bytes and milliseconds to
first paint, in `useReaderTelemetry`) and does not feed it back.

### F6 — Mounted canvas memory is not bounded in bytes (MEDIUM, Safari-relevant)

The mount bound is a *count* (visible + 2 × overscan). At the 1,000 px width
cap and DPR 2 a canvas is 2,000 × 2,828 × 4 ≈ 22.6 MB; twelve of them are
271 MB. WebKit enforces a total canvas backing-store budget per page (order
of a few hundred MB on iPad, less on older iPhones) and, when exceeded,
silently stops painting canvases rather than throwing. A tablet at fit-width
with the "fast" tier sits at the edge of that today. The bound needs to be
expressed in bytes, from the geometry the reader already computes.

### F7 — A failed progress save is never retried (MEDIUM)

`useReaderProgress` sets `lastSavedRef.current = progressPct` *before*
calling `saveReadingProgress`; if the action rejects (offline) the position
is considered saved and is not retried until the reader turns another page.
Reading offline to page 80, reconnecting, and closing the tab loses the
position on the server. The device record is correct, so the same device
resumes correctly; another device does not.

### F8 — Telemetry cannot answer the operational questions (LOW)

`/api/reader-events` writes to `console.warn` only, has no rate limit, and
has no notion of device class. p50/p95 first paint, failure rate for large
files, and offline recoveries are not computable. `app_events` (migration
`0090`) already holds AI telemetry rows with exactly the shape needed; its
`kind` check constraint just does not admit a reader kind.

### F10 — A jump mounted every page between the old and new positions (HIGH) — found by measurement

Not visible from the code review above; found by the first baseline run of
`e2e/reader-performance.spec.ts`. The virtualiser mounted
`mergeRanges(immediateWindow, deferredWindow)` — the *union* of the window
at the current scroll position and the (lagging) `useDeferredValue` window.
While scrolling the two are adjacent; after a jump (a resume to page 500,
"Go to page", an outline entry, a search hit) they are arbitrarily far apart,
and the union is every page in between for as long as the deferred value
lags — which, with pdf.js busy rendering, is long. Measured at open on a real
500-page document resuming at its last page: **500 pages and 502 canvases
mounted**, 9,479 DOM nodes, 46.6 MB heap, a 25 s first paint. The component
test "≤ 12 pages for a 500-page book" could not see it: it opens at page 1.

### F11 — A reload landed the reader on the last page (MEDIUM) — found by measurement

While `<Document>` shows its loading node the scroll content collapses to one
placeholder, so `scrollHeight ≈ clientHeight` and the scroll handler's "at
the end of the document" rule (`scrollTop >= scrollHeight − clientHeight −
1`) was true at `scrollTop 0`. Any scroll event during a reload — the retry
button, a new file, the recovery reload this phase adds — set the current
page to the last page. Observed: recovery at page 240 of 300 ended on page
300.

### F12 — Search moved the page indicator off by one (LOW) — found by measurement

Centring the active search highlight scrolls the container directly, and
that scroll was read back as a page change. On a phone viewport (542 px
high) the 35 % line then sits on the previous page: searching to page 431
reported "Page 430" with the highlight on 431 mid-screen, and saved that
position.

### F13 — pdf.js walks every page dictionary at load; where they sit decides the cost (MEDIUM, not ours to fix in the reader)

`PDFDocument.checkLastPage()` runs at load and calls `getPage(numPages − 1)`;
`Catalog.getPageDict()` on a flat `/Kids` array issues `xref.fetchAsync` for
**every** kid (`pdf.worker.mjs`, "pageDictCache.put(lastKid,
xref.fetchAsync(lastKid))"). Whether that costs one chunk or the whole file
depends on the producer's object layout: page dictionaries written together
(linearized/optimized output, most producers) fit in one or two 512 KB
chunks; page dictionaries interleaved with each page's image (a naive
page-at-a-time writer) put each one in its own chunk, and the load-time walk
touches the entire file however `disableAutoFetch` is set. Measured with a
10 MB / 20-page document of each shape after the streaming fix: **clustered
7.6 MB → dominated by the mounted pages' own images; interleaved 12.6 MB =
the whole file**. Pinned by a dedicated e2e case so a pdf.js change shows
up. The remedy is at ingestion (`qpdf --object-streams=generate
--linearize`), not in the viewer — recorded in READER-CACHING-STRATEGY.md.

### F9 — Smaller items

* `useReaderSearch` keeps every page's text for the document's life; for a
  1,000-page text PDF that is the whole book's text in memory (a few MB) and
  a full download of the file — inherent to client-side search; bounded by
  cancellation. Noted, not changed.
* Thumbnails start rendering the moment the panel opens, in parallel with
  the visible page.
* `classifyPdfError` maps a 429 or a 5xx to "unknown", so a rate-limited
  reader is offered "Report broken file".
* The `retry` for a load error is manual only.

## 4. Measurable gaps

| Question | Can the current code answer it? |
|---|---|
| How many bytes does opening a book cost? | No — `pdf_first_page.bytes` reads Resource Timing at first paint; the stream keeps going afterwards |
| Are mounted pages bounded over a long session? | Count yes (test); bytes no |
| Does anything leak across mount → unmount → remount? | pdf.js document destroy yes; page objects no measurement |
| What happens when the network drops mid-read? | Nothing measured; behaviour is F2 |
| First-page p50/p95 by device class | No |

## 5. Browser and device gaps

* Safari/iOS: no `navigator.connection` (F5); canvas memory budget (F6);
  `navigator.onLine` is optimistic; `visibilitychange`/`pagehide` flush is
  already correct for Safari; `100dvh` and safe-area insets already used.
* Firefox: no `navigator.connection`; otherwise same as Chromium.
* Only Chromium is automated today (`playwright.config.ts`); WebKit is not
  installed. Real-device gestures were not automated in the previous phase.

## 6. Large-PDF risks

F1 dominates. Secondary: the worker allocates the full `Uint8Array(length)`
for the chunked stream at load (inherent to pdf.js; the OS commits pages
lazily), and the `fileRange` bucket (240/min/IP) is generous but a
fast scroll through a scanned 100 MB book at one 512 KB chunk per page could
approach it; a 429 is then F2.

## 7. Memory risks

F3 (pdf.js retention), F6 (canvas bytes), object URLs (one per cached book in
`useResolvedPdfFile`, revoked on cleanup — verified), search text cache
(bounded by document text), MutationObserver in `useTextLayerA11y` (one,
disconnected on unmount), timers (all cleared in effects — component test
pins the window listeners).

## 8. Network-recovery risks

F2, F7, plus: the load-error screen requires a manual retry; while
`navigator.onLine === false` the virtualiser still mounts new pages as the
user scrolls, each issuing range requests that fail and mark chunks broken
(F2), so an offline scroll makes recovery *more* expensive.

## 9. Cache risks

The model is sound (see [PWA-OFFLINE-READING.md](./PWA-OFFLINE-READING.md)):
the service worker never writes a book file, the offline library is
user-owned and separate from derived caches, and `private, no-store` on the
file route keeps the HTTP cache out of it. The risk is F1: "ephemeral reader
prefetch" today is *the entire file*, held in the worker's memory. Nothing
else caches it, so nothing needs evicting — but nothing bounds it either.

## 10. Proposed changes (as implemented; see the verification document)

1. **`disableStream: true`** (F1). Every byte then arrives by an explicit
   512 KB range the reader asked for; the audit's chunk-size measurements
   stand.
2. **Explicit prefetch planner** (`lib/reader/prefetch.ts`, F4): the visible
   window mounts immediately; overscan pages are *admitted* in priority order
   (nearest first, biased in the reading direction), at most
   `MAX_CONCURRENT_PREFETCH` in flight, only after the visible pages have
   painted, never while offline; pages that leave the window are evicted
   (react-pdf cancels their render task). Geometry changes reset admissions
   so a zoom re-rasterises the visible page first. Single-page neighbours
   wait for the current page.
3. **Budgets module** (`lib/reader/budgets.ts`, F6): `MAX_MOUNTED_PAGES`,
   `MAX_PREFETCH_PAGES` and `MAX_PREFETCH_BYTES` per tier,
   `MAX_CONCURRENT_PREFETCH`, `MAX_CANVAS_BYTES` per device class,
   `IDLE_CLEANUP_MS`, `RECONNECT_BACKOFF_MS`. The prefetch window is the
   minimum of the tier's page budget, the byte budget divided by the
   measured bytes-per-page, and what the canvas budget leaves after the
   visible pages.
4. **Page cleanup** (F3): `ReaderPage` captures the `PDFPageProxy` and calls
   `cleanup()` after unmount (pdf.js defers it if a render task is still
   winding down); `pdf.cleanup(true)` after 30 s with no render activity and
   no render pending.
5. **Connectivity state machine** (`lib/reader/connectivity.ts`, F2): page
   load errors are classified; a transient failure or the `offline` event
   freezes mounting (rendered pages stay), shows a small
   offline/reconnecting indicator, and starts a probe with exponential
   backoff (2 → 30 s, no probes while the browser says offline). A successful
   probe reloads the document *only if* a failure was recorded, restoring the
   exact page and zoom from state. Nothing is reloaded unnecessarily and no
   request is made while offline.
6. **Measured network tier** (F5): when `navigator.connection` is absent, the
   first-page transfer (bytes / ms) classifies the tier.
7. **Progress retry** (F7): a rejected save restores the previous
   `lastSaved` so the next autosave or the `online` event resends.
8. **Telemetry** (F8): `page_load_error`, `offline_transition`,
   `network_recovery`, and one aggregate `reader_session` beacon (prefetch
   hits/misses, pages visited, max mounted); events written to `app_events`
   under a new `reader_event` kind with a device class enum, rate-limited
   per IP; SQL for p50/p95 documented.
9. **Error classification**: 429 → `rateLimited`, 5xx → `server`, both
   transient (auto-retry with backoff, no "report broken file").

Not changed, deliberately: chunk size (512 KB), the file route's
`no-store`, the download gate, the offline library contract, any UI beyond
the indicator, react-pdf/pdf.js versions.

## 11. Test strategy

* **Pure modules**: every planner/state-machine decision has a unit test
  (`lib/reader/{budgets,prefetch,connectivity,preload,errors}.test.ts`).
* **Component** (`PDFViewer.test.tsx`, react-pdf mocked at the module
  boundary): bounded mounts under prefetch admission; admissions stop while
  offline and resume on `online`; a page load error → indicator → probe →
  reload preserving page and zoom; `page.cleanup()` on unmount; failed save
  retried; no listener/timer growth across mount → unmount → remount.
* **End-to-end** (`e2e/reader-performance.spec.ts`, real pdf.js, a
  generated 500-page/multi-MB PDF served by a real range-capable HTTP server
  in the test process so bytes actually pushed are counted): the long-session
  scenario (1 → 20 → 50 → 100 → 200 → 300 → 400 → 500, zoom, rotate,
  search, panel, bookmark, back) with DOM node / canvas / listener / heap /
  object-URL / timer / observer counters; first-page cost for 10/25/50/75/100
  MB files; network drop and recovery with `context.setOffline`; Chromium,
  Pixel 5 emulation and WebKit.
* **Regression**: `reader-ux`, `offline-reading`, `a11y` suites unchanged
  and green; `tsc`, `lint`, `vitest`, `next build`.

# PDF reader — production performance verification (phase 2)

What changed, what was measured, how, and what remains. Companion to
[READER-PRODUCTION-AUDIT-2.md](./READER-PRODUCTION-AUDIT-2.md) (the findings)
and [READER-CACHING-STRATEGY.md](./READER-CACHING-STRATEGY.md) (the model).
Every PASS below names the test or command that produced it; anything not
verified says so.

**Conditions.** Verified 2026-09-05 on a 16 GB macOS machine against the
local stack: `next dev` (Turbopack) on port 3100, local Supabase on 54331
(seeded accounts, seeded book), and a **real range-serving HTTP server in the
test process** (`e2e/utils/pdf-server.ts`) fed generated multi-MB PDFs
(`makeLargeTestPdf`, `e2e/utils/pdf.ts`). The file route is *redirected* to
that server with `route.continue({ url })`, so the browser still addresses
`/api/books/<id>/file` and pdf.js behaves exactly as in production; what the
server counts is what it actually wrote to the socket. Browsers: Chromium
(Desktop Chrome, Pixel 5 emulation) and WebKit (Desktop Safari, iPhone 13
emulation) via Playwright. Absolute latencies are dev-server, loopback
numbers and are quoted only as before/after pairs under identical
conditions; the properties (bounded, proportional, recovered) are what is
claimed.

---

## 1. Architecture — PASS

Same shape as before (one orchestrator, pure `lib/reader/*`, hooks,
components), plus four pure modules and three hooks:

| New | Role | Tests |
|---|---|---|
| `lib/reader/budgets.ts` | every bound in one place: `MAX_MOUNTED_PAGES`, `MAX_PREFETCH_PAGES`/`_BYTES` per tier, `MAX_CONCURRENT_PREFETCH`, `MAX_CANVAS_BYTES` per device class, `IDLE_CLEANUP_MS`, `STALL_TIMEOUT_MS`, `MAX_RECOVERY_RELOADS`, `RECONNECT_BACKOFF_MS`, `OPEN_REQUEST_BUDGET` | `budgets.test.ts` (8) |
| `lib/reader/prefetch.ts` | the mount plan: visible window + admitted prefetch, nearest-first in the reading direction, ≤ N unsettled in flight, none before the visible pages paint, none offline; a **pure derivation**, not accumulated state | `prefetch.test.ts` (15) |
| `lib/reader/connectivity.ts` | outage state machine: browser events, classified transient failures, probes with backoff, one reload | `connectivity.test.ts` (9) |
| `lib/reader/preload.ts` (+) | network tier from the measured first-page transfer where `navigator.connection` is absent | `preload.test.ts` (12) |
| `lib/reader/errors.ts` (+) | `rateLimited` (429) and `server` (5xx) kinds, both transient | `errors.test.ts` (6) |
| `hooks/useMountPlan.ts` | settled/ever-rendered bookkeeping around the planner; stall probe | `PDFViewer.test.tsx` |
| `hooks/useConnectivity.ts` | wires the machine to `online`/`offline`, a 1-byte `Range` probe, the reload | `PDFViewer.test.tsx` |
| `hooks/useIdleDocumentCleanup.ts` | `pdf.cleanup(true)` after 30 s of render idleness | `PDFViewer.test.tsx` |

Rules that held: high-frequency handlers read refs and bind once; pure
modules import no React; per-page callbacks are stable (a regression found
here — inline arrows had defeated `ReaderPage`'s `memo`); no ref is read or
written during render (`react-hooks/refs` clean).

## 2. What changed, and why (each tied to an audit finding)

| Finding | Change |
|---|---|
| F1 whole file streamed | `disableStream: true` in `pdf-options.ts`; pinned by `pdf-options.test.ts` |
| F10 jump mounted every page in between | `useDeferredValue` + `mergeRanges` replaced by the pure plan (visible ∪ admitted) |
| F4 background rasters compete | prefetch admitted ≤ 2 at a time, only after visible pages paint; single-page neighbours wait for the current page; geometry change resets admissions so the visible page re-sharpens first |
| F5 Chromium-only tier | `classifyMeasured()` from Resource Timing bytes/ms |
| F6 canvas memory unbounded in bytes | `prefetchWindowSize()` = min(tier pages, tier bytes ÷ bytes-per-page, canvas budget − visible) |
| F3 pdf.js retention | `ReaderPage` calls `page.cleanup()` on unmount; `pdf.cleanup(true)` on 30 s idle |
| F2 failed chunk hangs forever | connectivity machine + stall watchdog + one state-preserving reload (cap 3) |
| F11 reload landed on the last page | "at end" needs real scrollable content and a loaded document; recovery repositions through the layout-ready path |
| F12 search moved the indicator | match centring is a programmatic scroll |
| F7 failed save counted as saved | `lastSaved` restored on rejection; `online` re-arms the debounce |
| F8 telemetry unqueryable | `app_events` kind `reader_event` (0138), device class, `reader_performance_daily` view, per-IP rate limit |
| F9 429/5xx → "report broken file" | classified transient; retry only |

Not changed: chunk size (512 KB), the file route's `no-store`, the download
gate, the offline library contract, react-pdf/pdf.js versions, any UI beyond
the reconnecting badge.

## 3. Large PDFs — PASS (with one recorded pdf.js property)

`e2e/reader-performance.spec.ts`, Chromium, one book per size, clustered page
dictionaries (the common producer layout), open → sit on page 1 → 6 s idle →
counters reset → 6 s more.

| File | Before: pushed to read page 1 | After: open + settle | After: next 6 s idle |
|---|---|---|---|
| 10 MB / 20 p | 10.0 MB (all of it) | 12.2 MB · 20 req ¹ | **0 req / 0 MB** |
| 25 MB / 50 p | 36.0 MB (stream + 23 ranges) | 7.6 MB · 11 req | **0 / 0** |
| 50 MB / 100 p | 91.6 MB (stream + 84 ranges) | 3.7 MB · 9 req | **0 / 0** |
| 75 MB / 150 p | 140.1 MB (stream + 131 ranges) | 6.1 MB · 9 req | **0 / 0** |
| 100 MB / 200 p | **178.2 MB** (102 MB stream + 157 ranges) | **7.1 MB · 11 req** | **0 / 0** |

¹ The 20-page book is small enough that the resumed position plus the
page-1 window is most of the book; the property that matters — the cost does
not scale with the document — holds across the row.

The un-ranged GET pdf.js opens is now **cancelled** in every case (server
sees `aborted: true`); the 0.4–3 MB it managed to push before the cancel
landed is a loopback artefact (huge socket buffers), not a file-size term.

**Recorded, not fixed (F13):** a document whose page dictionaries are
interleaved with its images is walked at load by pdf.js's own page-count
validation — measured 12.6 MB of a 10 MB file, `scattered layout` case,
asserted so a pdf.js change is noticed. Remedy: `qpdf
--object-streams=generate --linearize` at ingestion (see the caching
strategy document).

## 4. Long session — PASS

500-page / 24 MB book, 1 → 20 → 50 → 100 → 200 → 300 → 400 → 500 → zoom ×2
→ rotate → search → panel → bookmark → back to 400. Chromium, CDP metrics.

| Measure | Before | After |
|---|---|---|
| Mounted pages at open (resumed at last page) | **500** (502 canvases) | 6 (8 canvases) |
| DOM nodes at open | 9,479 | 3,060 |
| JS heap at open | 46.6 MB | 22.5 MB |
| First paint | 25.1 s ² | 5.0 s |
| Mounted pages, every later step | 3–6 | 7–8 (bounded ≤ 12; prefetch now fills its budget) |
| Page-jump latency, 7 jumps | 1.7–2.8 s | 1.7–2.9 s |
| Zoom step / rotate | 861 / 744 ms | 917 / 777 ms |
| Bytes by page 500 (before search) | **37.3 MB** — the whole 24 MB file, plus 13 MB of duplicated ranges | **10.0 MB** |
| Bytes after search (walks every page's text) | 37.3 MB (already had it all) | 17.5 MB |
| Canvas backing store, peak | not measured | 64.6 MB (budget 256 MB desktop) |
| JS event listeners, open → end | 887 → 910 | 892 → 910 |
| ResizeObservers / MutationObservers | 5 / 2 → 5 / 3 | 5 / 2 → 5 / 3 |
| Live object URLs | 0 | 0 |
| Live intervals | 1–3 | 2–5, back to 2 |

² Resume to page 500 through a smooth scroll of the whole document, with
every page in between mounting and starting to render — the F10 case.

The unchanged listener/observer counts across mount → jump × 8 → zoom →
rotate → search → panel → unmount are the "no accumulation" evidence; the +1
MutationObserver is the search panel's, released with it.

## 5. Memory — PASS (bounded), with one honest limit

* Mounted pages ≤ `MAX_MOUNTED_PAGES` at every snapshot in every run
  (component test at 500 pages; e2e at every step; rotation keeps the set
  unique).
* Canvas backing store ≤ the device budget in the zoom sweep and the long
  session (peak 64.6 MB desktop, 54.5 MB Pixel 5 at 125 %).
* `page.cleanup()` is called for every page that leaves the window
  (component test asserts on the proxies handed to `onLoadSuccess`);
  `pdf.cleanup(true)` fires after 30 s idle and not before.
* Not measured directly: pdf.js's worker-side memory. The JS heap figures
  above are the main thread's; the worker's is released by the idle sweep
  and is not observable from Playwright without a heap snapshot of the
  worker, which this phase did not add.

## 6. Network recovery — PASS

`e2e/reader-performance.spec.ts` "network drop", 100 MB / 200-page book so a
far page is certainly unfetched:

1. **Browser offline** (`context.setOffline(true)`) on page 5: the rendered
   page stays readable, the top bar shows the offline status, **0** file
   requests are attempted in 6 s, and the badge clears when the browser comes
   back.
2. **File unreachable with `navigator.onLine` true** (the route aborts —
   a dead tunnel, a captive portal): jump to page 150. Failures are reported
   once as `offline_transition` plus classified `pdf_render_error`s; the badge
   shows; nothing spins. Route restored: the 1-byte probe succeeds, the
   document reloads **once** (`network_recovery { reloaded: true }`), page
   150 paints, the indicator says 150, the zoom is unchanged.

Three signals feed the machine because the failure has three shapes, all
seen while building this: `onLoadError` (a page whose bytes fail),
`onRenderError` with a network kind (a render started before the bytes
failed), and **nothing at all** — pdf.js's stuck chunk hangs the page
silently, which only the 12 s visible-page stall watchdog can notice.
Component tests cover each path, the no-probe-while-browser-offline rule,
and the offline reader's inertness.

## 7. Zoom / rotation / thumbnails / search / gestures — PASS

`e2e/reader-interaction.spec.ts`:

| | Chromium | Pixel 5 |
|---|---|---|
| Zoom sweep (3 up, 3 down), step latency | 151–651 ms, 2–5 pages mounted, ≤ 34 MB canvas | 156–474 ms, 4–6 pages, ≤ 54.5 MB |
| Rotation 90/180/270/0 on page 120 | page kept, no duplicate rows, ≤ 12 mounted | same |
| Pages panel opened ×3 on 500 pages | 8 → peak 17 canvases (30 MB) → 8 | 10 → 20 → 11 |
| Refined search over 500 pages ("page 4" → "page 431") | 918 ms, indicator 431 | 869 ms, indicator 431 (was 430 — F12) |
| Swipe / double-tap / zoomed swipe (single-page mode) | n/a | swipe turns, double-tap zooms, zoomed swipe pans |

## 8. Real-device / Safari — see §12 (WebKit runs)

## 9. Offline — PASS

`e2e/offline-reading.spec.ts` unchanged and green (Chromium projects; the two
true-offline-navigation cases skip under `next dev` as before). The offline
reader passes `offline`, which disables the connectivity machine, the stall
watchdog and telemetry; the component test "makes no server call of any
kind" still holds and a new one asserts no probe and no beacon over 60 s.

## 10. Accessibility — PASS

`e2e/a11y.spec.ts` "PDF reader" (axe, light + dark) green. The connectivity
badge is `role="status" aria-live="polite"`, so a screen-reader user hears
"Offline" / "Reconnecting…" once; the "cached" badge stays decorative.

## 11. Security — PASS

No route policy, download gate or storage exposure changed. The telemetry
route rebuilds its payload from an allow-list, stores no IP / user id /
session, enum-checks device/source/kind, and is rate limited per IP
(`readerEvents`, 120/min, dropping with 204). The probe is a same-origin
1-byte `Range` GET through the existing authorised file route — no new
endpoint, no credential in a URL. `lib/books/storage-url-exposure.test.ts`
and the authorization-boundary tests are untouched and green.

## 12. WebKit (Desktop Safari, iPhone 13) — filled in below after the runs

## 13. Tests, lint, build — filled in below after the final run

## 14. Remaining limitations, stated plainly

* **Scattered page dictionaries** (F13) cost the whole file at load, in any
  viewer built on pdf.js. Fix at ingestion.
* **The initial un-ranged GET** cannot be avoided with the fetch transport;
  its cost is bounded by the link, not the file.
* **`Save-Data`** is readable only where `navigator.connection` exists.
* **Worker memory** is not measured; it is released by the idle sweep.
* **Client-side search** reads every page's content stream: inherent, and
  the one legitimate whole-document walk.
* **The 12 s stall watchdog** can misfire on a very slow link with a very
  heavy page; the consequence is one state-preserving reload, capped at 3.
* Absolute latencies here are dev-server, loopback figures; production
  first-page p50/p95 by device class is now answerable from
  `reader_performance_daily` once 0138 is applied.

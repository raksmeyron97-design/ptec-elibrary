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
(Desktop Chrome and Pixel 5 emulation) via Playwright; WebKit could not be
launched on this machine (§12). Absolute latencies are dev-server, loopback
numbers and are quoted only as before/after pairs under identical
conditions; the properties (bounded, proportional, recovered) are what is
claimed. "Before" is `main` at `2c615f3` with the same specs and the same
test server; "after" is this branch.

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
counters reset → 6 s more. "Before" = the same spec and server with
`disableStream: false` (the shipped configuration), everything else equal.

| File | Before: open + settle | After: open + settle | After: next 6 s idle |
|---|---|---|---|
| 10 MB / 20 p | 10.0 MB · 2 req (the whole file) | 8.7 MB · 14 req ¹ | **0 req / 0 MB** |
| 25 MB / 50 p | 25.0 MB · 2 req (the whole file) | 7.4 MB · 11 req | **0 / 0** |
| 50 MB / 100 p | 50.1 MB · 2 req (the whole file) | 7.3 MB · 11 req | **0 / 0** |
| 75 MB / 150 p | 75.1 MB · 2 req (the whole file) | 6.0 MB · 9 req | **0 / 0** |
| 100 MB / 200 p | **100.2 MB · 2 req (the whole file)** | **7.3 MB · 11 req** | **0 / 0** |

(Final run; `docs/reader-performance/size-*-chromium.json`. An earlier run
gave 12.2 / 7.6 / 3.7 / 6.1 / 7.1 MB — the spread is the resumed position
and the prefetch tier, never the file size.) Pixel 5 (10 and 25 MB): same
shape — `size-*-Mobile-Chrome.json`.

Before, the two requests were the xref range and the initial GET — which
pdf.js kept open and read to the end of the file, whatever the reader looked
at. The first baseline run, with the interleaved layout the generator then
produced, was worse still: **178 MB for the 100 MB book** (a 102 MB stream
*plus* 157 ranges, the same bytes twice), because the load-time page-tree walk
(F13) ran alongside the stream.

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

| Measure | Before (streaming on) | After — Chromium | After — Pixel 5 |
|---|---|---|---|
| Bytes at open | **23.8 MB — the whole file, in 2 requests** | 2.5 MB | 2.5 MB |
| Range bytes by page 500 (before search) | 23.8 MB (nothing left to fetch) | **6.9 MB**, growing with each window | 5.4 MB |
| Bytes after search (walks every page's text) | 23.8 MB | 15.4 MB | 13.4 MB |
| Mounted pages, range over the session | 5–6 | 2–8 (bounded ≤ 12) | 2–9 |
| DOM nodes, open → end | 3,034 → 3,259 | 3,069 → 3,041 | — |
| JS heap, open → end | 22.3 → 24.2 MB | 22.3 → 23.2 MB | 18.3 → 19.8 MB |
| Page-jump latency, 7 jumps | 1.6–1.8 s (bytes already local, smooth scroll) | **0.3–0.7 s** (instant landing, bytes fetched on demand) | 0.3–0.6 s |
| Zoom ×2 / rotate | 724 / 686 ms | 1,108 / 733 ms | — |
| Search, 500 pages | 1,295 ms | 2,917 ms (fetches every page's text) | — |
| Canvas backing store, peak | 49.4 MB | 64.6 MB (budget 256 MB) | 45.1 MB (budget 96 MB) |
| JS event listeners, open → end | — | 890 → 908 | 818 → 836 |
| ResizeObservers / MutationObservers | — | 5 / 2 → 5 / 3 | same |
| Live object URLs | 0 | 0 | 0 |

² This baseline rerun happened to resume at page 1. The **first** baseline
run resumed at the account's saved position, page 500, and recorded **500
mounted pages, 502 canvases, 9,479 DOM nodes, 46.6 MB heap and a 25.1 s first
paint** — the F10 case (`mergeRanges` mounting every page between the old and
new windows during the resume scroll). It is pinned by the component test "a
JUMP mounts a window around the destination, never the pages in between",
which fails on the old code and passes on this branch.

A jump now LANDS instead of animating. The smooth scroll to a far page used
to sweep the viewport across every row in between, and each row it passed
mounted, started a render and fetched its chunk — on CI's fast runners "go to
page 500" cost the chunks of pages 2–499 (14–16 MB of range traffic for nine
jumps, against 10 MB on this laptop, which completed fewer frames of the
animation). A far jump (> 2 pages) is now instant, as in pdf.js's own viewer;
a page turn stays smooth; reduced motion stays instant everywhere. That is
also why jumps are three to five times faster than before.

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
| Zoom sweep (3 up, 3 down), per-step latency | 269–464 ms, 2–4 pages mounted, ≤ 34 MB canvas | 121–327 ms, 4–6 pages, ≤ 54.5 MB |
| Rotation 90/180/270/0 on page 120 | page kept, no duplicate rows, ≤ 12 mounted | same |
| Pages panel opened ×3 on 500 pages, canvases | 10 → peak 19 (39 MB) → 6 | 5 → 18 (27 MB) → 9 |
| Refined search over 500 pages ("page 4" → "page 431") | 891 ms, indicator 431 | 1,056 ms, indicator 431 (was 430 — F12) |
| Swipe / double-tap / zoomed swipe (single-page mode) | n/a | swipe turns, double-tap zooms, zoomed swipe pans |

Evidence: `docs/reader-performance/{zoom,thumbnails,search}-*.json`.

## 8. Real-device / Safari — WARN, see §12

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

## 12. WebKit (Desktop Safari, iPhone 13) — NOT RUN on this machine (WARN)

`playwright.config.ts` now carries opt-in WebKit projects (`PW_WEBKIT=1 npx
playwright test --project=webkit --project="Mobile Safari"`, matching the
three reader specs), and the specs were written engine-neutral (no CDP where
WebKit runs; touch via real `Touch`/`TouchEvent`). The run was attempted and
could not start: **Playwright 1.60 does not ship a WebKit build for macOS 13**
(`ERROR: Playwright does not support webkit on mac13`), which is what this
machine runs. Every WebKit result in this document is therefore absent, not
inferred. What is Safari-specific in the change set was reasoned from the
engine's documented behaviour, not observed:

* the network tier comes from the measured first-page transfer where
  `navigator.connection` is missing (Safari, Firefox) — unit-tested;
* the canvas budget on touch devices (96 MiB) exists because WebKit enforces
  a per-page canvas memory limit and blanks canvases beyond it;
* `visibilitychange` / `pagehide` (not `beforeunload`) carry the teardown
  flush, as before;
* gestures use `touchstart/move/end` with passive listeners, as before.

To close this: run the three reader specs on a macOS 14+ machine or in CI
with `PW_WEBKIT=1`, or on a physical iPhone against a preview deployment,
and append the results here.

## 13. Tests, lint, build

| Check | Result |
|---|---|
| `npx tsc --noEmit` | clean |
| `npm run lint` | 0 errors (5 pre-existing warnings, none in touched files) |
| `npx vitest run` | **3,646 passed**, 50 skipped, 235 files — includes 51 new/updated reader tests (5 pure modules: 50; `PDFViewer.test.tsx`: 40 → 51; `pdf-options.test.ts`: 3 → 4) |
| `npm run build` (webpack, `rm -rf .next` first) | **PASS** — exit 0, 115 static pages, service worker bundled; the only warnings are Next's own pre-existing Edge-runtime notices |
| `e2e/reader-ux` + `offline-reading` + `a11y`, Chromium + Pixel 5 | **60 passed**, 6 skipped (the two true-offline-navigation cases need a production server, as before; project-specific viewport cases) |
| `e2e/reader-performance` + `reader-interaction`, Chromium | **12 / 12 passed** |
| `e2e/reader-performance` + `reader-interaction`, Pixel 5 | 6 passed in the combined 9-minute serial run + 3 that timed out under that load (rotation, long session, outage) and **passed when run alone** (10.9 s, 29.4 s); the two timeouts involved were lengthened. 5 skipped by design (large sizes and the scattered case run on one project) |
| WebKit / Mobile Safari | not runnable on this machine — §12 |

Every new e2e case fails against `main` for the reason it exists (the size
cases on bytes, the long session on mounted pages, the outage case on
recovery), which is how the baselines above were produced.

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

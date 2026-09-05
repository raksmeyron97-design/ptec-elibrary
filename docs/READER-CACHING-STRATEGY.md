# Reader caching strategy

What the reader keeps, where, for how long, and — most of the time — why it
deliberately keeps nothing. Companion to
[PWA-OFFLINE-READING.md](./PWA-OFFLINE-READING.md) (the offline library),
[READER-PRODUCTION-AUDIT-2.md](./READER-PRODUCTION-AUDIT-2.md) (what was
found) and
[READER-PRODUCTION-PERFORMANCE-VERIFICATION.md](./READER-PRODUCTION-PERFORMANCE-VERIFICATION.md)
(what was measured).

---

## 1. Three stores, three owners

```
                 ┌──────────────────────────────────────────────────────────────┐
 explicit save   │  OFFLINE LIBRARY  — Cache Storage "offline-books"             │
 (button)  ────▶ │  whole verified PDF · user-owned · survives SW upgrades       │
                 │  never written by the SW · never evicted silently             │
                 └──────────────────────────────────────────────────────────────┘
                 ┌──────────────────────────────────────────────────────────────┐
 opening a book  │  EPHEMERAL READER STATE — pdf.js, in memory, per document     │
           ────▶ │  512 KB chunks the reader ASKED for · decoded pages for the   │
                 │  mounted window · gone with the tab                           │
                 └──────────────────────────────────────────────────────────────┘
                 ┌──────────────────────────────────────────────────────────────┐
 every request   │  HTTP — Cache-Control: private, no-store on the file route    │
           ────▶ │  nothing. The browser HTTP cache and the SW hold no book byte │
                 │  a reader did not choose to save.                             │
                 └──────────────────────────────────────────────────────────────┘
```

The separation the brief asks for — offline library vs. ephemeral prefetch —
already existed in *policy*; the second store simply had no bound. The
reader's pdf.js configuration streamed the entire file into memory on every
open (audit F1). This phase makes the ephemeral store proportional to what is
read, and gives it a budget.

## 2. The offline library (unchanged)

Documented in full in [PWA-OFFLINE-READING.md](./PWA-OFFLINE-READING.md).
The rules that matter here:

| Rule | Where enforced |
|---|---|
| A book enters Cache Storage only on an explicit "Save offline", and only after the stored entry is read back | `downloadOfflineBook()` in `lib/offline.ts` |
| The service worker can serve a saved book but can never write one (`cacheWillUpdate: () => null`) | rule 1 in `app/sw.ts` |
| Saved books survive every worker upgrade | `USER_OWNED_CACHES` in `lib/sw-policy.ts` |
| A saved book is never evicted by the app. The cap (`MAX_OFFLINE_BOOKS = 20`) is an explicit error the reader resolves, not a silent LRU | `lib/offline.ts` |
| Quota is reported, not guessed: `navigator.storage.estimate()` plus the exact sum of verified sizes | `getOfflineStorageEstimate()` |
| Offline reads never touch the network (`isLoggedIn = prop && !offline`) | `PDFViewer.tsx` |

The browser itself may evict Cache Storage under storage pressure (non-
persistent origins). `/offline-books` detects a record whose bytes are gone
and offers a re-download rather than opening a reader that fails. That is the
one eviction path, it is the platform's, and it is surfaced, not hidden.

## 3. Ephemeral reader state (this phase)

### 3.1 Bytes: only what was asked for

`pdf-options.ts` now sets `disableStream: true` alongside `disableAutoFetch:
true`. pdf.js then cancels the initial full-document request as soon as the
headers prove the server supports ranges, and every byte afterwards arrives by
a 512 KB `Range` request that a page render (or the xref / pages tree) needed.
The worker's `ChunkedStream` still allocates its `Uint8Array(length)` up front
— that is pdf.js's design and it is address space, not resident memory, until
a chunk lands — so the measure that matters is bytes transferred, and it is
now a function of pages read:

| Situation | Before | After |
|---|---|---|
| Open a 100 MB scanned book, read page 1 | whole file streamed in the background | see verification §4 — bounded, a handful of chunks |
| Read pages 1 → 500 by jumps in a 24 MB book | whole file | proportional to pages visited plus one chunk of xref |

The cost is one extra round-trip on first paint: chunk 0 arrives by range
rather than in the initial response body. Measured in the verification
document.

### 3.2 Decoded pages: the mounted window, and nothing after it

pdf.js keeps a `PDFPageProxy` per page for the document's life, and each one
retains its operator list and decoded image bitmaps until `cleanup()` is
called. react-pdf never calls it after a page unmounts (audit F3). The reader
now does, in two places:

* **Per page** — `ReaderPage` captures the proxy from `onLoadSuccess` and
  calls `cleanup()` after unmount. pdf.js refuses (and defers) the cleanup
  while a render task is still cancelling, so this is safe to call blind.
* **Per document** — after `IDLE_CLEANUP_MS` (30 s) with no render started or
  finished, `pdf.cleanup(true)` releases the worker-side caches (global image
  cache, xref cache) while keeping loaded fonts. Never while a render is in
  flight: pdf.js documents that as a source of rendering errors.

So the decoded state at any moment is: the mounted pages (≤ `MAX_MOUNTED_PAGES`
= 12, and fewer when the canvas budget says so) plus whatever the worker holds
until the next idle sweep.

### 3.3 The prefetch window: a budget, not a constant

`lib/reader/budgets.ts` is the one place the numbers live. The window of pages
mounted beyond the visible ones is the **minimum** of three bounds:

| Bound | Slow | Normal | Fast |
|---|---|---|---|
| `MAX_PREFETCH_PAGES` (total beyond visible) | 2 | 4 | 6 |
| `MAX_PREFETCH_BYTES` ÷ bytes-per-page | 1 MiB | 4 MiB | 12 MiB |
| `MAX_CANVAS_BYTES` − visible canvases | 96 MiB touch · 256 MiB desktop | | |

*Bytes per page* is the document length (from `onLoadProgress`'s `total`,
which is the `Content-Length` the file route sends) divided by the page count;
a scanned 100 MB / 200-page book therefore prefetches two pages on a normal
link where a 5 MB text PDF prefetches four. *Canvas bytes* come from the
geometry the reader already computes (`width × height × DPR² × 4`); WebKit's
per-page canvas budget is the reason the touch figure is small.

The window is split by reading direction (roughly two thirds ahead), and it
is **admitted**, not mounted: at most `MAX_CONCURRENT_PREFETCH` (2) prefetch
pages render at a time, none until the visible pages have painted, and none
while offline. A geometry change (zoom, rotation) resets the admitted set so
the visible page is re-rasterised first. Every rule is in
`lib/reader/prefetch.ts` and pinned by its tests.

### 3.4 Network tier

`slow / normal / fast` comes from `navigator.connection` where it exists
(Chromium) and from the measured first-page transfer (bytes ÷ ms from Resource
Timing) everywhere else; `Save-Data` forces `slow`. No tier can exceed the
`fast` budgets. `lib/reader/preload.ts`.

### 3.5 What is deliberately NOT cached

* **The file route stays `private, no-store`.** A `private, max-age` would let
  the browser HTTP cache answer repeat ranges within a session, but it would
  also keep book bytes on disk without consent and outside the offline
  library's ownership and revocation model. Rejected.
* **No service-worker "reader cache".** Rule 1 in `app/sw.ts` is read-only by
  construction; adding a write path would recreate the ~240 MB leak the
  allow-list replaced, and would blur the `?offline=1` consent marker.
* **No IndexedDB page cache.** Decoded pages are memory-bound by design; a
  disk cache of rasters would cost more to manage than a re-render.
* **Search text** is kept per document, in memory, for the tab's life. It is
  the document's text (a few MB at most for a 1,000-page book) and is bounded
  by the document, not the session.

## 4. Save-Data and constrained devices

* `navigator.connection.saveData === true` → slow tier: 2 prefetch pages,
  1 MiB byte budget, one neighbour in single-page mode.
* Touch devices get the 96 MiB canvas budget; a tablet at fit-width and DPR 2
  therefore mounts four pages where a desktop mounts up to eleven.
* Reduced motion: no smooth scrolling, no page-turn animation (unchanged).
* Save-Data cannot be read where `navigator.connection` is missing; the
  measured tier is the fallback, and the byte budget still applies.

## 5. Interaction with the offline library

A saved book is read through an object URL from Cache Storage. pdf.js
receives the whole file locally, so there are no range requests and no network
budget; the mounted-window and cleanup rules still apply, because canvas and
decoded-page memory are the same whether the bytes came from disk or the
network. The `offline` reader never probes, never reloads and never sends
telemetry.

## 6. Quotas

| Quota | Value | Owner |
|---|---|---|
| `fileRead` (unranged opens) | 30 / min / IP | `lib/rate-limit-policy.ts` |
| `fileRange` (chunks) | 240 / min / IP ≈ 120 MB / min | same |
| `readerEvents` (telemetry) | 120 / min / IP | same (this phase) |
| Offline books per device | 20 | `lib/offline.ts` |
| Offline book size | 400 MB | `lib/offline.ts` |

With streaming off, a document open costs one `fileRead` token (the cancelled
initial request) plus one `fileRange` token per 512 KB chunk actually read. A
recovery reload costs the same again, and reloads are backed off (2 → 30 s)
and only happen after a successful probe.

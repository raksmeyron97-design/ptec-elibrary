# Large-PDF reading performance — audit

**Scope:** why books above ~50 MB are slow to open, across both repositories:
`e-library-ptec` (Next.js) and `storage` (Zima Storage API).

**Method:** source of truth is the code in both repos, plus HTTP-level probes
against a locally-run Zima instance and a measured chunk-size benchmark. Where
a number is projected rather than observed, it says so.

---

## 0. Headline finding, stated first because it changes the plan

**Zima's byte-range support is already complete and correct. The bottleneck is
not the storage service, and it is not file size.**

The reader is slow on large books because the Next.js file proxy performs
**three Supabase round-trips per byte range**, and PDF.js was configured to ask
for **64 KB at a time** — so opening one book costs dozens of fully
re-authorized requests, and then hits a **30-requests-per-minute** rate limit
mid-read.

A smaller "reader PDF" would not have fixed this. An 85 MB book and a 22 MB
book are both fetched in 64 KB chunks through the same per-chunk authorization
cost, and both blow the same rate limit. That is why the optimization pipeline
in the brief is *not* the first fix — see §8.

---

## 1. Current architecture (as built)

```
ADMIN UPLOAD
  UploadForm → /api/admin/upload (or v1 batch) → zimaUpload()
    → POST Zima /api/upload | /api/v1/files → <repo>/files/<folder>/book.pdf
    → book_files.file_url = https://<zima-host>/files/…/book.pdf

ONLINE READING
  /books/[slug]/read  (auth-gated server render)
    → <PDFViewer pdfUrl="/api/books/<id>/file">
      → pdf.js issues HTTP Range requests to that URL, 64 KB at a time
        → app/api/books/[slug]/file/route.ts
           1. lockdownResponse()                    (sync)
           2. rateLimit()      → Supabase RPC       ── network
           3. auth.getUser()   → Supabase GoTrue    ── network
           4. books select     → Supabase PostgREST ── network
           5. zimaFetch(url, range) → Zima          ── network
        → 206 streamed back, Cache-Control: private, no-store

DOWNLOAD
  /api/books/[slug]/download — auth + per-user limit + allow_download gate (0131)

OFFLINE
  "Save offline" → downloadOfflineBook() → caches `…/file?offline=1`
  Reader → useResolvedPdfFile() → caches.match(url, {ignoreSearch:true})
        → res.blob() → object URL
```

---

## 2. Zima Range support — proven, not assumed

`/files` is served by `express.static(UPLOAD_DIR, …)` (`index.js:768`) with no
`acceptRanges: false`, so the `send` module handles ranges natively and streams
from disk. Verified against a locally-run instance with a 60 MB object:

| Probe | Result |
|---|---|
| `HEAD` | `200`, `Accept-Ranges: bytes`, `Content-Length: 62914560`, `ETag`, `Last-Modified`, `Content-Type: application/pdf` |
| `Range: bytes=0-1048575` | `206`, `Content-Range: bytes 0-1048575/62914560`, `Content-Length: 1048576` |
| `Range: bytes=1048576-2097151` | `206`, correct `Content-Range` |
| `Range: bytes=-1024` (suffix) | `206`, `Content-Range: bytes 62913536-62914559/62914560` |
| `Range: bytes=999999999-` | `416`, `Content-Range: bytes */62914560` |

Streaming, not buffering: `send` uses `fs.createReadStream` with the range
applied, so a 100 MB file does not become 100 MB of RSS. `grep` for
`readFile`/full-buffer serving in `index.js` and `lib/` finds none on the file
path (`lib/clamav.js` and `lib/fileIndex.js` stream too).

**Conclusion: Phases 2.1–2.4 of the brief are already satisfied. Nothing in
Zima's range/streaming/HEAD/caching-metadata layer needs rewriting.** Doing so
would be churn against working, security-reviewed code.

Compression (2.5): Zima applies none to `/files`. Correct — leave it.

---

## 3. The actual bottleneck, measured

### 3a. Per-chunk authorization cost

`app/api/books/[slug]/file/route.ts` performs **four network round-trips per
range request**, three of them to Supabase (region `sin1`, Singapore):

| # | Call | Cost |
|---|---|---|
| 1 | `rateLimit()` → `check_rate_limit` RPC | Supabase round-trip |
| 2 | `auth.getUser()` | Supabase round-trip |
| 3 | `books` + `book_files` select | Supabase round-trip |
| 4 | `zimaFetch()` | Zima round-trip |

Steps 1–3 are repeated identically for every 64 KB of the same book, for the
same already-authenticated user.

Measured TTFB to the hosted Supabase project **from this machine** (indicative,
not from the production host): **178–235 ms** per request, median ~180 ms. Even
at a favourable server-side 20 ms per call, steps 1–3 add ~60 ms to every chunk.

### 3b. `rangeChunkSize: 65536`

`components/ui/reader/PDFViewer.tsx:449` pins PDF.js to 64 KB ranges. Benchmark
against the local Zima instance, fetching the first 4 MB of a 60 MB file (a
realistic "enough to render the first page of a scanned book" figure), with a
simulated per-request proxy overhead:

```
target: 4.0 MB before first page

chunk      reqs   +0ms/req   +30ms/req   +60ms/req
  64KB     64       203ms      2146ms      4168ms
 256KB     16        86ms       604ms      1025ms
 512KB      8        33ms       279ms       522ms
1024KB      4        22ms       150ms       273ms
```

At a realistic 60 ms of per-chunk authorization overhead, **64 KB chunks cost
4.2 s of pure overhead before the first page; 512 KB chunks cost 0.5 s.**

### 3c. The rate limit that makes it fail outright

`lib/rate-limit-policy.ts:63` — `fileRead` is **30 requests/minute per IP**
(10 under DDoS/strict mode).

Fetching 4 MB at 64 KB per request is **64 requests**. The reader therefore
exceeds its own rate limit *before finishing the first page* of a large book,
and receives `429`. This is not a slowdown; it is a failure mode, and it scales
with file size exactly as the reported symptom describes.

### 3d. Zima's own shared-IP ceiling

`filesLimiter` is 300 req/min keyed by client IP (`index.js:128`,
`RL_FILES_PER_MIN=300`). Every reader's bytes are fetched **by the Next.js
server**, so the entire library shares one bucket. `zimaFetch()` sends no
credentials, so these reads are indistinguishable from anonymous internet
traffic. At 64 KB chunks this ceiling is reached by roughly three concurrent
large-book readers.

---

## 4. Secondary findings (real, but not the cause)

| Finding | Effect | Action |
|---|---|---|
| `Cache-Control: private, no-cache, no-store` on every range | Browser cannot reuse any byte range across a revisit | **Left alone.** Deliberate for authorized private content; the PWA policy depends on the distinction. Not the measured cause. |
| `useResolvedPdfFile` does `res.blob()` on a cached book | An 85 MB offline book is fully materialised in RAM before page 1 | Offline path only; out of scope for online latency. Noted. |
| Upload path buffers | Admin-side only, one request per book | Not on the reading path. Not touched. |
| `disableAutoFetch: true` | **Correct already** — pdf.js fetches only what it renders | Keep. |

---

## 5. Recommended architecture

Keep the proxy — it is what enforces authentication, publication state, and the
per-book download policy (`0131`). Do not replace it with direct Zima URLs;
that trades the whole authorization model for latency the fixes below remove
anyway.

Change three things instead:

1. **Ask for bigger ranges.** `rangeChunkSize` 64 KB → 512 KB. One line,
   measured 8× fewer requests, ~8× less overhead.
2. **Stop re-deciding authorization per chunk.** The book row (title, file
   URL, download policy) is slow-moving and already cache-tagged; read it
   through a tagged cache instead of a Supabase query per 512 KB.
3. **Rate-limit the read, not the byte range.** A ranged continuation of an
   already-authorized read is not a new file read. Keep a strict limit on
   opening a document; give continuations a separate, higher ceiling.

And in Zima:

4. **Let the application identify itself.** An authenticated `/files` read
   (the library's own API key) gets its own, higher bucket, so one server's IP
   does not cap the whole library. Anonymous public reads keep 300/min exactly
   as today.

---

## 6. Files this will change

**e-library**
- `components/ui/reader/PDFViewer.tsx` — `rangeChunkSize`
- `app/api/books/[slug]/file/route.ts` — cached book lookup, range-aware limit
- `lib/rate-limit-policy.ts` — a `fileRange` policy beside `fileRead`
- `lib/zima.ts` — send the API key on file reads
- `.env.example` — the new knobs

**storage**
- `index.js` — `filesLimiter` bucket/ceiling for authenticated reads
- `lib/config.js`, `.env.example` — the new knob
- `test/` — range + limiter coverage

**Not changed, deliberately:** Zima's range/stream/HEAD implementation, the PDF
viewer's rendering pipeline, the offline cache, the download route, the service
worker, `Cache-Control` semantics.

---

## 7. Risks and rollback

| Change | Risk | Rollback |
|---|---|---|
| Larger `rangeChunkSize` | Slightly more bytes read for a tiny seek; worse on a very slow link | Revert one constant |
| Cached book lookup | A just-unpublished book stays readable until the tag revalidates | Cache is tagged `books`; every book mutation already revalidates it. Revert = drop the wrapper |
| Range-aware limit | A wider ceiling for authenticated range reads | Env knob; set it equal to `fileRead` to restore old behaviour |
| Zima authenticated bucket | Key now sent on file reads (internal hop) | Env knob off ⇒ identical to today |

All four are independently revertible and none touches authentication,
publication checks, the download policy, or offline storage.

---

## 8. Why the reader-PDF optimization pipeline is *not* step one

The brief (Phases 8–10) proposes generating a smaller "reader PDF" per book.
The measurements above say that would not have addressed the reported symptom:

- The cost is **per request**, not per byte. 22 MB fetched in 64 KB chunks is
  still 344 requests × 4 round-trips, and still exceeds a 30/min limit.
- With `disableAutoFetch: true`, the reader already fetches only the pages it
  renders — total file size is largely irrelevant to time-to-first-page.
- It is the only proposal in the brief that adds a background worker, a schema
  change, a new storage artefact per book, and a lossy transform of library
  material.

It remains worth doing for **bandwidth and offline-save size** (an 85 MB
download over a Cambodian mobile connection is a real cost), and the design in
Phases 8–13 is sound. But it should be scheduled *after* the fixes above are
deployed and re-measured, so the thresholds are chosen from real data — which
is what the brief itself asks for ("Do not hardcode arbitrary thresholds
without measuring").

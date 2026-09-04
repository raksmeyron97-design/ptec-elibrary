# Large-PDF reading performance — implementation

Companion to [LARGE-PDF-PERFORMANCE-AUDIT.md](./LARGE-PDF-PERFORMANCE-AUDIT.md),
which contains the discovery work and the evidence. This document records what
changed, what it measured, and how to undo it.

---

## 1. Root cause

Large books were slow to open **because of how many authorized requests it took
to read them, not because of how big they were.**

Three compounding causes, all on the application side:

1. **`rangeChunkSize: 65536`.** pdf.js asked for the book 64 KB at a time.
2. **Every one of those chunks paid full authorization.**
   `/api/books/[slug]/file` performed three Supabase round-trips per request —
   a `check_rate_limit` RPC, `auth.getUser()`, and a `books`+`book_files`
   select — before proxying a single byte.
3. **A 30-requests-per-minute ceiling** (`fileRead`) counted each of those
   chunks as a separate "file read". Reading ~2 MB of a book exhausted it, so
   large books did not merely open slowly — they **failed with `429` part-way
   through opening**, which is exactly the reported symptom scaling with size.

A fourth cause sat on the storage side: **Zima meters `/files` by client IP at
300/min, and every reader's bytes are fetched by the library's own server**, so
the entire library shared one anonymous bucket with the public internet.

**What was *not* the cause:** Zima's byte-range support, which was already
complete and correct (206 / `Content-Range` / suffix ranges / 416 / `ETag` /
streaming), and file size itself.

---

## 2. Before

```
pdf.js  ──64 KB range──▶  /api/books/[id]/file
                            ├─ check_rate_limit RPC   → Supabase   (per chunk)
                            ├─ auth.getUser()         → Supabase   (per chunk)
                            ├─ books + book_files     → Supabase   (per chunk)
                            └─ zimaFetch(range)       → Zima, anonymous,
                                                        300/min shared with
                                                        the whole internet
```
4 MB before the first page = **64 requests × 4 round-trips**, and a `429` after
the 30th.

## 3. After

```
pdf.js  ──512 KB range──▶  /api/books/[id]/file
                            ├─ rate limit: fileRange bucket        (per chunk)
                            ├─ auth.getUser()        → Supabase    (per chunk)
                            ├─ book row              → tagged cache, not a query
                            └─ zimaFetch(range)      → Zima, api-key identified,
                                                       own bucket
```
Same 4 MB = **8 requests**, one Supabase round-trip each, no `429`.

The session check is deliberately *not* cached: revoking a session still stops
the very next chunk.

---

## 4. Zima changes

Range/streaming/HEAD/caching-metadata were **not touched** — they were already
correct, and rewriting them would have been churn against security-reviewed
code.

| File | Change |
|---|---|
| `index.js` | `filesLimiter` now buckets by API-key id when a **valid** key is presented, with its own ceiling; anonymous reads keep the IP bucket and the old limit unchanged. Key check memoised per request. |
| `lib/config.js` | `rl.filesAuthedPerMin` (`RL_FILES_AUTHED_PER_MIN`, default 3000) |
| `.env.example` | documents the knob and how to disable it |
| `test/fileRange.test.js` | **new** — 10 tests: full range semantics (206 / `Content-Range` / suffix / 416 / unranged / HEAD-with-no-body, byte-for-byte content checks) and the metering split |

An absent, invalid, revoked or expired key falls back to the anonymous bucket.
The separation is a **different bucket, not an exemption**, and it still
collapses under `STRICT_DOWNLOAD_RATE_LIMIT`.

## 5. E-Library changes

| File | Change |
|---|---|
| `components/ui/reader/PDFViewer.tsx` | `rangeChunkSize` 64 KB → 512 KB; `pdf_first_page` telemetry with request count + bytes; `onRenderSuccess` plumbed through `VirtualPage`. Since the reader refactor (docs/READER-UX-PERFORMANCE-VERIFICATION.md) the options live in `pdf-options.ts` (pinned by `pdf-options.test.ts`) and the telemetry in `hooks/useReaderTelemetry.ts` |
| `app/api/books/[slug]/file/route.ts` | book row read through a `books`-tagged cache instead of a query per chunk; ranged requests metered as `fileRange` |
| `app/api/theses/[id]/file/route.ts` | same range-aware metering (same viewer, same defect) |
| `app/api/publications/[slug]/file/route.ts` | same |
| `lib/rate-limit-policy.ts` | new `fileRange` policy (`RL_FILE_RANGE_PER_MIN`, default 240) |
| `lib/zima.ts` | sends `x-api-key` on file reads — **only** to allow-listed Zima hosts, never to the legacy R2/blob hosts the same function proxies |
| `app/api/reader-events/route.ts` | accepts `pdf_first_page`; client counters clamped, never trusted |
| `.env.example` | documents `RL_FILE_RANGE_PER_MIN` |
| `app/api/books/[slug]/file/route.test.ts` | +6 tests for range delivery and metering |

## 6. Database changes

**None.** No migration, no schema change, no new column. The root cause was
request overhead, and nothing about it is stored.

---

## 7. Security impact

Nothing was relaxed to gain speed.

| Control | Status |
|---|---|
| Authentication on every chunk | **Unchanged** — `auth.getUser()` still runs per request; only the *book row* is cached, and nothing user-specific enters that cache |
| Publication check (`is_published`) | Unchanged — part of the cached lookup's own query |
| Per-book download policy (`allow_download`, `0131`) | Unchanged — lives on `/download`, untouched here; `?download=1` still redirects into it |
| SSRF allow-list | Unchanged, and now *load-bearing twice*: it is what confines the API key to Zima hosts |
| Rate limiting | Still enforced, on both request kinds and in both repos. `fileRange` is a ceiling, not an exemption |
| Raw storage URLs | Still never exposed; the proxy is still the only path |
| Telemetry | Counts only. `file` is reduced to a path with no query string client-side, so no token or storage host can reach a log line |

**The API key on file reads** is the one genuinely new exposure, and it is
bounded: it travels only to a host that `toAllowedStorageUrl()` has already
rebuilt the origin for, so a tampered `book_files.file_url` cannot aim it at a
third party. On the production box that hop is the app talking to the storage
service on the same machine.

## 8. Offline impact

Untouched and verified by the existing suites (`lib/sw-policy.test.ts`,
`lib/offline.test.ts`, `lib/theses/download-sw-policy.test.ts`, all passing):

- Normal online reading still populates **no** cache. The service worker's
  book-file rule keeps `cacheWillUpdate: () => null`.
- "Save offline" still writes to `offline-books` and still uses `ignoreSearch`.
- Already-saved books still open with the network off, and the larger chunk
  size does not reach that path at all — a cached book is resolved to a local
  blob before pdf.js sees a URL.
- No existing offline book is invalidated.

## 9. Performance measurements

All against a real Zima instance serving a 60 MB object. "overhead per request"
simulates the proxy's authorization cost; measured TTFB to the hosted Supabase
project from this machine was 178–235 ms, so 30–60 ms is a conservative stand-in
for the server's own round-trip.

### Time to the bytes needed for the first page (4 MB)

| chunk | requests | +0 ms/req | +30 ms/req | +60 ms/req |
|---|---|---|---|---|
| **64 KB (before)** | **64** | 555 ms | 2185 ms | **4112 ms** |
| 256 KB | 16 | 93 ms | 549 ms | 1032 ms |
| **512 KB (after)** | **8** | 34 ms | 289 ms | **525 ms** |
| 1024 KB | 4 | 27 ms | 156 ms | 270 ms |

**7.8× faster to first page at a realistic 60 ms overhead; 8× fewer requests.**

### Requests to read a whole 60 MB book

| chunk | requests |
|---|---|
| 64 KB | 960 |
| 512 KB | **120** |

### The rate limits, before and after

| | before | after |
|---|---|---|
| App: requests to reach 4 MB | 64, against a 30/min ceiling → **429 mid-open** | 8, against a 240/min `fileRange` ceiling |
| Zima: 400 ranged requests from one address | **300 served, 100 throttled** (measured) | **400 served, 0 throttled** (measured, authenticated bucket) |

### Concurrency and server memory (Zima, 512 KB chunks)

| readers | requests | bytes served | wall time | server RSS |
|---|---|---|---|---|
| baseline | — | — | — | 67 MB |
| 5 | 60 | 30 MB | 352 ms | 68 MB |
| 10 | 120 | 60 MB | 514 ms | 73 MB |
| 20 | 240 | 120 MB | 993 ms | 72 MB |

120 MB served with a ~5 MB RSS delta — the file service streams and does not
buffer, confirmed rather than assumed.

### What is NOT measured here

**No end-to-end browser measurement was taken.** Docker was unavailable in this
environment, so the local Supabase stack could not start and the app could not
be driven against a real book. The figures above are HTTP-level and
component-level. The `pdf_first_page` telemetry was added precisely so the
end-to-end number can be read from production after deploy — that is the
verification step still outstanding, and it should be done before calling this
finished.

---

## 10. Backward compatibility

- **No schema change**, so every existing row is unaffected.
- **Legacy R2 bare keys** still take the presigned-GET path in both file
  routes; the API key is not sent to them.
- **Legacy blob/R2 absolute URLs** still proxy through the generic branch.
- **Books with no file** behave as before.
- Both new env knobs have defaults; an untouched `.env` gets the new behaviour,
  and setting each equal to its old counterpart restores the previous one
  exactly.
- Zima with an older library build (no key on file reads) behaves exactly as
  today — the key is read, never required.

## 11. Rollback

Each change is independent and separately revertible.

| To undo | Do this |
|---|---|
| Larger chunks | `rangeChunkSize: 65536` in `components/ui/reader/pdf-options.ts` |
| Range-aware limiting | `RL_FILE_RANGE_PER_MIN=30` (equal to `RL_FILE_READ_PER_MIN`) |
| Zima's authenticated bucket | `RL_FILES_AUTHED_PER_MIN=300` (equal to `RL_FILES_PER_MIN`) |
| Cached book lookup | revert the `unstable_cache` wrapper in the file route; it is already tag-revalidated by every book mutation |
| Telemetry | drop `pdf_first_page` from `EVENT_TYPES` |

No rollback requires a migration, a data change, or a coordinated deploy of the
two repositories.

---

## 12. Deliberately not done

**The reader-PDF optimization pipeline** (a second, smaller PDF per book, with
`reader_file_url`, a processing status, a background worker and admin UI).

The measurements say it would not have addressed the reported symptom: the cost
was per request, not per byte, and `disableAutoFetch: true` already means the
reader fetches only the pages it renders. A 22 MB reader PDF fetched in 64 KB
chunks would still have been 344 requests and would still have hit the same
`429`.

It remains worth building for **bandwidth and offline-save size** — an 85 MB
download over a Cambodian mobile connection is a real cost to a real reader —
and the design sketched in the brief is sound. It should follow this work, with
thresholds chosen from the `pdf_first_page` telemetry rather than guessed,
which is what the brief itself asks for.

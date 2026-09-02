# Offline reading

> A book is "saved offline" when the reader can open it with the radio off —
> not when `cache.add()` resolved.

That sentence is the whole design. The previous implementation cached PDF bytes
correctly and was still unusable offline, because everything that could *open* a
saved book went through a server-rendered, auth-gated route. This document is
the map of what replaced it.

---

## 1. The failure this replaced

| Layer | What it did | Why offline reading still failed |
|---|---|---|
| `OfflineSaveButton` | `cache.add(url + "?offline=1")` | Resolving proves a request was made, not that an entry exists. An evicted, empty or HTML-bodied response counted as "Saved Offline". |
| `lib/offline.ts` | wrote the record to localStorage | The record was written unconditionally, so it could outlive the bytes. |
| `/offline-books` | linked each card to `/books/<slug>` | That page is a dynamic server render with a Supabase session lookup. With no network it cannot be produced at all — the service worker answered with `/~offline`. |
| `PDFViewer` | `caches.match(url)` | No `ignoreSearch`, so it never found the `?offline=1` entry the save had written. It always went back to the network. |

Saved PDF ≠ readable book. The fix separates the two surfaces:

```
/books/[slug]          online book page   — server-rendered, auth-gated, dynamic
/books/[slug]/read     online reader      — server-rendered, auth-gated, dynamic
/offline-reader?id=…   OFFLINE reader     — static shell, client-only, zero network
```

## 2. Data flow

```
SAVE (online, explicit)                READ (offline)
──────────────────────                 ───────────────────────
Save offline (button)                  /offline-reader?id=<bookId>
   │                                      │  service worker → precached shell
   ├─ fetch  …/file?offline=1             ├─ localStorage → record
   ├─ read body, counting bytes           ├─ caches.match(…, ignoreSearch)
   ├─ cache.put(offline-books)            ├─ Response → Blob
   ├─ cache.match  ← VERIFY               ├─ URL.createObjectURL
   ├─ cover → book-covers (best effort)   ├─ pdf.js (existing PDFViewer)
   └─ localStorage record  ← LAST         └─ revokeObjectURL on unmount
```

Ordering is the contract. `downloadOfflineBook()` (`lib/offline.ts`) writes the
localStorage record **only after** reading the stored entry back out of Cache
Storage, so a record can never outlive its bytes by construction. Every failure
path deletes the partial entry and throws a typed `OfflineSaveError` —
`network`, `server`, `empty`, `too-large`, `quota`, `storage`, `verify`,
`limit`, `unsupported`, `aborted` — which the button turns into one of three
messages plus a retry.

## 3. Cache ownership

| Cache | Written by | Read by | Survives SW upgrade |
|---|---|---|---|
| `offline-books` | the page, on an explicit save | SW rule 1, the offline reader | **yes** (`USER_OWNED_CACHES`) |
| `book-covers` | the page, on an explicit save | `<img>` in the library | **yes** |
| `serwist-precache-*` | install | precache route + shell rule | replaced per build |
| `ptec-pages-v3`, `ptec-static-v3`, `ptec-images-v3`, `ptec-pdfjs-v3`, `ptec-supabase-public-v3` | runtime rules | runtime rules | derived — deleted and rebuilt freely |

Two rules that must not be relaxed:

* **The service worker never writes a book file.** Rule 1 in `app/sw.ts` is
  `CacheFirst` with `cacheWillUpdate: () => null`. It can only ever hand back a
  file the user explicitly downloaded. Reading a book online stores nothing.
* **`?offline=1` is the consent marker.** The bytes are stored under
  `…/file?offline=1`; every reader and every delete looks up the bare URL with
  `ignoreSearch: true`. Removing that distinction would make an ordinary reader
  fetch indistinguishable from a download request.

## 4. Booting with no network

`/offline-books` and `/offline-reader` are **static client shells**, precached
as documents (`OFFLINE_SHELL_URLS` in `lib/sw-policy.ts`) in both locales —
English unprefixed, Khmer under `/km`, because a precached document carries the
messages of the locale it was rendered for. Their JS chunks come from the build
manifest, so an installed worker always holds an HTML+chunk pair from one build.

The book id travels in the **query string**, not a path segment. One precache
entry cannot cover `/offline-reader/[bookId]`, and serving a shell whose route
params disagree with the URL it was rendered for is a hydration hazard. With
`?id=` the same prerendered document answers for every saved book, and rule 2 in
`app/sw.ts` (`offlineShellFor()`) serves it for any `/offline-reader` URL when
the network is gone. Network first while there is one.

`/~offline` remains what it always was: the apology screen for a navigation we
cannot answer. It is deliberately *not* the reader.

## 5. Privacy and shared devices

The offline library is device-local: no server ever learns what was downloaded.

* Every record carries `ownerKey` — the profile id of the account that saved it.
* The device remembers the last account that used the library
  (`ptec_offline_owner`). That is readable **offline**, which `/api/me` is not,
  and it is what the library filters by when there is no network.
* **Sign-out destroys nothing.** The overwhelmingly common case is one reader
  signing out of their own device; deleting a 200 MB library they chose to keep
  would be a hostile surprise.
* **Signing in as a different account destroys the previous account's
  downloads** — records and bytes — via `reconcileOfflineOwnership()`, called
  from `/offline-books` as soon as `/api/me` answers. Reader B can never open,
  list, or silently inherit reader A's downloads.
* Pre-v2 records (saved before ownership existed) have `ownerKey: null`, stay
  visible, and are claimed by the first account to reconcile. Hiding them would
  read as data loss.

Unchanged, and still enforced: no generic `/api` caching, no cached profile,
notification, saved-books or admin responses, and a 2 MB ceiling plus a
`no-store`/`private`/`Set-Cookie` refusal on every *derived* cache
(`isCacheableResponse`).

**Known residual, stated plainly.** Because sign-out keeps both the downloads
and the device's owner key, anyone holding the unlocked device can open the
previous reader's saved books until a different account signs in. Clearing the
owner key on sign-out would close that, at the cost of making a reader's own
library disappear whenever they signed out while offline — which is the state
this feature exists to serve. The exposure is bounded to *published library
content that every signed-in reader may already open*: no profile, list,
progress or notification data is ever cached. If PTEC ever runs this on genuine
kiosk hardware, clearing `ptec_offline_owner` (and its books) inside
`clearPrivateBrowserState()` is the one-line change, and it belongs behind a
deployment setting rather than as the default.

## 6. Storage

* Bytes live in Cache Storage. Never localStorage (5 MB, synchronous, string
  only) and not IndexedDB (no demonstrated need — the service worker reads Cache
  Storage, and pdf.js is happy with a Blob).
* One copy is held in memory during a download, to count real bytes. Files over
  `MAX_OFFLINE_BOOK_BYTES` (400 MB) are refused rather than attempted.
* `MAX_OFFLINE_BOOKS` (20) is an **explicit error**, not a silent eviction. The
  old code deleted the oldest download without telling anyone.
* `/offline-books` shows the exact sum of verified book sizes, plus
  `navigator.storage.estimate()` when the browser supports it — labelled as an
  approximation, never presented as exact.
* Progress is honest: a percentage appears only when the response carried a
  `Content-Length`; otherwise the UI reports bytes received, or just
  `Preparing… / Downloading… / Saving… / Verifying…`.

## 7. Reader lifecycle

`components/ui/pwa/OfflineBookReader.tsx` does six things and no others: read
the record, fetch the cached response, convert to a Blob, create an object URL,
hand it to the existing `PDFViewer`, revoke the URL on unmount. It contains no
download logic — a reader that can fetch is a reader that can be broken by a
network path.

`PDFViewer` gained one prop, `offline`. It derives `isLoggedIn = isLoggedInProp
&& !offline`, which switches off every server round-trip (progress sync,
annotations, download counting, reader telemetry) at the single place they are
all gated, while local state — bookmarks, last page, zoom, theme — keeps working
because it never left the device. Downloading the open book is still allowed
offline: the bytes are already there.

pdf.js assets are already offline-safe and unchanged: the worker and standard
fonts are precached, cmaps are fetched on demand and cached by rule 6.

## 8. Service-worker upgrades

`skipWaiting: false` (unchanged) — a new worker waits rather than activating
under pages running the previous build. On activate, every cache the worker does
not own is deleted; `offline-books` and `book-covers` are owned and unversioned
precisely so an upgrade cannot destroy saved content. `lib/sw-policy.test.ts`
fails if either name leaves `USER_OWNED_CACHES`.

One fix landed here alongside the reader: `UpdateAvailable.tsx` reloaded the page
on **every** `controllerchange`, including the first-ever claim by
`clientsClaim` on a page loaded before any worker existed. That is not a
handover — nothing is stale — so a first visit spent a few seconds and then
reloaded itself under the reader. It now reloads only when the page was already
controlled. (Measured, not theorised: it destroyed the execution context in the
middle of the offline e2e run.)

## 9. Testing

| Level | File | What it proves |
|---|---|---|
| unit | `lib/offline.test.ts` | the save contract (verify-before-record, rollback on every failure), `ignoreSearch` matching and deletion, availability from the cache rather than the record, ownership purge, v1 migration, corrupt metadata |
| unit | `lib/sw-policy.test.ts` | shells are precached in both locales, the shell rule precedes the navigation fallback, one shell serves any book id, user-owned caches survive |
| e2e | `e2e/offline-reading.spec.ts` | real `window.caches`: save → verified entry, failure leaves nothing, online reading caches nothing, library availability/removal, the reader rendering pdf.js pages **with the file endpoint aborted**, phone viewport |

The service worker is disabled in development and Playwright's `webServer` runs
`npm run dev`, so the true offline-navigation case skips there. Run it against a
production build:

```bash
npm run build && npm run start
```

then, in another shell:

```bash
npx playwright test e2e/offline-reading.spec.ts
```

Measured on that build: 24/24 pass across Desktop Chrome and Pixel 5, including
"reloads and reads a saved book with no connection". The page-level specs do not
depend on the worker at all — aborting `/api/**` proves the PDF came from Cache
Storage more strictly than `setOffline(true)` does.

Auth for the save specs comes from `installSeededReaderSession()`
(`e2e/utils/auth.ts`): a real password grant from the local GoTrue, written into
the cookie `@supabase/ssr` reads. The token is genuine and the server still
verifies it; only the Turnstile widget is stepped around, because a spec about
offline storage should not fail — or hang — on a captcha.

## 10. Known browser limitations

* **Cache Storage needs a secure context.** `http://` on a LAN address has none,
  so the Save button hides itself rather than failing later.
* **Eviction is the browser's call.** Chrome and Safari can evict under storage
  pressure; nothing on the web platform makes a cache permanent (`persist()` is
  a request, not a guarantee). This is why availability is re-probed on every
  render instead of trusted from the record.
* **`navigator.storage.estimate()` is approximate and absent on some browsers**,
  including older iOS Safari. The UI degrades to "this browser does not report
  storage use".
* **iOS PWAs get a smaller, more aggressively reclaimed quota**, and storage is
  dropped after long periods without use. A missing copy is a normal state, not
  an error — hence the "Offline copy unavailable" row and its re-download link.
* **Private/incognito windows** may refuse Cache Storage or discard it on close.

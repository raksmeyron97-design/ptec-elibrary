# Large-file upload — protocol, state and recovery

**Scope:** how a book PDF gets from a librarian's laptop into Zima Storage and
into a `books` row, why the previous design produced the failures operators
reported, and what is now guaranteed.

Companion docs: `docs/BOOK-INGESTION.md` (what makes a book acceptable),
`docs/BULK-IMPORT.md` (the CSV importer), `docs/LARGE-PDF-PERFORMANCE-AUDIT.md`
(reading large books, not writing them).

---

## 0. The five reported symptoms, and their causes

| Reported | Actual cause |
|---|---|
| "Uploads stop around 10 MB" | No single layer imposes 10 MB. The bulk importer switched to the chunked path only **above 15 MB**, so a 10–15 MB book went as one request through Cloudflare's 100 s origin timeout and failed as a bare 524. Threshold is now 8 MB. |
| "Large PDFs stall at ~62%" | A chunk request that failed was retried up to 3 times with a 90 s client timeout, and each failure re-sent 5 MB. Nothing recorded which parts the server already held, so a slow link could not make progress. Chunks are now staged durably, and the client asks the server what is missing instead of guessing. |
| "Missing chunk 0 during final assembly" | Three independent producers — see §2. |
| "100% but the UI stays loading" | The bar measured the request BODY. The final chunk's body finished in a second; the server then worked for up to four minutes with nothing to report it. |
| "File in storage, book not in the dashboard" | The only record that a file had been stored lived in a React ref. If the save failed — or merely *appeared* to fail — nobody knew the bytes existed. |

---

## 1. Architecture

### Before

```
  browser                          one Next.js container
  ───────                          ────────────────────────────────────────
  POST chunk 0  ──────────────────▶ write /tmp/ptec-upload-chunks/<id>/part-0
  POST chunk 1  ──────────────────▶ …                     (tmpfs = RAM,
     …                                                     erased on restart)
  POST chunk N-1 ─────────────────▶ write part-N-1
                                    │  ← implicit finalize, same request
                                    ├─ readFileSync × N   ─┐
                                    ├─ Buffer.concat       │ five live copies
                                    ├─ .buffer.slice()     │ of the whole file
                                    ├─ sha256(whole)       │
                                    ├─ VirusTotal          │
                                    ├─ duplicate query     │
                                    ├─ new File(...)       │
                                    └─ fetch → Zima       ─┘
                                    rm -rf <id>/
  ◀────────────── { url } ──────────┘   (client timeout: 180 s)

  saveBookRecord(url)  ──▶ books + book_files
  on ANY error: browser deletes the PDF from storage
```

Nothing outside that one request knew the upload existed.

### After

```
  browser                          container                     Postgres
  ───────                          ─────────                     ────────
  POST action=init  ─────────────▶ validate destination ───────▶ upload_sessions
                                   + permission                   state=CREATED
  ◀── { present: [...] } ──────────┘

  POST action=chunk (× N) ───────▶ write <staging>/<i>.part      state=UPLOADING
                                   (durable volume, atomic
                                    scratch-then-rename)
  ◀── { received, missing } ───────┘

  POST action=finalize  ─────────▶ CAS UPLOADING→FINALIZING  ──▶ state=FINALIZING
                                   ├─ count parts (stat only)
                                   ├─ sniff 4 KB
                                   ├─ sha256, STREAMED
                                   ├─ VirusTotal (by hash)
                                   ├─ duplicate query
                                   └─ zimaUploadStream ──────────▶ Zima
                                      (1 MB window, never
                                       the whole file)
                                   CAS FINALIZING→STORED     ──▶ state=STORED
                                   discard staged parts             stored_url
  ◀── { url, contentHash } ────────┘

  GET  ?uploadId= ───────────────▶ state + exactly which parts are missing
  DELETE ?uploadId= ─────────────▶ cancel (refused once STORED)

  saveBookRecord({ …, uploadId })
        ├─ CAS STORED→SAVING_DB                              ──▶ state=SAVING_DB
        ├─ insert books + book_files
        └─ CAS SAVING_DB→COMPLETED with book id              ──▶ state=COMPLETED

  /api/cron/upload-reconcile (hourly) — releases stuck sessions, adopts files a
  row turns out to reference, flags the rest, reclaims staging disk.
```

---

## 2. "Missing chunk 0" had three causes, and all three are fixed

1. **The staging directory was RAM that a deploy erased.** `docker-compose.yml`
   mounts a tmpfs at `/tmp` because the image runs `read_only: true`, and
   `os.tmpdir()` is `/tmp`. Every `docker compose up -d` — and every OOM
   restart — destroyed the parts of every upload in flight. The client's next
   request found nothing and was told chunk 0 was missing, as though the
   browser had failed to send it.
   *Fixed:* `UPLOAD_STAGING_DIR` points at a named volume (`upload-staging`).

2. **A client timeout raced its own still-running finalize.** The final chunk's
   XHR timed out at 180 s while the server was legitimately still storing the
   file. The client retried; the retry ran a **second full finalization**
   concurrently; whichever finished first deleted the staging directory out
   from under the other, which then reported chunk 0 missing. Both had also
   uploaded the file to Zima, so one book left two objects behind.
   *Fixed:* finalize is claimed with a compare-and-set on the session row. The
   loser is told `SESSION_BUSY` or handed the winner's result. The client no
   longer times out on finalize at all — it polls `GET ?uploadId=`.

3. **Every error path deleted the staged parts.** A transient storage 503, a
   duplicate check, a content-type refusal — all ran `rm -rf` on the session
   directory, so the retry the operator was invited to make began by finding
   chunk 0 missing.
   *Fixed:* only a TERMINAL refusal (duplicate, malware, wrong type, oversize)
   discards the parts. A transient failure hands the session back to
   `UPLOADING` with the bytes intact, and finalize can simply be called again.

---

## 3. The state machine

`lib/uploads/state.ts` owns the transition table; it is pure and unit-tested.

```
CREATED ──▶ UPLOADING ──▶ FINALIZING ──▶ STORED ──▶ SAVING_DB ──▶ COMPLETED
   │            ▲              │            │           │
   │            └──────────────┘            │           └──▶ STORED  (retry)
   │         (parts missing —               │
   │          not a failure)                └──▶ ORPHANED ──▶ COMPLETED (adopted)
   └────────────┴──────────────┴──▶ FAILED / CANCELLED
```

Three edges carry most of the value:

* **FINALIZING → UPLOADING** — a finalize that found parts missing is not a
  failure. The parts it *does* hold are still good, and the client re-sends only
  what is named.
* **SAVING_DB → STORED** — a failed insert leaves the file perfectly usable. The
  librarian fixes the metadata and saves again; no byte is re-uploaded.
* **ORPHANED → COMPLETED** — the reconciler's most important edge. A save whose
  *response* was lost leaves a real `books` row and a session that never heard
  about it. Deleting that file would take out a catalogued book's PDF.
* **ORPHANED → SAVING_DB** — the save action claims from `["STORED", "ORPHANED"]`,
  so a librarian who left the form open past the reconciler's expiry can still
  save. `transition()` validates every state in that list before touching the
  row, so this edge must exist even for a session still sitting in STORED —
  without it every chunked save failed with "Illegal upload transition
  ORPHANED → SAVING_DB".

**Client stages** (`UploadStage`) are deliberately coarser and only one of them
is measurable:

| stage | bar | means |
|---|---|---|
| `sending` | determinate | bytes are leaving the browser |
| `finalizing` | indeterminate | hashing, sniffing, malware, duplicate |
| `storing` | indeterminate | transfer into Zima (reported by the session) |
| `saving` | indeterminate | the database row is being written |
| `complete` | — | the row exists. **The only stage that may say "done".** |

---

## 4. Memory

Finalization never holds more than a ~1 MB window, at any file size. Measured
with `scripts/upload-bench.ts` (which runs the old and new implementations
against the same staged parts and checks their hashes agree):

```
  size  chunks  mode        peak heap   peak RSS      time
  ────────────────────────────────────────────────────────
  10MB       2  streaming      3.5 MB    10.2 MB     1.88s
  10MB       2  legacy         0.2 MB    48.6 MB     0.81s
  25MB       5  streaming      0.2 MB    13.0 MB     1.33s
  25MB       5  legacy         0.2 MB   148.1 MB     1.32s
```

Legacy RSS scales with the file (≈6× the file size at the peak); streaming does
not. On a container with `memory: 1g`, that is what decided whether a 95 MB book
could be stored at all.

The transfer into storage is the second half: `zimaUploadStream()` writes the
multipart envelope by hand around a `Readable`, with an exactly-computed
`Content-Length`, so `fetch` never materialises the body. `duplex: "half"` is
required and Node-only; there is no browser caller and there must not be.

---

## 5. Size limits — where they actually are

| Layer | Endpoint | Limit | Evidence |
|---|---|---|---|
| Browser pre-flight | UploadForm / EditForm | `MAX_UPLOAD_BYTES` | `lib/uploads/state.ts` — imported, not restated |
| Chunk session | `POST /api/admin/upload/chunk` (init) | `MAX_UPLOAD_BYTES`, checked against `fileSize` before any chunk | route `handleInit` |
| Chunk part | `POST …/chunk` (chunk) | `chunkSize`, or the remainder for the last part | route `handleChunk` |
| Assembled file | `POST …/chunk` (finalize) | `MAX_UPLOAD_BYTES`, checked against the true streamed length | route `handleFinalize` |
| Single request | `POST /api/admin/upload` | `MAX_UPLOAD_BYTES` | route |
| Bulk request | `POST /api/admin/bulk-upload` | `MAX_UPLOAD_BYTES` per part | route |
| **Storage** | Zima `POST /api/upload` | **rejects exactly 104,857,600 bytes; accepts 104,857,599** | probed against a running instance |
| Storage (v1) | Zima `POST /api/v1/files` | same `maxUploadSizeMb`, up to 10 files | `lib/v1Routes.js` |
| Proxy | Cloudflare | 100 MB body; **100 s origin-response timeout** | this is what the chunk threshold is set from, not the file size |
| Next.js route handlers | — | none | `serverActions.bodySizeLimit: "6mb"` applies to Server Actions only, and no upload uses one |

**`MAX_UPLOAD_BYTES` is 100 MiB minus one byte**, and the byte is load-bearing:
the app's cap used to be exactly 104,857,600, which is precisely the size
storage refuses. A file of that size passed every check, was cut into twenty
chunks, staged, hashed, scanned and duplicate-checked, and was then refused by
Zima with a bare `413` after several minutes.

**There is no 10 MB layer anywhere.** The reported ceiling came from the bulk
importer's route selection: at or under 15 MB a row went as one request, and one
request carrying a 10–15 MB PDF over a slow link had to complete the browser's
transfer *and* the server's transfer into storage inside Cloudflare's 100 s
budget. The threshold is now 8 MB (`CHUNKED_THRESHOLD_BYTES`), chosen from the
proxy timeout and a realistic ~1 MB/s office link, not from the file size.

---

## 6. Idempotency

| Repeated | Result |
|---|---|
| the same chunk twice | same bytes, atomic rename, no corruption |
| `init` on an existing session | returns it, with the parts it already holds |
| `init` naming a different destination | **refused** — the key decides which permission row was checked |
| finalize while one is running | `409 SESSION_BUSY`; the client polls |
| finalize after one succeeded | replays the stored result; **no second object** |
| a chunk arriving after STORED | answered with the result |
| `saveBookRecord` with the same `uploadId` | replays the book the first call created |
| a save that fails | session returns to STORED; retry reuses the file |

---

## 7. Storage ↔ database consistency

A completed upload has, by construction: a storage object, a `books` row, a
`book_files` row with the content hash the server computed from the stored
bytes, `books.storage_folder`, and the true file size.

If the insert fails after storage succeeded, the session sits in `STORED` —
"these bytes are in storage and nothing references them" — which is a state
something can find. **The browser no longer deletes the PDF.** It cannot decide
correctly: a save request can fail from the browser's point of view while the
insert succeeded, and the file it deleted was then the one a live row pointed
at. The cover is still cleaned up client-side, because it is only ever
referenced by the row that call was creating.

---

## 8. Reconciliation

`/api/cron/upload-reconcile`, hourly (`.github/workflows/cron.yml`).

| Detected | Action |
|---|---|
| FINALIZING for > 15 min | released to UPLOADING with a fresh 24 h lease |
| SAVING_DB for > 10 min | released to STORED with a fresh lease |
| CREATED/UPLOADING past expiry | FAILED; staged parts reclaimed |
| STORED past expiry, URL referenced | **adopted** → COMPLETED |
| STORED past expiry, URL unreferenced | ORPHANED, **reported, not deleted** |
| ORPHANED, `?purge=1`, > 7 days, still unreferenced | trashed |
| staging directory with no live session, > 26 h | removed |

Two rules are absolute and tested:

* **It never deletes a database row.** A record with a broken file is a repair
  job; deleting it destroys catalogue work a re-upload cannot recreate.
* **It never deletes a storage object without asking the database first**, and
  a lookup that *errors* counts as "referenced". An error is not evidence of
  absence, and reading it as one is how a reconciler deletes live files during a
  database blip.

`purge` is off on the schedule. Run it by hand when disk actually needs it.

---

## 9. Security

Unchanged: staff authorization, `books: write` on the destination folder, magic
byte validation, hash-reputation malware check (`FAIL_CLOSED_VIRUS_SCAN`
respected), content-hash duplicate blocking, the allow-listed prefixes, and the
`describeStorageKeyError` folder rules.

Added:

* **Session ownership.** `requireOwnedSession()` — staff authorization says the
  caller may upload; it does not say whose staged bytes are theirs. Without
  this, any staff account could finalize, cancel or read the status of another
  account's upload by guessing an id, and publish a book from a PDF it never
  sent. A session belonging to someone else answers exactly as a missing one
  does, so the response cannot be used to enumerate ids.
* **Upload ids cannot traverse.** `UPLOAD_ID_RE` excludes `.`, `/`, `\` and
  everything else that could reach `path.join`, and `lib/uploads/staging.ts`
  re-checks containment after joining.
* **The destination is immutable for the life of a session**, so a
  books-scoped upload cannot be finished inside `publications/`.
* **Header injection into the multipart envelope** is closed:
  `zimaUploadStream` strips CR/LF/quotes from the filename and validates the
  content type before either is placed in a part header.

---

## 10. Configuration

| Variable | Default | Notes |
|---|---|---|
| `UPLOAD_STAGING_DIR` | `os.tmpdir()/ptec-upload-chunks` | **Must** be set in production to a durable mount. The default is the tmpfs. |
| `UPLOAD_INSTANCE_ID` | `hostname:pid` | Recorded on the session so a request reaching an instance that cannot see the staged parts says so, rather than reporting them missing. |
| `CRON_SECRET` | — | Guards `/api/cron/upload-reconcile` like every other cron route. |

On a platform where consecutive requests do not share a disk (Vercel, Lambda)
and `UPLOAD_STAGING_DIR` is unset, `init` refuses with
`CHUNK_STORAGE_UNAVAILABLE` and says why — instead of accepting twenty chunks
and reporting "Missing chunk 0" at the end.

---

## 11. Verifying a change

```bash
# Deterministic, CI-safe
npx vitest run lib/uploads app/api/admin/upload lib/upload-chunked.test.ts

# Memory + timing, against a running Zima
ZIMA_API_URL=… ZIMA_API_KEY=… npx tsx --expose-gc scripts/upload-bench.ts --legacy

# The real thing: real Postgres, real disk, real storage
NEXT_PUBLIC_SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… \
ZIMA_API_URL=… ZIMA_API_KEY=… UPLOAD_STAGING_DIR=… \
UPLOAD_E2E_OWNER=<uuid in auth.users> \
  npx tsx --tsconfig scripts/tsconfig.e2e.json scripts/upload-e2e.mts \
    --sizes 10,25,50,75,100
```

---

## 12. Rolling back

The change is additive at the data layer: migration `0132` only creates
`upload_sessions`. No existing table, column or row is altered, and no book,
`book_files` row or storage object depends on it.

To revert the application: `git revert` the change. The old route stages under
`os.tmpdir()` again and ignores `upload_sessions` entirely; existing books are
untouched, because nothing about them was ever stored in that table. Leave the
table in place — a stale, unread table costs nothing, and dropping it would
discard the record of any in-flight upload.

To revert only the infrastructure: remove `UPLOAD_STAGING_DIR` from the box's
`.env`. Staging falls back to `/tmp`, restoring the old (worse) behaviour
without a redeploy — useful only if the volume itself is the problem.

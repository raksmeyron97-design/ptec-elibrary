# Bulk book import — storage limits and how the importer survives them

`/admin/books/upload` → "បញ្ចូលជាដុំ" imports a CSV plus a folder of PDFs and a
folder of covers. Two hard limits in Zima Storage shape everything about how it
behaves. Both were found the same way: by reading the storage server's source
(`lib/safeFiles.js`, `index.js`, `lib/config.js`) rather than inferring them
from error messages.

---

## 1. Folder names: 80 characters per path segment

Zima validates every `/`-separated segment of the `x-folder` header with

```js
/^[a-zA-Z0-9_\- ក-៿]{1,80}$/     // lib/safeFiles.js → isValidFolderPath()
```

and answers anything else with `400 {"error":"Invalid target folder"}` — from
multer's `destination` callback, so the upload is refused before a byte lands.

| property | value | consequence |
| --- | --- | --- |
| unit | **characters**, not bytes | Khmer is BMP, so 80 Khmer characters (240 bytes) is fine |
| scope | **per segment** | total path length and depth are unconstrained |
| charset | letters, digits, `_`, `-`, space, U+1780–U+17FF | **no `.`** in a folder segment |
| non-ASCII | rejected in practice | `zimaUpload()` percent-encodes it, and `%` is not in the charset |

**Everything that builds a segment goes through
`lib/storage/folder-name.ts`.** `buildStorageFolderName()` reserves the `-<uid>`
suffix first, then truncates the slug at a word boundary to a 64-character
budget. `bookFolder` / `postFolder` / `thesisFolder` / `publicationFolder` in
`lib/book-utils.ts` are the callers; `describeStorageKeyError()` re-checks
server-side in both upload routes and in `validateFolder()`.

### The public URL slug is a separate value and is never truncated

```
public page URL : /books/interviewing-as-qualitative-research-…-3rd-edition   (109 chars, intact)
Zima folder     : books/research/interviewing-as-qualitative-research-a-guide-for-jm0p7tqz   (≤ 64)
```

Public URLs are shared, indexed, and embedded in the APA/BibTeX/RIS citations
on every book page. `slugify()` (`unicodeSlug`) must never adopt the storage
budget. Pinned by `lib/storage/folder-name.test.ts`.

### `book-<uid>` folders are not failures

A title with no Latin content — a Khmer-only title — slugifies to nothing and
falls back to `book-<uid>`. Those imports **succeeded**. Deciding orphanhood by
folder name would delete live books; `scripts/audit-book-storage.ts` decides by
whether any row references the file.

### The folder is recorded, never recomputed

`books.storage_folder` (migration `0128`). The uid is random and the slug is
truncated, so the folder cannot be reconstructed from the current title — and a
title edit would change the input anyway. Before this column, the edit form
recovered the folder from the cover URL and, for a book with no cover, minted a
brand-new folder on every PDF replacement.

---

## 2. Uploads: 60 per hour, per file, for the whole application

```js
// storage index.js
const uploadLimiter = makeLimiter({ name: 'upload', windowMs: 3600_000, max: rl.uploadPerHour });
// storage lib/config.js  → int(process.env.RL_UPLOAD_PER_HOUR, 60)
// storage .env (production) → RL_UPLOAD_PER_HOUR=60
```

| property | value | consequence |
| --- | --- | --- |
| quota | **60 uploads / hour** | a book with a cover spends **two** |
| window | **fixed**, not sliding | `retryAfterSeconds` counts down to the window's end; hammering does not extend it |
| key | client IP | every upload reaches Zima from **this server**, so the whole app shares one bucket |
| charged | **before** folder validation | a rejected row still spends quota |

That last row explains the observed run exactly:

> 23 books × 2 files + 14 folder-rejected rows = **60**. Everything after that
> got `429 {"retryAfterSeconds":3224}` instantly — 63 rows "failed" against a
> limit that still had 54 minutes to run.

### Concurrency is not the fix — and neither is raising the limit

The quota is a **rate**, not a concurrency limit. At 2 files per book against
60/hour, 86 books is ~2.9 hours no matter how the client paces itself; dropping
concurrency from 4 to 2 only stops four rows being burned per 429 instead of
one.

Raising `RL_UPLOAD_PER_HOUR` on the box would work, and is worth knowing about
as an escape hatch, but it was not needed: it permanently widens the ceiling on
an endpoint every other upload path also uses.

### What the importer actually does: one request per book

Zima meters **per request, not per file**, and runs two upload endpoints on two
independent counters:

| endpoint | bucket | limit | files/request | scope |
| --- | --- | --- | --- | --- |
| `POST /api/upload` | `upload:<ip>` | `RL_UPLOAD_PER_HOUR` = 60 | 1 | `write:files` |
| `POST /api/v1/files` | `v1-upload:<ip>` | `storageUploadPerHour` = 120 | up to 10 | `storage:write` |

`RL_STORAGE_UPLOAD_PER_HOUR` is not set on the box, so v1 runs at its 120
default. The importer sends a book's PDF and cover in **one** v1 request:

```
before:  2 of 60/hour   =  30 books/hour
after:   1 of 120/hour  = 120 books/hour        4x, nothing raised or removed
```

It also stops the importer competing with the single-book form, the thesis form
and the publication form, which stay on the legacy endpoint.

**One folder per request** is the binding constraint: `POST /api/v1/files` takes
a single `folder` for the whole batch, and every book has its own folder. So it
is one request per book, not five books per request.

`lib/storage-client.ts` already spoke v1 for `/admin/storage`; `uploadStorageFiles()`
only needed an overridable timeout, because the file manager's 2-minute default
does not comfortably cover a 100 MB PDF and a cover together.

### The legacy path is kept as a fallback, and it announces itself

v1 authorizes on `storage:write` — a different scope from the legacy endpoint's
`write:files`. In production both env vars hold the **same key**, and any key
whose role is `write` or `admin` carries both scopes (`storage/lib/auth.js`
→ `ROLE_SCOPES`), so it should be present; an explicit per-key scope override is
the only way it would not be.

Rather than depend on that, a v1 failure falls back to the old
one-request-per-file path so imports keep working at the old rate. The response
carries `via: "v1" | "legacy"` and **Step 3 shows which path the run used either
way** — a green "Batched uploads in use" line, or an amber warning naming the
scope to check. Silence cannot answer "am I really getting 120/hour?", because a
fallback and a fast run would look identical.

### Partial success

`POST /api/v1/files` returns a per-file array and has already moved each
successful file into place by the time it answers, so "one of two failed" is a
state on disk, not a hypothetical. The two halves are deliberately asymmetric:

- **PDF fails** → the book cannot exist, so anything that landed is garbage:
  every stored file in the batch is trashed before returning the error. No
  half-written folder.
- **Cover fails** → the book is still worth having. It is saved without a cover
  and the row carries a visible warning. A book quietly created with no cover
  and no error shown is the outcome this must not produce.
- **Unexpected response shape, or stored-but-no-URL** → files may be on disk, so
  re-uploading would duplicate them: clean up and fail the row rather than fall
  back.

The one case that can still leave an orphan is a **timeout**: the request may
have stored the files, and the client cannot tell, so the legacy retry can
leave an unreferenced copy. `scripts/audit-book-storage.ts` reconciles that, and
it is a better outcome than failing every row of an import.

### Resuming

The importer offers to pick up an unfinished run from the last 24 hours.

**Files are not persisted** — browser `File` handles cannot be serialized — so
resuming requires re-selecting the same CSV and PDF folder. What is recovered
is the decision record: which rows are done, which failed and why, and each
row's destination folder. Rows already `done` or `skipped` are not re-uploaded.
The UI says this rather than implying the transfer resumes by itself.

### Re-running is safe regardless

`/api/admin/bulk-upload` hashes every PDF and returns `409` if it is already in
the library (`book_files.content_hash`, unique-indexed). A re-run reports those
rows as **"Already in library"**, a distinct status — not an error, and not a
duplicate. The cost is that the file is still transferred before the server can
hash it; a client-side pre-hash would avoid that and has not been built.

---

## Cleanup after a failed run

```bash
npx tsx scripts/audit-book-storage.ts            # report
npx tsx scripts/audit-book-storage.ts --delete   # remove orphan FILES only
```

Reconciles `books/` in storage against `books` / `book_files` and reports:

- **orphan files** — bytes no row points at (a PDF that uploaded before its row
  failed to save). The importer now rolls these back as they happen; the script
  is for what is already on disk. These also poison a retry, because the
  duplicate check is by content hash.
- **orphan rows** — a book row whose PDF is missing. Worse, because the entry
  is public and its download 404s. The script never deletes a row: removing a
  catalogue entry has a public URL attached to it and belongs in `/admin`.

---

## Transport: which path a row takes, and why it is shown

A row goes one of three ways, and the panel says which — positively, on every
run, because a fallback and a fast run are otherwise indistinguishable:

| Transport | Route | Requests per book | Zima quota |
|---|---|---|---|
| `v1` | `POST /api/admin/bulk-upload` → storage `/api/v1/files` | 1 (PDF + cover together) | `v1-upload`, 120/hour |
| `legacy` | `POST /api/admin/bulk-upload` → storage `/api/upload` | 2 | `upload`, 60/hour |
| `chunked` | `POST /api/admin/upload/chunk` (many) → storage `/api/upload` | 1 for the PDF, 1 for the cover | `upload`, 60/hour |

The run reports the **worst** path any row took, since that is the rate it is
actually getting. `chunked` used to be reported as `v1`, which told an operator
importing large textbooks that they were on the 120/hour batched path while they
were spending quota twice as fast.

**A PDF over `CHUNKED_THRESHOLD_BYTES` (8 MB) goes chunked.** The number comes
from the PROXY, not the file: Cloudflare's origin-response timeout is 100 s, and
a single request carrying the whole PDF has to complete the browser's transfer,
this server's transfer into storage, the hash and the duplicate query inside
that budget. It was 15 MB, which put ordinary scanned coursebooks on the wrong
side of it and produced bare 524s on rows that were perfectly good.

Each row keeps a stable upload-session id for the life of the job, so **retrying
a failed row resumes its session** rather than uploading the file a second time
and stranding the first copy. See `docs/CHUNKED-UPLOAD.md`.

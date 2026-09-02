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

### Concurrency is not the fix

The quota is a **rate**, not a concurrency limit. 86 books ≈ 172 files ≈ **2.9
hours** at 60/hour no matter how the client paces itself. Lowering concurrency
from 4 to 2 only stops four rows being burned per 429 instead of one.

### The real remedy: raise the limit on the storage box

For bulk-import work, set on the Zima server's `.env` and restart it:

```bash
RL_UPLOAD_PER_HOUR=600      # 86 books ≈ 172 files, comfortably inside one window
```

This is a deliberate operational choice, not a default to change blindly: the
limiter also caps the damage an exposed key could do. Raise it for an import
window and consider putting it back afterwards.

### What the importer does meanwhile

Implemented in `lib/admin/import-queue.ts` (extracted so it is unit-testable —
`lib/admin/import-queue.test.ts`) and driven by `BulkUploadForm.tsx`:

- **Concurrency 2.**
- **One shared gate.** The first 429 pauses *every* worker. The quota is
  per-IP, so racing on only burns the counter for the same reply.
- **`retryAfterSeconds` is honoured**, from the JSON body or the `Retry-After`
  header, clamped to 70 minutes, and never shortened by a later worker.
- **A quota wait is not a failure** and is not charged to the transient-retry
  budget: up to 4 windows per file, versus 3 retries for a 5xx or network fault
  with exponential backoff.
- **`429`/`5xx` reach the client as themselves.** Both upload routes now relay
  `ZimaUploadError` with its status and `Retry-After` instead of flattening
  everything to `500` — that flattening is what made a rate limit look like a
  broken file.
- **"Rate limited — resuming in M:SS"** with a live countdown, and a **Stop**
  button, because a 54-minute automatic wait with no exit is a trap.
- **Progress is persisted server-side** (`book_import_runs`, migration `0129`)
  on a 1-second debounce, so a refresh or a closed laptop during a long pause
  does not lose the record of which rows landed.

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

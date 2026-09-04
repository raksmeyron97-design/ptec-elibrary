# Discovery data quality: why a published book might not be findable

A resource being *published* is not the same as it being *findable*, and this
library has four independent layers of findability. A book can pass every one
of them and fail the next:

| Layer | Backed by | What it makes possible | Fails how? |
|---|---|---|---|
| **Listed** | `books.is_published` | It appears on `/books`, `/subjects`, `/authors`, in counts | Loudly — the page is empty |
| **Keyword-searchable** | trigram indexes on `title`/`description` | `/api/search/native` matches its title, author, subject | Loudly — no result for its own title |
| **Semantically searchable** | `books.embedding` (`vector(768)`) | A related-meaning query finds it; the AI can surface it as a suggestion | **Silently** — it just ranks nowhere |
| **Full-text searchable** | `book_pages` → `book_chunks` | "Found inside" page hits; an AI answer can quote and cite **a page of it** | **Silently** — the phrase inside it matches nothing |

The bottom two fail silently, and that is the whole subject of this document.

## The incident this document exists because of

On 2026-09-04 an audit of production found:

```
resource_type | published | embedded | missing_embedding      ← public_resource_search_health
book          |    120    |    3     |       117

book_pages   rows: 0
book_chunks  rows: 0
```

120 published books. Three of them semantically searchable — the three oldest
rows in the table, from the day someone ran `scripts/embed-library.ts` by hand
when the library held three books. **Zero** of them full-text searchable, ever,
of any resource type.

The observable symptom: `/api/search/native?q=triangulation` returned
`results: 0, pageHits: 0` against a collection that is mostly research-methods
textbooks. The AI assistant could not cite a single page of a single book,
because `match_book_chunks()` had no rows to match.

Nothing in the application said so. `/books` cheerfully reported "120
resources" and was *correct*. `/subjects` and `/authors` agreed at 120. The
admin Data Quality screen reported embedding coverage and said nothing at all
about page extraction, so "the indexer has never once succeeded" was rendered
identically to "this collection happens to be scans".

### Root cause

`lib/pdf-page-index.ts` imports pdf.js by string literal:

```ts
await import("pdfjs-dist/legacy/build/pdf.mjs")
```

Next's file tracer sees that and copies **that one file** into
`.next/standalone/node_modules/`. But pdf.js does not import its worker — it
names one at runtime, on a mutable global:

```js
GlobalWorkerOptions.workerSrc ||= "./pdf.worker.mjs";
```

In Node there is no real `Worker`, so `getDocument()` takes the "fake worker"
path, which imports that specifier to get `WorkerMessageHandler`. A relative
string assigned to a global is invisible to static analysis, so the traced
output contained exactly one pdfjs file and every extraction in the container
died on its first statement:

```
Setting up fake worker failed: "Cannot find module
  /app/node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs"
```

`indexPdfPagesSafe()` is non-throwing by contract — a PDF that will not parse
must never fail a librarian's save — so that exception became a `console.log`
in a container nobody tails, 120 times.

It reproduces in one command. Hide the worker and the extractor throws that
exact message; restore it and the same PDF yields 172 pages:

```bash
mv node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs{,.HIDDEN}
```

**Every local run and every test passed the entire time**, because a
development `node_modules` has the worker sitting next to `pdf.mjs`.

### The three fixes

1. **`outputFileTracingIncludes` in `next.config.ts`** ships
   `pdf.worker.mjs`. This is the actual bug fix, and it is load-bearing for
   search and RAG, not a build detail.
   `lib/pdf-worker-tracing.test.ts` fails if it is removed, if pdf.js renames
   the worker in an upgrade, or if the extractor switches to a build whose
   worker is a different file.
2. **`resource_index_state` (migration 0133)** makes the outcome of every
   attempt durable, so the next silent failure is not silent.
3. **The admin Data Quality panel** renders it, so the failure is *seen*.

### The sequel: `DOMMatrix is not defined`

Shipping the worker exposed the second thing pdf.js hides behind a runtime
lookup — and `resource_index_state` is the reason we found out at all. With the
worker in place, records stopped failing on `Setting up fake worker failed` and
started failing on:

```
status: failed
detail: DOMMatrix is not defined
```

`DOMMatrix` is a browser API; Node has never had one. pdf.js knows that and
covers it in `src/display/node_utils.js`:

```js
const require = process.getBuiltinModule("module").createRequire(import.meta.url);
canvas = require("@napi-rs/canvas");
if (!globalThis.DOMMatrix) { globalThis.DOMMatrix = canvas.DOMMatrix; }
```

`@napi-rs/canvas` is an **optional** dependency of `pdfjs-dist`, pulled in
through `createRequire` — the same invisibility as `workerSrc`, one layer
down. It is therefore absent from `.next/standalone`, `globalThis.DOMMatrix`
stays undefined, and `pdf.mjs` throws while evaluating *its own module body*:

```js
const SCALE_MATRIX = new DOMMatrix();   // pdf.mjs, module scope
```

So this is not confined to unusual documents. The `import()` itself throws, and
`compileType3Glyph` in the worker — which builds one to flip a Type 3 bitmap
glyph into text space — would throw next:

```js
const { a, b, c, d, e, f } =
  new DOMMatrix().scaleSelf(1 / width, -1 / height).translateSelf(0, -height);
```

It reproduces the same way the worker did. Hide the package and the extractor
throws `ReferenceError: DOMMatrix is not defined`:

```bash
mv node_modules/@napi-rs{,.HIDDEN}
mv node_modules/pdfjs-dist/node_modules/@napi-rs{,.HIDDEN}
```

**The fix is `lib/polyfills/dom-matrix.ts`**, mounted on `globalThis` before
the pdf.js import (at module scope in `lib/pdf-page-index.ts`, and again in
`extractPdfPages` where it is load-bearing). Tracing `@napi-rs/canvas` was the
alternative and was rejected: it is a platform-specific native binary shipped
to satisfy two constructors, and text extraction rasterizes nothing.

The polyfill is deliberately narrow — affine 2D only, the six components
pdf.js reads — and a 3D operation **throws** rather than returning a plausible
2D answer, so the next gap is loud rather than silently wrong. It installs only
when the runtime has none, so a browser or canvas-backed `DOMMatrix` always
wins. Its arithmetic is pinned in `lib/polyfills/dom-matrix.test.ts` against
values taken from a real spec implementation, and
`lib/pdf-worker-tracing.test.ts` pins that it is mounted before the import.

`Path2D` is *not* polyfilled. pdf.js only warns about it, and it is reached
from rendering, which this path never does.

## The index state model

One row per `(record_type, record_id)`, recording the most recent attempt.
Four statuses, and the distinctions between them are the point:

| Status | Meaning | Retry? | Whose problem |
|---|---|---|---|
| `indexed` | Pages extracted and stored | No | — |
| `no_text_layer` | Parsed fine; every page was an image | **No — permanent** | Needs OCR, not a retry |
| `unfetchable` | File URL unresolvable or fetch failed | Yes | Storage / a moved object |
| `failed` | The attempt threw | Yes | **Always a bug or an outage on our side** |

A bare "not indexed" boolean would merge all three failure rows, and merging
them is exactly what hid the incident: a crash on the extractor's first
statement looked like a library of photographed textbooks.

`never_attempted` is likewise its own bucket in
`public_resource_index_health`, not folded into a total. "We have not run the
indexer over these" and "we ran it and they are scans" call for opposite
responses.

`outcomeFromError()` therefore maps **every** throw to `failed`, never to
`no_text_layer`. An exception is evidence about us, not about the document; a
mapping that guessed "probably a scan" from a throw would have written the
reassuring answer 120 times.

### What is not stored

The file URL. A storage URL is a permanent, credential-free, unlogged download
link (see `docs/BOOK-DOWNLOAD-PERMISSION.md`), so it is not copied into a
second table — `source_digest` is a SHA-256 of it, which is all that "has this
file changed since we indexed it?" ever needed.

Also not stored: history. This is a derived cache of a fact that lives in
`book_pages`/`book_chunks`. It is safe to truncate and rebuild.

## Reading the admin panel

`/admin/data-quality` → **Resource count audit** now carries two index
sections, and they answer different questions:

- **Search index** — published rows vs rows carrying a `books.embedding`.
  Makes a book reachable by a *semantic match on its title and description*.
- **Full-text index** — published rows vs rows whose PDF pages were extracted.
  Makes the *words inside the book* matchable, and is the only thing that lets
  an AI answer cite a page.

A collection can score perfectly on the first and hold nothing on the second.
Production did.

A chip turns amber when a type has any `failed`, `unfetchable`, or
`never attempted` records. A `no_text_layer` count does **not** colour the
chip: it is a true fact about the documents, not a defect.

## Runbook

### "Why can I see this book in admin but not in full-text search?"

1. Open `/admin/data-quality` and read the **Full-text index** chip for books.
2. `never attempted` → the background indexer has not run for it. New uploads
   index themselves; existing records need the backfill below.
3. `failed` → a bug or an outage. Check the server log for `[pdf-index]`
   lines; `resource_index_state.detail` carries the sanitized reason.
4. `scanned (no text layer)` → the PDF has no text to extract. Only OCR fixes
   this, and OCR is deliberately not implemented (cost).

### Backfill

Order matters: chunk embeddings are derived from extracted pages, so
extraction runs first.

```bash
# 1. Extract per-page text into book_pages, and record an outcome for every
#    record in resource_index_state. Idempotent: records already indexed are
#    skipped, and so are records already established to be scans. Records that
#    previously FAILED or were UNFETCHABLE are retried — that is the point.
npx tsx scripts/extract-pdf-text.ts

#    Force a full re-extract (e.g. after changing the extraction rules):
npx tsx scripts/extract-pdf-text.ts --all

# 2. Embed: row-level `embedding` for semantic match, plus book_chunks
#    passages from the pages step 1 produced.
npx tsx scripts/embed-library.ts
```

Both read `.env.local` then `.env`, and need `NEXT_PUBLIC_SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY` and (for step 2) `GEMINI_API_KEY`.

Step 2 spends Gemini quota proportional to the corpus, and
`gemini-embedding-001`'s free tier enforces per-minute *and* per-day limits.
`lib/chunk-embed.ts` backs off on a per-minute 429 and fails fast on a per-day
one, so a daily-quota stop is expected on a large first run — re-run the next
day and it resumes with the records it has not reached.

**Do not change `EMBEDDING_MODEL` / `EMBEDDING_DIM` in `lib/ai/models.ts` to
make a backfill cheaper.** Both sides of every vector search read those
constants, and `books.embedding` has previously held vectors from two
different models at once — semantic search over those rows was noise. Changing
them requires re-embedding every table.

### Verifying it worked

```sql
-- coverage, per type
select * from public_resource_index_health;

-- anything that failed, and why
select record_type, record_id, status, detail, attempted_at
  from resource_index_state
 where status in ('failed', 'unfetchable')
 order by attempted_at desc;
```

And from the outside — a phrase that occurs inside a book but in no title
should now return page hits:

```bash
curl -s -G https://library.ptec.edu.kh/api/search/native \
  --data-urlencode 'q=triangulation' | jq '{results: (.results|length), pageHits: (.pageHits|length)}'
```

## Related

- `docs/BOOK-INGESTION.md` — how a book gets into the library
- `docs/AI_ASSISTANT_ARCHITECTURE.md` — what retrieval does with these rows
- `docs/RESOURCE-STATISTICS.md` — the counting rules for the *listed* layer
- `docs/search-ranking.md` — how page hits are weighted once they exist

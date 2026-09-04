# Production retrieval runbook

How to recover, verify, and diagnose the full-text retrieval index in
production.

## The pipeline

```
PDF → book_pages → book_chunks → embeddings → semantic retrieval → AI grounding
```

Each arrow can fail independently, and three of them have failed in production
for reasons that were invisible at the time. Read
`docs/INDEX-STATE-MODEL.md` before operating any of this.

## 0. Before you run anything

**Never run a backfill from a laptop against production.** Scripts load
`.env.local` before `.env`, so a dev `ZIMA_API_URL` wins even when the Supabase
credentials are production's. That combination recorded 203 healthy books as
`unfetchable` in the production health table.

The guard now refuses that run, but the safe habit is the same:

```bash
npm run backfill:index -- --dry-run
```

It prints the target and the storage hosts before doing anything:

```
  Target        : REMOTE project ufeymdoqksojwyysicun
  Mode          : DRY RUN (writes nothing)
  Resources     : 215 published with a file
  Storage hosts : storage-ptec.online
  Allow-list    : storage-ptec.online
```

If `Allow-list` and `Storage hosts` disagree, stop. Nothing you learn from that
run is true.

## 1. Recovery, in order

Extraction first, always. Chunks derive from pages; vectors derive from chunks.
Embedding a book whose pages were never extracted produces nothing.

```bash
# 1. Extract page text. Idempotent, resumable, bounded.
npm run backfill:index -- --limit=25        # repeat until eligible == 0
npm run backfill:index -- --all             # or in one go, if you can babysit it

# 2. Embed. Separate on purpose: this one spends metered quota.
npx tsx scripts/embed-library.ts
```

Selection is by **state**, never by id range, so `--limit=25` run nine times
covers the library with no bookkeeping on your part. Re-running is free: a
record already indexed from its current file is not eligible.

### Expect the embedding step to stop partway

`gemini-embedding-001`'s free tier has a per-**day** cap. A large backlog will
exhaust it. That is handled, not broken: `isDailyQuotaError` fails fast, and the
records it did not reach stay queued. Re-run the next day.

Quota exhaustion classifies as `transient`, so those records keep their retry
schedule rather than being written off as broken documents.

**Do not change `EMBEDDING_MODEL` / `EMBEDDING_DIM` to make a backfill
cheaper.** Both sides of every vector search read those constants, and
`books.embedding` has previously held vectors from two different models at once
— semantic search over those rows was noise.

## 2. Verify

```sql
-- Coverage, per type. Every published resource is in exactly one bucket.
SELECT * FROM public_resource_index_health;

-- Anything that needs a human
SELECT record_type, record_id, status, failure_kind, attempt_count,
       detail, attempted_at, next_attempt_at
  FROM resource_index_state
 WHERE failure_kind IS NOT NULL
 ORDER BY failure_kind, attempted_at DESC;
```

From outside, a phrase that occurs *inside* a book but in no title should now
return page hits:

```bash
curl -s -G https://library.ptec.edu.kh/api/search/native \
  --data-urlencode 'q=triangulation' \
  | jq '{results:(.results|length), pageHits:(.pageHits|length)}'
```

And `/admin/data-quality` → **Resource count audit** → **Full-text index**
should agree with the SQL.

## 3. Diagnosing one resource

> "Why can I see this book in admin but not in full-text search?"

```sql
SELECT status, failure_kind, attempt_count, detail, attempted_at, next_attempt_at
  FROM resource_index_state
 WHERE record_type = 'book' AND record_id = '<uuid>';
```

| What you see | What it means | What to do |
|---|---|---|
| No row | Never attempted | Wait for the hourly job, or run the backfill |
| `indexed`, but stale in the view | The PDF was replaced | Nothing — the job re-indexes stale first |
| `no_text_layer` / `permanent` | Image-only scan | Nothing will fix this but OCR, which we do not have |
| `unfetchable` / `transient` | Storage was unavailable | It retries automatically; check storage if it persists |
| `unfetchable` / `config` | **A runner could not reach the files** | Fix `ZIMA_API_URL` on the box — the document is fine |
| `failed` / `config` | A build defect — a file missing from the standalone bundle | See below |
| `failed` / `transient`, `attempt_count` 5 | Budget spent | Investigate, then re-run the backfill to reset |

### The `config` failures that have actually happened

Both were files pdf.js resolves at runtime, invisible to Next's file tracer,
and both produced a total, silent, every-record failure:

| Detail | Cause | Fix |
|---|---|---|
| `Setting up fake worker failed: Cannot find module …/pdf.worker.mjs` | Worker not traced into `.next/standalone` | `outputFileTracingIncludes` in `next.config.ts` (#130) |
| `DOMMatrix is not defined` | `@napi-rs/canvas` (optional dep) not traced | `lib/polyfills/dom-matrix.ts`, mounted before the pdf.js import (#132) |

If a third appears, it is the same shape. Check what the standalone bundle
actually contains before assuming the PDFs are at fault:

```bash
find .next/standalone/node_modules/pdfjs-dist -type f
```

## 4. Ongoing health

`/api/cron/index-reconcile` runs hourly and drains the backlog at 10 records a
pass. You should not need to run a backfill again except after a bulk import.

Watch for:

- `skippedEnvironment: true` — the deployment cannot reach its own storage. The
  Actions run fails loudly on this.
- `never_attempted` not falling — the cron is not running, or every pass is
  being refused.
- `stale` climbing — PDFs are being replaced faster than the job re-indexes;
  raise `?limit=`.

## Related

- `docs/INDEX-STATE-MODEL.md` — statuses, failure kinds, staleness
- `docs/INDEX-RECONCILIATION.md` — the hourly job
- `docs/DISCOVERY-DATA-QUALITY.md` — the original five-week outage
- `docs/AI_ASSISTANT_ARCHITECTURE.md` — what retrieval does with these rows

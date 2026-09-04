# Index reconciliation

The job that drains the retrieval backlog without anyone watching it.

`/api/cron/index-reconcile` → `lib/indexing/reconcile.ts`, scheduled hourly at
`:41` by `.github/workflows/cron.yml`.

## Why it exists

Migrations 0133 and 0134 made indexing outcomes visible and classifiable.
Visible is not fixed. A book whose first attempt hit a storage blip stayed
unsearchable until a human read a dashboard — and the entire history of this
subsystem is that nobody reads it in time. The original defect ran five weeks
inside a `console.log`.

## What it picks up, in priority order

| Priority | Reason | Why it ranks there |
|---|---|---|
| 0 | `stale` | The only state that is actively **wrong**: search can quote text the current PDF does not contain |
| 1 | `never_attempted` | A first attempt is likelier to succeed than a repeat of one that already failed |
| 2 | `config` | The environment may have been fixed since |
| 3 | `transient` | Backoff has elapsed |
| 4 | `reclaimed` | A claim went cold — a runner died mid-record |

It never picks up a healthy current record, and **never** a `permanent`
failure: those get no `next_attempt_at` at all, so nothing retries a corrupt or
image-only PDF forever.

## What it deliberately does not do

**It does not embed.** Extraction is free and local; embedding spends a metered
external quota with a per-day cap. Chaining them means one quota stop aborts
extraction work that would have succeeded. Embedding stays a separate,
deliberate sweep.

**It does not process the whole library.** Default 10 records per pass, hard
cap 200. Extraction is I/O and CPU over multi-megabyte PDFs; a pass that runs
long enough to overlap the next one turns a queue into a stampede.

**It never deletes a resource row**, and never treats a failure to *read* the
database as evidence about a resource — the same posture as
`lib/uploads/reconcile.ts`.

## The environment guard

Before it writes anything, the reconciler samples the file URLs the target
database actually holds and runs them through the same `toAllowedStorageUrl()`
the indexer will use. **If none resolve, it aborts and writes nothing.**

This is not defensive padding. It is the direct fix for the incident that
motivated 0134: a backfill started on a laptop, where `.env.local` supplied
`ZIMA_API_URL=http://localhost:4000` while the Supabase credentials pointed at
production. Every production URL was correctly refused as off-allow-list, and
203 healthy books were recorded as `unfetchable` — a statement about the
operator's machine, stored as a fact about the library.

A refusal returns **HTTP 200 with `skippedEnvironment: true`**, because the job
did the right thing and paging someone for a correct refusal trains them to
ignore the channel. The GitHub Actions step greps for that flag and fails the
run, so it is loud where it should be loud and quiet where it should be quiet.

## Operating it

```bash
# What would it do? (writes nothing)
curl -H "Authorization: Bearer $CRON_SECRET" \
  "https://library.ptec.edu.kh/api/cron/index-reconcile?dry=1&limit=25"

# One larger catch-up pass
curl -H "Authorization: Bearer $CRON_SECRET" \
  "https://library.ptec.edu.kh/api/cron/index-reconcile?limit=50"
```

Manually via GitHub: **Actions → Scheduled Jobs → Run workflow → `index-reconcile`**.

Locally, prefer the CLI — it prints the target and refuses a mismatched
environment before writing:

```bash
npm run backfill:index -- --dry-run
```

## Reading a pass

One structured log line per run:

```json
{"event":"index_reconcile","dryRun":false,"limit":10,"scanned":215,
 "eligible":207,"processed":10,"indexed":9,"noTextLayer":1,
 "unfetchable":0,"failed":0,"skippedEnvironment":false}
```

- `eligible > processed` — backlog remains; it drains at `limit` per hour.
- `skippedEnvironment: true` — the deployment cannot reach its own files. Fix
  `ZIMA_API_URL`; nothing was written.
- `failed` climbing with `indexed` at zero — look at
  `resource_index_state.detail`. A `config` kind means a build or environment
  defect, not bad documents.

## Acceptance behaviour

- A transient failure is retried, with backoff, up to 5 attempts.
- A permanent failure is never retried.
- A newly uploaded book indexes itself on save; if that fails, this job picks
  it up as `never_attempted`.
- A replaced PDF becomes `stale` and is re-indexed first.
- A deleted book leaves no pages, chunks, vectors, or state row — the delete
  paths in the admin actions clear all four.

## Related

- `docs/INDEX-STATE-MODEL.md` — what the statuses and kinds mean
- `docs/PRODUCTION-RETRIEVAL-RUNBOOK.md` — recovery and verification
- `docs/RUNBOOKS.md` — the other scheduled jobs

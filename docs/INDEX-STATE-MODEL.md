# The index state model

Every published resource with a PDF has exactly one answer to "can its text be
searched, and if not, whose problem is that?" This document is that answer's
definition.

Tables: `resource_index_state` (0133, extended by 0134). View:
`public_resource_index_health`. Pure logic: `lib/indexing/state.ts` (what
happened) and `lib/indexing/retry.ts` (what to do about it).

## Status: what happened on the last attempt

| Status | Meaning | Retried? |
|---|---|---|
| *(no row)* | Never attempted | Yes — first in line after stale |
| `running` | Claimed by a runner right now | Only once the claim goes cold |
| `indexed` | Pages extracted and stored | No, unless stale |
| `no_text_layer` | Parsed cleanly; every page was an image | **Never** |
| `unfetchable` | The file could not be retrieved | Depends on `failure_kind` |
| `failed` | The attempt threw | Depends on `failure_kind` |

## Failure kind: whose problem is it?

This is the axis 0133 lacked, and the omission cost 203 false verdicts in
production. Status alone cannot distinguish these three:

| Kind | Meaning | Retry | Counts as evidence about the collection? |
|---|---|---|---|
| `transient` | The world was briefly unavailable — storage 5xx, socket reset, **provider rate limit** | Backoff, up to `MAX_ATTEMPTS` (5) | Yes |
| `permanent` | A property of the document — image-only scan, corrupt or encrypted PDF | **Never** | Yes |
| `config` | **Our** environment was wrong — a runner could not reach the files at all | Yes, but never consumes the attempt budget | **No** |

Three rules follow from `config` being "not about the resource", and all three
are enforced in code, not convention:

1. **A `config` verdict never overwrites a non-`config` state.**
   `shouldOverwrite()` refuses it. A process that cannot reach the files has
   learned nothing about them.
2. **A `config` failure does not increment `attempt_count`.** Otherwise one
   misconfigured sweep exhausts every record's retry budget and leaves the
   library permanently un-retried after the fix ships.
3. **A `config` failure still reschedules.** Environments get corrected and
   redeployed; the records should heal on their own rather than waiting for
   someone to remember them.

### Classification is conservative in a specific direction

`classifyFailure()` checks config patterns first, then permanent, then
transient, and **defaults anything unrecognised to `transient`**.

Being wrong by retrying costs five attempts. Being wrong by abandoning costs a
book that is never searchable again. The asymmetry decides the default.

Config patterns are checked first because a config failure often *looks* like
something else: `Cannot find module …/pdf.worker.mjs` and `DOMMatrix is not
defined` are technically crashes, but both were **build defects** — files
missing from the standalone bundle — and filing either as `permanent` would
have marked ~200 perfectly good PDFs as unusable forever.

## Staleness is derived, never stored

`source_digest` is the SHA-256 of the file URL that was indexed. The health
view compares it against the digest of the URL the resource points at *now*:

```sql
s.source_digest IS DISTINCT FROM encode(extensions.digest(p.file_url,'sha256'),'hex')
```

`lib/indexing/reconcile.test.ts` pins that `sourceDigest()` produces exactly
that string. If the two ever diverge, every record reads as stale and the
reconciler re-extracts the whole library on a loop.

Stale is not a status because a stored flag can disagree with the files it
describes. Derived, it cannot: replace a PDF and the record stops reading as
healthy on the next read, with no write and no trigger.

**Stale outranks everything in the work queue.** It is the only state that is
actively *wrong* rather than merely absent — search can quote text the current
document does not contain.

## Claims

`running` + `claimed_at` + `claimed_by` stop the hourly cron and an operator's
manual backfill from processing the same record twice. A claim older than
`STALE_CLAIM_MS` (30 minutes) is reclaimable, so a runner killed mid-extract
does not strand a record in `running` for good.

## What the numbers mean on `/admin/data-quality`

Two sections, two different questions:

- **Search index** — does the resource carry a `books.embedding`? That makes it
  reachable by a *semantic match on title and description*.
- **Full-text index** — were the PDF's pages extracted? That makes *the words
  inside it* matchable, and it is the only thing that lets an AI answer cite a
  page.

A collection can score perfectly on the first and hold nothing on the second.
Production did: 3/120 embedded while 0/120 had any extracted text.

A chip turns amber for `failed`, `unfetchable`, `never attempted` or `stale`. A
`no_text_layer` count does **not** colour it — that is a true fact about the
documents, not a defect.

## Related

- `docs/INDEX-RECONCILIATION.md` — the job that drains the backlog
- `docs/PRODUCTION-RETRIEVAL-RUNBOOK.md` — how to run and verify a recovery
- `docs/DISCOVERY-DATA-QUALITY.md` — the original incident and the four layers
  of findability

# Production Validation — 9 September 2026

Measurement-first audit of `library.ptec.edu.kh`. Every number below was taken
from the live deployment or the production database. **No writes were made to
production**: every interaction was a read, an unauthenticated probe, or a HEAD
request — no test uploads, no seeded accounts, no cron triggers.

## Release recommendation: READY WITH WARNINGS

The branch is ready to merge and **should be deployed promptly** — production
is still serving Next 16.3.0, which carries a critical RCE this audit showed is
reachable through the image optimizer enabled in #146. Nothing else found is
release-blocking. The warnings are about *evidence*, not known breakage.

Production health: **7.5 / 10** — strong data-layer and pipeline integrity,
held back by an undeployed critical patch and two features live but unexercised.

| # | Area | Verdict | Basis |
|---|---|---|---|
| P1 | Reader 2 durable state | **WARN** | Exact-page resume verified live (5 rows carry the 0141 columns, incl. page 244/295). `reader_bookmarks`/`reading_lists`/`book_notes` hold **0 rows** — never exercised. |
| P2 | PWA offline | **WARN** | SW live (102 KB, 620 precache entries); all 4 offline shells + `/~offline` confirmed in the deployed worker. Offline round-trip not driven. |
| P3 | Large uploads | **PASS** | 141 real sessions; 0 stuck mid-transition; no historical failure mode present. Ceiling untested (largest ever = 81 MB). |
| P4 | Retrieval / AI | **PASS** | 245/270 AI-ready (90.7%), deterministic across 3 runs. |
| P5 | Cron / cache | **PASS** | 5/5 routes 401 on no-auth and wrong-bearer; 0 overdue scheduled; 0 mirror divergence. |
| P6 | Security | **FAIL → fixed** | One reachable critical RCE, fixed on branch, **not yet deployed**. RLS/CSP/headers otherwise strong. |
| P7 | Performance | **PASS** | Baseline captured; range requests verified end to end. |

## Confirmed defects

### 1. Critical RCE reachable through the image optimizer

`next@16.3.0` is inside `>=16.0.0 <16.3.3` for two critical advisories,
including an RCE in the image-optimization AVIF decoder
(GHSA-2xp9-vwfh-vxw4). `formats: ["image/webp"]` stops us *encoding* AVIF; it
does not stop us **decoding** an AVIF source an allowlisted host returns.

The allowlist carried a wildcard `*.r2.dev`, and any r2.dev subdomain is
registrable by anyone with a Cloudflare account:

```
/_next/image?url=https://pub-<random>.r2.dev/x.avif  -> 401  upstream propagated: FETCHED
/_next/image?url=https://example.com/x.png           -> 400  refused (not allowlisted)
```

The 400 control proves 401 means the allowlist accepted the host and production
fetched it.

**Fix:** next 16.3.0 → 16.3.4; `*.r2.dev` wildcard removed. It was redundant —
all 270 `books.cover_url` and all 270 `book_files.file_url` point at
`storage-ptec.online`, and the single remaining r2.dev row (one avatar) is on
the `pub-859a15…` bucket already listed explicitly.

**Verification:** `audit-gate` now reports 0 critical (was 1); clean build on
16.3.4, 115/115 static pages. **Closes only on deploy.**

### 2. The readiness audit answered a different number every run

`scripts/audit-resource-health.ts` reported **231, 230, 234** AI-ready books on
three consecutive runs against a database provably not changing
(`resource_index_state`: 0 stale, 0 running, and no `updated_at` to churn).

`allRows()` paged with `.range()` and no `ORDER BY`. Measured on production
`book_chunks`:

```
unordered  132,270 fetched · 90,335 DISTINCT · 41,935 duplicates
           29,691 rows in one sweep were absent from the next
ordered    132,270 fetched · 132,270 DISTINCT · 0 duplicates
```

Books whose chunks all landed in a skipped window read as `not_embedded`. This
is the report that decides what gets reprocessed — it was naming 17–23 healthy
books as needing a backfill, against a metered embedding quota.

**Fix:** ordering is now a *required* parameter, not a default (the right key is
per-table; `resource_index_state` has no `id` column). Every production sweep
was already correct — only this one had drifted.

**Regression test:** `lib/db/paginated-sweep.test.ts`, a source scan over all
eight sweeping files. Confirmed to fail with the exact file and line when the
ordering is removed.

| Measure | Before | After | Target | Status |
|---|---|---|---|---|
| AI-ready reported | 228–234 | 245 | stable | Fixed |
| Run-to-run variance | ±6 books | 0 | 0 | Fixed |
| "Actionable" backlog | 17–23 | 6 | true count | Fixed |
| Distinct chunk rows swept | 90,335 | 132,270 | 132,270 | Fixed |

### Coverage gap (not a live bug)

The **server half** of Reader 2's account isolation had no test.
`bookmark-ownership.test.ts` covers the device half and its own docstring says
the other half is that the *server* decides. Meanwhile `localPages`/`localOwner`
arrive as Server Action arguments, as caller-controlled as a request body — on a
shared lab machine a regression there moves one student's bookmarks into the
next student's account.

The logic is correct (`user_id` comes from server-side `getUser()`; a
foreign-owned record uploads nothing). Added
`app/actions/reader-bookmarks-isolation.test.ts` — 6 cases, verified to fail
when the ownership check is removed.

## Retrieval coverage — 270 published books

| Stage | Ready | Missing | Coverage |
|---|---|---|---|
| Metadata | 270 | 0 | 100% |
| File present | 270 | 0 | 100% |
| Text extracted | 248 | 22 | 91.9% |
| Chunks created | 246 | 24 | 91.1% |
| Embeddings complete | 246 | 24 | 91.1% |
| Searchable | 270 | 0 | 100% |
| **AI-ready** | **245** | 25 | **90.7%** |

Of the 25, **19 are permanently image-only scans** — a fact about the documents,
not a defect. Genuinely actionable: **six** (3 unembedded, 2 failed extraction,
1 never indexed). Reprocessing should be limited to those six.

## Upload pipeline — 141 real sessions, 3–6 September

| Failure mode in scope | Count | Finding |
|---|---|---|
| Stall at ~62% | 0 | No session in a non-terminal state |
| Missing chunk 0 | 0 | Absent from the record entirely |
| 100% progress, never completes | 0 | No stuck finalize; 2 retried once |
| Incomplete session reclamation | 0 | Reconciler classified every failure |
| Abandoned mid-upload | 8 | `FINALIZATION_FAILED`, reclaimed as designed |
| Stored but DB save failed | 30 | `ORPHANED` — see below |
| Completed | 103 | 73% of attempts |

The 30 orphans are **not a storage leak**. Each has
`stored_bytes == declared_size` (file fine, second phase of the two-phase commit
failed). All 30 `stored_url`s return **404** from Zima, while live
`book_files` URLs return **200 with content-length** on the identical
unauthenticated request — that control is what makes 404 mean "already
reclaimed" rather than "needs auth". ~747 MB already gone; rows persist
deliberately. All failures cluster in the 3–4 Sept bulk-import window; nothing
has failed since the 6th.

## Performance baseline

| Measure | Value | Note |
|---|---|---|
| Homepage TTFB | 231 ms | 101 KB brotli / 883 KB decoded |
| /books TTFB | 337 ms | total 546 ms |
| /search TTFB | 305 ms | warm repeat 216 ms |
| ZimaOS throughput (5 MB) | 7.3 MB/s | home-server tier |
| ZimaOS throughput (58 MB) | 2.4 MB/s | 24 s full download |
| Range request | 206 OK | correct `Content-Range` |
| 64 KB range fetch | 177 ms | first-page latency proxy |

**Investigated and cleared:** raw storage does not advertise `Accept-Ranges`,
which would normally make pdf.js abandon ranges and stream whole documents. The
reader never reads storage directly — its proxy at `/api/books/[slug]/file` sets
`Accept-Ranges: bytes` explicitly on both the Zima and R2 paths and forwards
`Range` upstream. No change made.

## Data-layer security

Probed with the anon key. Every private table either hard-blocks (`42501`) or
filters to zero rows while holding data: `reading_progress` 51 → 0,
`book_chunks` 132,270 → 0, `profiles` 30 → 0, `role_permissions` 67 → 0. An
anonymous INSERT into `reader_bookmarks` was refused. **No IDOR at the data
layer.** Split CSP verified live: public pages `unsafe-inline` with no nonce
(prerendering preserved); admin pages per-request nonce + report-only +
`noindex, nofollow`. All five cron routes 401 on both no-auth and wrong-bearer.

## Remaining risks

| Risk | Confidence | Detail |
|---|---|---|
| Production still on Next 16.3.0 | **VERIFIED** | Critical RCE open until this branch deploys |
| Reader 2 bookmarks/collections never executed in production | **VERIFIED** | 0 rows in 3 tables ~9 h after deploy, despite real reader traffic. Absence of evidence, not proof of correctness |
| Cross-account isolation under two live accounts | **INFERRED** | Correct by code + 6 new tests; never driven by two signed-in browsers |
| Offline round-trip (save → disconnect → reopen → resume) | **BLOCKED** | Needs a signed-in production account; in-app browser cannot register a service worker |
| Uploads above 100 MB | **NOT TESTED** | Largest attempt in production history is 81 MB |
| Scheduled publishing under load | **INFERRED** | 0 overdue, but also 0 scheduled — path was idle. Mirror consistency across 270 books is the real evidence |
| `middleware.ts` deprecated in Next 16 | **VERIFIED** | Build warns; migration to `proxy.ts` is future work. Only one CSP source, so no conflict today |
| `browserslist`, `js-yaml` advisories | **VERIFIED** | Build-time and dev-only; browserslist's only "fix" is a semver-major downgrade of `@serwist/next`. Correctly non-actionable |

## Verification run

After `rm -rf .next` (a warm webpack cache can mask a build error):

```
tsc --noEmit    0
eslint          0 errors (172 pre-existing warnings)
vitest run      4,054 passed, 50 skipped, 265 files
npm run build   0  — Next 16.3.4, 115/115 static pages
audit-gate      0 critical (was 1)
```

15 new tests: 9 sweep-invariant, 6 account-isolation. Both suites were
negative-controlled — each confirmed to fail when the code it guards is
reverted, so neither is vacuous.

## Recommended next steps

1. **Merge and deploy this branch first.** It is the only thing between
   production and a reachable critical RCE.
2. **Reprocess exactly six books**, not the 19–23 the old report named.
3. **Get one real bookmark written in production** — a single signed-in pass
   over bookmark → rename → collection → reload. That is the one piece of
   evidence that moves Reader 2 from WARN to PASS.
4. **Test one upload above 100 MB** against staging to exercise the ceiling
   production has never reached.
5. Consider narrowing `*.supabase.co` and `*.public.blob.vercel-storage.com` in
   `remotePatterns` — attacker-registrable in the same way `*.r2.dev` was, and
   both match zero production rows. Left in place deliberately: the Supabase
   Cloud rollback window is open until early October, and CLAUDE.md documents
   the Blob entry as intentional legacy support.

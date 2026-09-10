# PTEC e-Library — Production Security Closure & AI Quality 2.0 Preparation

**Date:** 2026-09-10
**Branch:** `fix/security-event-sink-production` (from `audit/final-production-reliability-2`)
**Follows:** [Final Production Reliability Audit 2.0](./FINAL-PRODUCTION-RELIABILITY-AUDIT-2.md), verdict PASS WITH WARNINGS

---

## Verdict

## **PASS WITH WARNINGS**

The warning that made the previous audit "with warnings" is **closed**: the
security-event sink's root cause is proven, fixed, and verified end to end
against a real production build — 0 rows → 3 rows → a detected incident. The
authorization gap the audit could not close is now closed **at the database
boundary** by 39 executable cross-account probes, having been unverifiable
before for want of a second account.

It is not a clean PASS, and the reason is stated rather than buried: **the fix
has not yet run in production.** Everything below was reproduced and verified
against a production *build* driving the local stack. The production container
is still running the old code, so `security_events` on
`supabase.storage-ptec.online` is still at zero rows until this branch is
deployed. One post-deploy check closes it (§6).

---

## 1. Security event sink

### 1.1 Observed failure

`security_events` = 0 rows and `security_incidents` = 0 rows in production,
while `app_events` held 487 and `admin_audit_log` 381 — so the app's *other*
durable writers were working. Three invalid-bearer cron requests produced three
401s and no rows, twice, hours apart.

**43 files call `logSecurityEvent`.** Every one of them was silently dropping
its event.

### 1.2 Root cause — proven, not inferred

**`let sink: SecuritySink | null = null` at module scope is not a singleton.**

Next's webpack build instantiates a module once per chunk that imports it, and
each instantiation gets its own copy of every module-level binding. Measured on
a production build of this repository, `lib/security-log.ts` was emitted into
**three separate server chunks**. `instrumentation.ts` registered the durable
sink into the one copy it happened to load; every route handler read a
different copy whose `sink` was still `null`. `sink?.(normalized)` is a silent
no-op on `null`.

That produces exactly the four symptoms observed, and no others:

| Symptom | Why |
|---|---|
| the console line was written | the emitter is module-local too, and worked in every copy |
| registration reported success | it really did succeed — in the other copy |
| no error thrown or logged | there was no error |
| `security_events` stayed empty | for months |

**Evidence — static.** `SECURITY_SPIKE_THRESHOLD`, a string that occurs exactly
once in `lib/security-log.ts`, appears in `chunks/7999.js`, `chunks/3107.js` and
`chunks/2365.js`. Only 7999 also contains `registerSecuritySink` — webpack
tree-shook the unused export from the copies that only needed
`logSecurityEvent`, leaving each of them a `sink` that nothing can ever set.

**Evidence — runtime.** Local production build (`next start`), 2026-09-10
12:18:33 UTC:

```
✓ Ready in 470ms
[env-check] …                                    ← instrumentation.register() RAN
                                                 ← and NO "sink not installed" warning
GET /api/cron/cleanup  (Bearer invalid-probe-secret)  → 401
{"evt":"security","type":"cron_auth_failed",…}   ← the event WAS emitted
security_events → Content-Range: */0             ← and persisted nowhere
```

Registration succeeded, the event was emitted, nothing errored, no row. That
combination has exactly one explanation.

### 1.3 What was ruled out

| Hypothesis | Ruled out by |
|---|---|
| Migration 0127 not applied | table exists and is readable |
| Hosted schema drift | **all 17 columns** `lib/security/sink.ts` writes are selectable on the hosted schema |
| Instrumentation never runs | `[env-check]` lines print at startup, after the sink block |
| Dynamic import throwing | the `catch` logs `security event sink not installed` — it never appeared |
| Sink disabled itself / batch failure | the sink logs both, and neither appeared; severity 2 flushes immediately |
| Route returns before logging | `app/api/cron/cleanup/route.ts:46` logs before the 401, and the console line proves it ran |

### 1.4 Fix

**One idea, minimally applied: the registry is process-global, not
module-local.**

`lib/security-log.ts` now keeps `{ sink, registeredAt, instances, emitted,
delivered, undelivered }` on an object addressed by
`Symbol.for("ptec.security-log.registry")`. `Symbol.for` resolves through the
cross-realm symbol registry, so every duplicated copy of the module — in any
chunk, in any bundle — reaches the same object.

**Nothing else about the architecture changed.** The wiring stays inverted,
`lib/security-log.ts` stays free of `server-only`, the sink is still installed
by `instrumentation.ts` and by nobody else, the event schema is untouched, the
fallback console line is untouched, and no authorization logic was altered.

**And the fallback stopped hiding the failure.** Delivery is now accounted for:

- `getSecuritySinkHealth()` reports `installed`, `emitted`, `delivered`,
  `undelivered` and `moduleInstances`.
- The first event that finds no sink logs, **once per registry state**, that
  nothing is being persisted and that detection, incidents and alerting cannot
  fire. Once, not per event: an incident is exactly when that path runs
  thousands of times.
- `/admin/security` gained an **Event persistence** row that reads
  `NOT PERSISTING — N event(s) written to stdout only` in precisely the state
  that went unnoticed, and flags `moduleInstances > 1` by name. It is
  deliberately **not** on the public `/api/health`: advertising that monitoring
  is off is itself a disclosure.

### 1.5 Bonus finding — a real redaction gap, found by the new test

Writing the "never persists a secret" test surfaced a defect that was not part
of the brief:

```
input   detail: "authorization: Bearer sk_live_NOT_A_REAL_KEY_000000 password=hunter2"
before  detail: "[redacted] sk_live_NOT_A_REAL_KEY_000000 [redacted]"     ← credential in the clear
after   detail: "[redacted] [redacted]"
```

Two causes, both fixed in `lib/security/model.ts`:

1. The key/value rule `…(bearer|authorization|…)\s*[:=]\s*\S+` consumed the word
   **"Bearer"** — the auth *scheme* — as its value and stopped. An HTTP auth
   credential is **space-separated** from its scheme and was invisible to it. A
   scheme-aware pattern now runs first.
2. `\b(?:sk|pk|rk)_[A-Za-z0-9]{16,}` does not match `sk_live_NOT_A_REAL_KEY_000000` —
   the underscore in the environment segment ends the run four characters in —
   which is the shape every provider using that prefix actually issues. The
   charset now allows `_` after the prefix.

This mattered more than a normal redaction miss: it applied to durable rows
**and** to any Telegram message built from them.

### 1.6 Tests

`lib/security-log.test.ts` (+9), all new:

| Test | Protects |
|---|---|
| hands every event to an installed sink | the delivery contract |
| survives a sink that is not installed, **and says so — once** | the exact production state; one warning per state, not per event |
| counts a throwing sink as undelivered | health never reports a write that did not happen |
| registering twice replaces rather than fans out | idempotent installation |
| registering null resumes stdout-only | the documented test/teardown path |
| **resolves the registry through the cross-realm symbol** | **the failure class itself** — a refactor back to a module-local `let sink` passes every other test in the file and fails this one |
| reports how many copies of the emitter module exist | the diagnostic that names the cause |
| never persists a secret handed to it by mistake | §1.5, both directions (row and stdout) |

### 1.7 Production result

Verified end to end against a production build, local stack, 12:26:55 UTC:

```
BEFORE   security_events  Content-Range: */0
         3 × GET /api/cron/cleanup with an invalid bearer  →  401, 401, 401
AFTER    security_events  Content-Range: 0-0/3
```

Persisted row — only intended metadata, no token, no secret:

```json
{ "event_type": "cron_auth_failed", "severity": 2, "service": "cron",
  "location": "/api/cron/cleanup", "result": "blocked", "actor_type": "anonymous",
  "detail": null, "metadata": {}, "occurred_at": "2026-09-10T12:26:55.928+00:00" }
```

**And the rest of the chain, which had never run:**

```
12 more invalid-bearer requests → POST /api/cron/security-scan
{"ok":true,"eventsScanned":15,"findings":1,"incidentsOpened":1,…}

SEC-20260910-001 · open · severity 2
"Scheduled-job endpoint probed with a bad secret"
"15 request(s) to a /api/cron/* route with a wrong or missing bearer secret.
 The routes refused them. If this was not your own misconfiguration, rotate
 CRON_SECRET (docs/RUNBOOKS.md §I10)."
```

Event → persisted → detected → finding → incident, with the correct runbook.
`notificationsFailed: 1` is Telegram being unconfigured locally, as the startup
env-check said.

---

## 2. Authorization

### 2.1 Now fully verified

**39 cross-account (IDOR) probes, all passing**, against live PostgREST with two
different readers' own access tokens — `lib/rls-cross-account.test.ts`.

For each of `reading_progress`, `reader_bookmarks`, `reading_lists`,
`book_annotations`, `book_notes`:

| Direction | Expected | Result |
|---|---|---|
| A creates, A reads | allowed | ✅ |
| **B reads A's row** | empty set | ✅ |
| **B updates A's row** | 0 rows changed, A's data intact | ✅ |
| **B deletes A's row** | 0 rows deleted, row still present | ✅ |
| **B inserts a row stamped for A** | refused | ✅ |
| A updates and deletes its own | allowed | ✅ |

Plus `profiles`: B cannot rename A; **B cannot escalate its own role to
`super_admin`** (verified by reading the row back past RLS with the service
key).

**Why the second reader had to be created.** Every user-owned table here is
guarded by a policy of the shape `user_id = auth.uid()`, and a policy of that
shape is *indistinguishable from having no policy at all* until two different
users ask for the same row. The previous suite had one seeded reader, so "I can
only see my own rows" and "there is only one user" produced identical evidence.
`student2@ptec.local` is now in `supabase/seed.sql`, which makes this
deterministic and reproducible in CI.

**The probe carries its own positive control.** A test file whose every
assertion is "zero rows" passes just as well when the token is broken, the table
is empty or the URL is wrong. The last test inserts a row *as B* and asserts B
sees it and A does not — ruling all three out.

Also verified in this pass: the anonymous RLS suite (`lib/rls.test.ts`) — **42
passed, 3 skipped**.

### 2.2 What remains unverified, and exactly what would close it

Testing is at the **database boundary**, which is the right place — RLS is the
line that holds when a route forgets its `.eq("user_id", …)`, and testing
through the app would pass on a UI that merely hides things. Server-side scoping
in the actions themselves is covered separately by
`lib/db/silent-mutation.test.ts`.

Still unverified:

1. **The same matrix against the production database.** The probe refuses to run
   against a non-localhost URL by design — it signs in with seeded credentials
   and writes rows. Production RLS policies come from the same migration chain
   the local stack applies, so the risk is drift, not design.
2. **The app's HTTP surface with two real sessions** — `/api/reader/progress`,
   `/api/me/continue-reading`, and the reader/collection Server Actions driven
   as A against B's resource ids.

**Procedure to close both**, when two ordinary production logins exist:

```bash
# 1. Database boundary, against production (needs the guard relaxed and two
#    real production readers rather than the seeded pair).
CROSS_ACCOUNT_PROBE=1 npx vitest run lib/rls-cross-account.test.ts

# 2. HTTP surface. For each of A and B, sign in, capture the session cookie,
#    then for every user-owned resource id belonging to the OTHER account:
#      GET    → 404 / empty, never the row
#      POST   → refused
#      PATCH  → refused, and the row unchanged when read back as its owner
#      PUT    → refused
#      DELETE → refused, and the row still present when read back as its owner
#    and the same operations against the account's OWN ids → allowed.
#    Resources: reading progress, bookmarks, collections, collection items,
#    annotations, notes, profile.
```

**No IDOR was found.** Nothing in this pass suggests one exists; what is missing
is production confirmation of policies verified everywhere else.

---

## 3. AI benchmark — preserved, documented, baselined

`npm run ai:answer-benchmark` was **not** discarded or rewritten. It gained
diagnostics (§4) and nothing was removed.

Documented in full at [docs/AI-ANSWER-BENCHMARK.md](./AI-ANSWER-BENCHMARK.md):
dataset structure, label verification, category distribution, scoring logic,
mock-model architecture, corpus resolution, reproducibility and failure
reporting.

| | |
|---|---|
| Command | `npm run ai:answer-benchmark` |
| Questions | **123** |
| Categories | **14** |
| Paid API calls | **0** — `lib/ai/mock-model.ts` unless `--live` |
| Corpus | production, 268 published books |
| Labels | generated from verified `book_pages` text; `no_answer` subjects confirmed at **zero** pages |

### Reproducibility result

Run on this branch, then re-run: **identical in every column, `tok-in`
included.**

| Metric | Expected | Reproduced |
|---|---|---|
| Groundedness | 88% | **88%** ✅ |
| Retrieval correctness | 89% | **89%** ✅ |
| Routing | 98% | **98%** ✅ |
| Hallucinated citations | 0 | **0** ✅ |
| Context relevance | 70% | **70%** ✅ |
| No-answer correctness | 63% | **63%** ✅ |
| Unwanted templates | 3 | **3** ✅ |

Companion retrieval baseline also reproduced: top-1 **70%**, single-document
**87%**, cross-collection passages **5.0**, sources **3.7**, p50 ~900 ms.

Committed as [docs/ai-answer-benchmark/baseline.md](./ai-answer-benchmark/baseline.md).

---

## 4. AI diagnostics

No AI pipeline rewrite was performed — the brief asked for observability, and
that is what was built.

**`npm run ai:answer-benchmark -- --diagnose`** now attributes every failing
question to exactly one pipeline stage, via the pure, unit-tested
`lib/ai/answer-failure.ts`, and prints a per-question trace: routing decision
and retrieval mode, passages retrieved, context precision, expected vs actual
sources, answer class, hallucinated citations, the stage, and **the file to
change**.

Two rules are enforced in code:

1. **The order of the checks is the design.** A stage that makes later stages
   impossible is reported instead of the stages it disabled — a question routed
   to an intent that retrieves nothing has no ranking to blame.
2. **`MODEL_REASONING` is the last resort**, reachable only when every upstream
   stage is positively verified correct *and* a model actually answered. Under
   the mock provider it is **not assessable at all**, and the report says so.

### Current attribution — 21 of 123 questions

| | Stage | n |
|---|---|---|
| **B** | `RETRIEVAL` | **8** |
| **A** | `QUERY_UNDERSTANDING` | 5 |
| **E** | `PROMPT` | 5 |
| **I** | `NO_ANSWER_HANDLING` | 3 |
| **F** | `MODEL_REASONING` | **0 — NOT ASSESSABLE** |
| C, D, G, H | — | 0 |

**The classifier was corrected mid-pass, against itself.** Its first run
attributed 14 questions to `D — CONTEXT` on low context precision. Inspecting
them showed all 14 were *unscoped* questions whose label is a non-exhaustive
recall list — four of them catalogue searches where returning five cards with
the named book among them is correct behaviour. Low precision is only a defect
where the label can bear the weight, so `D` now requires
`expectedSourcesExhaustive`, which is true only for a question scoped to one
record. Overstating a stage would have sent the next phase to tune a diversity
cap that is working.

### Recommended next engineering target, in evidence order

1. **`exact_book` retrieval, 40%** — the largest block of `B`. Two ranking
   models over one collection (`lib/ai/work-ranking.ts` and
   `lib/search/ranking.ts`) is the defect; the public search returns these
   titles first. Retire one into the other.
2. **Term specificity (IDF)** — the single lever behind both the remaining
   `no_answer` failures and `exact_book`.
3. **`E — PROMPT`, 5 cases** — scoped questions that retrieved 4 passages at
   100% context precision and still refused. The narrowest, best-isolated
   defect on the list.
4. **A `--live` run** — the only way to learn whether stage `F` exists at all.

---

## 5. Regression results

| Gate | Result |
|---|---|
| **TypeScript** | `npx tsc --noEmit` → **0 errors** |
| **ESLint** | `npx eslint` → **0 errors**, 172 warnings (baseline 174 — net −2) |
| **Vitest** | **4312 passed · 89 skipped · 0 failed** (275 files) — baseline was 4287, **+25 new tests** |
| **Build** | `rm -rf .next && npm run build` → **exit 0** from a cold cache |
| **RLS (anonymous)** | `RLS_PROBE=1` → **42 passed, 3 skipped** |
| **Cross-account (IDOR)** | `CROSS_ACCOUNT_PROBE=1` → **39 passed, 0 failed** |
| **Security + admin suites** | **945 passed, 8 skipped, 0 failed** |
| **AI answer benchmark** | 123 questions — **reproduced the baseline exactly** |
| **Retrieval benchmark** | 98 questions — top-1 70%, no-evidence 100%, citation 100% |
| **Production smoke** | `/api/health` ok; 5/5 cron endpoints 401 on anonymous *and* wrong secret |

No threshold was lowered and no test was weakened. Two assertions in
`lib/ai/evidence.test.ts` were rewritten during the previous audit to state the
property they protected rather than a literal number; nothing in this pass
touched a test to make it pass.

---

## 6. What must happen after merge

**One post-deploy check closes the last warning.** After this branch is
deployed to the ZimaOS container:

```bash
# 1. Raise an event, deliberately. Any value that is NOT the real CRON_SECRET
#    works — the point is to be refused, so never paste the real one here.
WRONG_SECRET=not-the-cron-secret

curl -s -o /dev/null -w '%{http_code}\n' \
  -H "Authorization: Bearer $WRONG_SECRET" \
  https://library.ptec.edu.kh/api/cron/cleanup          # expect 401

# 2. Confirm it was PERSISTED, not just logged.
#    Either: /admin/security → Monitoring health → "Event persistence"
#            should read "N of N event(s) handed to the durable sink"
#            and must NOT read "NOT PERSISTING".
#    Or:     select count(*) from security_events;      # expect > 0
```

If it still reads `NOT PERSISTING` with a non-zero emitted count, the health row
now names the cause — check `moduleInstances`, and read the container log for
`[instrumentation] security event sink not installed`.

Also worth doing once monitoring is live: `TELEGRAM_BOT_TOKEN` /
`TELEGRAM_CHAT_ID` are unset in the environment this was verified in, and
`notificationsFailed: 1` on the scan confirms an incident opens silently without
them.

---

## 7. Scope

This branch contains security-event persistence, redaction, cross-account
authorization testing, and AI *observability*. It contains **no** homepage work,
no SEO changes, no Reader or PWA changes, no dependency changes, and **no
change to the AI pipeline's behaviour** — the AI fixes measured in the previous
audit are on `audit/final-production-reliability-2` and are inherited unchanged.

**No model was trained, fine-tuned, replaced or prompted around a benchmark.**
The §29 precondition remains unmet, and §4 now records exactly what evidence
would meet it.

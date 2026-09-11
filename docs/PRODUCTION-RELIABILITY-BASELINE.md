# PTEC Production Reliability Baseline

**Frozen:** 2026-09-11
**Production commit:** `4f89f58`
**Environment:** `https://library.ptec.edu.kh` · storage `https://storage-ptec.online` · self-hosted Supabase `https://supabase.storage-ptec.online`

This is the reference point the next phase is measured against. Every figure
below was produced by a named command or a recorded production probe — nothing
here is an estimate, and nothing is carried over from a report without being
re-run.

---

## What is in the baseline

| Area | State | Evidence |
|---|---|---|
| **Security event persistence** | **PRODUCTION VERIFIED** | 0 → 18 rows; `SEC-20260911-001` opened sev2; Telegram delivered |
| **Cross-account authorization** | **LOCAL VERIFIED** | 39 IDOR probes at the database boundary; production 2-account testing outstanding |
| **Reader 2** | PASS | 11 passed / 5 skipped / 0 failed (real browser) |
| **PWA offline** | PASS | 11 passed / 1 skipped / 0 failed, incl. a true network-off reload |
| **PDF integrity** | PASS | **268/268** published books: header, `%%EOF`, size, 206 + `Content-Range`, `Accept-Ranges` |
| **Storage reliability** | PASS | 617 objects reconciled; 0 orphan rows; 23 orphan files (120.9 MB, bookkeeping) |
| **Database integrity** | PASS | 0 orphans across 8 derived tables; 0 upload sessions stuck mid-transition |
| **Search** | PASS | 474/474 sitemap URLs 200; `/api/search/native` returns exact titles first |
| **AI retrieval** | Baselined | 98 labelled questions |
| **AI answer quality** | Baselined | 123 labelled questions |

---

## AI answer quality — `npm run ai:answer-benchmark`

123 questions · 14 categories · production corpus (268 published books) ·
mock model, no paid calls · reproduced identically across runs.

| Metric | Baseline |
|---|---|
| Routing accuracy | **98%** |
| Retrieval correctness | **89%** |
| Context relevance | **70%** |
| Groundedness | **88%** |
| No-answer correctness | **63%** |
| Template rate | 36% |
| Unwanted templates | **3** |
| **Hallucinated citations** | **0** |
| Evidence per answer | 2.8 |
| Input tokens / question (est.) | 482 |

Per-category table and the failure-stage breakdown:
[docs/ai-answer-benchmark/baseline.md](./ai-answer-benchmark/baseline.md).

## AI retrieval — `npm run retrieval:benchmark`

98 labelled questions, same corpus.

| Metric | Baseline |
|---|---|
| Recall@5 / @10 | 83% / 83% |
| Top-1 accuracy | 70% |
| single_document top-1 | 87% |
| multi_document evidence / spread | 5.0 / 3.7 |
| Khmer / mixed recall | 80% / 80% |
| Scope isolation | 100% |
| No-evidence handled correctly | 100% |
| Citation accuracy | 100% |
| p50 latency | ~900 ms |

## Test and build gates

| Gate | Baseline |
|---|---|
| TypeScript | 0 errors |
| ESLint | 0 errors (172 warnings) |
| Vitest | **4315 passed · 89 skipped · 0 failed** (276 files) |
| Build | `rm -rf .next && npm run build` → exit 0 from a cold cache |
| RLS (anonymous) | 42 passed, 3 skipped |
| Cross-account IDOR | 39 passed |
| Security + admin suites | 945 passed |
| CI e2e | 339 passed / 25 skipped |

## Production performance (warm)

| Route | TTFB-ish |
|---|---|
| `/` | 0.47 s |
| `/books` | 0.42 s |
| `/authors` | 0.41 s |
| `/search` | 0.36 s |
| `/api/health` | 0.46 s |

---

## Known limitations carried into the next phase

Stated so that none of them is mistaken for a pass.

1. **Production cross-account (IDOR) testing** has not been done with two real
   non-admin sessions. Evidence is the 39-probe suite at the database boundary
   against a stack running the identical migration chain.
2. **Detection latency.** `security-scan` is configured for every 5 minutes;
   GitHub Actions ran it once in the 2.5 hours observed. Events persist
   immediately; incident creation and alerting can lag by up to an hour.
3. **Sink health was not visually confirmed** in `/admin/security` — no
   administrator session. The persisted rows are the evidence that it is
   healthy.
4. **`--live` AI benchmark has never been run.** Every answer-quality number is
   from the mock model, which measures routing, retrieval, context, grounding,
   citation and no-answer handling exactly, and answer *prose* not at all.
   Stage `F — MODEL_REASONING` is therefore **not assessable**, and the §29
   precondition for considering any model change is **not met**.
5. **OS-level airplane mode, browser-process restart and installed-PWA
   validation** remain unperformed, carried forward from Audit 2.0.
6. **Two truncated PDFs** (both unpublished drafts, both already taken down by
   an operator) await re-upload from `/admin/edit/<id>`.
7. **Cold/revalidating page renders** were 5.5–11.2 s against a warm TTFB of
   0.25–0.61 s at the time of Audit 2.0.

## Next phase

`feat/ai-brain-answer-quality-2`, with `npm run ai:answer-benchmark` as the
permanent quality gate. Targets, in the order the evidence ranks them:

1. `exact_book` retrieval, 40% — the largest block of `B — RETRIEVAL` failures.
   Two ranking models over one collection (`lib/ai/work-ranking.ts` and
   `lib/search/ranking.ts`) is the defect; retire one into the other.
2. Term specificity (IDF) — the one lever behind both the remaining
   `no_answer` failures and `exact_book`.
3. `E — PROMPT`, 5 cases — scoped questions that retrieved 4 passages at 100%
   context precision and still refused.
4. A `--live` run, to learn whether stage `F` exists at all.

**Do not train, fine-tune or replace the model** until a `--live` run produces
failures that survive classification as `F`.

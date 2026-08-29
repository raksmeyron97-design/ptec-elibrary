# AI Assistant Benchmark — before / after

Measured on 2026-08-29 against the pre-2.0 baseline described in
[`AI_ASSISTANT_AUDIT.md`](./AI_ASSISTANT_AUDIT.md). Reproduce with:

```bash
npm run ai:benchmark              # the table below
npm run ai:benchmark -- --verbose # per-question rows
npm run ai:benchmark -- --json    # machine-readable
```

## What this benchmark is, and is not

**Is.** A deterministic, offline measurement of *request construction and
routing* over 100 representative questions (~40% Khmer). For each question it
runs the real post-2.0 decision path — `classifyIntent` → fixture retrieval →
`deterministicAnswer` → `buildGeneration`, the actual exported functions from
`lib/ai/plan.ts` — and counts the prompt that would be sent. It then rebuilds
the pre-2.0 prompt for the same question **from the same fixture rows**, using
the archived request assembly of `app/api/ask/route.ts` and
`app/api/chat/route.ts` (`git show 4836a4c:app/api/ask/route.ts`).

Both sides are counted with the same estimator (`lib/ai/token-budget.ts`), and
both see identical retrieval output, so the difference is attributable to
prompt assembly and routing — not to a change in what was retrieved.

**Is not.** It is not a measurement of provider-billed tokens: Gemini's
tokenizer is not this estimator, and no model is called. It is not a
measurement of end-to-end latency, and it says nothing about answer quality.

The estimator is calibrated to over-count slightly, and it over-counts *both*
sides, so the ratios below are more trustworthy than the absolute numbers. The
real per-request bill is recorded in production: `lib/ai/telemetry.ts` writes
the SDK's own `usage.inputTokens` / `usage.outputTokens` into
`app_events.detail` on every request. That is the number to check after a
week of live traffic.

## Results

Corpus: 100 representative questions (~40% Khmer), fixture retrieval, offline.

| Measure | Before (pre-2.0) | After (2.0) | Change |
|---|---:|---:|---:|
| Avg input tokens / request | 2261.5 | 81.5 | −96% |
| Avg output tokens / request † | 700 | 79.8 | −89% |
| Avg total tokens / request | 2961.5 | 161.2 | −95% |
| P95 input tokens | 2757 | 663 | −76% |
| Model calls (100 questions) | 182 | 15 | −92% |
| DB queries | 300 | 101 | −66% |
| Embedding calls | 46 | 18 | −61% |
| Requests answered with no model | 0 | 85 | — |
| Requests on the reasoning tier | n/a | 11 | — |

### By intent

| Intent | n | Before avg tokens | After avg tokens | Model calls before → after |
|---|---:|---:|---:|---:|
| `book_search` | 34 | 3237.4 | 23.9 | 68 → 0 |
| `faq` | 22 | 2612 | 28 | 44 → 0 |
| `thesis_search` | 13 | 3388.4 | 23.8 | 26 → 0 |
| `pdf_question` | 12 | 2960.4 | 936.2 | 12 → 11 |
| `post_search` | 6 | 3195.2 | 24 | 12 → 0 |
| `general_knowledge` | 4 | 1602 | 637 | 4 → 4 |
| `related_books` | 3 | 3164 | 16 | 6 → 0 |
| `book_detail` | 2 | 2700 | 95.5 | 4 → 0 |
| `general_library_question` | 2 | 2680 | 41.5 | 4 → 0 |
| `unsupported` | 2 | 1605 | 68.5 | 2 → 0 |

† Output is the configured ceiling on both sides for model-generated answers; for the 2.0 template answers it is the ACTUAL length of the answer produced, because no model runs and no ceiling applies.

No-result rate (searches only): 11.3% · RAG success rate (document questions with page evidence): 91.7%
Local pipeline P95 (classification + context assembly, no I/O): 3.2 ms.

Repeat-traffic pass — 134 requests of which 34 are repeats: 34 served from the retrieval cache (25.4% of all requests), saving that many embedding + query rounds. The pre-2.0 routes had no cache, so this figure is 0 there.

## Reading the table

**Where the 96% input-token reduction comes from.** Three effects, in order of
size:

1. **85 of 100 questions never reach a model.** A library-hours question, a
   catalogue search that returned results, a "similar books" request — all are
   fully determined by the database. The pre-2.0 system spent 2,600–3,400
   tokens and one or two round-trips to have Gemini restate rows it had already
   fetched. This is the single largest saving and it is a routing decision, not
   a compression trick.
2. **The static prompt stopped being resent per tool iteration.** The old
   `/api/ask` sent a ~700-token system instruction plus six tool schemas on
   *every* iteration of its tool loop, and a tool-using request took two
   iterations: ~2,000 tokens of pure boilerplate per question.
3. **Context is compact.** Raw PostgREST rows JSON-stringified into the prompt
   (`{"departments":{"name":…}}` and all) became `Title — Author · Kind: 45
   tokens of summary`; six 700-character passages became three ~400-character
   ones; a ten-turn transcript became zero turns for a self-contained question.

**Where the remaining spend is.** 15 model calls across 100 questions: 11
document questions with page evidence to synthesize, and 4 general-knowledge
questions. Those are the requests where a model genuinely produces something
the database cannot, and `pdf_question` is deliberately the one intent allowed
onto the reasoning tier.

**Why "model calls" fell further than "questions".** 182 → 15, not 100 → 15,
because the pre-2.0 tool loop cost *two* Gemini round-trips for any question
that touched a tool: one to choose the call, one to answer from its result.

**Database queries fell 66%** because retrieval is now typed and keyword-first:
a book search hits one table, and only escalates to an embedding + vector scan
when the keyword pass returns fewer than three hits. The old `/api/chat` ran
one embedding plus three queries on every message including "hello".

**Cache.** The 100-question corpus is 100 *distinct* questions, so a single
pass can never register a hit. The repeat pass replays every third question and
measures 34 hits — a quarter of all requests served without an embedding call
or a query round. Real traffic is more repetitive than that corpus, so treat
25% as a floor.

**No-result rate 11.3%** is a property of the fixture (one search in eight is
seeded barren), not a measurement of the live catalogue. It is reported so the
zero-result path is visibly exercised: those requests return a template and
cards, and cost no model call.

## What was NOT measured, and how to close it

| Question | How to answer it |
|---|---:|
| Real billed tokens | `app_events` where `kind='ai_request'`, `detail->>'input_tokens'` — one row per request, live |
| Real latency | `app_events.latency_ms`, split by `detail->>'tier'` |
| Answer quality | Not automatable here. The grounding tests (`lib/ai/grounding.test.ts`) prove citations cannot be invented; whether the prose is *good* needs human review of a live sample |
| Cache hit rate in production | `detail->>'cache'` = `hit`/`miss` |

The performance-dashboard contract for all of these is
`AIPerformanceContract` in `lib/ai/telemetry.ts`, which documents the exact SQL
each metric comes from.

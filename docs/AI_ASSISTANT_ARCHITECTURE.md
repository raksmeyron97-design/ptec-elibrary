# AI Assistant 2.0 — architecture

The final architecture and request flow of the PTEC e-Library assistant.
Companion documents: [`AI_ASSISTANT_AUDIT.md`](./AI_ASSISTANT_AUDIT.md) (what
this replaced and why) and
[`AI_ASSISTANT_BENCHMARK.md`](./AI_ASSISTANT_BENCHMARK.md) (measured effect).

## The one idea

**The model is the last resort, not the first step.** A library assistant's
traffic is dominated by questions whose answers are already sitting in Postgres
— opening hours, "do you have books about X", "what else is like this one".
Sending those to an LLM buys nothing and costs a round-trip. So every request is
classified deterministically first, retrieval runs second, and a model runs only
when the answer genuinely requires generation. 85 of the 100 benchmark
questions never reach one.

The corollary matters as much: when a model *is* needed, it gets compact,
fenced evidence and a short prompt, and whatever it says about page numbers is
verified against the retrieval set before the reader sees it.

## Request flow

```
                    POST /api/ai            (canonical)
                    POST /api/ask           (adapter → legacy {answer, books, remaining})
                    POST /api/chat          (adapter → AI-SDK UI message stream)
                          │
                          ▼
   ┌──────────────────────────────────────────────────────┐
   │ ADMISSION                          lib/ai/limits.ts   │
   │  auth → validate → duplicate guard → cooldown → quota │  ← rejects here cost nothing
   └──────────────────────────────────────────────────────┘
                          │
                          ▼
   ┌──────────────────────────────────────────────────────┐
   │ CLASSIFY (pure)                     lib/ai/intent.ts  │
   │  language · verbosity · intent · topic · slug · page  │  ← no model, ~0.1 ms
   └──────────────────────────────────────────────────────┘
                          │
                          ▼
   ┌──────────────────────────────────────────────────────┐
   │ RETRIEVE (typed, budgeted)       lib/ai/retrieval.ts  │
   │  faq → settings   search → keyword→[semantic]         │
   │  pdf → 1 embedding + match_book_chunks                │
   └──────────────────────────────────────────────────────┘
                          │
                          ▼
   ┌──────────────────────────────────────────────────────┐
   │ DECIDE (pure)                        lib/ai/plan.ts   │
   │  deterministicAnswer() → answer?  ─── yes ──────────┐ │
   └──────────────────────────────────────────────────────┘ │
                          │ no                              │
                          ▼                                 │
   ┌──────────────────────────────────────────────────────┐ │
   │ GENERATE                lib/ai/plan.buildGeneration   │ │
   │  short system prompt  +  compressed history           │ │
   │  +  fenced LIBRARY DATA (user role)  +  question      │ │
   │  tier + output cap from lib/ai/models.ts              │ │
   └──────────────────────────────────────────────────────┘ │
                          │                                 │
                          ▼                                 │
   ┌──────────────────────────────────────────────────────┐ │
   │ GROUND                          lib/ai/guardrails.ts  │ │
   │  strip every citation retrieval does not support      │ │
   └──────────────────────────────────────────────────────┘ │
                          │                                 │
                          ▼                                 ▼
   ┌──────────────────────────────────────────────────────────┐
   │ RESPOND  AIResponse{mode, answer, results, sources, …}   │
   │ RECORD   lib/ai/telemetry.ts → app_events                │
   └──────────────────────────────────────────────────────────┘
```

## Modules

| File | Server? | Responsibility |
|---|---|---|
| `lib/ai/response.ts` | pure | The typed contract: `AIIntent`, `ModelTier`, `AIResponse`, `AIRequestError` |
| `lib/ai/intent.ts` | pure | Deterministic classification, language + verbosity detection, query normalization |
| `lib/ai/models.ts` | pure | The **only** place model ids and tier rules live |
| `lib/ai/prompts.ts` | pure | Short composed system prompts — policy only, never data |
| `lib/ai/token-budget.ts` | pure | Budgets + a script-aware estimator |
| `lib/ai/context.ts` | pure | Compact, fenced evidence assembly |
| `lib/ai/conversation.ts` | pure | History compression |
| `lib/ai/citations.ts` | pure | Sources built from retrieval, formatted per locale |
| `lib/ai/guardrails.ts` | pure | Validation, filter sanitization, injection defence, grounding enforcement |
| `lib/ai/templates.ts` | pure | Bilingual answer templates for the zero-LLM paths |
| `lib/ai/plan.ts` | pure | `deterministicAnswer()` and `buildGeneration()` — the cost-relevant decisions |
| `lib/ai/cache.ts` | in-proc | TTL + LRU cache with per-namespace stats |
| `lib/ai/limits.ts` | server | Quotas, cooldown, circuit breakers — one source of truth |
| `lib/ai/retrieval.ts` | server | All Supabase + embedding access, behind one adaptive policy |
| `lib/ai/router.ts` | server | Orchestration: `runAssistant()` / `streamAssistant()` |
| `lib/ai/telemetry.ts` | server | One `app_events` row per request |
| `app/api/ai/route.ts` | route | Canonical endpoint |

The pure/server split is load-bearing, not cosmetic: it is what lets
`scripts/ai-benchmark.ts` and the unit tests exercise the real decision
functions without a database, so the benchmark cannot drift from the behaviour
it reports on.

## Intents and what each one costs

| Intent | Retrieval | Model | Typical DB queries |
|---|---|---|---|
| `faq` | published settings + `lib/library-info` | **none** (confident) / fast | 0–1 |
| `book_search` / `thesis_search` / `post_search` | keyword → semantic on a thin result | **none** (confident) | 1–2 |
| `book_detail` | one row by slug | **none** | 1 |
| `related_books` | seed row + FK match | **none** | 2 |
| `pdf_question` | 1 embedding + `match_book_chunks` | fast, or reasoning for deep/multi-passage | 1 |
| `general_library_question` | library overview facts | fast | 0–1 |
| `general_knowledge` | none | fast, told to flag it is off-catalogue | 0 |
| `unsupported` | none | **none** — a decline template | 0 |

Greetings and thanks short-circuit before retrieval: zero queries, zero tokens.

## Design decisions worth knowing

### Search results are the answer

For a catalogue search the result **cards** carry the substance. The prose is
one template sentence — "I found 4 books related to …" / "រកឃើញ សៀវភៅ ចំនួន ៤
…" — in the reader's language. Asking a model to narrate a list it was handed
is the most expensive way to produce the least information. When the search
returns nothing, the template says so and points at a next step.

This is not a quality downgrade. The template cannot hallucinate, is instant,
and the cards are what the UI renders anyway.

### Retrieved text is data, not instruction

Evidence travels in a **user-role** message, inside a labelled fence, after
`defangCorpusText()` has neutralised control sequences. The pre-2.0 `/api/chat`
concatenated retrieved corpus text into the *system* prompt, where an
instruction embedded in a scanned page would have inherited system authority.
`lib/ai/grounding.test.ts` pins both the fencing and the defanging.

### Citations are verified, not trusted

`enforceGrounding()` parses every `(Title, p. N)` — Arabic or Khmer numerals —
out of the model's answer and deletes any whose (title, page) pair the
retrieval set does not contain. A title match alone is not enough: the page has
to be one that was actually retrieved for that title, otherwise the model has
guessed a page inside a real book. Only the surviving citations become
`AIResponse.sources`.

**One honest limitation:** on the *streaming* path the text has already left
the server by the time it can be checked, so an ungrounded citation cannot be
removed from it. The check still runs on the completed text and records the
result (`detail.fallback`), so a rise in invented citations is visible in
analytics. The non-streaming path — which is what `/api/ask` and every default
`/api/ai` request use — strips them before the reader sees anything. If
streaming ever becomes the default for document questions, that gap needs
closing with a buffering transform.

### One embedder, both sides

`EMBEDDING_MODEL` / `EMBEDDING_DIM` in `lib/ai/models.ts` are the single source
of truth for query *and* document embeddings. `books.embedding` previously held
vectors from two different models — `scripts/embed-library.ts` wrote
`gemini-embedding-001`, `/api/admin/backfill-embeddings` wrote
`text-embedding-004` — and `/api/ask` queried it with a third combination, so
its semantic search was comparing points from unrelated spaces. All three now
agree. **Changing any of those constants requires re-embedding every table.**

### Adaptive search policy

Keyword first, one indexed `ilike` fan-out over the requested table. Three or
more hits and we stop — no embedding, no vector scan, one query. Fewer, and the
semantic pass runs and merges. Exact-title lookups are answered by keyword;
conceptual questions fall through to pgvector, which is what they need.

### Conversation compression

A self-contained question carries **no history at all**. Only a question that
depends on the previous turn — a pronoun, an ordinal, a bare fragment
(`needsHistory()`) — replays context, and then only the most recent turns that
fit in 400 tokens, with anything older reduced to a one-line rolling summary.

### Model tiers

`resolveTier()` picks the cheapest tier that can be correct. `none` for
anything the database settles; `fast` for ordinary generation; `reasoning` —
with a non-zero thinking budget — only for document synthesis that is either
explicitly deep or spans three or more passages. Thinking tokens are billed, so
every other path sets that budget to zero.

### Streaming is conditional

A deterministic answer is one or two sentences; streaming it adds a round-trip
and saves nothing. `streamAssistant()` returns `{streamed: false}` for those and
the route emits a one-shot UI message stream, so a streaming client sees the
protocol it expects either way. Real generation streams normally.

### Graceful degradation

Every dependency has a defined failure mode, and none of them takes search down:

| Fails | Behaviour |
|---|---|
| Embedding / Gemini embeddings | keyword results only (`fallback: no_embedding`) |
| `match_library` / `match_book_chunks` | keyword results only |
| Generation | results + a "temporarily unavailable" lead-in; a typed `unavailable` error only when there is nothing at all to show |
| Cache | every entry is reproducible from the DB; a miss is just slower |
| A loader throws | nothing is cached, so a transient error cannot become a five-minute outage |

## Cost controls (unchanged in behaviour, single-sourced in code)

- Auth required on every assistant endpoint.
- Per-user daily quota (10), incremented **before** the model call so a forced
  error still costs a use.
- Global daily circuit breaker (500) on a sentinel `ai_usage` row; the public
  search summary has its own 1,000/day sentinel.
- One shared 5-second cooldown map across all entry points — previously each
  route had its own, so alternating endpoints halved the effective cooldown.
- Admins bypass the per-user quota, never the global one.
- `GEMINI_API_KEY` server-side only.
- `/api/search` remains IP rate-limited and honours `DISABLE_EXPENSIVE_SEARCH`.

`DAILY_USER_LIMIT` now has exactly one definition (`lib/ai/limits.ts`), read by
the routes *and* by the quota badge in `app/actions/ai-usage.ts`.

## Observability

`lib/ai/telemetry.ts` writes one `app_events` row per request with
`kind='ai_request'` and a `detail` object carrying `intent`, `tier`, `model`,
`locale`, `verbosity`, `input_tokens`, `output_tokens`, `total_tokens`,
`retrieval_ms`, `embedding_ms`, `db_queries`, `result_count`, `cache`,
`deterministic` and, when a degraded path answered, `fallback`.

No message content, no titles, no slugs — only counts and enums.
`AIPerformanceContract` in that file documents the SQL for each dashboard
metric (avg tokens, cost/request, cache hit rate, RAG success rate, fallback
rate, no-result rate, zero-LLM rate).

## Backward compatibility

| Surface | Status |
|---|---|
| `AskWidget` → `POST /api/ask` `{messages:[{role,text}]}` → `{answer, books, remaining}` | **Unchanged.** No component edits were needed. |
| Error codes `auth` / `quota` / `cooldown` / `global_limit` / `duplicate` / `unavailable` and their HTTP statuses | Unchanged |
| `getRemainingAiQuota()` badge | Unchanged (now reads the shared constant) |
| `/api/chat` AI-SDK stream protocol | Unchanged |
| `/api/search` `{answer, books, passages}` | Unchanged |

New clients should call `/api/ai`, which returns the full typed `AIResponse`
(`mode`, `intent`, `sources`, `metadata`) plus `remaining`. It also accepts
`context: { slug }` — passing the slug of the page the reader is on is what
enables the `book_detail`, `related_books` and `pdf_question` shortcuts.

## Known follow-ups

- **`components/ui/chat/FloatingChat.tsx` is imported by nothing**, so
  `/api/chat` currently has no first-party caller. It is kept alive behind the
  same auth and quota gate; deleting both is the obvious next cleanup once
  that is confirmed against production logs.
- **`books.embedding` may still contain `text-embedding-004` vectors** written
  by the old backfill route before it was corrected. A full re-run of
  `npx tsx scripts/embed-library.ts` is needed to clear that out; until then,
  semantic quality on affected rows stays degraded regardless of this rework.
- **`/api/search` has no first-party caller either** — every search surface in
  the app calls `/api/search/native`. Its Gemini summary is generated for an
  audience that may not exist; worth a product decision before it is optimised
  further.
- The in-process cache is per-instance. If the deployment ever scales past one
  container, a shared cache (or accepting the lower hit rate) is the decision
  point.

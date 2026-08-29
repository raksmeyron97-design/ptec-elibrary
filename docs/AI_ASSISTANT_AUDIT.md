# AI Assistant Audit — pre-2.0 baseline

Snapshot of the AI surface **before** the 2.0 rework, taken 2026-08-29 on
`feature/apply-77-updates`. Everything below is a statement about the code as
it existed at that commit; the fixes are described in
[`AI_ASSISTANT_ARCHITECTURE.md`](./AI_ASSISTANT_ARCHITECTURE.md) and measured in
[`AI_ASSISTANT_BENCHMARK.md`](./AI_ASSISTANT_BENCHMARK.md).

## 1. Inventory

| Surface | File | Model calls / request | Consumer |
|---|---|---|---|
| Tool-loop assistant | `app/api/ask/route.ts` (707 lines) | 1 embedding + **1–4** `generateContent` | `components/ui/ask/AskWidget.tsx` (mounted in the public layout) |
| Streaming RAG chat | `app/api/chat/route.ts` (248 lines) | 1 embedding + 1 `streamText` | `components/ui/chat/FloatingChat.tsx` — **not mounted anywhere** |
| Public semantic search | `app/api/search/route.ts` (409 lines) | 1 embedding + 1 `generateContent` (summary) | **no first-party caller** — the `/search` page and every search component use `/api/search/native`. It is a public API surface (and is named in the service-worker cache policy) |
| Native search | `app/api/search/native/route.ts` (1422 lines) | none (deterministic) | `/search` page |
| Recommendations | `app/api/recommendations/route.ts` | none (deterministic) | dashboard |
| Embedding helpers | `lib/gemini-embeddings.ts` | — | routes + backfills |
| Quota display | `app/actions/ai-usage.ts` | — | both widgets |
| Editorial facts | `lib/library-info.ts` | — | `/api/ask` only |

Supporting data: `ai_usage` (+ `increment_ai_usage` / `get_ai_usage` RPCs,
migration `0023`), `match_library` (`0029`), `match_books` (`0051` / baseline),
`match_book_chunks` (`0082`), `app_events` (`logAppEvent`).

## 2. Correctness defects found

### 2.1 `books.embedding` holds two incompatible vector spaces — semantic search in `/api/ask` is effectively broken

`lib/gemini-embeddings.ts` exports two *different* embedders:

| Function | Model | Dim | Task type | Normalized |
|---|---|---|---|---|
| `generateEmbedding` | `text-embedding-004` | 768 | — | no |
| `generateDocumentEmbedding(s)` / `generateQueryEmbedding` | `gemini-embedding-001` | 768 | `RETRIEVAL_DOCUMENT` / `RETRIEVAL_QUERY` | L2 |

Both write to the *same* `books.embedding vector(768)` column:

- `scripts/embed-library.ts` → `gemini-embedding-001`, `RETRIEVAL_DOCUMENT`, L2-normalized
- `app/api/admin/backfill-embeddings/route.ts` → `generateEmbedding` → `text-embedding-004`, raw

…and they are queried by *different* embedders too:

- `/api/search` → `gemini-embedding-001` / `RETRIEVAL_QUERY` (matches the script)
- `/api/ask` `searchBooks()` → `generateEmbedding` → `text-embedding-004` (**matches nothing**)

Cosine similarity across two unrelated embedding models is noise. `/api/ask`'s
`match_books` call at `match_threshold: 0.2` therefore either returns nothing
(and silently falls through to keyword search — paying for an embedding call
per request for zero benefit) or returns arbitrary books. This is the single
highest-impact defect in the audit.

### 2.2 `getRelatedBooks()` does not filter

```ts
query.or(`categories.name.ilike.%${categoryName}%,authors.name.ilike.%${authorName}%`)
```

PostgREST cannot filter on an embedded resource from a top-level `.or(...)`
without `!inner` on the embed. The filter is not applied; the function returns
"the most-downloaded published books, minus this one" regardless of the book
asked about. The `.eq("categories.name", …)` branches have the same problem.

### 2.3 Model-supplied `sort` silently disagrees with the schema

`searchBooks` orders by `rating` for `top_rated` but the semantic branch never
applies `sort` at all, so `sort` is honoured only when the (broken) semantic
path returns nothing.

### 2.4 `/api/ask` result objects do not match their declared type

`BookResult` declares 6 fields; the mappers return 10–12 (`category`,
`department`, `language`, `description`, `program`, `subject`,
`academicYear`…). Those extras are (a) fed back to Gemini inside the tool
response, and (b) serialized to the browser. Both are pure waste — `AskWidget`
renders only `title`, `author`, `coverUrl`, `url`, `type`.

## 3. Duplication

| Duplicated thing | Copies |
|---|---|
| `DAILY_USER_LIMIT = 10` | `api/ask`, `api/chat`, `app/actions/ai-usage.ts` |
| `DAILY_GLOBAL_LIMIT = 500`, `COOLDOWN_MS`, `GLOBAL_SENTINEL`, `MAX_OUTPUT_TOKENS` | `api/ask`, `api/chat` |
| In-memory `cooldownMap` | `api/ask`, `api/chat` |
| PostgREST metachar sanitizer | `api/ask` (`sanitizeQuery`), `api/chat` (`sanitizeSearchTerm`), `api/search` (`sanitize`), `api/search/native` |
| `coverUrlOf()` | `api/ask`, `api/search`, `api/recommendations` (inline), `lib/book-utils` |
| `MODEL = "gemini-3.5-flash"` | `api/ask`, `api/chat`, `api/search` (inline string) |
| `urlFor()` route mapping | `api/search`, `api/search/native`, `api/ask` (inline template strings) |
| Chunk retrieval against `match_book_chunks` | `api/ask`✗ / `api/chat` / `api/search` — two independent implementations with different `match_count`, `min_similarity`, and snippet lengths |
| Book/thesis/post keyword search | `api/ask` (3 functions), `api/chat` (inline), `api/search` (`keywordSearch`) |
| System-prompt "never invent / reply in the user's language / don't write essays" rules | `api/ask` (~700 tok), `api/chat` (~230 tok), `api/search` (~110 tok) |

Three routes, three prompts, three quota implementations, three sanitizers,
and no shared module. Any policy change (a new limit, a new grounding rule)
has to be made in three places or it silently diverges — which it already had.

## 4. Token & latency waste

Measured against the code paths, per request:

### `/api/ask`
1. **System instruction is ~700 tokens and is re-sent on every tool-loop
   iteration.** With the maximum 3 iterations that is 4 × 700 = 2,800 input
   tokens of *static* instructions per request.
2. **The full submitted history (up to 6 turns) is re-sent on every iteration**,
   and each iteration also appends the previous model content *and* the full
   tool-response JSON. A 3-iteration request re-sends the accumulated transcript
   4 times — quadratic-ish growth in input tokens.
3. **Tool results carry the fat objects from §2.4** — up to 8 books × ~300-char
   descriptions + category + department + language ≈ 1,200 tokens per
   `search_books` result, re-sent on every subsequent iteration.
4. **Every question pays for tool-calling round-trips**, including
   "តើបណ្ណាល័យបើកម៉ោងប៉ុន្មាន?" (opening hours), which is a constant lookup:
   LLM call → `get_library_info` → LLM call. Two model round-trips (~2 s) and
   ~1,600 input tokens to render a string the server already has in memory.
5. **A duplicate-message guard exists but nothing else is cached.** Two users
   asking the same question pay full price twice; the same user asking twice
   30 s apart pays twice.

### `/api/chat`
6. **Every message unconditionally runs 1 embedding + 3 DB queries + an LLM
   call**, including "hello" and "thanks". There is no intent gate at all.
7. **`JSON.stringify(books ?? [])` puts raw PostgREST rows into the system
   prompt** — including nested `{"departments":{"name":…}}` and
   `{"author":{"name":…}}` wrappers, full `description` bodies, and JSON
   punctuation. Roughly 2× the tokens of a compact rendering of the same facts.
8. **`MAX_PASSAGES = 6` × `PASSAGE_TEXT_LEN = 700`** = up to 4,200 characters
   (~1,100–1,600 tokens) of passage text on every request, whether or not the
   question is about document contents. The spec target is 3 × ~400.
9. **`convertToModelMessages(messages)` sends up to 10 full turns.** Nothing is
   summarized or dropped.
10. **The library context is injected into the *system* prompt**, so it can
    never be prompt-cached across turns and it re-enters the billing on every
    message of the conversation.

### `/api/search`
11. `getOrgIdentity()` is awaited inside the summary builder on every request
    (cached upstream, but the prompt is rebuilt from scratch).
12. The summary is generated even when the query returned **zero** results and
    even when the query is an exact title match — cases where a template
    sentence is strictly better and free.
13. Keyword fallback issues **5 parallel table queries** unconditionally when
    semantic returns fewer than 6 rows.

### Cross-cutting
14. **No token accounting anywhere.** `logAppEvent` records only
    `{status, route, latencyMs}`. There is no field for input tokens, output
    tokens, intent, model, cache hit, or DB query count, so no cost or quality
    claim about the current system can be verified from production data.
15. **No cache of any kind** — not for embeddings, not for FAQ answers, not for
    retrieval results.
16. **Cooldown maps are per-process and per-route**, so the two routes' 5 s
    cooldowns are independent: a client can alternate `/api/ask` and
    `/api/chat` to halve the effective cooldown.

## 5. Dead and orphaned code

- `components/ui/chat/FloatingChat.tsx` is **imported by nothing**. `/api/chat`
  — a fully live, quota-consuming, publicly reachable authenticated endpoint —
  has no first-party caller.
- `/api/search` has no first-party caller either: every search surface in the
  app calls `/api/search/native`. It remains a reachable public endpoint that
  spends Gemini budget, so it still needs its cost controls — but the "Gemini
  summary" nobody in this app renders is worth a product decision.
- `generateEmbedding` (text-embedding-004) is reachable only from the broken
  `/api/ask` path and `/api/admin/backfill-embeddings`, which is what poisoned
  the vector column in the first place.
- `LIBRARY_INFO.links.*` is referenced only by `/api/ask`'s `getLibraryInfo`.

## 6. Security posture (to preserve)

These are correct today and must survive the rework:

- Both assistant routes are **auth-gated** (`supabase.auth.getUser()`).
- Per-user daily quota via `increment_ai_usage`, incremented **before** the
  model call so a forced error still costs a use.
- Global daily circuit breaker on a sentinel UUID; `/api/search` has its own
  sentinel with a 1,000/day budget.
- Admins (`ADMIN_PANEL_ROLES`) bypass the per-user quota but not the global one.
- `GEMINI_API_KEY` is server-only.
- PostgREST filter metacharacters are stripped from user input before `.or(...)`.
- `/api/search` is IP rate-limited through `ratePolicy("search")` and honours
  `DISABLE_EXPENSIVE_SEARCH`.

Gaps: no prompt-injection handling (in `/api/chat` the retrieved corpus text is
concatenated into the *system* prompt, where an injected instruction inside a
PDF page would carry system authority), and no verification that the citations
the model emits correspond to passages that were actually retrieved.

## 7. Prioritized findings

| # | Finding | Impact |
|---|---|---|
| 1 | §2.1 mixed embedding spaces | Correctness — semantic book search is noise |
| 2 | §4.4 / §4.6 no intent gate; every request calls the LLM | Cost + latency — the largest single saving available |
| 3 | §4.1–4.3 static prompt + fat tool results re-sent per tool iteration | Cost — ~3–5 k input tokens/request |
| 4 | §4.7–4.8 raw JSON rows + 6×700-char passages in the prompt | Cost — ~2× necessary context |
| 5 | §3 triplicated limits/prompts/sanitizers | Maintainability — divergence already happened |
| 6 | §4.14 no token telemetry | Blocks any measured improvement |
| 7 | §2.2 `getRelatedBooks` filter is a no-op | Correctness — wrong recommendations |
| 8 | §6 injection via retrieved text in the system prompt | Security |
| 9 | §4.9 full history resent | Cost |
| 10 | §5 `/api/chat` has no caller | Attack surface + confusion |

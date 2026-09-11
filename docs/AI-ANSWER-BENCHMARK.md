# The AI answer benchmark

`npm run ai:answer-benchmark`

The instrument that says whether the assistant answers a reader's question
well. It is the permanent quality gate for AI work on this repository: no
change to `lib/ai/*` should be defended without a before/after run of it.

---

## 1. Why it exists, and why the other two benchmarks are not it

Three AI benchmarks live in `scripts/`, and they measure three different things.
Confusing them is how a pipeline ends up with excellent numbers and bad answers.

| Benchmark | Measures | Needs a DB? | Needs a key? |
|---|---|---|---|
| `ai:benchmark` | **Tokens** — what a routing decision costs, from fixtures | no | no |
| `retrieval:benchmark` | **Retrieval** — whether the right *pages* are found | yes | yes (embeddings) |
| **`ai:answer-benchmark`** | **The answer** — routing, evidence, grounding, citations, refusals | yes | no (mock by default) |

Before this one existed, the assistant could score well on both of the others
while telling a reader that a subject the library is built around was "outside
the library's collection". That is the gap it closes: it is the only instrument
that looks at what the reader actually receives.

---

## 2. Dataset

`scripts/ai-answer-benchmark/questions.json` — **123 questions, 14 categories.**

| Category | n | What it probes |
|---|---|---|
| `factual_lookup` | 10 | `Who wrote "X"?` — a byline, from catalogue metadata |
| `exact_book` | 10 | `Do you have the book "X"?` — exact-title catalogue search |
| `definition` | 12 | `What is X?` — the bare topical question, the most natural phrasing |
| `explanation` | 10 | `Explain X as the library's books describe it` |
| `concept` | 10 | `What does the literature say about X?` — cross-collection |
| `multi_document` | 10 | `Across the library's books, how is X handled?` |
| `comparison` | 8 | `Compare "A" and "B"` — two named works |
| `single_document` | 12 | `What does this book say about X?` — scoped to one record |
| `summary` | 6 | `Summarize this book` |
| `khmer` | 10 | Khmer questions, including library FAQs and scoped questions |
| `mixed_language` | 6 | Khmer frame, Latin topic — the phrasing PTEC readers actually use |
| `no_answer` | 8 | Subjects the collection provably does **not** hold |
| `library_faq` | 6 | Hours, location, contact, collection size, rules, membership |
| `citation` | 5 | `How do I cite this in APA?` |

### Question shape

```jsonc
{
  "id": "def-001",
  "category": "definition",
  "question": "What is action research?",
  "locale": "en",
  "scope": { "recordType": "book", "slug": "…" },   // optional — "ask this book"
  "expectIntent": ["pdf_question", "general_knowledge"],
  "sources": ["slug-a", "slug-b", "…"],             // a RECALL list, never exhaustive
  "expectGrounded": true,
  "expectNoAnswer": false,
  "templateOk": false,
  "note": "verified: 6 books in the collection have pages containing \"action research\""
}
```

### Labels are verified, not asserted

Every label was generated from the **production corpus**, not written by hand:

- **`sources`** — for each topic, `book_pages` was queried with
  `ilike '%<term>%'` and the label lists the books whose extracted page text
  actually contains it. The `note` field records the count.
- **`no_answer`** — each of the eight subjects was confirmed to appear on
  **zero** `book_pages` rows before being used. The generator throws if a
  supposedly-absent term is present, so the fixture cannot silently rot into
  claiming the library lacks something it holds.
- **titles and authors** — taken from real `books` rows, so
  `Who wrote "X"?` names a book that exists.

`sources` is a **recall list, not an exhaustive one.** A question about
sampling may legitimately be answered from a book the label does not name.
This is why `retrieval` is scored as "at least one expected source appeared"
and `context` is reported as a percentage rather than as a pass/fail.

### `expectIntent` is the product answer, not a snapshot

It records the intent that *should* answer the question, so a routing change
shows up as a delta. Where a design decision makes two intents both correct,
both are listed and the `note` says why — `definition` accepts
`general_knowledge` because the catch-all is an evidence-first path
(`lib/ai/router.ts`), so the label staying `general_knowledge` while the answer
is retrieved and cited is correct behaviour, not a miss.

---

## 3. What it scores

For each question it drives the **real** `runAssistant` — classify → retrieve →
template-or-model → ground → cite — and records:

| Metric | Definition |
|---|---|
| **routing** | the router chose an intent `expectIntent` accepts |
| **retrieval** | at least one expected source is among the evidence |
| **context** | share of the prompt's passages drawn from an expected source |
| **grounded** | the answer carries ≥1 citation that survived `enforceGrounding` |
| **no-answer** | a question the collection cannot answer was refused, with no evidence |
| **template** | share answered by a canned sentence with no model call |
| **unwanted** | templates where the label says the reader needed a real answer |
| **halluc** | citations the answer invented and grounding deleted |
| **ev** | passages per answer |
| **tok-in** | estimated input tokens per question |

**`template` is not a defect metric.** A byline and an APA reference *should* be
templates — a model there costs money to produce a worse, unverifiable result.
Only `unwanted` counts against the system, and only where the label says so.

---

## 4. The mock model, and why it is the default

`lib/ai/mock-model.ts` answers strictly from the LIBRARY DATA block it is
handed, quoting the first passages and citing them in the exact
`(Title, p. N)` form `enforceGrounding` verifies. It is reached only when
`AI_MOCK_PROVIDER` is set, which this script sets for itself unless `--live`.

Consequences, all deliberate:

- **No billing, no key, no rate limit.** The benchmark can run on every change.
- **No run-to-run drift.** Two runs of the same commit produce the same numbers,
  so a delta is attributable to the change.
- **Everything except prose is still real.** Routing, retrieval, ranking,
  context assembly, the prompt, grounding and citation all execute exactly as
  in production; the mock sits on the same side of `enforceGrounding` as any
  model, so an answer it invented would be stripped identically.
- **Answer prose is measured not at all.** That is what `--live` is for.

`scripts/shims/next-cache.ts` is what makes offline execution possible:
`getOrgIdentity()` is wrapped in `unstable_cache`, which throws outside a Next
request context. Mapped in `scripts/tsconfig.benchmark.json` exactly as
`server-only` is.

---

## 5. Which corpus it runs against

Retrieval reads a database, so **this is not a hermetic unit test** — it
measures the answer quality of whichever environment you point it at.

```bash
# Against whatever .env.local names (local stack by default)
npm run ai:answer-benchmark

# Against production, read-only, with the production Supabase credentials
# active in the environment. Every statement the benchmark issues is a SELECT.
npm run ai:answer-benchmark
```

The header of every run states the corpus it measured
(`corpus fixture: 268 published books, labelled 2026-09-10`), and the same line
is written into the results JSON, so a number can always be traced to the
collection it describes.

---

## 6. Failure reporting

```bash
npm run ai:answer-benchmark -- --diagnose
```

Every failing question is attributed to **one pipeline stage** by
`lib/ai/answer-failure.ts` (pure, unit-tested), using the brief's taxonomy:

| | Stage | |
|---|---|---|
| **A** | `QUERY_UNDERSTANDING` | the question was understood as a different question |
| **B** | `RETRIEVAL` | the evidence exists in the corpus and was not retrieved |
| **C** | `RANKING` | the evidence was retrieved and lost its place in the ordering |
| **D** | `CONTEXT` | evidence reached the prompt, as the wrong passages |
| **E** | `PROMPT` | the instructions were wrong for the evidence supplied |
| **F** | `MODEL_REASONING` | everything upstream correct, answer still wrong |
| **G** | `CITATION` | supported answer, unusable citations |
| **H** | `HALLUCINATION` | cited something the retrieval set does not contain |
| **I** | `NO_ANSWER_HANDLING` | "we don't have that" was owed and not given |

Two rules are enforced in code, not by convention:

1. **The order of the checks is the design.** A stage that makes later stages
   impossible is reported instead of the stages it disabled. A question routed
   to an intent that retrieves nothing has no ranking to blame.
2. **`MODEL_REASONING` is the last resort.** It is reachable only when every
   upstream stage is positively verified correct *and* a model actually
   answered. Under the mock provider it is **not assessable at all**, and the
   report says so in as many words — a zero there means "we did not look", not
   "we looked and found none".

`--diagnose` also prints a per-question trace: routing decision and mode,
passages retrieved, context precision, expected vs actual sources, answer
class, hallucinated citations, the stage, and the file to change.

---

## 6a. The trace, and the failure matrix

Every row of a results file carries `trace` — the explainable chain behind
that answer, built by `lib/ai/trace.ts` from data the router already holds:
how the question was read (`question.frame`, `topic`, `titleCandidates`,
`isbnCandidates`, `compareTargets`, `scopeTitle`), which intent and
strategy answered it, every selected passage with its ranking signals
(`lexical`, `semantic`, `density`, `definition`, `rrf`), what reached the
prompt, and how the citations were judged (`grounded` / `hallucinated` /
`quoted`). That is the machine-readable failure matrix.

```bash
npm run ai:answer-benchmark -- --diagnose --matrix docs/ai-answer-benchmark/failure-matrix.md
```

renders the failing rows for people: question, expected vs predicted
intent, normalized topic, entities, retrieval strategy and candidates,
retrieved documents, the ranked passages, context size, policy, model
output, citations, expected evidence, the stage, the root cause and the
remedy. Nothing in it is recomputed — it is the trace, laid out.

The same trace is available on every production request as
`AssistantResult.trace` (never in the HTTP response) and is printed to the
server log with `AI_TRACE=1`. It carries titles and the question's topic, so
it is never written to `app_events` — that table's contract is counts and
enums only (`lib/ai/telemetry.ts`).

## 6b. Two suites

| Suite | File | n | Purpose |
|---|---|---|---|
| `v1` (default) | `questions.json` | 123 | the permanent baseline — **never edited** |
| `v2` | `questions-v2.json` | 37 | permanent edge cases: typos, ISBNs (bare and in a sentence), Khmer and lower-case titles, author/title ambiguity, named-source questions, concept and edition comparisons, cross-book synthesis, a named work the library does not hold, ambiguous input |
| `all` | both | 160 | |

```bash
npm run ai:answer-benchmark -- --suite v2
npm run ai:answer-benchmark -- --suite all --diagnose
npm run ai:answer-benchmark -- --live --ids def-001,exact-003,none-003   # a small, deliberate live set
```

`v2` labels were verified against the live corpus on 2026-09-11 the same way
as `v1`; the file's `notes` say how. New edge cases go in `v2`; `v1`'s
expected answers are not changed to move a number.

## 6c. A degraded run is not a run

The retrieval layer logs an embedding or vector failure and carries on —
correct for a reader, fatal for a measurement: with the semantic leg missing
for 25 questions, definition retrieval read 33% instead of 92% with nothing
changed. The script now counts those log lines itself, prints a `DEGRADED
RUN` warning, suffixes the results file `-DEGRADED`, and records the count
as `degraded` in the JSON. Do not compare a degraded run against anything;
re-run.

## 7. Reproducibility

- **Deterministic** at a fixed commit and corpus: the mock model has no
  sampling, retrieval fusion and diversity are pure functions, and the fixture
  is committed.
- Every run writes `scripts/ai-answer-benchmark/results/<ISO>.json` with the
  overall metrics, the per-category breakdown and every row.
  Those files are **gitignored** (like the other benchmarks' runs); the
  committed baseline is `docs/ai-answer-benchmark/baseline.md`.
- `--compare <file>` diffs a run against a previous result.

## 8. Rules for changing the pipeline

1. **Evaluate against all 123 questions.** Never optimise one failing category
   while regressing another — the report is per-category for exactly this
   reason.
2. **Record before, after, delta, regressions, latency and tokens** for every
   change.
3. **Do not tune the fixture to make a change look good.** A label is changed
   only when it was wrong about the corpus, and the `note` must say why.
4. **Do not train or replace the model** until a `--live` run shows failures
   that survive classification as `F`. That condition has not been met.

## 9. Regenerating the fixture

The question set is generated once from verified corpus facts and committed.
Regenerate only when the collection changes enough that the labels no longer
describe it — and re-verify the `no_answer` subjects when you do, because a
library that has since acquired a book on one of them would turn a correct
answer into a scored failure.

# AI Brain 2.1 — Live Model Monitoring

How the real model is watched, what may fail a run, what may only warn, and
what to do when something does. The offline half of the same contract is
`lib/ai/live-contract.test.ts`, which runs on every commit and costs nothing.

---

## 1. Why a live suite exists at all

AI Brain 2.0's central finding was that the offline benchmark was blind to the
two things that were actually wrong in production:

- **Gemini charges thinking tokens against `maxOutputTokens`.** Every evidence
  question with three or more passages runs on the reasoning tier (512
  thinking tokens) inside what was then a 350-token cap, so answers came back
  at 49–80 characters, ending mid-sentence, `finishReason=length`. One
  measured usage was `{textTokens: 10, reasoningTokens: 336}`.
- **The grounding parser read one citation form** while the model wrote at
  least six. Eleven correct answers were reported as "no citation survived"
  and six as "hallucinated".

Every mock metric was green throughout. The mock answers in exactly the form
`enforceGrounding` verifies and has no thinking budget, so by construction it
cannot produce either defect. **A provider is a thing that changes without
telling you**, and a fix proved only by a run nobody schedules is not a fix.

---

## 2. The two halves

| | What it proves | When | Cost |
|---|---|---|---|
| `lib/ai/live-contract.test.ts` | our arithmetic and our parser handle what a real model does | every commit | free |
| `--live-suite smoke` | the provider still does what we handle | weekly | ~15k tokens |

Both are needed. The unit test cannot prove Gemini's behaviour; the live run
cannot pin an off-by-one in a budget.

---

## 3. Running it

```bash
# The weekly set — 14 questions, ~9 model calls, ~15k tokens
npm run ai:answer-benchmark -- --suite all --live-suite smoke --artifact --gate

# After a change to the prompt, the output budget, the citation parser or the
# provider — 24 questions
npm run ai:answer-benchmark -- --suite all --live-suite regression --artifact

# One question, for a reproduction
npm run ai:answer-benchmark -- --live --ids cmp-002 --diagnose
```

`--live-suite` implies `--live`. The sets live in
`scripts/ai-answer-benchmark/live-suites.json`; naming the set rather than
typing ids is what makes a live run reproducible and its cost a number
somebody chose rather than a number somebody typed.

Point the environment at the **production** corpus. The local Supabase stack
holds six books and no page text, so a live run against it bills the provider
to measure an empty library.

---

## 4. What the smoke suite covers

Fourteen questions, one per property that only a live model can show, across
both languages and both fixtures:

| Property | Question |
|---|---|
| definition from evidence | `def-001` |
| explanation | `expl-001` |
| cross-collection concept | `concept-003` |
| topic across many books | `multi-002` |
| a real two-work comparison | `cmp-002` |
| inside one book | `single-002` |
| summary of a document | `sum-001` |
| Khmer × 2 | `km-001`, `km-005` |
| mixed Khmer/English | `mix-001` |
| an honest refusal | `none-001` |
| a catalogue fact (byline) | `fact-001` |
| a formatted citation | `cite-001` |
| a misspelt concept | `v2-typo-003` |

Five of the fourteen are answered by templates and cost nothing; the other
nine reach the model.

---

## 5. The gates

A run prints every gate with `ok`, `warn` or `HARD FAIL`. `--gate` makes the
process exit non-zero on a hard failure **and nothing else**.

### Hard — fails the job

| Gate | Why it is hard |
|---|---|
| `finish-reason` | `finishReason` other than `stop` means the reader saw a cut-off answer. This is the 2.0 defect; it is true or false regardless of wording. |
| `hallucinated-citations` | A citation naming a page the retrieval set does not contain. Grounding deletes it, so the reader is protected — but the prompt is inviting it and that is a change. |
| `unsupported-answers` | A question the collection cannot answer was answered anyway. |
| `wrong-document` | An answer that **silently** drew on works outside the ones its question required. See §5.1. |
| `empty-answers` | A model call that returned nothing. |

### Warn — reported, never fails

`groundedness` below 95%, any false no-answer, and any `requiredClaims` miss.
Plus latency and token drift, which are recorded in the artifact and never
gated at all.

**The split is the point.** A real model's phrasing moves run to run. A job
that goes red for that stops being read within a month, at which point the
hard gates stop being read with it.

### 5.1 Why `wrong-document` fires only on a silent one

The first live smoke run failed this gate on `cmp-002`, a comparison of two
works where one side had no indexed passages. The model's answer opened

> "a full comparison is not possible because one of the sides is missing from
> the passages"

and then named what it did have. Retrieval was genuinely incomplete —
`multiDocumentRecall` 0.5, exactly what that metric exists to catch — but the
answer was honest. Paging somebody for a system correctly reporting its own
gap is the failure mode §23 of the brief is written to prevent.

So the hard gate is the dangerous case only: an answer built on the wrong
works that does **not** say so. The honest one is still counted, still
reported, and shows up in the weekly trend as a retrieval number.

---

## 6. A degraded run is not a regression

The benchmark counts embedding/vector failures itself and prints

```
!! DEGRADED RUN: N embedding/vector failure(s) were logged.
```

`--gate` will **not** fail such a run. Its numbers describe an outage rather
than the pipeline, and failing a scheduled job on them teaches everybody to
ignore it. Measured on 2026-09-11: about 25 consecutive `fetch failed`
embeddings turned definition retrieval from 92% into 33% with no code change
at all.

---

## 7. The weekly job

`.github/workflows/ai-quality.yml`, Sundays 19:00 UTC (02:00 Monday
Asia/Phnom_Penh) plus manual dispatch with a suite choice.

It runs the offline contract first (free), then the live suite, writes the
trend artifact, publishes the 2.1 scorecard and the gate table to the job
summary, and fails only on a hard gate.

- **Read-only.** Every statement the benchmark issues is a SELECT. It creates
  no content, mutates no reader state, and writes nothing to the database.
- **Skips rather than fails when unconfigured.** A red cross that means "no
  credentials" is indistinguishable from one that means "the AI regressed".
- **Never publishes model output.** The summary carries the scorecard and the
  gates; the per-question prose stays in the run artifact.

Required repository secrets: `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`.

---

## 8. The trend file

`--artifact` writes one JSON per run to `artifacts/ai-quality/`:

```
artifacts/ai-quality/2026-09-12-live-smoke-03-12-39.json
```

Headline metrics only — every 2.1 rate, the gate counts, token totals,
latency quantiles and the scope census. **Never a prompt, never an answer,
never a key**: a trend file that carries model output is a trend file nobody
can publish. The workflow uploads the directory with 180-day retention.

---

## 9. What to do when a gate fails

Follow §25 of the brief, in order. Real-model evaluation is stochastic and
**one bad answer is not evidence**.

1. **Reproduce.** `--live --ids <id> --diagnose`.
2. **Re-run.** The same id, again. A failure that does not repeat is not a
   regression.
3. **Compare runs.** `--compare artifacts/ai-quality/<previous>.json`, and the
   previous week's artifact.
4. **Read upstream first.** The trace on the failing row carries the frame,
   the topic, the correction, the entity, every ranked passage with its
   signals, the context size and the citation judgement. `--matrix out.md`
   renders it.
5. **Classify** with `lib/ai/answer-failure.ts`'s stages. A failure is
   `F — MODEL_REASONING` only when routing, entity, retrieval, context,
   prompt and citations were each positively verified correct and the answer
   still omits a claim the label requires.
6. **Only then** change something.

### The one thing that justifies looking at the model

If `F — MODEL_REASONING` rises materially across several clean runs, that is
the evidence the fine-tuning question needs — and the order of investigation
is still prompt, then model version, then model configuration, then provider
regression, and only then model replacement. Nothing else does.

As of 2026-09-12, across every live run made in 2.0 and 2.1, **no failure has
survived classification as F**.

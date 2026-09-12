# AI Brain 2.1 — Quality Baseline

What each metric means, which label shape it is entitled to be computed
against, how to reproduce it, and what a change to it does and does not prove.

The instrument is `scripts/ai-answer-benchmark.ts` (answers) and
`scripts/retrieval-benchmark.ts` (evidence). The scoring rules are
`lib/ai/evaluation.ts`, which is pure and unit-tested offline.

---

## 1. The fixtures, and the rule that governs them

| Fixture | n | Status |
|---|---|---|
| `questions.json` (v1) | 123 | **Permanent historical baseline. Never edited.** |
| `questions-v2.json` (v2) | 37 | AI Brain 2.0's edge cases. Frozen. |
| `questions-v2-1.json` (v2.1) | 17 | The label shapes 2.1 introduced. |

A later phase **adds** a fixture; it never rewrites an earlier one. That is
what lets a number from September 2026 be compared with a number from a year
later and mean something.

v1 and v2 carry no scope field. Their scopes are **derived** by
`deriveEvidenceScope`, a pure function of fields they already have, in a fixed
order, printed as a census on every run. A scope can therefore never be chosen
per question to make a number look better — it has to be argued for in the
rule table, in the open, for every question the rule touches.

```
v1 scope census:  single_document 32 · multi_document 8 · topic_unscoped 43
                  · metadata 32 · no_evidence 8
```

---

## 2. Evidence scopes

| Scope | The label says | Retrieval is correct when | Context relevance |
|---|---|---|---|
| `exact_page` | this page | that page is among the evidence | pages named |
| `page_range` | this span | a page in the span is | pages in span |
| `single_document` | this record, exhaustively | that record contributed | measured |
| `multi_document` | these NAMED works, all required | **every** required work contributed | measured |
| `topic_unscoped` | a recall list, not a set | any labelled record contributed | **not measurable** |
| `metadata` | a catalogue fact | the record is among the results | **not applicable** |
| `no_evidence` | the corpus cannot answer | — | — |

Derivation order (`lib/ai/evaluation.ts`):

1. `expectNoAnswer` → `no_evidence`
2. an explicit `evidenceScope` → believed (v2.1+ only)
3. `pageRange` → `page_range`; `pages` → `exact_page`
4. `scope` (the reader is inside one record) → `single_document`
5. `templateOk` (a catalogue answer is right) → `metadata`
6. the question **names** two or more of its labelled works → `multi_document`
7. exactly one labelled record → `single_document`
8. anything else → `topic_unscoped`

Rule 6 reads the question, not the category and not the source count. Both
alternatives were tried and both are wrong:

- **Category** — v1's `multi_document` category is "Across the library's
  books, how is ethics handled?", which names nothing and is labelled against
  six. So is v2's `cross_book_synthesis`.
- **Count** — `v2-synth-002` ("What does the literature say about phonics?")
  is labelled against four and names nothing; `v2-cmp-002` is labelled against
  two and names both.

---

## 3. The metrics

### Label-bound — only where the scope can carry them

| Metric | Definition | Scopes |
|---|---|---|
| **routing** | the intent is one the label accepts | all |
| **entity resolution** | the resolver attached the work the question named | where a work was named |
| **retrieval** | the evidence a correct answer needs was retrieved | all but `no_evidence` |
| **context sufficiency** | enough of the right evidence reached the prompt to answer | all but `metadata`/`no_evidence` |
| **context relevance** | share of passages drawn from a labelled record | `single_document`, `multi_document`, page scopes |
| **multi-document recall** | share of REQUIRED works that contributed ≥ 1 passage | `multi_document` |
| **answer correctness** | every `requiredClaims` substring is present | where the label states claims |

### Label-free — computed from the context itself

These need no fixture and **cannot go stale as the collection grows**, which
is why they are the right instrument for an unscoped topic.

| Metric | Definition |
|---|---|
| **evidence coverage** | share of passages carrying a real lexical (≥ 1 term) or semantic (≥ 0.70) signal |
| **irrelevant context ratio** | share carrying neither |
| **duplicate context ratio** | share repeating a (record, page) already present |

### Outcome rates

| Metric | Definition |
|---|---|
| **groundedness** | the answer carries a citation that survived `enforceGrounding` |
| **citation correctness** | grounding deleted nothing — no citation named a page the retrieval set lacks |
| **no-answer recall** | an unanswerable question was refused |
| **false no-answer rate** | an **answerable** question was refused |
| **unsupported answer rate** | an **unanswerable** question was answered |
| **wrong document rate** | evidence was retrieved and none of it came from a required record |
| **wrong page rate** | the right record, at a page the label excludes |
| **finishReason ≠ stop** | the output cap cut an answer off |

**`null` is a real value and is excluded from the denominator.** A metric the
label cannot answer is not a zero. That one rule is the difference between a
recall list reading as a ranking defect and a recall list reading as a recall
list.

---

## 4. The frozen numbers

### 4.1 AI Brain 2.0, reproduced on this branch before any change

```
v1 (123)   routing 100% · retrieval 98% · context 75% · grounded 100%
           no-answer 100% · hallucinated 0 · failures 2
v2 (37)    routing 100% · retrieval  97% · context 82% · grounded  94%
           no-answer 100% · failures 1
retrieval  R@5 84% · top-1 73% · single_document 97%/93%
           multi_document 60%/20% · khmer 80% · mixed 80%
           no-evidence 100% · citation 100% · 13 misses
```

### 4.2 Under the 2.1 evaluator (same run, same corpus, mock model)

```
v1, scope-aware
  routing              100% (123)
  entity resolution    100% (20)
  retrieval             91% (102)
  context sufficiency   89% (83)
  context relevance    100% (34)     ← 34 questions, not 123
  evidence coverage     96% (77)     ← label-free
  irrelevant context     4% (77)     ← label-free
  duplicate context      0% (77)
  multi-document recall 94% (8)
  groundedness         100% (69)
  citation correctness 100% (123)
  no-answer recall     100% (8)
  false no-answer       1.6%
  unsupported answer    0.0%
  wrong document        0.8%
  wrong page            0.0%
```

The legacy columns are printed on the same run, so v1's historical 75% is
still reproducible from it. **The two numbers do not contradict each other**:
75% is the average share of retrieved passages drawn from a labelled record
across all 123 questions; 100% is the same quantity computed only over the 34
questions whose label names every record that could answer them.

### 4.3 Live model

Two runs of `--live-suite smoke`, in exact agreement:

```
provider gemini · model gemini-3.5-flash · 9 model calls of 14 questions
tokens in 7,606 · out 6,353–7,367 · total 13,959–14,973
model latency p50 4.7–5.8 s · p95 6.7–7.3 s
citations 26–27 grounded · 0 hallucinated
finishReason ≠ stop: 0
```

---

## 5. Reproducing a number

```bash
# Point the environment at the PRODUCTION corpus. The local stack holds six
# books and no page text, so a run against it measures nothing.
npm run ai:answer-benchmark -- --suite v1 --diagnose
npm run ai:answer-benchmark -- --suite v2.1 --diagnose
npm run ai:answer-benchmark -- --suite all --matrix /tmp/matrix.md
npm run retrieval:benchmark -- --diagnose

# Against a previous run
npm run ai:answer-benchmark -- --compare scripts/ai-answer-benchmark/results/<file>.json
```

---

## 6. What a change to a number proves, and what it does not

- **A run that logged embedding failures proves nothing.** The benchmark
  counts them and prints `DEGRADED`. Measured 2026-09-11: ~25 consecutive
  `fetch failed` embeddings turned definition retrieval from 92% into 33% with
  no code change at all.
- **Latency here is not a measurement.** Laptop → Cloudflare tunnel →
  self-hosted Postgres. p50 has swung between 0.9 s and 3.6 s across runs with
  purely in-process changes.
- **Recall against the retrieval fixture is not a pure quality signal.** 11.8%
  of its labelled pages are front matter (§5.1 of the evaluation audit), so a
  change that stops retrieving contents pages *lowers* recall while improving
  every answer. Read the label-free furniture share beside it.
- **A mock run cannot assess the model.** `F — MODEL_REASONING` requires a
  model to have answered; the benchmark prints "NOT ASSESSABLE" rather than
  letting a zero read as a clean bill of health.
- **One live answer is not evidence.** Reproduce, re-run, compare runs,
  inspect upstream, classify — then act (§25 of the brief;
  `docs/AI-BRAIN-2-1-LIVE-MONITORING.md` §9).

---

## 7. Targets

| Metric | Target | Why that number |
|---|---|---|
| routing | ≥ 99% | a question sent to the wrong intent cannot be recovered downstream |
| retrieval | ≥ 95% | the evidence exists; not finding it is a defect |
| context relevance (scoped) | ≥ 90% | measured only where the label is exhaustive |
| evidence coverage | ≥ 95% | a passage with no signal is a wasted prompt slot |
| groundedness | ≥ 95% | an uncited claim is not checkable by a reader |
| citation correctness | ≥ 98% | |
| hallucinated citations | **0** | non-negotiable |
| unsupported answers | **0** | non-negotiable |
| finishReason ≠ stop | **0** | non-negotiable |
| false no-answer | ≤ 2% | a refusal owed to nobody is a lost reader |

There is deliberately **no target for `topic_unscoped` context relevance**,
because there is no honest way to compute one.

# AI Answer Quality — committed baseline

**Every number here was produced by the benchmark, not transcribed from a
report.** Reproduce it with:

```bash
npm run ai:answer-benchmark
```

| | |
|---|---|
| **Recorded** | 2026-09-10 |
| **Branch** | `fix/security-event-sink-production` (identical on `audit/final-production-reliability-2`) |
| **Corpus** | production — 268 published books, 249 with extracted pages, 249 with embedded chunks |
| **Fixture** | `scripts/ai-answer-benchmark/questions.json`, 123 questions, 14 categories, labelled 2026-09-10 |
| **Provider** | mock (`lib/ai/mock-model.ts`) — no key, no billing, no sampling |
| **Reproducibility** | two independent runs on this branch produced identical figures in every column, `tok-in` included |

---

## Overall

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
| Input tokens per question (est.) | 482 |

## By category

```
category         n   routing  retrieval  context  grounded  no-ans  template  unwanted  halluc  ev   tok-in
-----------------------------------------------------------------------------------------------------------
factual_lookup   10  100%     90%        90%      —         —       100%      0         0       0.0  0
exact_book       10  100%     40%        8%       —         —       100%      0         0       0.0  0
definition       12  92%      92%        45%      92%       —       8%        1         0       4.6  795
explanation      10  100%     90%        58%      90%       —       10%       1         0       4.0  755
concept          10  100%     100%       52%      100%      —       0%        0         0       5.0  845
multi_document   10  100%     80%        46%      90%       —       10%       1         0       3.8  682
comparison       8   100%     100%       94%      —         —       0%        0         0       5.5  807
single_document  12  100%     100%       100%     83%       —       0%        0         0       4.0  649
summary          6   100%     100%       100%     67%       —       0%        0         0       4.2  702
khmer            10  100%     100%       100%     100%      —       70%       0         0       1.5  234
mixed_language   6   100%     100%       100%     83%       —       0%        0         0       4.0  655
no_answer        8   100%     —          —        —         63%     63%       0         0       0.4  123
library_faq      6   67%      —          —        —         —       67%       0         0       0.8  196
citation         5   100%     100%       100%     —         —       100%      0         0       0.0  0
-----------------------------------------------------------------------------------------------------------
ALL              123 98%      89%        70%      88%       63%     36%       3         0       2.8  482
```

## Companion baseline — retrieval

`npm run retrieval:benchmark`, 98 labelled questions, same corpus:

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

---

## Where the remaining failures live

`npm run ai:answer-benchmark -- --diagnose`

**21 of 123 questions fall short on at least one measured property**, attributed
by `lib/ai/answer-failure.ts`:

| | Stage | n | Representative case |
|---|---|---|---|
| **B** | `RETRIEVAL` | **8** | `Do you have the book "Qualitative Research from Start to Finish"` — the named book is not among the five results |
| **A** | `QUERY_UNDERSTANDING` | 5 | `What is action research?` → `thesis_search`, because "action research" is a collection keyword |
| **E** | `PROMPT` | 5 | a scoped question retrieved 4 passages at 100% context precision and the answer still refused |
| **I** | `NO_ANSWER_HANDLING` | 3 | `byzantine fault tolerance` answered from one page that shares an ordinary word |
| **F** | `MODEL_REASONING` | **0 — not assessable** | no model reasons under the mock provider |

**F is zero because nothing looked, not because nothing was found.** The
benchmark prints this in as many words. Establishing whether the model itself
ever fails requires `--live`, and until that run exists the §29 precondition for
considering training is **not met**.

### The three named gaps, in the order the evidence ranks them

1. **`exact_book` retrieval is 40%** — the largest single block of B failures.
   The assistant's catalogue leg ranks with its own model (`lib/ai/work-ranking.ts`)
   while `/api/search/native` — which returns the same titles first — uses
   `lib/search/ranking.ts`. Two ranking models over one collection is the
   defect; retiring one into the other is the fix.
2. **`no_answer` is 63%** — three of eight subjects the collection provably does
   not hold are still answered from a page sharing one ordinary word. The
   remaining lever is term *specificity* (an IDF weight over the corpus), which
   would also lift `exact_book`.
3. **`library_faq` routing is 67%** — `Across the collection, what is said about
   ethics?` matches the FAQ table's `"the collection"` entry and is answered with
   the library's collection size.

---

## Rules for moving this baseline

1. Evaluate **every** change against all 123 questions. Never optimise one
   category while regressing another.
2. Record before, after, delta, regressions, latency and token impact.
3. A change is accepted only when the overall system improves, or the trade-off
   is documented and justified.
4. Update this file, with the run that produced the numbers, in the same commit
   as the change that moved them.
5. **Do not train, fine-tune or replace the model** until a `--live` run
   produces failures that survive classification as `F`.

# The AI quality test matrix

What each suite measures, what it may and may not be used to claim, and how to
run it. Companion to [`AI-QUALITY-AUDIT-2026-09.md`](./AI-QUALITY-AUDIT-2026-09.md)
and [`AI-QUALITY-IMPLEMENTATION-2026-09.md`](./AI-QUALITY-IMPLEMENTATION-2026-09.md).

---

## The suites

| suite | n | fixture | frozen? | what it is for |
|---|---:|---|---|---|
| `v1` | 123 | `questions.json` | **yes, never edited** | the permanent historical baseline |
| `v2` | 18 | `questions-v2.json` | **yes** | AI Brain 2.0 edge cases |
| `v2.1` | 17 | `questions-v2-1.json` | yes | evidence scopes: pages, ranges, required works, required claims |
| `km` | 18 | `questions-km.json` | **new** | Khmer and mixed-language, including a Khmer page reference |
| `goal` | 11 | `questions-goal.json` | **new** | goal-shaped questions + 3 controls |
| `all` | 187 | all of the above | — | what a live run draws its ids from |
| retrieval | 98 | `retrieval-benchmark/questions.json` | yes | whether retrieval finds the right *pages* |

```bash
npm run ai:answer-benchmark -- --suite km
npm run ai:answer-benchmark -- --suite goal --verbose
npm run ai:answer-benchmark -- --suite v2.1 --matrix out.md
npm run retrieval:benchmark -- --diagnose
npm run retrieval:benchmark -- --compare scripts/retrieval-benchmark/results/baseline-2026-09-17.json
```

Retrieval reads the database, so **point it at the environment whose answer
quality you are asking about**. Against the local stack every retrieval metric
is 0% and the run means nothing.

---

## Coverage against the brief's matrix

✅ covered · ⚠️ thin · ❌ absent

| dimension | | where |
|---|---|---|
| **Query understanding** | | |
| direct / conversational / paraphrase | ✅ | v1 definition, explanation, concept |
| ambiguous, long | ⚠️ | v2 |
| Khmer-only | ✅ | `km` ×12, v1 khmer ×10 |
| mixed Khmer/English | ✅ | `km` ×4, v1 mixed ×6 |
| **Entity resolution** | | |
| exact / edition / no-edition title | ✅ | v1 exact_book ×10 |
| typo title | ✅ | v2.1 typo ×3 |
| ISBN-10 / 13 / formatted / embedded | ✅ | v2 |
| quoted, Khmer title | ✅ | v1, `km` |
| shortened title | ⚠️ | one case |
| **Document questions** | | |
| summary, definition, explanation | ✅ | v1 |
| **specific page** | ✅ | v2.1 exact_page ×2, `km` ×1 |
| **page range** | ✅ | v2.1 page_range ×2 |
| "according to this book" | ✅ | v1 single_document ×12 |
| chapter | ❌ | — no chapter handling exists |
| verbatim quote | ⚠️ | covered incidentally |
| **Multi-document** | | |
| compare two works | ✅ | v1 comparison ×8, v2.1 ×2 |
| compare three+ | ❌ | — |
| synthesise across books | ✅ | v1 multi_document ×10, retrieval ×20 |
| agreement / disagreement | ❌ | — |
| **Library discovery** | | |
| find books, by author, by subject | ✅ | v1 |
| exact availability | ✅ | v1, `goal` control |
| related books | ✅ | v1 |
| **learning-path discovery** | ✅ | `goal` ×8 |
| **Institutional** | | |
| hours, location, contact, rules, membership | ✅ | v1 library_faq ×6, `km` ×2 |
| mission, history, collection, services | ⚠️ | keyword-routed, not all fixtured |
| **Learning / goal** | | |
| "what should I read first" | ✅ | `goal` |
| "which path should I follow" | ✅ | `goal` |
| "what resources help me teach X" | ✅ | `goal` |
| "what comes next" | ✅ | `goal` |
| "why is this resource in this path" | ❌ | — |
| **Negative / no-answer** | | |
| topic absent | ✅ | v1 ×8, `km` ×2, `goal` ×4 |
| fake ISBN / author / page | ⚠️ | v2 partial |
| insufficient evidence | ✅ | v1 |

**Known holes:** chapter references, three-way comparison, explicit
agreement/disagreement, and "why is this book in this path". None has any
implementation to test.

---

## What each metric may be used to claim

The 2.1 doctrine, restated because this is where it gets misread: **a metric a
label cannot bear is `null` and leaves the denominator. It is never a zero.**

| metric | label-bound? | may be used to claim |
|---|---|---|
| routing | no | the question reached an intent that can answer it |
| entity resolution | yes | a named work resolved to the right record |
| retrieval | **yes** | an expected source was retrieved — *only* where the label is exhaustive |
| context relevance | **yes** | `null` for `topic_unscoped`, by design |
| context sufficiency | partly | enough of the right evidence reached the prompt |
| **evidence coverage** | **no** | share of passages carrying a real signal — safe at any corpus size |
| **irrelevant context** | **no** | share carrying none |
| **duplicate context** | **no** | share repeating a (record, page) |
| **source spread** | **no** | how many distinct records an answer drew on |
| **furniture dropped** | **no** | pages refused as a book's front matter |
| groundedness | no | the answer carries a citation grounding verified |
| citation correctness | no | no citation survived that names an unretrieved page |
| no-answer recall | no | an unanswerable question was refused |
| unsupported answer | no | an unanswerable question was answered |
| wrong document / wrong page | yes | needs a page- or document-scoped label |
| answer correctness | yes | `requiredClaims` present; `null` where unstated |

### The rule that matters most right now

> **`multi_document` R@5 and `on-label` must not be used as success criteria
> for retrieval work at 1,916 books.**

Those labels were written at 268. The library now holds the 5th, 6th *and* 8th
editions of at least one labelled work; retrieving the 6th edition's chapter on
validity scores a **miss**. Three audits have read that number as a retrieval
defect. Full evidence: audit §4.

Use the label-free metrics instead. They need no fixture and cannot go stale.

---

## Live runs

```bash
npm run ai:answer-benchmark -- --suite all --live-suite smoke --artifact --gate
npm run ai:answer-benchmark -- --suite all --live-suite capabilities
npm run ai:answer-benchmark -- --suite all --live-suite regression
```

`--suite all` is required: the live suites name ids across every fixture, and
an id the active fixture does not hold is dropped **silently**.

| suite | n | model calls | tokens | when |
|---|---:|---:|---:|---|
| `smoke` | 14 | 9 | ~15k | weekly (`.github/workflows/ai-quality.yml`) |
| `capabilities` | 12 | 8 | ~12k | after a change to page lookup, goals, or Khmer |
| `regression` | 25+ | ~20 | ~35k | after a change to the prompt, output budget, citation parser or provider |

### Why the hard gates are the shape they are

A gate may only fail a run on a property that is true or false **regardless of
phrasing** — a cut-off answer, a citation naming an unretrieved page, an
unanswerable question answered, an empty response, an answer that *silently*
drew on the wrong works. A job that goes red for wording drift stops being
read, and the red that matters goes with it. A DEGRADED run never fails a gate.

### Results, 2026-09-17

Both runs: **all eight gates ok**, `finishReason = stop` on every call.

```
smoke          gemini-3.5-flash   9 calls   14,828 tok   27 grounded / 0 hallucinated
capabilities   gemini-3.5-flash   8 calls   12,042 tok   19 grounded / 0 hallucinated
```

---

## Traps that make a run lie

Each of these has produced a wrong conclusion in this repository at least once.

1. **A DEGRADED run.** ~25 consecutive `fetch failed` embeddings turned
   definition retrieval from 92% into 33% with no code change. The script
   prints `DEGRADED` and suffixes the filename; before that the only tell was
   `grep -c "fetch failed"`.
2. **Pointing at the local stack.** Every retrieval metric reads 0%. The v2.1
   suite scored retrieval 0% / context 0% this way, which is the empty
   database, not the pipeline.
3. **Stale labels.** See above. The symptom is a category whose score falls
   while nothing about it changed.
4. **Vitest under machine load.** 8 phantom failures at load average 98. Check
   `uptime` before believing a local failure.
5. **`search:benchmark` drives `localhost:3000`.** If a dev server is running
   against the local stack it will answer, quickly, with 0% everywhere — a
   valid-looking table measuring nothing.
6. **A live suite run without `--suite all`.** Ids outside the active fixture
   are dropped silently and the run reports fewer questions than it named.
7. **A benchmark that cannot see the defect.** The first learning-path
   implementation answered "underwater welding" with a maths curriculum and the
   fixture scored it ✓, because the label checked the intent and allowed a
   template. When a new capability is added, ask what its *wrong* answer would
   look like and whether any label would catch it.

---

## Adding a suite

1. `scripts/ai-answer-benchmark/questions-<name>.json` with `generatedAt`,
   `corpusBooks` and `questions`.
2. A branch in the `SUITE ===` chain, and the fixture in the `all` list.
3. Write labels by **reading the collection**, never by recording what the
   system returned. Where the corpus holds nothing, say so and let the refusal
   be the correct answer.
4. Include **controls** — questions the new capability must *not* claim. The
   `goal` suite has three; they are what prove it did not swallow the catalogue
   search beside it.

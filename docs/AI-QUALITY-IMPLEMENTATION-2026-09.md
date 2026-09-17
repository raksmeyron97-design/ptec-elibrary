# AI Quality 3.0 — what changed, and what it is worth

**Branch:** `feat/ai-quality-3` · four commits on `main` @ `18824cf`
**Audit:** [`AI-QUALITY-AUDIT-2026-09.md`](./AI-QUALITY-AUDIT-2026-09.md)
**Benchmarks:** [`AI-QUALITY-BENCHMARK-2026-09.md`](./AI-QUALITY-BENCHMARK-2026-09.md)

Evidence classes as in the audit: **PRODUCTION**, **LOCAL**, **LIVE**,
**UNKNOWN**.

---

## Before

All PRODUCTION, 1,916 published books, mock model.

| | v1 (123) | v2.1 (17) | km (18) | goal (11) | retrieval (98) |
|---|---:|---:|---:|---:|---:|
| routing | 100% | 100% | 94% | — | — |
| retrieval | 91% | 63% | 100% | — | R@5 81% |
| context sufficiency | 89% | 77% | 71% | — | — |
| context relevance | 100% | 60% | 100% | — | — |
| groundedness | 100% | 92% | 100% | — | — |
| no-answer recall | 88% | 100% | 50% | — | 100% |
| unsupported answer | 12.5% | 0% | **50%** | — | — |
| wrong document | 0.8% | 11.8% | 0% | — | — |
| wrong page | 0.0% | 5.9% | 0% | — | — |

`km` and `goal` did not exist; they are part of this work. Their "before"
column is the unchanged pipeline measured against the new fixtures.

---

## Changes

### 1. A question that NAMES a page gets that page

`lib/ai/page-target.ts` (new, pure) · `page_lookup` retrieval mode · three
refusal templates · structural refusal in the trace.

A page reference is **identity**, in the same sense an ISBN is. "Page 294 of X"
designates one row of `book_pages`; a semantically similar page is not a worse
answer to it, it is the wrong answer. Before this, `extractPage()` pulled the
number out for the citation intent's reference line and every retrieval path
then searched page text for the *words* "page 87 of practical research
methods".

- The parser is narrow on purpose: every match needs an explicit page word,
  because an edition, a year, a grade and an ISBN are all numbers a reader
  writes, and scoping an answer to a page nobody asked about is worse than the
  corpus search it replaces — it *looks* precise.
- `\b` is defined over ASCII, so `\bទំព័រ` could never match. Every Khmer page
  reference was silently unparseable. The look-arounds ask the real question
  for any script.
- The page-quality filter is **not** applied: when a reader asks what is on
  page 5 and page 5 is a table of contents, that is the honest answer.
- Three refusals, chosen by what the **database** reported: the title did not
  resolve, the page carries no extracted text (and how far the text does run),
  or no document was named.
- A range is sampled across its span, never truncated at its start, so a
  summary of pp. 175–185 sees the end of the section as well as the beginning.

### 2. Khmer is a language, not a blob

`isKhmerScaffolding` in `lib/ai/evidence.ts` · `WORK_SIMILARITY_FLOOR` ·
`TitlePool` · Khmer frames in `query.ts`/`intent.ts`.

Five defects, each measured before it was fixed:

**(a) A Khmer frame became a required lexical term.** Khmer has no word
boundaries, so a run enters `queryTerms` whole — right for a topic, wrong for a
particle. `អំពី` is "about", and because runs sort longest-first a Khmer clause
lands inside `requiredTerms`, which is applied as a SQL conjunction: an English
page had to contain a Khmer particle before it could be evidence.

A run is dropped only when it decomposes **entirely** into function words,
never trimmed to a remainder. Without boundaries, stripping `ជា` off `មុខវិជ្ជា`
("subject") leaves `មុខវិជ្`, and `ការ` off `ការស្រាវជ្រាវ` ("research") leaves
`ស្រាវជ្រាវ` — silently, inside the one term carrying the question.
All-or-nothing makes that impossible.

**(b) The semantic work floor was 0.25, which is no filter.** The same defect
`CHUNK_MIN_SIMILARITY` had at 0.3, in the same file, against the same embedder;
that one was recalibrated and this one never was. `scripts/calibrate-work-threshold.ts`
(new) measures it, and finds that one number cannot serve both scripts:

```
             min     p50     max        separating band
latin  on    0.589   0.642   0.734      [0.51, 0.58]
latin  off   0.476   0.494   0.505
khmer  on    0.659   0.706   0.739      [0.62, 0.65]
khmer  off   0.502   0.590   0.611
```

At 0.25 **every** off-topic query is admitted. At a single 0.55, Khmer admits
8/10 false positives; at a single 0.62, Latin keeps only 4/8 true ones. The
cause is mechanical: the embedder is trained overwhelmingly on English, so a
thinly represented script lands in a tighter region and scores higher in *both*
directions. Each floor is the midpoint of its own band; a mixed query takes the
stricter one.

**(c) The trigram fallback leaked into the result pool.** `namedBookRows` has
two legs making different claims — ordered-words rows carry the query's words
in their title; fuzzy rows merely *look* alike to a trigram index. Both were
merged into the results. Fuzzy rows now feed `resolveTitle` alone.

(b) and (c) together took "find books about space mining" from *"found 5
books"* to an honest refusal, over a collection holding none.

**(d) "What does the library say about X" was an institutional question.**
Anything mentioning the library routed to `general_library_question`, which
answers with opening hours and a phone number. Pairing the institution noun
with a **content verb** separates it from "where is the library".

**(e) Khmer puts its interrogative at the end**, and only the yes/no shape was
handled. `តើ X មានប៉ុន្មានប្រភេទ?` matched no frame, fell to the keyword tables,
and `ស្រាវជ្រាវ` sent it to `thesis_search` — one published record against
1,916 books. That is the Khmer instance of the defect `CONCEPT_FRAMES` exists
for.

### 3. A GOAL is answered from the published curriculum

`learning_path` intent · `searchLearningPaths` · `lib/ai/learning-path-match.ts`
(new, pure) · bilingual templates.

Production publishes nine learning paths over 82 steps and the assistant could
reach none of them. "Where do I start with action research?" was answered with
a row of book covers — the shelf, not the order to read it in, and the order is
the one thing a curriculum exists to express.

**The capability was the easy part. This is the part worth reading:**

The first version scored a path by counting the goal's words anywhere in it,
and led with whatever scored highest above zero. Against a curriculum whose
nine paths are *all* MoEYS early-grade reading and mathematics, that answered:

```
"Where do I start with action research?"   → Early Grade Mathematics, Grade 3
"...qualitative research methods..."       → Early Grade Learning
"learning paths for underwater welding"    → Early Grade Learning
```

Three confident wrong answers — **and the benchmark scored all three as
passes**, because its label checked which *intent* the question reached and
allowed a template. An instrument that cannot see a capability's own failure
mode is not measuring it.

So the ranking moved into a pure module, pinned against the real nine paths:

1. A path may only **lead** on a title or topic hit. A description mention
   ranks it and may never make it the answer — a description says who a
   curriculum is for and what it is made of, not what it teaches.
2. The goal's own vocabulary is removed first. "Learning", "paths", "plan",
   "start" are what *routed* the question here, so by construction every such
   question carries them and none says anything about its subject.
3. A token nearly every path shares cannot make a match strong —
   self-calibrating, so it survives the curriculum growing. The threshold is
   **0.8, not 0.5**: this curriculum is one half reading and one half
   mathematics, so the word separating its two tracks appears in five of nine
   paths and a rule tuned for a general collection destroys it.

And the fixture's labels were corrected after reading the curriculum. Four
questions are now `expectNoAnswer`: naming the nine published paths is the
right answer to a goal the library does not cover. **That made the suite
harder, not easier.**

### 4. Khmer that spells nothing is not evidence

`assessKhmerText` in `lib/ai/page-quality.ts` ·
`scripts/audit-khmer-page-text.ts` (new).

A Khmer PDF whose font carries no usable ToUnicode map extracts as correctly
encoded but **wrong** code points — real Khmer characters in an order that
spells nothing. It clears every character check, clears the lexical floor, and
reaches the model as evidence, where the only thing it can produce is a
confident answer made of nonsense, in the reader's own language. It was found
by reading a measured run's retrieved passages, not by any metric.

PRODUCTION, 20,000 pages: 10,060 are Khmer, **936 (9.3%) unreadable**, in
**41 of 127** records carrying Khmer text. The populations separate cleanly on
the signal that decides — mean Khmer run length p50 5.98 readable vs 2.27
unreadable. The row stays in `book_pages`; it is only refused an evidence slot.

**What this deliberately does not do.** A second flavour exists: runs stay long
but syllables split mid-word, leaving runs that begin with a dependent vowel
(`ាវ` starts with U+17B6, which cannot begin a Khmer syllable). An early version
acted on it. Then the distributions were read: readable pages reach an orphan
share of p95 = 0.12, and every threshold catching the split pages condemns
56–64% of the Khmer corpus. Removing two thirds of a language on an overlapping
signal is not a filter, and I cannot read Khmer well enough to say which of
those 5,671 pages are broken. `orphanShare` is computed, carried, and printed
by the audit **with what it does and does not establish**, and it decides
nothing.

### 5. Four instrument corrections

Rule 4 of the brief cuts both ways: an instrument that cannot see a defect is
as much a problem as the defect. None of these changed a question or a label to
raise a score.

| what | why |
|---|---|
| `hasSignal` counts a **designated** page | It asks whether a *ranker* fired. A page fetched by number was never ranked, so both scores are absent by construction — and scoring that as no-signal reported the tightest context the system can produce (exactly the pages asked for) as 100% irrelevant. Measured: coverage 100% → 69% on the first run of the page path, with no junk passage in any prompt. |
| `trace.answerClass` is decided **structurally** | The prose scan could not recognise "Page 294 of X has no extracted text" or "Which document? Page 42 on its own doesn't identify one". Both are refusals; both filed as ordinary template answers. |
| the benchmark's `isRefusal` consults the trace | Same defect one layer up: it called "No learning path covers that exactly, but the library publishes 9" an *answer* and reported no-answer recall as 25% over four questions that were all answered correctly. |
| a hub for "which paths exist" ≠ a hub for "none covers that" | Collapsing them reported a correctly answered question as a false refusal. |

This is the lesson `missingDocuments` and the 2.1 live monitoring already
recorded, applied twice more: **a gate must read what retrieval reported, never
the prose.**

---

## Results

### Answer quality, before → after. PRODUCTION, mock model.

| | v1 (123) | v2.1 (17) | km (18) | goal (11) |
|---|---|---|---|---|
| routing | 100% → 100% | 100% → 100% | 94% → **100%** | → 100% |
| retrieval | 91% → 91% | 63% → **100%** | 100% → 100% | → 100% |
| context sufficiency | 89% → 89% | 77% → **100%** | 71% → **86%** | → 100% |
| context relevance | 100% → 100% | 60% → **100%** | 100% → 100% | n/a |
| evidence coverage | 96% → 96% | 100% → 100% | 100% → 100% | → 100% |
| groundedness | 100% → 100% | 92% → **100%** | 100% → 100% | → 100% |
| citation correctness | 100% → 100% | 100% → 100% | 100% → 100% | → 100% |
| answer correctness | n/a | 60% → **80%** | → 100% | n/a |
| no-answer recall | 88% → 88% | 100% → 100% | 50% → **100%** | → 100% |
| unsupported answer | 12.5% → 12.5% | 0% → 0% | 50% → **0%** | → 0% |
| false no-answer | 0.8% → 0.8% | 0% → 0% | 16.7% → **5.6%** | → 0% |
| wrong document | 0.8% → 0.8% | 11.8% → **0%** | 0% → 0% | → 0% |
| wrong page | 0% → 0% | 5.9% → **0%** | 0% → 0% | → 0% |
| hallucinated citations | 0 → 0 | 0 → 0 | 0 → 0 | 0 |

By evidence scope, v2.1:

```
                  retrieval        ctx-suff         ctx-rel
exact_page          0% → 100%       0% → 100%      13% → 100%
page_range         50% → 100%      50% → 100%      33% → 100%
single_document   100% → 100%     100% → 100%     100% → 100%
multi_document    100% → 100%     100% → 100%     100% → 100%
```

### Retrieval benchmark — the control. PRODUCTION.

```
category         n   R@5      top1     isolation  spread
single_document  30  97% (=)  93% (=)  100% (=)   1.0
multi_document   20  50% (=)  20% (=)  —          3.3
summary          10  100% (=) 100% (=) 100% (=)   1.0
khmer            10  80% (=)  80% (=)  100% (=)   0.8
mixed            10  80% (=)  80% (=)  100% (=)   0.8
ALL              98  81% (=)  73% (=)  100% (=)   1.2
```

**Identical in every category.** That is the point: none of the 98 questions
names a page, a goal, or reaches a corrupted Khmer page, so this suite is a
clean control on work that should not have touched it.

### LIVE — real Gemini 3.5 Flash

Two runs. Both under the authorised budget.

**smoke** (14 questions, 9 model calls, 14,828 tokens):

```
gates: finish-reason ok · hallucinated-citations ok · unsupported-answers ok
       wrong-document ok · empty-answers ok · groundedness ok
       false-no-answer ok · answer-correctness ok
citations: 27 grounded · 0 hallucinated       model p50 4,588 ms
```

**capabilities** (12 questions over the new paths, 8 model calls, 12,042
tokens) — all eight gates pass, 19 grounded / 0 hallucinated:

```
scope           routing  retrieval  ctx-suff  ctx-rel  grounded
exact_page      100%     100%       100%      100%     100%
page_range      100%     100%       100%      100%     100%
single_document 100%     100%       100%      100%     100%
khmer (4 q)     100%     100%       100%      —        100%
```

Real answers, verbatim:

> **"What is on page 87 of *Practical Research Methods*?"**
> According to "Practical Research Methods," page 87 contains the beginning of
> "8 How to Conduct Focus Groups," which explains that a focus group is a
> gathering of people brought together to discuss a specific issue for research
> purposes (Practical Research Methods, p. 87). …

> **"តើទំព័រ ៨៧ និយាយអំពីអ្វី?"** (scoped to the same book)
> ផ្អែកតាមសៀវភៅ "Practical Research Methods" ទំព័រ ៨៧ បានពិភាក្សាអំពីរបៀបនៃការដឹកនាំ
> ក្រុមពិភាក្សា (Focus Groups) … ("Practical Research Methods", ទំព័រ 87)។

> **"Summarize pages 175 to 185 of *Qualitative Inquiry and Research Design*"**
> …Based on the provided sample—**which only includes pages 175, 176, 177, 179,
> 181, and 183**—ethnography originated in early 20th-century comparative
> cultural anthropology… (pp. 175–177).

The third is the one to notice: the model states which pages of the range it
actually saw. That is the sampling being honest about itself, not a phrasing
instruction.

---

## Remaining gaps

Stated plainly; none is hidden in a passing number.

1. **1,360 books have text and no vectors** (80% of the extracted collection).
   Needs `scripts/embed-library.ts --chunks-only` — a production write and a
   metered spend, so not run here. **Highest-impact next action.**
2. **5,671 Khmer pages carry an unresolved corruption signal.** Needs a Khmer
   reader, not a bigger regex.
3. **Multi-document source spread** is 3–4 records of 10–24 available.
   Document-first selection is the fix; `on-label` must not be used to judge it.
4. **`unsupported answer` 12.5% on v1** — 1 of 8, unchanged, not diagnosed.
5. **Search ranking UNKNOWN.** `search:benchmark` drives `localhost:3000`,
   which served the empty local stack; it was not a valid control here.
6. **Latency UNKNOWN in production.** Measured over a laptop→tunnel hop, p50
   swings 0.5–1.5 s between identical runs.
7. **The Ollama path UNKNOWN.** `AI_PROVIDER` is unset in production.
8. **`/api/chat` still has no first-party caller.** Unchanged.

## Not done, on purpose

No new vector store, no RAG framework, no agent framework, no second provider
abstraction, no fine-tuning. Every defect found sat in a parser, a threshold, a
pool boundary, a data pipeline, or the measuring instrument. Across two live
runs and four mock suites, **zero** failures classified as model reasoning.

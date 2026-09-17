# AI Quality 3.0 — audit of the assistant as it stands

**Date:** 2026-09-17  **Branch:** `feat/ai-quality-3`  **Base:** `main` @ `18824cf`

Every number below was measured. Each carries its evidence class:

| class | meaning |
|---|---|
| **PRODUCTION** | measured against the live corpus (`supabase.storage-ptec.online`), read-only |
| **LOCAL** | measured on this machine, offline (unit tests, pure functions) |
| **LIVE** | measured against the real Gemini provider |
| **UNKNOWN** | not measured — said so, rather than guessed |

Nothing here is carried over from an earlier report without re-measuring it.

---

## 0. The finding that reframes everything else

**The corpus is 7× larger than every committed baseline assumes.** PRODUCTION

| | at last audit (2026-09-12) | today |
|---|---:|---:|
| published books | 268–270 | **1,916** |
| pages with extracted text | — | **210,806** |
| books with extracted text | 248 | **1,695** (88%) |
| books with embedded chunks | 198 | **336** (17.5%) |
| books with a metadata embedding | — | **296** (15%) |
| published theses | — | **1** |
| published journal articles | — | **1** |
| published learning paths / steps | — | **9 / 82** |

Two consequences run through this whole audit.

**(a) 1,360 books have full text and no vectors.** 80% of the extracted
collection can contribute only to the lexical leg. Extraction is automated
(hourly `/api/cron/index-reconcile`); embedding is not — the reconciler
deliberately skips it to protect a metered quota, so a book extracted by the
cron is embedded only when a human runs `scripts/embed-library.ts`. The gap was
51 books at the last audit. It is now 1,360, and it grew because the automated
half scaled and the manual half did not. This is the single largest AI quality
fact in production and it is an **operations** finding, not a code defect.

**(b) Every page-level benchmark label is stale, and one of them is
actively misleading.** See §4.

---

## 1. Architecture map

The pipeline, as it actually runs. `/api/ai` is canonical; `/api/ask` and
`/api/chat` are adapters over the same core.

```
messages
  → compressConversation      conversation.ts    history → one turn + summary
  → parseQuery                query.ts           frame · topic · titles · ISBNs
  → parsePageTarget           page-target.ts     NEW — the page a question names
  → classifyIntent            intent.ts          16 intents, deterministic
  → retrievalModeFor          plan.ts            9 modes, a property of the QUESTION
  → retrieveFor               router.ts          one branch per intent
       ├ page_lookup          retrieval.ts       NEW — fetch named rows by number
       ├ searchWorks          retrieval.ts       keyword → (entity) → semantic
       ├ retrieveEvidence     retrieval.ts       lexical ∥ semantic → RRF → diversify
       ├ retrieveComparison   retrieval.ts       per-document, balanced
       ├ searchLearningPaths  retrieval.ts       NEW — the published curriculum
       ├ searchAuthors/Subjects                  public directory hubs
       └ getLibraryFact       retrieval.ts       published settings + LIBRARY_INFO
  → deterministicAnswer       plan.ts            85%+ of questions stop HERE
  → buildGeneration           plan.ts            system + fenced evidence + budget
  → generateText              provider.ts        Ollama → Gemini, or mock
  → enforceGrounding          guardrails.ts      delete any unverifiable citation
  → buildTrace                trace.ts           the explainable chain
  → telemetry                 telemetry.ts       one app_events row, counts only
```

Pure modules (no `server-only`): `query`, `page-target`, `intent`, `entity`,
`work-ranking`, `evidence`, `page-quality`, `spellcheck`, `learning-path-match`,
`plan`, `context`, `prompts`, `templates`, `token-budget`, `models`,
`evaluation`, `failure-class`, `answer-failure`, `citations`. This is what lets
the benchmarks drive the real decision functions rather than a copy.

---

## 2. Baseline — before any change in this branch

### 2.1 Answer quality, v1 (123 questions, mock model) PRODUCTION

```
routing               100%     citation correctness  100%
retrieval              91%     groundedness          100%
context sufficiency    89%     no-answer recall       88%
context relevance     100%     unsupported answer   12.5%
evidence coverage      96%     wrong document        0.8%
irrelevant context      4%     wrong page             0.0%
```

3 failures of 123: 2 RETRIEVAL, 1 NO_ANSWER_HANDLING.

### 2.2 Answer quality, v2.1 (17 edge cases, mock model) PRODUCTION

```
scope             retrieval  ctx-suff  ctx-rel   grounded
exact_page              0%        0%      13%       100%   ← worst in the suite
page_range             50%       50%      33%        50%
single_document       100%      100%     100%       100%
multi_document        100%      100%     100%       100%
topic_unscoped          —       100%       —        100%
```

Overall: retrieval 63%, context sufficiency 77%, context relevance 60%,
answer correctness 60%, wrong document 11.8%, wrong page 5.9%.

### 2.3 Retrieval (98 labelled questions) PRODUCTION

```
category         n   R@5   top1  isolation  on-label  spread
single_document  30  97%   93%   100%       —         1.0
multi_document   20  50%   20%   —          25%       3.3
summary          10  100%  100%  100%       —         1.0
khmer            10  80%   80%   100%       —         0.8
mixed            10  80%   80%   100%       —         0.8
no_evidence       8   —     —    100%       —         0.0
ALL              98  81%   73%   100%       25%       1.2
```

no-evidence handled correctly 100%; citation accuracy 70%; p50 735 ms.

15 misses: `DIVERSITY_ERROR` 6, `RETRIEVAL_MISS` 6, `RERANK_MISS` 1,
`QUERY_ROUTING_MISS` 2.

**Identical to the last committed run at 268 books** (R@5 81.25%, top-1 72.5%,
on-label 25%). The pipeline did not degrade under 7× growth — a real and
non-obvious result.

### 2.4 Not measured

| | why |
|---|---|
| search ranking (`search:benchmark`) | UNKNOWN — it drives `localhost:3000`, which serves the empty local stack. Not a valid control for this work. |
| latency in production | UNKNOWN — measured here over a laptop→tunnel hop; p50 swings 0.5–1.5 s between identical runs. |
| Ollama path | UNKNOWN — `AI_PROVIDER` is unset in production; Gemini answers everything. |

---

## 3. Failure matrix

Categories from the master brief. Severity: **S1** wrong answer presented as
right · **S2** capability absent · **S3** quality shortfall · **S4** measurement.

| # | Class | Symptom | Root cause | Layer | Evidence | Sev | Fixed |
|---|---|---|---|---|---|---|---|
| 1 | QUERY_UNDERSTANDING | "What is on page 87 of X?" searched page text for the words *page* and *87* | `extractPage()` fed only the citation intent; no retrieval path consumed a page number | query → retrieval | PRODUCTION: `exact_page` retrieval 0%, ctx-rel 13% | S2 | ✅ |
| 2 | QUERY_UNDERSTANDING | "pages 274 to 290" parsed as no page at all | `PAGE_RE` had no range form | query | LOCAL | S2 | ✅ |
| 3 | RETRIEVAL_PRECISION | "រកសៀវភៅអំពីការរុករករ៉ែក្នុងលំហ" (space mining) → "found 5 books" | `WORK_MIN_SIMILARITY = 0.25` admits **10/10** off-topic queries; Gemini's space is not centred at zero | retrieval | PRODUCTION: `calibrate-work-threshold.ts` | **S1** | ✅ |
| 4 | RETRIEVAL_PRECISION | same, after the floor was fixed | the trigram fallback in `namedBookRows` joined the general result pool, not just `resolveTitle` | retrieval | PRODUCTION | **S1** | ✅ |
| 5 | KHMER | An English page had to contain a Khmer particle to be evidence | `queryTerms` has no Khmer stopwords; Khmer runs sort longest-first into `requiredTerms`, applied as a SQL conjunction | evidence | LOCAL + PRODUCTION | S3 | ✅ |
| 6 | KHMER | "ខ្ញុំចង់រៀន action research" → "I couldn't find «ខ្ញុំចង់រៀន action research»" | no lead-strip for a Khmer goal frame or an English noun + Khmer preposition | query | PRODUCTION `--suite km` | S3 | ✅ |
| 7 | KHMER | "តើ X មានប៉ុន្មានប្រភេទ?" → thesis search over a 1-record collection | Khmer puts its interrogative at the END; only the yes/no shape was handled | query | PRODUCTION | S3 | ✅ |
| 8 | INSTITUTIONAL_FACT | "តើបណ្ណាល័យនិយាយអ្វីអំពី\<topic\>?" answered with opening hours | anything mentioning the library routed to `general_library_question` | intent | PRODUCTION | S3 | ✅ |
| 9 | LEARNING_PATH | Every goal question answered with a row of book covers | 9 published paths, 82 steps, and no code path to any of them | all | code inspection + PRODUCTION | S2 | ✅ |
| 10 | LEARNING_PATH | "learning paths for underwater welding" → the MoEYS maths curriculum | first-draft scoring counted any word anywhere; **and the fixture scored it a pass** | retrieval + measurement | PRODUCTION | **S1** | ✅ |
| 11 | KHMER | Garbled Khmer reaching the model as evidence | PDFs whose font has no ToUnicode map extract as correct code points in a meaningless order | data → evidence | PRODUCTION: 9.3% of 10,060 Khmer pages, 41/127 records | **S1** | ✅ (one flavour) |
| 12 | KHMER | A second flavour: syllables split mid-word, runs begin with a dependent vowel | same extraction fault, different font | data | PRODUCTION: 5,671 further pages | **S1** | ❌ open — §5 |
| 13 | RETRIEVAL_RECALL | 80% of extracted books cannot contribute semantic evidence | embedding backfill is manual; extraction is automated | data pipeline | PRODUCTION: 1,360 books | **S1** | ❌ open — §5 |
| 14 | MEASUREMENT | `multi_document` R@5 50%, on-label 25% read as a retrieval defect for three audits | labels written at 268 books; the library now holds the 5th, 6th **and** 8th editions of a labelled work, and the unlabelled editions are correctly retrieved | benchmark | PRODUCTION, §4 | **S4** | documented |
| 15 | MEASUREMENT | Label-free context metrics scored a designated page as 100% irrelevant | `hasSignal` asks whether a RANKER fired; a page fetched by number was never ranked | evaluation | PRODUCTION | S4 | ✅ |
| 16 | MEASUREMENT | A correct refusal counted as an answer | `isRefusal` scanned prose for refusal words | benchmark | PRODUCTION | S4 | ✅ |
| 17 | NO_ANSWER | 1 of 8 unanswerable v1 questions still answered | unchanged from baseline | retrieval | PRODUCTION: 12.5% | S3 | ❌ open |
| 18 | MULTI_DOCUMENT | A synthesis question draws on 3–4 of 10–24 available records | `diversify` walks the PASSAGE ranking, so a record whose best page ranks #12 never enters | evidence | PRODUCTION, §4 | S3 | ❌ open — §5 |

---

## 4. The measurement finding, in full

`multi_document R@5 = 50%` has been reported three times and read as a
retrieval defect twice. It is now mostly a **label artefact**, and this is what
that looks like when you print the evidence instead of the score.

For *"What does the library's literature say about validity?"*, all five
retrieved passages were unlabelled. They were:

```
1. handbook-of-quantitative-methods-for-educational-research   p.46
2. qualitative-inquiry-and-research-design-4th-edition         p.405
3. educational-research-competencies-for-analysis-11th-global  p.6
4. methods-in-educational-research-from-theory-to-practice     p.125
5. research-methods-in-education-6th-edition                   p.152
```

Line 5 is the **6th edition** of a book whose **8th edition** is on the label
list. Same work, same chapter, same subject — scored a miss because only the
8th edition existed when the fixture was written. The label is not wrong about
the library; it is wrong about *today's* library.

**So `multi_document` R@5 and `on-label` must not be used as success criteria
for retrieval work at this corpus size.** The label-free metrics
(`evidenceCoverage`, `irrelevantContextRatio`, `duplicateContextRatio`,
`sourceSpread`, `furnitureDropped`) are the instruments that still mean
something, and they are why this branch changed no ranking weight.

What the same inspection *did* establish, label-free:

```
question                         pool records → shown
validity                              24 → 5
assessment                            18 → 3   (2 slots to one book, 2 to another)
sampling                              10 → 4
classroom                             16 → 4
```

A cross-collection synthesis question draws on 3–4 of 10–24 available sources.
That is a real shortfall (row 18), and fixing it means separating *document
selection* from *passage selection* — see §5.

---

## 5. Open, with evidence

### 5.1 The embedding backfill — **highest impact, needs authorisation**

1,360 books have text and no vectors. Every paraphrase, every concept question
and every Khmer query against an English catalogue depends on the semantic leg,
and for 80% of the extracted collection there is nothing for it to match.

```bash
npx tsx scripts/embed-library.ts --chunks-only     # writes to production, spends Gemini quota
```

Not run here: it is a production write and a metered spend. **Recommended
first action after this branch**, and it should be measured before and after
with `npm run retrieval:benchmark`, which is where the effect will show.

### 5.2 The second flavour of broken Khmer

5,671 pages (56% of the Khmer corpus) carry more runs beginning with a
dependent vowel than 95% of the readable population does. Either a second
extraction fault, or ordinary Khmer this heuristic cannot parse — the
distributions overlap and no threshold separates them. **A Khmer reader needs
to look at a sample.** The signal is computed and printed
(`scripts/audit-khmer-page-text.ts`); nothing is filtered on it.

### 5.3 Multi-document source spread

Document-first selection: rank *records* by topic coverage, take the top K,
then take the best passages from each — the shape `retrieveComparison` already
uses for named works, applied to unnamed synthesis questions. Measure with
`sourceSpread` and the label-free context metrics, never with `on-label`.

### 5.4 `unsupported answer 12.5%` on v1

1 of 8. Unchanged by this branch. The Khmer equivalent went 50% → 0% by fixing
the similarity floor and the fuzzy pool; the remaining English case has a
different cause and has not been diagnosed.

---

## 6. What was verified as still true

From the AI Brain 2.0/2.1 reports, re-checked against `main` rather than
assumed:

| claim | still true? |
|---|---|
| query understanding improved substantially | ✅ routing 100% on every suite |
| named-work resolution improved | ✅ entity resolution 100% (20 questions, v1) |
| ISBN handling exists | ✅ identity path, never falls through to neighbours |
| no-answer correctness improved | ⚠️ 88% on v1, 12.5% unsupported — target is 98% |
| grounding improved | ✅ 100% groundedness, 0 hallucinated citations, LIVE and mock |
| citation parsing had real-model problems | ✅ fixed and holding — 46 grounded / 0 hallucinated across two LIVE runs |
| thinking tokens interacted with output budgets | ✅ fixed and holding — `finishReason = stop` on every live call |
| context quality below target | ⚠️ 74% legacy / 100% under the 2.1 scopes; the legacy number is label-bound |
| multi-document retrieval is the biggest gap | ❌ **not as stated** — see §4 |
| typo/concept correction incomplete | ✅ still true for concepts; typo correction measures 100% precision |
| latency measurements environmentally noisy | ✅ still true |
| fine-tuning justified | ❌ still not. Every defect in this audit is in a parser, a threshold, a pool boundary, a data pipeline, or the instrument. Zero were model reasoning. |

---

## 7. Reproducing this audit

```bash
# All read-only. Point the three Supabase vars at production first.
npx tsx --tsconfig scripts/tsconfig.benchmark.json scripts/ai-answer-benchmark.ts --suite v1
npx tsx --tsconfig scripts/tsconfig.benchmark.json scripts/ai-answer-benchmark.ts --suite v2.1
npx tsx --tsconfig scripts/tsconfig.benchmark.json scripts/ai-answer-benchmark.ts --suite km
npx tsx --tsconfig scripts/tsconfig.benchmark.json scripts/ai-answer-benchmark.ts --suite goal
npx tsx --tsconfig scripts/tsconfig.benchmark.json scripts/retrieval-benchmark.ts --diagnose
npx tsx --tsconfig scripts/tsconfig.benchmark.json scripts/calibrate-work-threshold.ts
npx tsx --tsconfig scripts/tsconfig.benchmark.json scripts/audit-khmer-page-text.ts --sample=20000

# LIVE (bills the provider): ~15k tokens each
npm run ai:answer-benchmark -- --suite all --live-suite smoke --artifact --gate
npm run ai:answer-benchmark -- --suite all --live-suite capabilities
```

Results: `docs/AI-QUALITY-IMPLEMENTATION-2026-09.md`,
`docs/AI-QUALITY-BENCHMARK-2026-09.md`.

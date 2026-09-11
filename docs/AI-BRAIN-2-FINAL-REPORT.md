# AI Brain 2 — Answer Quality: Final Report

**Branch** `feat/ai-brain-answer-quality-2` · **Recorded** 2026-09-11 · Audit: `docs/AI_BRAIN_2_AUDIT.md`

## 1. Executive summary

The assistant now understands what is asked (a question is read into a frame,
a topic and its named entities before anything runs), resolves a named work
exactly (edition-aware, typo-tolerant, ISBN-aware, popularity only as a
tie-break), locates evidence before reading it (a short topic must be present
in full, records are ranked by how much of them is on the topic), assembles
that evidence as passages rather than page fragments, and answers under a
policy that names the kind of claim it is making and refuses in one fixed
sentence when the library falls short.

On the 123-question benchmark that has not been edited, failures went from
**20 to 2**, and the two that remain are the recall-list labels, not the
pipeline (the retrieved book has 50 pages on the topic; the label lists six
others). No-answer correctness went from 63% to 100% with hallucinated
citations still at 0. Five of the original twenty failures were the
benchmark's own mock model, which could not read an author field containing
parentheses; that was repaired first and reported separately so no pipeline
change is credited with it.

The model was never the bottleneck — but the live runs (§7) found the two
defects that the mock benchmark is blind to, and they are almost certainly
what the complaint was about: **Gemini's thinking tokens were being charged
against a 350-token output cap, so most evidence answers were cut off after
one sentence**, and **the grounding parser accepted only one citation form,
so the citations a real model writes were being stripped as "hallucinated"
or never attached**. Both are fixed and pinned by tests. Across five live
runs nothing reached stage F: every answer produced from correct evidence
was correct and cited from it. Fine-tuning is not justified.

## 2. Baseline (2026-09-11, before any change; mock model; live corpus)

```
routing 98% · retrieval 90% · context 70% · grounded 88% · no-answer 63%
hallucinated citations 0 · unwanted templates 3 · failures 20 of 123
tok-in 482 · p50 1.65 s · p95 4.56 s (this environment)
retrieval benchmark: R@5 83% · top-1 70% · multi_document R@5 55% / top-1 20%
```

Corrected-instrument baseline (mock author regex repaired, pipeline
unchanged): grounded 96%, failures 16.

## 3. Final (2026-09-11, all phases; mock model; same corpus, same fixture)

```
routing 100% · retrieval 98% · context 75% · grounded 100% · no-answer 100%
hallucinated citations 0 · unwanted templates 0 · failures 2 of 123
tok-in 600 · p50 1.44 s · p95 4.23 s (this environment)
v2 suite (37 new edge cases): routing 100% · retrieval 93% · grounded 94% · no-answer 100% · failures 1 (typo in a concept)
```

Full tables: `docs/ai-answer-benchmark/baseline.md`; failure matrix:
`docs/ai-answer-benchmark/failure-matrix.md`.

## 4. Delta, per metric

| Metric | Before | After | Δ | Target | Met? |
|---|---|---|---|---|---|
| Routing | 98% | **100%** | +2 pp | ≥ 99% | yes |
| Retrieval correctness | 90% | **98%** | +8 pp | ≥ 95% | yes |
| Top-1 retrieval (retrieval benchmark) | 70% | see §6 | | ≥ 90% | see §6 |
| Top-5 / Recall@5 | 83% | see §6 | | ≥ 97% | see §6 |
| Groundedness | 88% | **100%** | +12 pp (+4 pp after instrument repair) | ≥ 94% | yes |
| Context quality | 70% | **75%** | +5 pp | ≥ 90% | **no** — see §8 |
| No-answer accuracy | 63% | **100%** | +37 pp | ≥ 90% | yes |
| Hallucinated citations | 0 | **0** | — | 0 | yes |
| Citation correctness (live) | — | see §7 | | ≥ 98% | see §7 |
| Unwanted templates | 3 | 0 | −3 | | |
| Failing questions | 20 | 2 | −18 | | |

By stage (v1 fixture):

| Stage | Before | After |
|---|---|---|
| A Query understanding | 5 | 0 |
| B Retrieval | 7 | 2 (label gaps, §8) |
| C Ranking | 0 | 0 |
| D Entity resolution | (counted in B: 6) | 0 |
| E Prompt / context | 5 (all the mock's parser) | 0 |
| F Model reasoning | not assessable | not assessable in mock runs; 0 in the live run (§7) |
| G Citation | 0 | 0 |
| H Hallucination | 0 | 0 |
| I No-answer | 3 | 0 |

No-answer, measured both ways across both suites (160 questions, 12 of
them unanswerable): **UnsupportedAnswerRate 0 / 12** (no unanswerable
question was answered — NoAnswerRecall 12/12); **FalseNoAnswerRate 1 / 148**
(one answerable question refused: `What is validty?`, the misspelt concept —
NoAnswerPrecision 12/13). In the baseline the same two figures were 3/8
unanswerable questions answered and 3/115 answerable questions refused
(`expl-001`, `multi-008`, `def-001`).

## 5. What changed, by phase, with its own before → after

| Phase | Commit | What | v1 failures |
|---|---|---|---|
| Instrument | `test(ai): repair the answer benchmark instrument` | mock author regex; `citedSlugs`; DEGRADED-run detection; `--ids`; p50/p95 | 20 → 16 (grounded 88 → 96) |
| B Query | `fix(ai): read the question by construction` | `lib/ai/query.ts` frames/topic/entities; concept frames route to evidence; FAQ phrasings; frame verbs out of lexical terms | 16 → 12 (routing 100, unwanted 0) |
| C Retrieval / ranking | `fix(ai): resolve the work the reader named, and locate evidence before reading it` | `lib/ai/entity.ts`; entity-first catalogue; ISBN identity; two-phase lexical leg with `requiredTerms` and density; definition/density boosts; concept comparison | 12 → 3 (retrieval 98, no-answer 100, exact_book 100) |
| D Context | `fix(ai): assemble evidence as passages, not fragments` | adjacent-page merge with page ranges; near-duplicate drop; `quoted` vs `hallucinated` | 3 → 2 (hallucinated 1 → 0) |
| E Policy | `fix(ai): improve grounded answer policy` | three kinds of claim; fixed refusal sentence in both languages; page-belongs-to-title rule | mock-invisible; live in §7 |
| Observability + v2 | `feat(ai): named-source questions, embedded ISBNs, and an explainable trace`; `test(ai): AI Answer Benchmark 2.0` | `AssistantResult.trace`; `--matrix`; `--suite`; 37 edge cases; named-source scoping; embedded ISBNs | v2 4 → 2 → 1 |

## 6. Retrieval benchmark (98 labelled questions)

`npm run retrieval:benchmark -- --diagnose`, run 2026-09-11 13:31 UTC+7 after
Phase D (the last clean run — two later re-runs, taken after the retrieval
benchmark learned to count a merged page range, each logged embedding
`fetch failed` lines and are not comparable; the corrected matching can only
raise these numbers, never lower them).

| | Before | After | Δ |
|---|---|---|---|
| Recall@5 (all) | 83% | 84% | +1 pp |
| Top-1 (all) | 70% | 73% | +3 pp |
| single_document top-1 | 87% | **93%** | +6 pp |
| single_document R@5 | 97% | 97% | — |
| multi_document R@5 | 55% | 60% | +5 pp |
| multi_document top-1 | 20% | 20% | — |
| summary | 100% / 100% | 100% / 100% | — |
| khmer R@5 | 80% | 80% | — |
| mixed R@5 | 80% | 80% | — |
| no-evidence handled | 100% | 100% | — |
| citation accuracy | 100% | 100% | — |
| misses | 14 | 13 | −1 |

**The ≥ 90% top-1 and ≥ 97% top-5 targets are not met on this benchmark,
and the reason is the `multi_document` category.** Its labels are the
page-level pages that contain a phrase, in 20 questions, and the memory of
the previous audit records that its misses "were verified correct by
inspection" — newer, more on-topic books outrank the labelled pages. The
answer benchmark, which labels the same questions at the record level,
measures that category at 90% retrieval. `single_document` — the category
where a page label is exact — is at 93% top-1 and 97% recall, which is where
the retrieval changes were aimed. The 8 `RETRIEVAL_MISS` rows are unchanged
from before this phase and are not caused by it.

## 7. Live model evaluation (Phase F)

`npm run ai:answer-benchmark -- --live --suite all --ids …` — 24 questions
chosen across both suites (definition, explanation, concept, multi-document,
comparison ×2, single-document ×2, summary, Khmer ×3, mixed, no-answer ×3,
FAQ, exact book, byline, citation, typo, cross-book synthesis, named-source
citation verification). 16 reach a model (`gemini-3.5-flash`, provider
`gemini`); 8 are answered by templates. Five runs were made, because each
one found something the mock cannot see; the pipeline was fixed between
them and the fixes are pinned by unit tests.

| Run | What it showed | Fix |
|---|---|---|
| 1 | Answers of 49–80 characters ending mid-sentence, `finishReason=length`, usage `{textTokens: 10, reasoningTokens: 336}`: Gemini counts thinking against `maxOutputTokens`, and every evidence question with ≥ 3 passages runs on the reasoning tier (512) inside a 350-token cap. **This is almost certainly the largest single cause of "the answers are still not consistently good".** Also: three of three summaries opened with the refusal sentence — the Phase E rule applied to passages that are a sample by design. | `maxOutputTokens = text + thinking`; summary rider without the refusal rule |
| 2 | Full answers, correctly cited — and grounding could not read them: `*Title (8th Edition)* … (p. 470)` (italics, nested parentheses, bare page after the title in prose). 11 "no citation survived", 6 "hallucinated". | parser: nested parentheses, markup stripped, bare page attributed to the nearest preceding title |
| 3 | Two citations in one bracket `(*A*, pp. 8–9; *B*, p. 35)`, page lists `(p. 108, p. 110)`, a bare page 600 characters after the title, a title shortened to its first words, APA author form `(Creswell, pp. 6–8)`, and Khmer `ទំព័រ 5` with Arabic digits that grounding accepted but the source-attachment scan did not. | parser: split on `;`, lists, whole-answer reach, 3-word prefix, author surnames; sources attached from the verified citations |
| 4 | **44 citations grounded, 0 hallucinated, 0 quoted.** Two answers still cut at text + 1× thinking (the budget is a guide to this model, not a cap). | headroom 2× thinking; `finishReason` recorded in telemetry, trace and the benchmark |
| 5 | Re-run of the 8 questions that had been cut or were closest to it: all 8 `finishReason=stop`, 29 citations grounded, 0 hallucinated, no answer shorter than 570 characters; the only flag is `cmp-005` (below). | — |

Run 4, per metric (the last run of the full 24; two embedding `fetch
failed` lines during it, so it is flagged degraded for retrieval — the
citation and answer figures are unaffected):

```
routing 100% · retrieval 95% · no-answer 100% (3/3 refused, 0 answered)
citations: 44 grounded · 0 hallucinated · 0 quoted  → citation correctness 100% of surviving citations
grounded answers: 13 of 16 model answers carry ≥ 1 verified citation
model calls: 16 · input 951 tokens avg · output 638 avg (thinking included) · 25.4k tokens for the set
model latency p50 16.1 s · p95 26.8 s (thinking tier, laptop → tunnel)
```

The four rows the harness still flags:

- `cmp-005` — the model opens a two-book comparison with the refusal
  sentence because one book's only passage is its title page, then
  compares anyway and says so. The harness reads the sentence as a refusal;
  a reader gets an honest answer. Left as the model's judgement.
- `single-002`, `v2-cmp-001` — cut at text + 1× thinking in run 4; in run 5,
  with the wider cap, both finished (`stop`) at 579 and 817 characters with
  2 and 5 verified citations.
- `v2-typo-003` — the misspelt concept, unchanged.

**No failure in any of the five runs is a reasoning failure.** Every
answer the model produced from correct evidence was correct, on-topic and
cited from that evidence; when something was wrong it was the output cap,
the summary rider, or the citation parser — each of which is now a test.

### Citation correctness, measured

Across runs 3–4 (the two with the widened parser): every citation that
survived grounding named a retrieved title and a retrieved page for that
title, by construction; the reader-visible question is how many *correct*
citations the parser lost, and in run 4 that number was 0 (44 read, 44
verified, 0 removed). The ≥ 98% target is met on this set.

## 8. Remaining failures — and why they remain

1. **`def-012` / `multi-002` — "literature review" (v1).** Retrieved *Social
   Research Methods (4th Edition)* (50 pages contain the phrase) and *Research
   Design (3rd Edition)* (40). The six-slug label was built as a recall list
   and names neither. The answer is better than the label; the label is not
   changed (fixture rule 3). This is the ceiling on the unscoped context
   metric generally: on the 42 unscoped research questions, precision is
   measured against six books per topic when 10–47 books carry it.
2. **`v2-typo-003` — "What is validty?"** Page text has no fuzzy matching and
   the misspelling's embedding sits below the 0.70 chunk floor. The honest
   refusal is the designed outcome; a corpus-vocabulary spell-check before
   retrieval is the fix, and it is out of this phase's scope.
3. **Context quality 75% against a 90% target.** Scoped categories are at
   100%. The gap is entirely on unscoped research questions, and the
   probe in the audit (§6) shows it is largely a label artefact: the
   retrieved-but-unlabelled books discuss the topic. Density ranking moved
   it 70 → 75 honestly; moving it further by ranking would mean preferring
   labelled books over better ones. Widening the v1 labels would move the
   number and is forbidden by the rules this report is written under.
4. **Latency in this environment is not a measurement.** Laptop → Cloudflare
   tunnel → self-hosted Postgres at machine load 14: p50 swung between 0.9 s
   and 3.6 s across runs with pure in-process changes. The lexical leg now
   costs two round-trips instead of one (locate ≈ 260–790 ms, read ≈
   190–570 ms here; single-digit ms on the box). Nothing added a model
   call, an embedding call, or an N+1.

## 9. Cost

| | Before | After |
|---|---|---|
| Estimated input tokens per question, mock, all 123 | 482 | 600 (+24%) |
| Questions answered by a template, no model call | 36% | 37% |
| Live input tokens per model call (16 calls) | — | 951 |
| Live output tokens per model call, thinking included | — | 638 |
| Live total for the 24-question set | — | ≈ 25.4k tokens |

The input rise is the merged passages (a run of adjacent pages may use
twice one passage's budget) and ~40 tokens of policy in the system prompt.
The output figure is dominated by thinking on the reasoning tier, which
every evidence question with ≥ 3 passages uses; before this phase most of
that thinking was spent and the answer then cut, so the reader paid for
tokens they never saw. The repository holds no per-token price table; cost
per request = `total_tokens` from `app_events` × the provider's published
rate for `gemini-3.5-flash` (lib/ai/telemetry.ts documents the SQL).
Nothing in this phase added a model call, an embedding call or an N+1
query; the lexical leg costs one extra round-trip (locate, then read).

## 10. Training decision

**Is fine-tuning justified? No — not yet, and nothing here argues for it.**

Evidence: across 160 questions and two suites, no failure survived
attribution to stage F. Every failure was upstream — query understanding
(5), entity resolution (6), the lexical floor (3), the mock's parser (5),
and label recall (2) — and each was fixed or explained without touching the
model. The live run (§7) put the corrected pipeline's evidence in front of
the real model; the answers it produced were grounded in and cited from
that evidence. The precondition in the benchmark's own rules ("a `--live`
run produces failures that survive classification as F") is not met.

## 11. Recommended next phase

- **Labels for unscoped topics as page-count lists** (a generator that lists
  every book above a page-count threshold, not the first six), so context
  precision measures ranking rather than label recall.
- **A corpus-vocabulary spell-check** ahead of retrieval for concept terms.
- **A larger live set on a schedule** (`--live --suite all`, weekly), with
  the trace persisted for failing rows only, so F can be watched over time.
- **Khmer-content retrieval**: the semantic leg crosses languages weakly;
  measure it before deciding whether it is a model or an OCR problem.

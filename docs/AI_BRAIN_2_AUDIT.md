# AI Brain 2 — Answer Quality Audit (Phase A)

**Branch** `feat/ai-brain-answer-quality-2` · **Recorded** 2026-09-11 · **No code changed in this phase.**

This is the forensic read of the whole answer pipeline before any of it is
touched, with the baseline frozen and every failing benchmark question
attributed to a stage. The complaint it answers is "the AI answers are still
not consistently good". The finding is that the model is not the bottleneck:
every failure the instrument can see is upstream of it — query understanding,
entity resolution, the lexical evidence floor, and the benchmark instrument
itself.

---

## 1. Architecture — what a question passes through

```
question
  │  app/api/ai (canonical) · /api/ask (legacy adapter) · /api/chat (adapter, no caller)
  ▼
lib/ai/router.ts  runAssistant / streamAssistant
  │  compressConversation → classifyIntent (lib/ai/intent.ts, pure)
  ▼
retrieveFor(intent)                      lib/ai/router.ts
  │  faq → getLibraryFact               (settings + lib/library-info)
  │  book/thesis/post_search → searchWorks   keyword pool → rankWorks (lib/ai/work-ranking.ts)
  │  author_search → searchAuthors      directory hub, else findWorkByTitle
  │  pdf_question (unscoped) / general_knowledge → searchPassages → retrieveEvidence(hybrid)
  │  pdf_question (scoped) → retrieveEvidence(scoped, SQL-filtered)
  │  resource_summary → retrieveEvidence(summary) + samplePages fallback
  │  document_compare → findRecordByTitle ×2 → retrieveComparison (per-doc scope, balanced)
  │  citation → getCitationSource (catalogue fields, never a model)
  ▼
retrieveEvidence()                       lib/ai/retrieval.ts
  │  lexicalPages (book_pages ilike, scored by lexicalScore, floor minLexicalScore)
  │  ∥ embedQuery → semanticChunks (match_book_chunks / match_record_chunks, cosine ≥ 0.70)
  │  fuseEvidence (RRF) → diversify(perResource) | spreadPages (summary)
  ▼
deterministicAnswer()                    lib/ai/plan.ts — template, or undefined
  ▼
buildGeneration()                        lib/ai/plan.ts → buildSystemPrompt (prompts.ts) + buildContext (context.ts)
  ▼
generateText / streamText                provider.ts (Gemini | Ollama | mock)
  ▼
enforceGrounding()                       lib/ai/guardrails.ts — deletes any (Title, p. N) not in the retrieval set
usedSources() → attachReferences()       lib/ai/citations.ts, citation-source.ts
  ▼
AIResponse { answer, sources, results }  + AITelemetry → app_events (lib/ai/telemetry.ts)
```

### 1.1 AI entry points (complete inventory)

| Surface | File | Model? | Notes |
|---|---|---|---|
| `POST /api/ai` | `app/api/ai/route.ts` | yes | canonical; auth + cooldown + quota, then `runAssistant`/`streamAssistant` |
| `POST /api/ask` | `app/api/ask/route.ts` | yes | legacy `{answer, books, remaining}` adapter over the same core |
| `POST /api/chat` | `app/api/chat/route.ts` | yes | AI-SDK stream adapter; `FloatingChat` is imported by nothing |
| `GET /api/search` | `app/api/search/route.ts` | summary only | public hybrid search + optional Gemini summary; shares embedder/limits |
| `/api/search/native` | — | no | the `/search` page; **not** the AI path, but the same `book_pages` table |
| `/api/recommendations` | — | no | deterministic |
| `app/actions/ai-extraction.ts` | — | Gemini Vision | metadata drafting at upload; not an answer path |
| `scripts/ai-answer-benchmark.ts` | — | mock by default | drives the real `runAssistant` |

Everything AI lives in `lib/ai/*`; the routes hold admission and telemetry only.
The provider decision (`lib/ai/provider.ts`) is orthogonal to answer quality
and is not touched by this phase.

## 2. Query understanding — what the code actually does

`classifyIntent()` (`lib/ai/intent.ts`, 771 lines, pure) is an ordered chain
of keyword tables matched at a left word boundary:

1. academic misuse → `unsupported`
2. greeting → smalltalk template
3. `FAQ_TOPICS` (hours, location, contact, …) → `faq`
4. `CITATION_WORDS` → `citation`
5. `COMPARE_WORDS` + two extractable targets → `document_compare`
6. context-bound (a slug from the page): summary / related / detail / pdf words / deictic "this book … says" → `pdf_question` or `resource_summary`
7. `SUMMARY_WORDS` → `resource_summary`
8. page ref, `PDF_WORDS`, `LITERATURE_WORDS` → `pdf_question`
9. `SUBJECT_WORDS` / `AUTHOR_WORDS` → hubs
10. `THESIS_WORDS` → `thesis_search`; `POST_WORDS`; `BOOK_WORDS` → `book_search`
11. `SEARCH_WORDS` → `book_search`; `LIBRARY_WORDS` → `general_library_question`
12. everything else → `general_knowledge` (which the router then treats as an evidence-first hybrid retrieval)

`extractQuery()` strips lead scaffolding by regex (`LEAD_STRIP`, `LITERATURE_LEAD_STRIP`, Khmer deictic frame) and unwraps quotes. There is **no structured query object**: the intent, the topic string, quoted titles, compare targets and page number are separate fields on `IntentResult`, and no stage records *why* it decided what it decided.

**Measured defects (probe against the live corpus, 2026-09-11):**

| Question | What happened | Why |
|---|---|---|
| `What is action research?` | → `thesis_search`, template refusal | "action research" is in `THESIS_WORDS`; no definition frame exists, so a bare "what is X" is classified by whichever collection word X happens to contain |
| `Explain ethics as the library's books describe it.` | → `pdf_question`, **0 passages**, template refusal | the frame is not stripped: query = the whole sentence, `queryTerms` = `[describe, explain, library, ethics]`, floor = 3 of 4 → a page about ethics must also say "describe", "explain" and "library" |
| `Across the library's books, how is scaffolding handled?` | 0 passages | `LITERATURE_LEAD_STRIP` matches "across the library" but not "across the library's books,"; query becomes `'s books, how is scaffolding handled`, terms `[scaffolding, handled]`, both required |
| `Where is the PTEC library located?` | → `general_library_question` | `FAQ_TOPICS.location` has "where is the library" but the word "PTEC" sits in between; "located" is absent |
| `How do I become a member?` | → `general_knowledge`, answered from a random page | `membership` table lacks "become a member" |
| `What is validity?` | routed correctly, but the lexical phrase is `what is validity` and the embedding is of the question, not the concept | `LEAD_STRIP` never strips "what is" |

Root cause, stated once: **the topic of a question is derived by subtraction
(regexes that remove known frames) rather than by construction**, so every
frame the regexes do not know pollutes both retrieval legs — the lexical floor
counts frame words as required terms, and the embedding is of the sentence
rather than the concept.

## 3. Entity resolution — titles, authors, ISBNs

There are **three** title resolvers with three different rules:

| Function | Used by | Rule |
|---|---|---|
| `searchWorks()` → `keywordBooks()` + `rankWorks()` | `book_search` | `.or(title/description ilike %token%)` over `filterTokens()`, pool = top 30 **by download_count**, then `workScore` bands (exact 1 / prefix 0.95 / contains 0.9 / coverage ≤ 0.85) |
| `findRecordByTitle()` | compare, summary, citation | `ilike %w1%w2%…%` (words in order), first of 5 rows by download_count whose normalized title contains the query **or vice versa** |
| `findWorkByTitle()` | `author_search` fallback | same pattern, normalized-contains only |

Measured against the live corpus for the ten `exact_book` questions:

- `Interviewing as Qualitative Research (3rd Edition)` — `sanitizeFilterTerm()` strips the parentheses, so the whole-phrase clause `%Interviewing as Qualitative Research 3rd Edition%` **cannot match the stored title**; the remaining single-token clauses (`Interviewing`, `Qualitative`, `Research`) return the 30 most-downloaded books sharing a word, and the named book is not among them. Every edition-suffixed title fails this way.
- `Handbook of Methodological Approaches to Community-Based Research` — resolvable by `findRecordByTitle` (probe: correct), unreachable through `searchWorks` on the previous corpus snapshot because the OR pool of 30 by downloads filled up with "Research"/"Approaches" books.
- `Who wrote "English for Writing Research Papers"?` — the exact title exists (1st edition); `findWorkByTitle` returns the **2nd edition** because it is more downloaded and "contains" the query. Exact normalized equality is never preferred over containment.

There is no ISBN handling in the assistant at all (`/api/search/native` has it via `normalizeIsbn`). No typo tolerance either (`lib/search/normalize.ts` has `boundedEditDistance`; the assistant does not use it).

Root cause: **the catalogue lookup builds a popularity-ordered token pool and hopes the named title is inside it.** `findRecordByTitle` already has the right shape (ordered-word pattern + normalized confirmation) and resolves all four probe titles; it is simply not on the `book_search`/`author_search` path, and it lacks the exact > prefix > contains ordering.

## 4. Retrieval — the real pipeline

`retrieveEvidence()` is **hybrid and single-stage**: one lexical query and one vector RPC, in parallel, fused by reciprocal rank, then diversified. There is no reranker. Facts that matter:

- **Lexical leg** (`lexicalPages`): `book_pages … .or(content.ilike.%phrase%, content.ilike.%term%…) .limit(candidates × 6)` with **no ORDER BY**. Postgres returns whichever 108 matching rows it reaches first, so for a term on thousands of pages ("research", "assessment") the candidate pool is arbitrary and biased to physically-early records. Rows are then scored (`lexicalScore`: +10 whole phrase, +1 per term) and cut at `minLexicalScore` — a *majority* of terms.
- **Semantic leg**: 18 nearest chunks with cosine ≥ 0.70 (calibrated; see `CHUNK_MIN_SIMILARITY`). Skipped when the scoped record has no chunks (`readiness.ts` counts rows).
- **Fusion**: RRF, identity `(record, page)`; a page found by both legs leads. Verbatim window kept over chunk boundary.
- **Diversity**: `hybrid` = 5 passages, ≤ 2 per record; `scoped` = 4 from one record; `summary` = 5 spread; `multi_document` = 3 per side.
- **Readiness**: 268 published books, 249 with pages, 249 with chunks (baseline header). The semantic leg is unavailable for ~7% of the collection.

**Measured defects:**

| Question | Leg | What was admitted |
|---|---|---|
| `byzantine fault tolerance` (no_answer) | lexical | one page containing "fault" and "tolerance" — 2 of 3 terms clears the majority floor while "byzantine" appears nowhere |
| `cryptocurrency mining rigs` | lexical | a page on phenomenological studies ("mining"/"rigs" incidental) |
| `aortic valve replacement` | lexical | an operations-research page on heart-valve production planning |
| `quantum chromodynamics`, `zebrafish cardiac regeneration` | — | correctly nothing (0 lexical, 0 semantic) |
| `reflective practice` (multi-005) | both | 4 lexical + 18 semantic candidates; the 5 chosen are 4 semantic (0.73–0.75) and 1 exact; none from the 3 labelled books — the arbitrary lexical pool never reached them |

The semantic floor is doing its job (0 of 5 no-answer subjects admitted a chunk). **Every no-answer leak is the lexical majority floor**, which lets two ordinary words outvote the one word that made the question that question.

The benchmark run at 12:13 also showed a second-order hazard: the embedding provider returned `fetch failed` for ~25 consecutive questions and the run **completed with exit 0 and a plausible-looking table** (retrieval 72%, definition 33%). Nothing in the instrument distinguished a degraded run from a real regression. A run can silently measure a different pipeline than the one under test.

## 5. Ranking

Two ranking models, neither explainable as a sum of signals:

- Catalogue: `workScore` bands (title match) + popularity tie-break. No author/ISBN/edition awareness beyond a 0.1 author bonus.
- Evidence: RRF over two rank lists; the lexical list is ordered by `lexicalScore`, the semantic by cosine. There is no signal for **which record is a strong source for the topic** (a book with 40 pages on validity versus one with 1), no definition/intent signal (a page that *defines* the term versus one that mentions it), and no duplicate penalty beyond `(record, page)` identity.

## 6. Context assembly

`buildContext()` renders `[i] "Title" (Author), p. N: text` lines, evidence first, then works, then facts, under a per-mode token budget (`EVIDENCE_LIMITS[mode].budgetTokens`, 900–1,800). Each passage is clamped to `MAX_PASSAGE_TOKENS` = 130 (~400 Latin chars). Lexical snippets are a 300-char window around the match (`makeSnippet(content, focus, 150)`); semantic chunks are the first 600 chars of the chunk. Facts of the assembled prompt:

- **Adjacent pages are not merged.** A scoped question on grounded theory returned pp. 44, 45, 46, 47 of one handbook as four separate 170–320-char fragments — four citations for what is one passage.
- **Near-duplicate text is not detected** (only exact `(record, page)` identity). Running headers and repeated chapter summaries can occupy two slots.
- Metadata in the prompt is title/author/page only. Record type, record id, chunk id, match type and score exist on `RetrievedEvidence` but are not recorded anywhere a debugger can see per request.
- Ordering is fused rank, which is correct; the budget is enforced (passages drop from the tail).

Context precision measures 70% overall, but 100% on every scoped category and 45–58% on the unscoped research categories, whose labels are *recall lists* of six books per topic. Some of that 30% is a label artefact (the probe for "validity" retrieved *Handbook of Quantitative Methods for Educational Research* p.46, which plainly discusses validity and is simply unlabelled). Some is real: with an arbitrary lexical pool and no source-strength signal, a book with a single incidental page can occupy a slot that a book with a chapter on the topic should have.

## 7. Answer policy / prompt

`buildSystemPrompt()` = ~70-token base (answer only from LIBRARY DATA; never invent title/author/page/DOI/URL; say so plainly when the data lacks the answer; language; no homework) + a per-intent rider + a length rider. Evidence travels in a **user-role** fenced block after `defangCorpusText()` — correct, and this phase keeps it.

What the policy does **not** say:

- the distinction between *the library holds X* (a catalogue fact), *X discusses Y* (a passage exists), and *X says "…"* (a quotation) — the three claims a reader most often confuses;
- that a reference to a page must be one the passages show *for that title* (grounding enforces it after the fact, but the prompt does not ask for it);
- the exact no-answer sentence to use when evidence is thin, so refusals vary in wording and are harder to detect;
- for `book_search`, that an exact-title hit means "yes, we have it" — the template says "I found 5 books related to “X”" even when X is the first card.

## 8. Citations

Built from retrieval, never parsed from prose: `buildSources()` → `enforceGrounding()` (deletes any `(Title, p. N)` whose title+page the retrieval set does not contain, tolerant of shortened titles) → `usedSources()`. Hallucinated citations: **0** in every recorded run. This phase must preserve that and it will: merging adjacent pages only *widens* the set of pages a citation may name for a passage that was actually retrieved.

## 9. The instrument

`scripts/ai-answer-benchmark.ts` + `lib/ai/mock-model.ts`. Three defects found while attributing failures:

1. **The mock cannot read an author containing parentheses.** `PASSAGE_RE` uses `\(([^)]*)\)` for the author, so `(Leonard A. Jason, David S. Glenwick (Editors))` and `(Department for Education and Skills (DfES), United Kingdom)` fail to parse, the mock sees zero passages, and answers "I could not find evidence". All **five E — PROMPT failures** in the baseline (single-002, single-009, sum-002, sum-003, mix-002) are this: 4–5 correct passages at 100% context precision, and a parser that could not read the author field. A real model would have answered. The attribution "evidence reached the prompt and the answer still refused" is true of the mock and false of the pipeline.
2. **`citedSlugs` is always empty** — `Source` has no `slug` field, so the diagnostic trace prints "(none cited)" for every generated answer.
3. **A degraded run is indistinguishable from a regression** (§4).

## 10. Failure mapping — baseline, 20 of 123

| Stage | n | Questions | Root cause (verified) |
|---|---|---|---|
| **B** Retrieval / entity | 7 | exact-003, -005, -006, -008, -009; fact-009; multi-005 | phrase clause broken by stripped parentheses; popularity-capped OR pool; contains-before-exact; arbitrary lexical pool |
| **A** Query understanding | 5 | def-001, expl-001, multi-008, faq-002, faq-006 | no definition frame; two unstripped explanation frames; two FAQ phrasings |
| **E** Prompt | 5 | single-002, single-009, sum-002, sum-003, mix-002 | **instrument** — mock author regex (§9.1). Pipeline correct. |
| **I** No-answer | 3 | none-003, -005, -006 | lexical majority floor admits 2-of-3 ordinary words |
| **F** Model | 0 | — | not assessable under the mock; no live run exists yet |

Plus 3 *unwanted templates* (def-001, expl-001, multi-008 — all in A above) and the 30-point context-precision gap on unscoped research questions (§6).

## 11. Frozen baseline (this branch, live corpus, 2026-09-11 12:18 UTC+7)

`npm run ai:answer-benchmark -- --diagnose` · mock model · 123 questions · results file `scripts/ai-answer-benchmark/results/2026-09-11T12-18-05-176Z.json`

```
category         n   routing  retrieval  context  grounded  no-ans  template  unwanted  halluc  ev   tok-in
-----------------------------------------------------------------------------------------------------------
factual_lookup   10  100%     90%        90%      —         —       100%      0         0       0.0  0
exact_book       10  100%     50%        10%      —         —       100%      0         0       0.0  0
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
ALL              123 98%      90%        70%      88%       63%     36%       3         0       2.8  482
```

Identical to the committed `docs/ai-answer-benchmark/baseline.md` except `exact_book` retrieval 40% → 50% (overall 89% → 90%): one more exact title now falls inside the popularity-capped pool because download counts moved. That drift is itself evidence for §3 — the answer to "do you have this book" should not depend on how often other books were downloaded this week.

Latency in this environment (laptop → self-hosted DB over the tunnel, machine load 14): p50 1.65 s, p95 4.56 s, tok-in 482. The committed ~0.9 s p50 was measured on a quieter machine; only *relative* movement within this phase is meaningful.

Companion — `npm run retrieval:benchmark -- --diagnose`, same corpus, same day (`scripts/retrieval-benchmark/results/2026-09-11T12-22-32-048Z.json`):

```
category         n   R@5   R@10  top1  isolation  answered  spread  ev
single_document  30  97%   97%   87%   100%       100%      1.0     3.5
multi_document   20  55%   55%   20%   —          100%      3.7     5.0
summary          10  100%  100%  100%  100%       100%      1.0     4.0
khmer            10  80%   80%   80%   100%       80%       0.8     4.0
mixed            10  80%   80%   80%   100%       80%       0.8     3.1
no_evidence      8   —     —     —     100%       0%        0.0     0.0
ALL              98  83%   83%   70%   100%       78%       1.3     3.2
```

14 misses: 7 `RETRIEVAL_MISS` (both legs had the data, neither matched), 5 `DIVERSITY_ERROR` (found, then evicted by the per-record cap), 2 `QUERY_ROUTING_MISS`. No-evidence 100%, citation 100%. `multi_document` top-1 at 20% is the same arbitrary-pool problem as §4, seen from the page side.

## 12. Top root causes, ranked by questions affected

1. **Topic extraction by subtraction** (A: 5 questions + the unwanted templates + the pollution of both legs on every framed question). Fix: a structured `AiQuery` built by construction — frame classification (definition / explanation / evidence / availability / author / comparison / summary), quoted-title and author candidates, and a topic that excludes frame vocabulary — feeding both the lexical terms and the embedding.
2. **No exact-entity resolution on the catalogue path** (B: 6 questions). Fix: one title resolver with the ordering exact > normalized exact > edition-stripped exact > prefix > contains > fuzzy, consulted *before* the token pool on `book_search`/`author_search`, punctuation-tolerant, popularity only as a tie-break.
3. **Lexical majority floor** (I: 3 questions). Fix: for topics of ≤ 3 content terms require all of them (or the phrase); the phrase bonus still lets an exact phrase win outright.
4. **Arbitrary lexical candidate pool with no source-strength signal** (multi-005 and the 30-point context gap). Fix: locate matching pages first (ids only, phrase-or-all-terms), rank records by how many pages match, then fetch text for the strongest candidates; make record strength a ranking signal.
5. **Fragmented context** (§6). Fix: merge adjacent pages of one record into one passage with a page range; drop near-duplicate text; keep evidence-first order and the budget.
6. **Instrument defects** (§9). Fix first, and report the corrected baseline separately so no pipeline change is credited with the mock's repair.

## 13. What this audit does not conclude

- That the model is fine. It has not been observed: `F` is not assessable until a `--live` run exists. Phase F will run one on a small set, after the upstream fixes, and only failures that survive with correct retrieval, context and prompt count as model failures.
- That the 30% context-precision gap is all real. Part of it is a recall-list label; the final report will separate "unlabelled but on-topic" from "off-topic" by inspection of the retrieved titles rather than by moving labels.

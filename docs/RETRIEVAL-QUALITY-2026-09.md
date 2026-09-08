# Retrieval quality & performance at 270 books — 2026-09-08

The collection grew from 215 to 270 published books. The question this audit
answers is not "does retrieval work" but "does it stay accurate, fresh and
grounded as the library grows". Everything below is measured against
production (`https://library.ptec.edu.kh`, self-hosted Supabase). No number
here is an estimate.

## TL;DR

Three findings, in order of what they cost the reader:

1. **72 of 270 books (27%) are invisible to semantic retrieval** — 51 of them
   have extracted page text and no embeddings. This is a coverage gap, not a
   ranking one, and nothing in the system closes it automatically.
2. **The scoped-retrieval relevance floor was inert**, so "ask this book"
   returned four passages for any question, including ones the book cannot
   answer. Fixed and measured: no-evidence correctness 0% → 100%.
3. **Search did not regress.** The apparent regression was stale labels plus a
   benchmark that reported Recall@10 over a four-row list.

## 1. Current collection

From `scripts/audit-retrieval-snapshot.ts` (read-only), 2026-09-08:

| | count |
|---|---:|
| published books | 270 |
| with extracted page text (`book_pages`) | 248 |
| with embedded chunks (`book_chunks`) | **198** |
| `books.embedding` populated | 215 |
| stale index (digest mismatch) | **0** |
| `no_text_layer` (image-only scans) | 19 |
| `failed` (permanent) | 2 |
| `never_attempted` | **0** |
| `book_pages` rows | 57,779 |
| `book_chunks` rows | 111,415 |
| books created in the last 30 days | 270 |

Extraction is healthy: 0 never-attempted, 0 stale. That is a real improvement
— the same view reported 203 never-attempted a few days earlier.

### The coverage gap

**51 books have page text and no chunks.** They are full-text searchable and
invisible to the semantic leg. Combined with the 22 that have no text at all,
72 books cannot contribute semantic evidence.

The cause is structural, not a bug. Extraction is automated — the hourly
`/api/cron/index-reconcile` drains the backlog. Embedding deliberately is not:
the reconciler documents that it "does NOT embed" because embedding spends a
metered per-day quota and chaining them means one quota stop aborts extraction
that would have succeeded. That reasoning is sound, but it leaves no closing
step: a book extracted by the cron is embedded only when a human remembers to
run `scripts/embed-library.ts`. Books extracted at upload time chain their own
embedding; books extracted by the reconciler never do.

Two consequences worth separating:

- The reader is not given a wrong answer. `lib/ai/readiness.ts` counts
  `book_pages` / `book_chunks` rows rather than trusting the cached numbers in
  `resource_index_state`, so an unembedded record reports `semanticReady:
  false` and the semantic leg is skipped rather than allowed to fail. The
  degradation is to lexical-only, which is honest.
- `resource_index_state.chunks` has drifted badly — it sums to 175 across the
  whole collection while `book_chunks` holds 111,415 rows. Nothing reads it for
  a decision that matters, but it cannot be trusted for reporting.

**Remediation (needs a decision, not a patch):** `npx tsx
scripts/embed-library.ts --chunks-only` embeds records that have no chunks. It
spends Gemini quota and the free tier has a per-day cap, so a 51-book backlog
is expected to stop partway and resume. This was NOT run as part of this audit:
it is a write to production against a metered quota.

The systemic fix is to give the reconciler an embedding counterpart on its own
schedule — same claim-and-batch shape, separate budget — so the gap cannot
reopen. That is deliberately left as a proposal.

## 2. Search — `/api/search/native`

90 labelled queries, black-box HTTP against production.

| | R@1 | R@5 | R@10 | MRR | zero | p50 | p95 |
|---|---:|---:|---:|---:|---:|---:|---:|
| baseline (2026-09-04, 215 books) | 95% | 100% | 100% | 0.97 | 0% | — | 6.8s |
| 270 books, stale labels | 91% | 98% | 98% | 0.94 | 0% | 611ms | 801ms |
| **270 books, refreshed labels (`--depth`)** | **99%** | **100%** | **100%** | **0.99** | **0%** | **188ms** | **723ms** |
| 270 books, refreshed labels (blended) | 99% | 100% | 100% | 0.99 | 0% | 824ms | 1588ms |

The gate (R@1 ≥ 96%, R@5 = 100%, MRR ≥ 0.97, zero = 0%) is met.

### Why the middle row is not a regression

Two separate defects, neither in the ranker:

**The benchmark could not measure what it reported.** The blended view returns
`PAGE_SIZE_ALL = 4` rows per type while `counts` reports the whole pool —
`ទស្សនវិជ្ជា` reports 18 and returns 4. Ranks 5–10 were unrepresentable, so
every "Recall@10" this suite has printed was a Recall@4. `--depth` requests the
type-scoped page (10 rows), which is what a visitor sees on that type's tab.

**The labels aged out.** A subject query's answer is a set, and the set is a
property of the collection. Inspecting all twelve: every #1 result is genuinely
on subject, usually more so than the label. `ទស្សនវិជ្ជា` returned a philosophy
glossary, grade-11 philosophy lessons and the Dao De Jing; the labels named a
book on Buddhism and the environment — which was still retrieved, at #9.

`scripts/refresh-subject-labels.ts` rebuilds them from database facts (the
book's own title carries the term, or it is filed under that category), never
from what the ranker returned — which would grade the ranker against itself.
Tags are excluded: "qualitative research" as a tag on a general methods
textbook made that textbook a correct answer, inflating the set until the query
could not fail.

### A product observation

The type-scoped branch returns `pageHits: []`. Clicking the "Books" tab drops
every "found inside" full-text hit, even though those hits are books. Not
changed here — it is a design question, not a defect — but it is why `pdf_text`
is never scoped under `--depth`.

## 3. AI retrieval — evidence quality

98 labelled questions, `retrieveEvidence` called directly.

| | before | after |
|---|---:|---:|
| Recall@5 | 80% | **83%** |
| top-1 evidence | 53% | **66%** |
| single_document R@5 | 83% | **97%** |
| single_document top-1 | 33% | **77%** |
| scope isolation | 90% | **100%** |
| **no-evidence correctness** | **0%** | **100%** |
| citation accuracy | 100% | 100% |
| p95 | 1855ms | **1059ms** |

### The defect: an inert relevance floor

`CHUNK_MIN_SIMILARITY` was 0.3. Gemini's embedding space is not centred at
zero, so that admits everything. Measured (`scripts/calibrate-chunk-threshold.ts`,
29 verified scoped questions vs 3 subjects the library does not hold):

| top-1 similarity | min | p05 | median | max |
|---|---:|---:|---:|---:|
| on-topic | 0.684 | 0.698 | 0.753 | 0.826 |
| off-topic | 0.611 | 0.616 | 0.662 | 0.704 |

At 0.3, 29/29 off-topic questions were admitted. "What does the book say about
zebrafish cardiac regeneration protocols?" returned four pages of a
research-methods textbook — the raw material a confident wrong answer is
written from.

**0.70** is the measured knee, confirmed twice: by the distribution above, and
by sweeping the constant through the whole benchmark.

| threshold | R@5 | top-1 | no-evidence | single_doc R@5 | multi_doc R@5 |
|---:|---:|---:|---:|---:|---:|
| 0.30 | 80% | 53% | 0% | 83% | 55% |
| 0.66 | 80% | 64% | 100% | 90% | 55% |
| 0.68 | 79% | 65% | 100% | 87% | 55% |
| **0.70** | **83%** | **66%** | **100%** | **97%** | 55% |
| 0.72 | 80% | 70% | 100% | 97% | 45% |

Recall rising while a filter tightens is not a paradox: the noise was occupying
the fused pool and the per-record cap, so `DIVERSITY_ERROR` misses fell 9 → 5.

The distributions overlap (on-topic min 0.684 < off-topic max 0.704), so this
is a trade: two weak on-topic semantic hits are lost, both of which still have
the lexical leg. The value is a property of the embedding model — re-measure it
if the provider changes, do not carry it over.

### Failure breakdown (14 misses, `--diagnose`)

| class | n | where |
|---|---:|---|
| `RETRIEVAL_MISS` | 7 | 5 multi_document, 2 mixed |
| `DIVERSITY_ERROR` | 5 | 4 multi_document, 1 single_document |
| `QUERY_ROUTING_MISS` | 2 | khmer |

No `EMBEDDING_MISS` or `PAGE_INDEX_MISS` appears — the labelled corpus is drawn
from the older, fully-embedded books. **That is exactly why the coverage gap in
§1 must be read separately: this benchmark measures retrieval quality on
covered books and says nothing about the 27% that are not covered.**

### multi_document 55% is not a defect measurement

Nine of the fourteen misses are multi_document, and its candidate pool is the
smallest of any retrieving mode (10). That hypothesis was tested and **rejected**:
sweeping candidates 10 → 16 → 24 → 32 changed the score by zero. The change was
reverted.

Inspecting the misses instead: "what does the library's literature say about
interviews?" returned Research Methods in Education 6th ed., Qualitative Inquiry
and Research Design 4th ed. and Research Methods in Education 5th ed. — three
books that plainly discuss interviews. Only the 8th edition was labelled. Same
for data analysis (NVivo), literature review, validity.

These are recall lists built at 215 books and they are incomplete at 270. A
relabelling pass was written and **discarded**: deriving "records with ≥3 pages
containing the topic" expanded "assessment" to 93 of 270 records, which would
have made the questions unfailable and the improvement an artifact. Fixing this
honestly needs human labelling, or a metric that scores sufficiency ("did it
return N genuinely on-topic sources?") rather than exact-set recall. **Until
then, multi_document R@5 should not be read as a retrieval defect.**

## 4. AI routing and cost

`npm run ai:benchmark` — 106 questions, offline and deterministic.

| | value |
|---|---:|
| answered with **zero model calls** | 90 / 106 |
| reasoning tier | 11 |
| model calls, total | 16 (was 193 pre-2.0) |
| avg input tokens | 78.6 (was 2242.8) |
| avg total tokens | 155.7 (was 2942.8) |
| retrieval cache hits | 26.1% of requests |
| local pipeline p95 | 0.9 ms |

Routing is correct by inspection: `book_search`, `faq`, `thesis_search`,
`author_search`, `subject_search`, `related_books` and `citation` all resolve
to 0 model calls; `pdf_question` (11/12) and `general_knowledge` (5/5) reach a
model, which is the right split.

## 5. Performance

Production, client-measured wall clock.

| | p50 | p95 |
|---|---:|---:|
| search (`--depth`) | 188ms | 723ms |
| search (blended) | 824ms | 1588ms |
| retrieval (evidence) | 826ms | 1059ms |

Targets (p50 < 1.5s, p95 < 3s search; retrieval p95 < 2s) are met with room.

**The slow subject query is gone.** The 2026-09-04 baseline recorded a p95 of
6.8s; it is now 723ms — a −5.7s improvement that predates this work. Subject
queries retain the highest p95 in the set (~1.1s) but no longer approach the
budget, so no optimisation was made: there is no bottleneck left to justify one.

## 6. Security

- Both chunk-matching RPCs (`match_book_chunks`, `match_record_chunks`) join
  their parent on `is_published` and guard with
  `coalesce(b.id, r.id, p.id) is not null`, so an unpublished record cannot
  become retrievable because its embedding exists.
- Both are `revoke execute … from public, anon, authenticated` and granted only
  to `service_role`.
- Scope isolation measured **100%** over scoped questions (was 90%): the
  threshold fix removed the only leaking case.
- Scope is a retrieval input (`match_record_chunks` filters inside the ANN
  candidate CTE), not a model instruction, so it cannot be argued away by
  prompt content.

## 7. What this audit did not cover

Stated rather than implied:

- **The benchmark corpora were not expanded to 250+ cases.** They remain 90
  search queries and 98 retrieval questions. Both were verified to still
  resolve against the 270-book collection (0 missing slugs). Expanding them
  honestly requires human labelling against real page text; generating labels
  with a model would make every subsequent number unfalsifiable.
- **Khmer and cross-language retrieval were not separately benchmarked** beyond
  the existing `khmer` (10) and `mixed` (10) categories, both at 80%. The two
  `khmer` misses are `QUERY_ROUTING_MISS` — the mode chosen retrieves nothing —
  which is a routing question, not a Khmer-embedding question.
- **No lexical-only / vector-only A/B** was run; only the fused path was
  measured across five threshold settings.
- **Chunk quality was not sampled** for header/footer pollution or boundary
  errors. No measurement implicated chunking, so it was not opened.
- **`npm run test:e2e` and `npm run build` were not run.** Unit tests (3959
  passed), `tsc` and `lint` (0 errors) were. The two `tsc` errors present are
  pre-existing and local: `@vercel/analytics` and `@vercel/speed-insights` are
  in `package.json` but absent from this machine's `node_modules`.
- **No freshness SLO is claimed.** The measured reality is that extraction is
  hourly and automatic while embedding is manual and unbounded, so a
  time-to-AI-ready SLO would be a fiction until §1's remediation lands.

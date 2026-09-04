# Research Retrieval & Grounded Answers

How the assistant finds evidence, what it is allowed to say about it, and what
it costs. The search side (ranking, facets, the public search page) is
`docs/search-ranking.md`; the request pipeline and cost controls are
`docs/AI_ASSISTANT_ARCHITECTURE.md`. This document covers the layer between
them.

The order is fixed and the whole design rests on it:

> Search finds the evidence. Retrieval selects the evidence. The model explains
> the evidence. Citations prove it.

## The evidence layer

`lib/ai/evidence.ts` (pure) defines what evidence IS and how a candidate pool
becomes the few passages a model may see. `lib/ai/retrieval.ts` fetches it.

```
question (+ scope) ──┬── lexical: book_pages ilike ──┐
                     └── semantic: pgvector chunks ──┤
                                                     ├─ fuse (RRF) ─ diversify ─ evidence
                                                     ┘
```

**Both legs are evidence.** Before this, the AI path was vector-only: a
question quoting a phrase printed on a page could be answered "no evidence"
while `/api/search/native` found that page instantly, because the chunk's
embedding sat below the similarity floor. They are fused by reciprocal rank —
only the ORDER of a trigram hit and a cosine similarity is comparable, never
their magnitudes — so a page both legs agree on leads.

**A question is not a phrase.** Searching page text for "what does the book say
about formative assessment" matches nothing. `queryTerms()` drops the words a
question is made of and keeps the topic; a page must carry the phrase or at
least two terms (`minLexicalScore`) to count, which is what stops "zebrafish
cardiac regeneration protocols" from citing a research-methods page on the word
"protocols" alone.

**Mixed languages split.** A Khmer run has no internal word boundaries, so it
enters whole — but alongside any Latin words in the same query, not instead of
them. `តើសៀវភៅនេះនិយាយអ្វីអំពី research methods` used to collapse into one
unsplittable blob, discarding the only searchable thing in it.

### Scope is an input, not a filter

`match_record_chunks` (migration 0135) pushes the record filter inside the ANN
candidate CTE. "Ask this book" retrieves within one document; it does not
retrieve the corpus and discard the rest. That is both cheaper and the correct
shape for a visibility boundary — the rule this codebase holds to is that
authorization is decided *before* retrieval, never after generation.

`match_book_chunks` (0082) is untouched and still serves the unscoped path.

### Diversity is directional

An unscoped research question wants three resources, not three pages of one
book. A scoped question wants the opposite. `diversify()` takes `perResource`
from the mode, admitting at most that many per record on a first pass and
filling remaining slots on a second — so a question only one book can answer
still gets a full answer.

The old code hard-coded one passage per work. That gave diversity by accident
and made depth impossible: even a lucky corpus-wide hit on the right book
returned a single page.

## Modes and budgets

`EVIDENCE_LIMITS` in `lib/ai/evidence.ts` is the token bill of every mode.

| Mode | Evidence | Per record | Budget | Used by |
|---|---|---|---|---|
| `lookup` | 0 | — | 0 | facts, searches, author/subject hubs, book detail |
| `citation` | 0 | — | 0 | a reference, assembled from metadata |
| `hybrid` | 3 | 1 | 900 | a document question with no resource in context |
| `scoped` | 4 | 4 | 1200 | "Ask this book" |
| `summary` | 5 | 5 | 1400 | a grounded summary of one document |
| `multi_document` | 6 | 3 | 1800 | comparing two documents |

`contextCeilingFor()` raises the prompt ceiling only as far as a mode's own
evidence needs. Nothing here approaches the provider's context window: the
ceiling is what a grounded answer needs, not what the API would accept.

Model tier follows the mode (`resolveTier`): `citation` never reaches a model,
`resource_summary` uses the fast tier unless the reader asked for depth,
`document_compare` uses the reasoning tier because holding two documents'
evidence against each other is the one shape where a larger model measurably
changes the answer.

### Summaries sample, they do not search

"Summarize this book" names no topic. When the legs come back empty on a scoped
summary, `samplePages()` reads the document's page numbers, picks evenly spaced
ones and fetches only those — real pages, so every claim still carries a page a
reader can open. Front matter is skipped. A 300-page book does not send 300
pages of text over the wire to choose five.

## What the assistant refuses to do

- **Summarise text it does not have.** No indexed pages → the catalogue record,
  labelled as such (`T.summaryFromMetadata`), never prose about a document
  nobody read.
- **Compare a document it could not find.** `extractCompareTargets` returns two
  targets or none, and a document with no passages is stated as a fact the
  model must repeat — never left for it to infer agreement from.
- **Cite what was not retrieved.** `enforceGrounding` strips any `(Title, p. N)`
  the retrieval set does not support, in both scripts' digits.
- **Claim semantic coverage it lacks.** `lib/ai/readiness.ts` counts
  `book_pages` and `book_chunks` rows rather than trusting
  `resource_index_state`'s cached numbers, which drift when extraction succeeds
  and embedding then hits a quota. With no chunks the semantic leg is skipped,
  not merely allowed to fail.

## Citations

`Source` carries `recordType`/`recordId`, so a citation is verified and a
source is saved by identity rather than by a title string two editions share.
`attachReferences()` fills the APA form from `lib/citations.ts` — the same
formatter the record pages' cite panels use — and only for sources that
survived grounding, so a hallucinated citation never triggers a lookup.

Nothing here writes a reference. A record with no author and no year produces
no citation affordance rather than a formatted guess.

## Failure modes

| Condition | Behaviour |
|---|---|
| No embedding key / daily quota | Semantic leg skipped; lexical answers. Telemetry records `semanticAvailable: false`. |
| Record has no chunks | Same, decided from readiness before any embedding is spent. |
| Record has no pages at all | Honest "not indexed" — never an adjacent document. |
| Image-only scan (`no_text_layer`) | Same, and readiness reports it as a permanent property of the document. |
| Storage/provider error | Retrieval degrades leg by leg; the answer says what it has. |
| Model failure | Existing behaviour: cards without prose, never an invented answer. |

## Benchmark

`npm run retrieval:benchmark` (`scripts/retrieval-benchmark.ts`) runs 98
questions labelled against real `book_pages` text — the phrase each asks about
was verified to appear on the pages listed as correct. It calls
`retrieveEvidence` directly (`server-only` mapped to a stub by
`scripts/tsconfig.benchmark.json`, as vitest does), so it measures the real
functions.

Metrics and why each exists:

- **Recall@5 / @10** — an expected (record, page) appears in the top 5 / 10.
- **Top-1** — the first passage is one of them: what a short answer quotes.
- **No-leak** — no passage came from a record the question did not name. For a
  scoped question, citing another book is not a weaker answer, it is a wrong
  one.
- **Answered** — coverage, counted separately from leakage: a question that
  declines is safe, one that wanders is not.
- **Source spread** — distinct records per unscoped question.
- **No-evidence correctness** — questions whose honest answer is nothing.
- **Citation accuracy** — the reference carries the record's own author and year.

Measured 2026-09-04 (215 books, 201 with page text, chunks for 12, embedding
quota exhausted):

| category | R@5 | top-1 | no-leak | answered |
|---|---|---|---|---|
| single_document | 100% | 83% | 100% | 100% |
| multi_document | 75% | 55% | 70% | 100% |
| summary | 100% | 100% | 100% | 100% |
| mixed KM/EN | 80% | 80% | 100% | 80% |
| khmer | 40% | 40% | 100% | 40% |
| citation | — | — | 100% | — (100% accurate) |
| no_evidence | — | — | 100% | 0% (correct) |
| **all** | **84%** | **73%** | **94%** | **73%** |

The vector-only baseline scores **0% on every category** for this collection:
it is not a slower path, it is an absent one. Khmer questions about English
documents stay at 40% answered — they are only answerable through semantic
retrieval, which this collection does not yet have. That is a corpus fact,
recorded rather than tuned around; it improves when the embedding backfill runs.

## Testing

- `lib/ai/evidence.test.ts` — fusion, dedupe, diversity, spread, budgets.
- `lib/ai/grounding.test.ts` — one case per way a model can assert something
  retrieval never gave it, including Khmer digits.
- `lib/ai/mock-model.test.ts` — the e2e stand-in answers from its evidence and
  its citations survive grounding, so a broken context builder fails the e2e
  run rather than being papered over.
- `e2e/ai-research.spec.ts` — ask, cite, open the page, copy, save, find it on
  the dashboard; plus no-evidence, Khmer, and citation. Runs against
  `AI_MOCK_PROVIDER=1`, which CI sets because it has no Gemini key. Production
  must never set it.

// lib/ai/failure-class.ts
// WHY a retrieval missed — as a decision over observable facts, not a guess.
//
// "Recall@5 = 84%" names a number and no defect. Sixteen misses out of a
// hundred can be sixteen different bugs or one, and the difference decides
// whether the next change is a ranking weight, a chunker, or a backfill that
// has not finished running. This module turns one failed question into one
// named cause, from facts the benchmark can observe about that question:
// whether the page is in `book_pages` at all, whether its record has any
// embedded chunks, which retrieval leg's candidate pool contained it, and
// whether it survived fusion and diversity.
//
// Pure on purpose, like the rest of `lib/ai/*`: the classifier is the thing
// the report is built from, so it has to be testable without a database.
//
// The ORDER of the checks is the design. A cause that makes every later stage
// impossible is reported instead of the stages it disabled — a page that was
// never extracted is not a "semantic miss", and calling it one would send
// someone to tune a threshold over a document the system has never read.

/** Why an expected passage did not reach the model. */
export type RetrievalFailure =
  /** The expected page is not in `book_pages`. Extraction never produced it. */
  | "PAGE_INDEX_MISS"
  /** The record has extracted pages but no embedded chunks — no vector to match. */
  | "EMBEDDING_MISS"
  /** Neither leg's pool held it, though both legs could run. */
  | "RETRIEVAL_MISS"
  /** Only the semantic leg could have found it, and did not. */
  | "SEMANTIC_MISS"
  /** Only the lexical leg could have found it, and did not. */
  | "LEXICAL_MISS"
  /** The page is indexed and embedded, but no chunk covering it carries the text. */
  | "CHUNKING_MISS"
  /** It was in a candidate pool; fusion ranked it below the evidence cut. */
  | "RERANK_MISS"
  /** It was ranked high enough, but the per-record cap gave its slot away. */
  | "DIVERSITY_ERROR"
  /** Evidence came from a record the question did not name. */
  | "SCOPE_ERROR"
  /** The mode chosen for the question retrieves nothing by construction. */
  | "QUERY_ROUTING_MISS";

/**
 * What the benchmark observed about one question. Every field is a fact it can
 * measure, not an inference — the inference is this module's job.
 */
export interface FailureFacts {
  /** The question named a scope and evidence came from outside it. */
  leaked: boolean;
  /** The mode used retrieves no passages at all (`lookup`, `citation`). */
  retrievalDisabled: boolean;
  /** Any expected (record, page) exists as a `book_pages` row. */
  pageIndexed: boolean;
  /** Any expected record has at least one `book_chunks` row. */
  recordEmbedded: boolean;
  /** The query embedding was produced — the semantic leg actually ran. */
  semanticRan: boolean;
  /** The lexical leg ran (it always can, but a too-short query stops it). */
  lexicalRan: boolean;
  /** An expected (record, page) was in the lexical candidate pool. */
  inLexicalPool: boolean;
  /** An expected (record, page) was in the semantic candidate pool. */
  inSemanticPool: boolean;
  /** An expected (record, page) survived fusion into the ranked pool. */
  inFusedPool: boolean;
  /**
   * Its 1-based rank in the fused pool, when it was there. Distinguishes a
   * passage the ranker buried (a rerank problem) from one the per-record cap
   * evicted despite ranking inside the cut (a diversity problem).
   */
  fusedRank: number | null;
  /** Passages the mode's budget allowed through to the model. */
  evidenceLimit: number;
  /**
   * True when a record other than the expected one already spent the
   * per-record allowance ahead of it. Only meaningful with `inFusedPool`.
   */
  crowdedOut: boolean;
}

/**
 * The one cause to report for a failed question.
 *
 * Read top to bottom: each branch is a condition that makes everything below
 * it unmeasurable, so the first one that holds is the honest answer.
 */
export function classifyFailure(facts: FailureFacts): RetrievalFailure {
  // A leak is a wrong answer, not a missing one, and outranks every recall
  // question — an answer citing the wrong book is not improved by also
  // finding the right page.
  if (facts.leaked) return "SCOPE_ERROR";

  // The mode retrieves nothing by construction. No leg ran; nothing about
  // ranking or coverage is being measured here.
  if (facts.retrievalDisabled) return "QUERY_ROUTING_MISS";

  // Nothing downstream can find text that was never extracted. This is a
  // pipeline fact about the document, not a retrieval defect.
  if (!facts.pageIndexed) return "PAGE_INDEX_MISS";

  // It reached the ranked pool, so retrieval found it and selection lost it.
  // Which of the two selection stages dropped it is the actionable part:
  // inside the cut means the per-record cap took its slot, below the cut
  // means fusion ranked it too low.
  if (facts.inFusedPool) {
    const rankedIn = facts.fusedRank !== null && facts.fusedRank <= facts.evidenceLimit;
    if (facts.crowdedOut || rankedIn) return "DIVERSITY_ERROR";
    return "RERANK_MISS";
  }

  const lexicalCould = facts.lexicalRan;
  const semanticCould = facts.semanticRan && facts.recordEmbedded;

  // The record has pages but no vectors. Reporting this as a semantic miss
  // would hide a backfill behind a threshold: there is no vector to compare.
  if (!facts.recordEmbedded && facts.semanticRan) {
    return lexicalCould && facts.inLexicalPool ? "RERANK_MISS" : "EMBEDDING_MISS";
  }

  // Both legs could run and neither pool held it. The text is extracted and
  // embedded, so the passage exists in both representations and neither
  // matched — the chunk covering the page does not carry the query's words
  // and its vector is not near the query's.
  if (lexicalCould && semanticCould) {
    return facts.inLexicalPool || facts.inSemanticPool ? "RERANK_MISS" : "RETRIEVAL_MISS";
  }

  // Exactly one leg was available, so the miss belongs to that leg alone.
  if (semanticCould && !lexicalCould) return "SEMANTIC_MISS";
  if (lexicalCould && !semanticCould) return "LEXICAL_MISS";

  // Neither leg ran: the embedding call failed and the query was too short
  // for the lexical pass. Nothing was searched.
  return "RETRIEVAL_MISS";
}

/**
 * A chunking miss is only diagnosable with the chunk text in hand, so it is a
 * refinement applied after `classifyFailure`, not a branch inside it.
 *
 * The signal is specific: the PAGE contains the query's terms (so the lexical
 * representation has them) but no CHUNK derived from that page does. That can
 * only happen when the chunker split the text such that the terms fell across
 * a boundary, or dropped the passage as too small — which is a chunking
 * defect, not a ranking one, and no weight will fix it.
 */
export function refineChunkingMiss(
  cause: RetrievalFailure,
  pageCarriesTerms: boolean,
  anyChunkCarriesTerms: boolean,
): RetrievalFailure {
  const rankingCause = cause === "RETRIEVAL_MISS" || cause === "SEMANTIC_MISS";
  if (!rankingCause) return cause;
  if (pageCarriesTerms && !anyChunkCarriesTerms) return "CHUNKING_MISS";
  return cause;
}

/** Every cause, in report order — most structural first. */
export const FAILURE_ORDER: readonly RetrievalFailure[] = [
  "SCOPE_ERROR",
  "PAGE_INDEX_MISS",
  "EMBEDDING_MISS",
  "CHUNKING_MISS",
  "RETRIEVAL_MISS",
  "LEXICAL_MISS",
  "SEMANTIC_MISS",
  "RERANK_MISS",
  "DIVERSITY_ERROR",
  "QUERY_ROUTING_MISS",
];

/** What to do about each cause — the reason the breakdown is worth building. */
export const FAILURE_REMEDY: Record<RetrievalFailure, string> = {
  SCOPE_ERROR: "retrieval crossed a record boundary — a correctness bug, fix before any tuning",
  PAGE_INDEX_MISS: "run extraction for the record; nothing can retrieve unextracted text",
  EMBEDDING_MISS: "run the embedding backfill; the record has pages but no vectors",
  CHUNKING_MISS: "chunk boundaries lost the passage — revisit size/overlap, not weights",
  RETRIEVAL_MISS: "both legs had the data and neither matched — a real recall gap",
  LEXICAL_MISS: "the lexical leg was the only one available and did not match",
  SEMANTIC_MISS: "the semantic leg was the only one available and did not match",
  RERANK_MISS: "found, then ranked below the cut — a fusion/scoring change",
  DIVERSITY_ERROR: "found and ranked, then evicted by the per-record cap",
  QUERY_ROUTING_MISS: "the mode chosen for this question retrieves no passages",
};

export function tallyFailures(
  causes: readonly RetrievalFailure[],
): { cause: RetrievalFailure; count: number }[] {
  const counts = new Map<RetrievalFailure, number>();
  for (const c of causes) counts.set(c, (counts.get(c) ?? 0) + 1);
  return FAILURE_ORDER.filter((c) => counts.has(c)).map((c) => ({ cause: c, count: counts.get(c)! }));
}

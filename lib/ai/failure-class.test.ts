import { describe, expect, it } from "vitest";
import {
  FAILURE_ORDER,
  FAILURE_REMEDY,
  classifyFailure,
  refineChunkingMiss,
  tallyFailures,
  type FailureFacts,
} from "./failure-class";

/** A question that failed for no reason yet — every branch is opted into. */
const facts = (over: Partial<FailureFacts> = {}): FailureFacts => ({
  leaked: false,
  retrievalDisabled: false,
  pageIndexed: true,
  recordEmbedded: true,
  semanticRan: true,
  lexicalRan: true,
  inLexicalPool: false,
  inSemanticPool: false,
  inFusedPool: false,
  fusedRank: null,
  evidenceLimit: 3,
  crowdedOut: false,
  ...over,
});

describe("classifyFailure — precedence", () => {
  it("reports a leak before anything about recall", () => {
    // A scoped answer that cites another book is wrong, not incomplete: the
    // page it also failed to find is the smaller of the two problems.
    expect(classifyFailure(facts({ leaked: true, pageIndexed: false }))).toBe("SCOPE_ERROR");
  });

  it("reports an unextracted page before blaming a retrieval leg", () => {
    // Nothing downstream can find text the extractor never produced. Calling
    // this a semantic miss sends someone to tune a threshold over a document
    // the system has never read.
    expect(classifyFailure(facts({ pageIndexed: false, recordEmbedded: false }))).toBe(
      "PAGE_INDEX_MISS",
    );
  });

  it("reports missing vectors rather than a semantic miss", () => {
    // The record has pages but no chunks. There is no vector to compare, so
    // "the semantic leg did not match" describes a comparison that never ran.
    expect(classifyFailure(facts({ recordEmbedded: false }))).toBe("EMBEDDING_MISS");
  });

  it("does not call it an embedding miss when the lexical leg did find it", () => {
    // Unembedded, but lexical retrieved it and selection dropped it — the
    // actionable defect is the ranking, and a backfill would not fix it.
    expect(classifyFailure(facts({ recordEmbedded: false, inLexicalPool: true }))).toBe(
      "RERANK_MISS",
    );
  });
});

describe("classifyFailure — selection stages", () => {
  it("separates a passage evicted by the per-record cap from one ranked too low", () => {
    // Both were retrieved; only the fix differs. Inside the cut means the cap
    // gave its slot away (diversity); below the cut means fusion buried it.
    const inCut = facts({ inFusedPool: true, fusedRank: 2, evidenceLimit: 3 });
    const belowCut = facts({ inFusedPool: true, fusedRank: 9, evidenceLimit: 3 });
    expect(classifyFailure(inCut)).toBe("DIVERSITY_ERROR");
    expect(classifyFailure(belowCut)).toBe("RERANK_MISS");
  });

  it("calls an explicit eviction a diversity error even from below the cut", () => {
    expect(
      classifyFailure(facts({ inFusedPool: true, fusedRank: 12, evidenceLimit: 3, crowdedOut: true })),
    ).toBe("DIVERSITY_ERROR");
  });
});

describe("classifyFailure — which leg owns the miss", () => {
  it("blames neither leg alone when both could run and both missed", () => {
    expect(classifyFailure(facts())).toBe("RETRIEVAL_MISS");
  });

  it("blames the semantic leg when it was the only one available", () => {
    expect(classifyFailure(facts({ lexicalRan: false }))).toBe("SEMANTIC_MISS");
  });

  it("blames the lexical leg when the embedding call did not run", () => {
    expect(classifyFailure(facts({ semanticRan: false }))).toBe("LEXICAL_MISS");
  });

  it("reports a retrieval miss when nothing was searched at all", () => {
    expect(classifyFailure(facts({ semanticRan: false, lexicalRan: false }))).toBe("RETRIEVAL_MISS");
  });

  it("downgrades to a rerank miss when one pool did hold it", () => {
    expect(classifyFailure(facts({ inSemanticPool: true }))).toBe("RERANK_MISS");
  });

  it("treats a routing choice that retrieves nothing as its own cause", () => {
    // `lookup` and `citation` answer from structured data. A recall number
    // over them measures the router, not retrieval.
    expect(classifyFailure(facts({ retrievalDisabled: true }))).toBe("QUERY_ROUTING_MISS");
  });
});

describe("refineChunkingMiss", () => {
  it("names chunking when the page carries the terms and no chunk does", () => {
    // The page text has the words, so extraction worked; the chunk derived
    // from it does not, so a boundary split them. No weight fixes that.
    expect(refineChunkingMiss("RETRIEVAL_MISS", true, false)).toBe("CHUNKING_MISS");
    expect(refineChunkingMiss("SEMANTIC_MISS", true, false)).toBe("CHUNKING_MISS");
  });

  it("leaves the cause alone when a chunk does carry the terms", () => {
    expect(refineChunkingMiss("RETRIEVAL_MISS", true, true)).toBe("RETRIEVAL_MISS");
  });

  it("never overrides a structural cause", () => {
    // A page that was never extracted has no chunks by definition; letting
    // the refinement rename it would hide the backfill behind a chunker.
    for (const cause of ["PAGE_INDEX_MISS", "EMBEDDING_MISS", "SCOPE_ERROR"] as const) {
      expect(refineChunkingMiss(cause, true, false)).toBe(cause);
    }
  });
});

describe("report surface", () => {
  it("orders a tally most-structural first, whatever order the causes arrive in", () => {
    const tally = tallyFailures(["RERANK_MISS", "PAGE_INDEX_MISS", "RERANK_MISS", "SCOPE_ERROR"]);
    expect(tally).toEqual([
      { cause: "SCOPE_ERROR", count: 1 },
      { cause: "PAGE_INDEX_MISS", count: 1 },
      { cause: "RERANK_MISS", count: 2 },
    ]);
  });

  it("gives every cause a remedy and a place in the order", () => {
    // A breakdown exists to say what to do next; a cause with no remedy is a
    // label, and the point of the module is to not produce labels.
    for (const cause of FAILURE_ORDER) {
      expect(FAILURE_REMEDY[cause]).toBeTruthy();
    }
    expect(new Set(FAILURE_ORDER).size).toBe(FAILURE_ORDER.length);
    expect(Object.keys(FAILURE_REMEDY).sort()).toEqual([...FAILURE_ORDER].sort());
  });
});

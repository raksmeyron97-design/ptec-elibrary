import { describe, expect, it } from "vitest";
import {
  EVIDENCE_LIMITS,
  balanceByDocument,
  contextCeilingFor,
  dedupePages,
  diversify,
  fuseEvidence,
  minLexicalScore,
  sourceCount,
  spreadPages,
  type RetrievedEvidence,
} from "./evidence";

function ev(over: Partial<RetrievedEvidence> & { recordId: string; page: number }): RetrievedEvidence {
  return {
    recordType: "book",
    matchType: "semantic",
    title: `Book ${over.recordId}`,
    author: "Author",
    url: `/books/${over.recordId}`,
    text: `text ${over.recordId} p${over.page}`,
    similarity: 0.5,
    score: 0,
    ...over,
  };
}

describe("fuseEvidence", () => {
  it("ranks a page found by both legs above one found by either", () => {
    const lexical = [ev({ recordId: "a", page: 1, matchType: "pdf_exact" }), ev({ recordId: "b", page: 2, matchType: "pdf_exact" })];
    const semantic = [ev({ recordId: "c", page: 3 }), ev({ recordId: "a", page: 1 })];
    const fused = fuseEvidence([lexical, semantic]);
    expect(fused[0].recordId).toBe("a");
    expect(fused[0].score).toBeGreaterThan(fused[1].score);
    expect(fused).toHaveLength(3);
  });

  it("keeps the verbatim window when both legs found the same page", () => {
    const semantic = [ev({ recordId: "a", page: 4, text: "chunk boundary text" })];
    const lexical = [ev({ recordId: "a", page: 4, matchType: "pdf_exact", text: "…the exact phrase…" })];
    const [fused] = fuseEvidence([semantic, lexical]);
    expect(fused.matchType).toBe("pdf_exact");
    expect(fused.text).toBe("…the exact phrase…");
  });

  it("respects rank order within one list", () => {
    const list = [ev({ recordId: "a", page: 1 }), ev({ recordId: "b", page: 1 }), ev({ recordId: "c", page: 1 })];
    expect(fuseEvidence([list]).map((e) => e.recordId)).toEqual(["a", "b", "c"]);
  });

  it("is deterministic for equal scores", () => {
    const a = [ev({ recordId: "b", page: 2 }), ev({ recordId: "a", page: 2 })];
    expect(fuseEvidence([a]).map((e) => e.recordId)).toEqual(fuseEvidence([a]).map((e) => e.recordId));
  });
});

describe("dedupePages", () => {
  it("keeps one entry per record and page", () => {
    const out = dedupePages([ev({ recordId: "a", page: 1 }), ev({ recordId: "a", page: 1 }), ev({ recordId: "a", page: 2 })]);
    expect(out).toHaveLength(2);
  });
});

describe("diversify", () => {
  const pool = [
    ev({ recordId: "a", page: 1, score: 0.9 }),
    ev({ recordId: "a", page: 2, score: 0.8 }),
    ev({ recordId: "a", page: 3, score: 0.7 }),
    ev({ recordId: "b", page: 1, score: 0.6 }),
    ev({ recordId: "c", page: 1, score: 0.5 }),
  ];

  it("prefers three resources over three pages of one", () => {
    const out = diversify(pool, { limit: 3, perResource: 1 });
    expect(out.map((e) => e.recordId)).toEqual(["a", "b", "c"]);
    expect(sourceCount(out)).toBe(3);
  });

  it("keeps depth inside one record when scoped", () => {
    const scoped = pool.filter((e) => e.recordId === "a");
    const out = diversify(scoped, { limit: 4, perResource: 4 });
    expect(out.map((e) => e.page)).toEqual([1, 2, 3]);
  });

  it("fills remaining slots from one record when nothing else is available", () => {
    const thin = [ev({ recordId: "a", page: 1 }), ev({ recordId: "a", page: 2 }), ev({ recordId: "a", page: 3 })];
    expect(diversify(thin, { limit: 3, perResource: 1 })).toHaveLength(3);
  });

  it("returns nothing for a zero limit", () => {
    expect(diversify(pool, { limit: 0, perResource: 1 })).toEqual([]);
  });
});

describe("balanceByDocument", () => {
  it("gives each document its own slice, in the order asked", () => {
    const a = [ev({ recordId: "a", page: 1 }), ev({ recordId: "a", page: 2 }), ev({ recordId: "a", page: 3 })];
    const b = [ev({ recordId: "b", page: 9 })];
    const out = balanceByDocument(
      [{ label: "A", evidence: a }, { label: "B", evidence: b }],
      EVIDENCE_LIMITS.multi_document,
    );
    expect(out.filter((e) => e.documentLabel === "A")).toHaveLength(3);
    expect(out.filter((e) => e.documentLabel === "B")).toHaveLength(1);
    expect(out[0].documentLabel).toBe("A");
  });

  it("never lets one document consume the whole budget", () => {
    const many = Array.from({ length: 10 }, (_, i) => ev({ recordId: "a", page: i + 1 }));
    const out = balanceByDocument(
      [{ label: "A", evidence: many }, { label: "B", evidence: [ev({ recordId: "b", page: 1 })] }],
      EVIDENCE_LIMITS.multi_document,
    );
    expect(out.filter((e) => e.documentLabel === "A").length).toBeLessThanOrEqual(3);
  });
});

describe("spreadPages", () => {
  it("keeps the ranked lead and then samples across the document", () => {
    const pool = Array.from({ length: 20 }, (_, i) => ev({ recordId: "a", page: i + 1, score: 1 - i / 100 }));
    const out = spreadPages(pool, 5);
    expect(out).toHaveLength(5);
    const pages = out.map((e) => e.page);
    expect(pages).toContain(1);
    // Sampling must reach beyond the opening pages.
    expect(Math.max(...pages)).toBeGreaterThan(10);
    expect(new Set(pages).size).toBe(5);
  });

  it("returns everything when the pool is already small", () => {
    const pool = [ev({ recordId: "a", page: 1 }), ev({ recordId: "a", page: 2 })];
    expect(spreadPages(pool, 5)).toHaveLength(2);
  });
});

describe("EVIDENCE_LIMITS", () => {
  it("spends nothing on modes answered from structured data", () => {
    for (const mode of ["lookup", "citation"] as const) {
      expect(EVIDENCE_LIMITS[mode].evidence).toBe(0);
      expect(EVIDENCE_LIMITS[mode].budgetTokens).toBe(0);
    }
  });

  it("buys depth for scoped modes and breadth for comparison", () => {
    expect(EVIDENCE_LIMITS.scoped.perResource).toBeGreaterThanOrEqual(EVIDENCE_LIMITS.scoped.evidence);
    // The breadth rule, stated as the property rather than as one number.
    // `hybrid.perResource` was pinned at exactly 1, which is the strictest
    // possible reading of "prefer several sources" and also stopped a book
    // that genuinely answers the question from contributing a second page.
    // What must hold is that no single record can take half the evidence —
    // that is what keeps an unscoped answer drawing on at least three
    // sources, and it is true of the old shape (1 of 3) and the new one
    // (2 of 5) alike.
    expect(EVIDENCE_LIMITS.hybrid.perResource).toBeLessThan(EVIDENCE_LIMITS.hybrid.evidence / 2);
    expect(EVIDENCE_LIMITS.multi_document.evidence).toBeGreaterThan(EVIDENCE_LIMITS.hybrid.evidence);
  });

  it("keeps every mode's evidence budget bounded", () => {
    for (const limits of Object.values(EVIDENCE_LIMITS)) {
      expect(limits.budgetTokens).toBeLessThanOrEqual(1_800);
      expect(limits.evidence).toBeLessThanOrEqual(6);
    }
  });

  it("raises the context ceiling only as far as the evidence needs", () => {
    // A mode whose evidence fits under the base ceiling does not raise it…
    expect(contextCeilingFor("lookup", 2_000)).toBe(2_000);
    expect(contextCeilingFor("pdf_exact", 2_000)).toBe(2_000);
    // …and a mode that carries a real evidence budget raises it by exactly
    // that budget plus the fixed 1,100 the prompt and history need — never
    // to some larger round number. `hybrid` is in this group now: a
    // cross-collection research question retrieves passages, so it has to pay
    // for them the same way a comparison does.
    expect(contextCeilingFor("hybrid", 2_000)).toBe(EVIDENCE_LIMITS.hybrid.budgetTokens + 1_100);
    expect(contextCeilingFor("multi_document", 2_000)).toBe(2_900);
  });
});


describe("minLexicalScore — a page must share the QUESTION, not a word", () => {
  it("needs both terms of a two-term question", () => {
    // One incidental match was enough before: "cryptocurrency mining rigs"
    // was answered from a page about readability formulas, and "submarine
    // hull design" from a chapter-summary page, on ordinary words while the
    // word that made each question that question appeared nowhere.
    expect(minLexicalScore(["sampling", "interviews"])).toBe(2);
  });

  it("needs a majority of a longer question's terms", () => {
    expect(minLexicalScore(["cryptocurrency", "mining", "rigs"])).toBe(2);
    expect(minLexicalScore(["a", "b", "c", "d"])).toBe(3);
    expect(minLexicalScore(["a", "b", "c", "d", "e", "f"])).toBe(4);
  });

  it("still admits a single-term question on one match", () => {
    // This is the shape a stripped question takes — "sampling", "validity" —
    // and it is also the only shape a mixed Khmer/English question can take
    // once its frame is removed.
    expect(minLexicalScore(["validity"])).toBe(1);
    expect(minLexicalScore([])).toBe(1);
  });

  it("never demands more matches than the question has terms", () => {
    for (let n = 1; n <= 6; n++) {
      const terms = Array.from({ length: n }, (_, i) => `t${i}`);
      expect(minLexicalScore(terms)).toBeLessThanOrEqual(n);
      expect(minLexicalScore(terms)).toBeGreaterThanOrEqual(1);
    }
  });
});

describe("the cross-collection mode is not the thinnest one", () => {
  it("gives an unscoped research question more evidence than a bare lookup", () => {
    // `hybrid` answers "what does the literature say about X" across the whole
    // collection and used to get three passages at one per record — less than
    // a single document's own summary. Measured against production, that
    // squeezed a 24-row candidate pool through three slots.
    expect(EVIDENCE_LIMITS.hybrid.evidence).toBeGreaterThan(EVIDENCE_LIMITS.pdf_exact.evidence);
    expect(EVIDENCE_LIMITS.hybrid.candidates).toBeGreaterThan(EVIDENCE_LIMITS.pdf_exact.candidates);
  });

  it("keeps at least three sources reachable in every unscoped mode", () => {
    for (const mode of ["pdf_exact", "semantic", "hybrid"] as const) {
      const { evidence, perResource } = EVIDENCE_LIMITS[mode];
      expect(Math.ceil(evidence / perResource)).toBeGreaterThanOrEqual(3);
    }
  });
});

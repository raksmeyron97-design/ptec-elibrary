import { describe, expect, it } from "vitest";
import {
  EVIDENCE_LIMITS,
  balanceByDocument,
  contextCeilingFor,
  dedupePages,
  diversify,
  fuseEvidence,
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
    expect(EVIDENCE_LIMITS.hybrid.perResource).toBe(1);
    expect(EVIDENCE_LIMITS.multi_document.evidence).toBeGreaterThan(EVIDENCE_LIMITS.hybrid.evidence);
  });

  it("keeps every mode's evidence budget bounded", () => {
    for (const limits of Object.values(EVIDENCE_LIMITS)) {
      expect(limits.budgetTokens).toBeLessThanOrEqual(1_800);
      expect(limits.evidence).toBeLessThanOrEqual(6);
    }
  });

  it("raises the context ceiling only as far as the evidence needs", () => {
    expect(contextCeilingFor("hybrid", 2_000)).toBe(2_000);
    expect(contextCeilingFor("multi_document", 2_000)).toBe(2_900);
  });
});

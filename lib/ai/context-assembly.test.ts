// lib/ai/context-assembly.test.ts — AI Brain 2 Phase D.
//
// What reaches the model: adjacent pages folded into one passage, near-
// duplicate text dropped, page ranges rendered and cited correctly, and the
// grounding check accepting any page inside a merged run — and nothing else.

import { describe, expect, it } from "vitest";
import { dropNearDuplicates, mergeAdjacentPages, type RetrievedEvidence } from "./evidence";
import { buildContext, compactPassage, pageLabel } from "./context";
import { buildSources, sourcePages, usedSources } from "./citations";
import { enforceGrounding, extractCitations } from "./guardrails";
import { mockAnswerFor } from "./mock-model";

function ev(over: Partial<RetrievedEvidence> & { recordId: string; page: number }): RetrievedEvidence {
  return {
    recordType: "book",
    matchType: "pdf_exact",
    title: `Book ${over.recordId}`,
    author: "Author",
    url: `/books/${over.recordId}`,
    text: `text of ${over.recordId} page ${over.page} with enough distinct words to shingle ${over.page}`,
    similarity: 1,
    score: 0.01,
    ...over,
  };
}

describe("mergeAdjacentPages", () => {
  it("folds a run of consecutive pages into one passage with a page range", () => {
    // pp. 44–47 of one handbook arrived as four fragments and four citations.
    const out = mergeAdjacentPages([
      ev({ recordId: "h", page: 45, score: 0.02, text: "…second…" }),
      ev({ recordId: "h", page: 44, score: 0.03, text: "…first…" }),
      ev({ recordId: "h", page: 46, score: 0.01, text: "…third…" }),
      ev({ recordId: "other", page: 9, score: 0.025 }),
    ]);
    expect(out).toHaveLength(2);
    const run = out.find((e) => e.recordId === "h")!;
    expect(run.page).toBe(44);
    expect(run.pageEnd).toBe(46);
    expect(run.score).toBe(0.03);
    expect(run.text).toBe("first … second … third");
    // Ranked by the best score of the run.
    expect(out[0].recordId).toBe("h");
  });

  it("does not chain pages that are not adjacent, and caps a run", () => {
    const out = mergeAdjacentPages(
      [1, 2, 3, 4, 5, 9].map((page) => ev({ recordId: "a", page })),
      3,
    );
    const pages = out.map((e) => [e.page, e.pageEnd ?? e.page]);
    expect(pages).toContainEqual([1, 3]);
    expect(pages).toContainEqual([4, 5]);
    expect(pages).toContainEqual([9, 9]);
  });

  it("keeps runs from different records apart", () => {
    const out = mergeAdjacentPages([ev({ recordId: "a", page: 1 }), ev({ recordId: "b", page: 2 })]);
    expect(out).toHaveLength(2);
    expect(out.every((e) => e.pageEnd === undefined)).toBe(true);
  });
});

describe("dropNearDuplicates", () => {
  it("drops a lower-ranked passage whose text is nearly the higher-ranked one's", () => {
    const text = "Formative assessment is a continuous process in which teachers gather evidence of learning and adjust instruction accordingly";
    const out = dropNearDuplicates([
      ev({ recordId: "a", page: 1, text }),
      ev({ recordId: "b", page: 7, text: `${text} (see chapter 3)` }),
      ev({ recordId: "c", page: 2, text: "Classroom management rests on predictable routines that students can rely on every day" }),
    ]);
    expect(out.map((e) => e.recordId)).toEqual(["a", "c"]);
  });

  it("keeps passages that merely share the topic phrase", () => {
    const out = dropNearDuplicates([
      ev({ recordId: "a", page: 1, text: "Formative assessment is a continuous process in which teachers gather evidence of learning" }),
      ev({ recordId: "b", page: 2, text: "Formative assessment differs from summative assessment in timing, purpose and the use made of the results" }),
    ]);
    expect(out).toHaveLength(2);
  });

  it("never drops a short passage on a coincidence", () => {
    const out = dropNearDuplicates([ev({ recordId: "a", page: 1, text: "validity" }), ev({ recordId: "b", page: 2, text: "validity" })]);
    expect(out).toHaveLength(2);
  });
});

describe("a merged run in the prompt and in the citation", () => {
  const merged = { title: "Handbook", author: "Jason, Glenwick (Editors)", page: 44, pageEnd: 45, text: "Grounded theory builds theory from data. … It proceeds by constant comparison." };

  it("renders a page range and allows the merged passage twice the single budget", () => {
    expect(pageLabel(44)).toBe("p. 44");
    expect(pageLabel(44, 45)).toBe("pp. 44–45");
    const line = compactPassage(merged, 1);
    expect(line).toMatch(/^\[1\] "Handbook" \(Jason, Glenwick \(Editors\)\), pp\. 44–45: /);
    const long = { ...merged, text: "word ".repeat(400) };
    const single = compactPassage({ ...long, pageEnd: undefined }, 1).length;
    expect(compactPassage(long, 1).length).toBeGreaterThan(single);
  });

  it("is cited at either page, and grounding accepts both", () => {
    const sources = buildSources([{ ...merged, url: "/books/handbook", similarity: 1 }]);
    expect(sources[0].pageEnd).toBe(45);
    expect(sourcePages(sources[0])).toEqual([44, 45]);
    for (const cite of ["(Handbook, p. 44)", "(Handbook, p. 45)", "(Handbook, pp. 44–45)"]) {
      const answer = `Grounded theory builds theory from data ${cite}.`;
      const grounded = enforceGrounding(answer, sources);
      expect(grounded.hallucinated, cite).toHaveLength(0);
      expect(grounded.grounded, cite).toHaveLength(1);
      expect(usedSources(answer, sources), cite).toHaveLength(1);
    }
    const outside = enforceGrounding("x (Handbook, p. 46).", sources);
    expect(outside.hallucinated).toHaveLength(1);
  });

  it("reads a page range citation as its first page", () => {
    expect(extractCitations("… (Handbook, pp. 44-45).")).toMatchObject([{ raw: "Handbook, pp. 44-45", title: "Handbook", page: 44 }]);
  });

  it("is parsed by the mock model, which then cites its first page", () => {
    const block = buildContext({ query: "grounded theory", passages: [merged] }).block;
    expect(mockAnswerFor(block)).toMatch(/\(Handbook, p\. 44\)/);
  });
});

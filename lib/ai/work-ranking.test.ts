// lib/ai/work-ranking.test.ts
//
// The regression these protect: "do you have the book X" answered with five
// other books. The assistant's catalogue pool is a broad OR over the query's
// tokens ordered by download count, so without a scoring step the answer was
// "the most popular books sharing a word with X" — measured against production
// with scripts/ai-answer-benchmark.ts, the named book was absent from the
// results for 10 of 10 exact-title questions.

import { describe, expect, it } from "vitest";
import { rankWorks, workScore } from "./work-ranking";

const w = (title: string, popularity = 0, author?: string) => ({ title, popularity, author });

describe("workScore", () => {
  it("scores an exact title highest", () => {
    expect(workScore(w("Key Ideas in Educational Research"), "Key Ideas in Educational Research")).toBe(1);
  });

  it("does not punish an edition suffix", () => {
    // The reader types the title; the catalogue carries "(3rd Edition)".
    const s = workScore(
      w("Interviewing as Qualitative Research (3rd Edition)"),
      "Interviewing as Qualitative Research",
    );
    expect(s).toBeGreaterThan(0.9);
  });

  it("ranks a shared-word match well below a named title", () => {
    const named = workScore(w("Practical Research Methods"), "Practical Research Methods");
    const shared = workScore(w("Methods in Educational Research"), "Practical Research Methods");
    expect(shared).toBeLessThan(named);
    expect(shared).toBeLessThanOrEqual(0.85);
  });

  it("is zero for a title with nothing in common", () => {
    expect(workScore(w("Classroom Management Basics"), "zebrafish cardiac regeneration")).toBe(0);
  });

  it("credits an author the question named in full", () => {
    const withAuthor = workScore(w("Educational Psychology", 0, "Anita Woolfolk"), "Anita Woolfolk");
    expect(withAuthor).toBeGreaterThan(0);
  });

  it("survives an empty query or an empty title", () => {
    expect(workScore(w("A Title"), "")).toBe(0);
    expect(workScore(w(""), "a query")).toBe(0);
  });
});

describe("rankWorks", () => {
  it("puts the named title first however unpopular it is", () => {
    const pool = [
      w("Qualitative Research and Evaluation Methods", 9_999),
      w("Methods in Educational Research", 5_000),
      w("Qualitative Research from Start to Finish (2nd Edition)", 3),
    ];
    const out = rankWorks(pool, "Qualitative Research from Start to Finish (2nd Edition)");
    expect(out[0].title).toBe("Qualitative Research from Start to Finish (2nd Edition)");
  });

  it("lets popularity decide only inside a band", () => {
    const pool = [w("Research Methods B", 10), w("Research Methods A", 900)];
    const out = rankWorks(pool, "something else entirely");
    // Neither title answers the query, so the pool's own order stands.
    expect(out.map((x) => x.title)).toEqual(["Research Methods A", "Research Methods B"]);
  });

  it("is stable — the same pool and query always give the same order", () => {
    const pool = [w("A", 1), w("B", 1), w("C", 1)];
    expect(rankWorks(pool, "q").map((x) => x.title)).toEqual(rankWorks(pool, "q").map((x) => x.title));
  });

  it("returns an empty list for an empty pool", () => {
    expect(rankWorks([], "anything")).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";
import { RELATED_WEIGHTS, rankRelated, scoreRelated, type RelatedCandidate, type RelatedSeed } from "./related-score";

const seed: RelatedSeed = {
  id: "seed",
  type: "book",
  subject: "ស្រាវជ្រាវ",
  authors: ["John W. Creswell"],
  keywords: ["Mixed Methods", "Research Design"],
  language: "English",
};

function cand(id: string, over: Partial<RelatedCandidate<string>> = {}): RelatedCandidate<string> {
  return { id, type: "book", item: id, ...over };
}

describe("scoreRelated", () => {
  it("weights subject above author above keywords above language above type", () => {
    const subject = scoreRelated(seed, cand("a", { subject: "ស្រាវជ្រាវ", type: "research" })).score;
    const author = scoreRelated(seed, cand("b", { authors: ["Dr. John W. Creswell"], type: "research" })).score;
    const keywords = scoreRelated(seed, cand("c", { keywords: ["research design"], type: "research" })).score;
    const language = scoreRelated(seed, cand("d", { language: "english", type: "research" })).score;
    const type = scoreRelated(seed, cand("e")).score;
    expect(subject).toBeGreaterThan(author);
    expect(author).toBeGreaterThan(keywords);
    expect(keywords).toBeGreaterThan(language);
    expect(language).toBeGreaterThan(type);
  });

  it("caps keyword credit and reports every reason", () => {
    const r = scoreRelated(seed, cand("k", { keywords: ["mixed methods", "research design", "extra", "more"], subject: "ស្រាវជ្រាវ" }));
    expect(r.reasons).toEqual(["subject", "keywords", "type"]);
    expect(r.score).toBe(RELATED_WEIGHTS.subject + Math.min(2 * RELATED_WEIGHTS.keyword, RELATED_WEIGHTS.keywordsMax) + RELATED_WEIGHTS.type);
  });

  it("uses exact normalized author identity, never initials", () => {
    expect(scoreRelated(seed, cand("x", { authors: ["J. Creswell"] })).reasons).not.toContain("author");
    expect(scoreRelated(seed, cand("y", { authors: ["john w creswell"] })).reasons).toContain("author");
  });

  it("gives an empty seed field no credit", () => {
    const bare: RelatedSeed = { id: "s", type: "book" };
    expect(scoreRelated(bare, cand("z", { subject: "", authors: [], keywords: [] })).reasons).toEqual(["type"]);
  });
});

describe("rankRelated", () => {
  it("never lets popularity outrank a real relationship", () => {
    const ranked = rankRelated(seed, [
      cand("popular", { popularity: 10_000 }),
      cand("same-subject", { subject: "ស្រាវជ្រាវ", popularity: 0 }),
    ]);
    expect(ranked.map((r) => r.item)).toEqual(["same-subject"]);
  });

  it("uses popularity only to break ties, then id", () => {
    const ranked = rankRelated(seed, [
      cand("b", { subject: "ស្រាវជ្រាវ", popularity: 1 }),
      cand("a", { subject: "ស្រាវជ្រាវ", popularity: 1 }),
      cand("c", { subject: "ស្រាវជ្រាវ", popularity: 9 }),
    ]);
    expect(ranked.map((r) => r.item)).toEqual(["c", "a", "b"]);
  });

  it("drops the seed and duplicates, and honours the limit", () => {
    const many = Array.from({ length: 10 }, (_, i) => cand(`c${i}`, { subject: "ស្រាវជ្រាវ" }));
    const ranked = rankRelated(seed, [cand("seed", { subject: "ស្រាវជ្រាវ" }), ...many, many[0]], 6);
    expect(ranked).toHaveLength(6);
    expect(ranked.map((r) => r.item)).not.toContain("seed");
  });

  it("falls back to same-type/language only when nothing stronger exists", () => {
    const ranked = rankRelated(seed, [cand("t1", { language: "English" }), cand("t2")]);
    expect(ranked.map((r) => r.item)).toEqual(["t1", "t2"]);
  });

  it("is deterministic for any input order", () => {
    const input = [cand("b", { subject: "ស្រាវជ្រាវ" }), cand("a", { authors: ["John W. Creswell"] }), cand("c", { keywords: ["mixed methods"] })];
    const a = rankRelated(seed, input).map((r) => r.item);
    const b = rankRelated(seed, [...input].reverse()).map((r) => r.item);
    expect(a).toEqual(b);
    expect(a).toEqual(["b", "a", "c"]);
  });
});

import { describe, expect, it } from "vitest";
import {
  buildSeoHealth,
  duplicateTitleIds,
  normalizeTitle,
  type SeoResourceInput,
} from "./health";

function res(partial: Partial<SeoResourceInput> & { id: string }): SeoResourceInput {
  return {
    type: "book",
    title: "A Title",
    editUrl: `/admin/edit/${partial.id}`,
    hasSocialImage: true,
    ...partial,
  };
}

describe("normalizeTitle", () => {
  it("lowercases, collapses whitespace, trims (Unicode-safe)", () => {
    expect(normalizeTitle("  The  Great   Book ")).toBe("the great book");
    expect(normalizeTitle(null)).toBe("");
  });
});

describe("duplicateTitleIds", () => {
  it("flags same-type, same-title published records", () => {
    const dupes = duplicateTitleIds([
      res({ id: "a", title: "Pedagogy 101" }),
      res({ id: "b", title: "pedagogy 101" }), // case-insensitive match
      res({ id: "c", title: "Unique" }),
    ]);
    expect(dupes).toEqual(new Set(["a", "b"]));
  });

  it("does NOT flag same title across different types (routes namespace them)", () => {
    const dupes = duplicateTitleIds([
      res({ id: "a", type: "book", title: "Math" }),
      res({ id: "b", type: "research", title: "Math" }),
    ]);
    expect(dupes.size).toBe(0);
  });

  it("ignores blank titles", () => {
    const dupes = duplicateTitleIds([
      res({ id: "a", title: "" }),
      res({ id: "b", title: "   " }),
    ]);
    expect(dupes.size).toBe(0);
  });
});

describe("buildSeoHealth", () => {
  it("flags a missing social image (no og image and no cover)", () => {
    const { findings, counts } = buildSeoHealth([res({ id: "a", hasSocialImage: false })]);
    expect(findings).toHaveLength(1);
    expect(findings[0].issue).toBe("missing_social_image");
    expect(findings[0].severity).toBe("medium");
    expect(counts.byIssue.missing_social_image).toBe(1);
  });

  it("raises three HIGH scholar findings for an incomplete scholarly record", () => {
    const { findings, counts } = buildSeoHealth([
      res({
        id: "t1",
        type: "research",
        title: "Thesis A",
        scholarly: true,
        hasAuthor: false,
        hasDate: false,
        hasAbstract: false,
      }),
    ]);
    const issues = findings.map((f) => f.issue).sort();
    expect(issues).toEqual([
      "scholar_missing_abstract",
      "scholar_missing_author",
      "scholar_missing_date",
    ]);
    expect(findings.every((f) => f.severity === "high")).toBe(true);
    expect(counts.high).toBe(3);
    expect(counts.scholarlyChecked).toBe(1);
  });

  it("does not run scholar checks on non-scholarly types", () => {
    const { counts } = buildSeoHealth([
      res({ id: "b1", type: "book", hasAuthor: false, hasDate: false, hasAbstract: false }),
    ]);
    expect(counts.high).toBe(0);
    expect(counts.scholarlyChecked).toBe(0);
  });

  it("a complete scholarly record with image and unique title yields no findings", () => {
    const { findings } = buildSeoHealth([
      res({
        id: "p1",
        type: "publication",
        title: "Unique Article",
        scholarly: true,
        hasAuthor: true,
        hasDate: true,
        hasAbstract: true,
        hasSocialImage: true,
      }),
    ]);
    expect(findings).toHaveLength(0);
  });

  it("orders high-severity findings before medium", () => {
    const { findings } = buildSeoHealth([
      res({ id: "a", title: "Dup", hasSocialImage: false }), // medium (image) + medium (dup)
      res({ id: "b", title: "Dup", hasSocialImage: true }), // medium (dup)
      res({
        id: "t",
        type: "research",
        title: "T",
        scholarly: true,
        hasAuthor: false,
        hasDate: true,
        hasAbstract: true,
        hasSocialImage: true,
      }), // high (author)
    ]);
    expect(findings[0].severity).toBe("high");
    expect(findings[0].issue).toBe("scholar_missing_author");
  });
});

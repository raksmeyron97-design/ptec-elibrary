import { describe, it, expect } from "vitest";
import {
  normalizeTitle,
  normalizeIsbn,
  findDuplicateGroups,
  type DuplicateBook,
} from "./duplicates";

function book(partial: Partial<DuplicateBook> & { id: string; slug: string; title: string }): DuplicateBook {
  return {
    isbn: null,
    year: null,
    author: null,
    pages: null,
    fileSizeKb: null,
    contentHash: null,
    createdAt: "2026-01-01",
    ...partial,
  };
}

describe("normalizeTitle", () => {
  it("lowercases and strips punctuation/casing differences", () => {
    expect(normalizeTitle("Social Research Methods, 4th Edition")).toBe(
      normalizeTitle("social research methods 4th edition"),
    );
  });
});

describe("normalizeIsbn", () => {
  it("keeps only valid 10/13-digit ISBNs", () => {
    expect(normalizeIsbn("978-0-7879-7962-2")).toBe("9780787979622");
    expect(normalizeIsbn("N/A")).toBeNull();
    expect(normalizeIsbn("123")).toBeNull();
  });
});

describe("findDuplicateGroups", () => {
  it("groups records sharing an identical ISBN as high confidence", () => {
    const groups = findDuplicateGroups([
      book({ id: "1", slug: "a", title: "Different Title A", isbn: "978-0-7879-7962-2" }),
      book({ id: "2", slug: "b", title: "Different Title B", isbn: "9780787979622" }),
      book({ id: "3", slug: "c", title: "Unrelated" }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].confidence).toBe("high");
    expect(groups[0].signals).toContain("isbn");
    expect(groups[0].books.map((b) => b.id).sort()).toEqual(["1", "2"]);
  });

  it("groups identical content hashes as high confidence", () => {
    const groups = findDuplicateGroups([
      book({ id: "1", slug: "coding", title: "The Coding Manual", contentHash: "abc" }),
      book({ id: "2", slug: "coding-1", title: "The Coding Manual", contentHash: "abc" }),
    ]);
    expect(groups[0].confidence).toBe("high");
    expect(groups[0].signals).toContain("content-hash");
  });

  it("treats matching title + same year as medium confidence", () => {
    const groups = findDuplicateGroups([
      book({ id: "1", slug: "srm", title: "Social Research Methods, 4th Edition", year: 2012 }),
      book({ id: "2", slug: "srm-1", title: "Social Research Methods, 4th Edition", year: 2012 }),
    ]);
    expect(groups[0].confidence).toBe("medium");
    expect(groups[0].signals).toEqual(expect.arrayContaining(["title", "year"]));
  });

  it("treats title-only matches as low confidence", () => {
    const groups = findDuplicateGroups([
      book({ id: "1", slug: "t", title: "Common Title", year: 2001 }),
      book({ id: "2", slug: "t-1", title: "Common Title", year: 2010 }),
    ]);
    expect(groups[0].confidence).toBe("low");
  });

  it("does NOT group distinct books that merely share no signal", () => {
    const groups = findDuplicateGroups([
      book({ id: "1", slug: "a", title: "Alpha" }),
      book({ id: "2", slug: "b", title: "Beta" }),
    ]);
    expect(groups).toHaveLength(0);
  });

  it("mirrors the real hosted duplicates (coding manual, social research)", () => {
    const groups = findDuplicateGroups([
      book({ id: "1", slug: "the-coding-manual-for-qualitative-researchers", title: "The Coding Manual for Qualitative Researchers", year: 2015, fileSizeKb: 4146 }),
      book({ id: "2", slug: "the-coding-manual-for-qualitative-researchers-1", title: "The Coding Manual for Qualitative Researchers", year: 2015, fileSizeKb: 4146 }),
      book({ id: "3", slug: "social-research-methods-4th-edition", title: "Social Research Methods, 4th Edition", year: 2012, fileSizeKb: 16271 }),
      book({ id: "4", slug: "social-research-methods-4th-edition-1", title: "Social Research Methods, 4th Edition", year: 2012, fileSizeKb: 16520 }),
    ]);
    expect(groups).toHaveLength(2);
    // The coding manual pair shares an identical file size → medium+.
    const coding = groups.find((g) => g.books.some((b) => b.slug.startsWith("the-coding")))!;
    expect(coding.signals).toContain("file-size");
    expect(coding.confidence).toBe("medium");
  });
});

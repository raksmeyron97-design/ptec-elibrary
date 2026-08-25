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

describe("findDuplicateGroups — title-prefix signal", () => {
  const LONG = "Introduction to Research Methods: A Practical Guide";
  const LONGER = `${LONG} for Anyone Undertaking a Research Project (5th ed.)`;

  it("groups a truncated title with its fuller form by the same author", () => {
    // The real production miss this signal was added for: same work, catalogued
    // twice, once with the full title and once truncated.
    const groups = findDuplicateGroups([
      book({ id: "a", slug: "intro-practical-guide", title: LONG, author: "Catherine Dawson" }),
      book({ id: "b", slug: "educational-research-text", title: LONGER, author: "Catherine Dawson", year: 2019 }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].books.map((b) => b.id).sort()).toEqual(["a", "b"]);
    expect(groups[0].signals).toContain("title-prefix");
  });

  it("stays LOW confidence — a prefix is also how separate editions look", () => {
    const groups = findDuplicateGroups([
      book({ id: "a", slug: "x", title: LONG, author: "Catherine Dawson" }),
      book({ id: "b", slug: "y", title: LONGER, author: "Catherine Dawson" }),
    ]);
    expect(groups[0].confidence).toBe("low");
  });

  it("does not group a prefix across DIFFERENT authors", () => {
    expect(
      findDuplicateGroups([
        book({ id: "a", slug: "x", title: LONG, author: "Catherine Dawson" }),
        book({ id: "b", slug: "y", title: LONGER, author: "Someone Else" }),
      ]),
    ).toHaveLength(0);
  });

  it("does not group when the author is unknown on either side", () => {
    expect(
      findDuplicateGroups([
        book({ id: "a", slug: "x", title: LONG, author: null }),
        book({ id: "b", slug: "y", title: LONGER, author: null }),
      ]),
    ).toHaveLength(0);
  });

  it("respects word boundaries — 'guide' must not match 'guidebook'", () => {
    expect(
      findDuplicateGroups([
        book({ id: "a", slug: "x", title: "The Action Research Guide", author: "Same Person" }),
        book({ id: "b", slug: "y", title: "The Action Research Guidebook", author: "Same Person" }),
      ]),
    ).toHaveLength(0);
  });

  it("ignores prefixes shorter than the minimum, so short titles can't cluster the shelf", () => {
    expect(
      findDuplicateGroups([
        book({ id: "a", slug: "x", title: "Research", author: "Same Person" }),
        book({ id: "b", slug: "y", title: "Research Methods in Education", author: "Same Person" }),
      ]),
    ).toHaveLength(0);
  });

  it("leaves an exact-title pair on the stronger 'title' signal, not the prefix one", () => {
    const groups = findDuplicateGroups([
      book({ id: "a", slug: "x", title: LONG, author: "Catherine Dawson", year: 2019 }),
      book({ id: "b", slug: "y", title: LONG, author: "Catherine Dawson", year: 2019 }),
    ]);
    expect(groups[0].confidence).toBe("medium");
    expect(groups[0].signals).toContain("title");
    expect(groups[0].signals).not.toContain("title-prefix");
  });
});

describe("findDuplicateGroups — evidence survives cluster merges", () => {
  it("keeps MEDIUM when a prefix-matched third record joins a title+author+year pair", () => {
    // Regression: cluster signals/confidence are keyed by union-find root, and
    // a merge used to drop whichever root stopped being the representative.
    // Production symptom — a real MEDIUM group silently reported as LOW the
    // moment a third, prefix-matched edition joined it.
    const base = "Research Design: Qualitative, Quantitative, and Mixed Methods Approaches";
    const groups = findDuplicateGroups([
      book({ id: "a", slug: "rd", title: base, author: "John Creswell", year: 2014 }),
      book({ id: "b", slug: "rd-1", title: base, author: "John Creswell", year: 2014 }),
      book({ id: "c", slug: "rd-4th", title: `${base} 4th Edition`, author: "John Creswell", year: 2014 }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].books).toHaveLength(3);
    expect(groups[0].confidence).toBe("medium");
    // Both the exact-title evidence and the prefix evidence are reported.
    expect(groups[0].signals).toEqual(expect.arrayContaining(["title", "author", "year", "title-prefix"]));
  });

  it("keeps HIGH when an ISBN cluster later merges into a title cluster", () => {
    const groups = findDuplicateGroups([
      book({ id: "a", slug: "x", title: "A Very Long Book Title Here", isbn: "9780061120084", author: "Same Person" }),
      book({ id: "b", slug: "y", title: "Something Else Entirely Different", isbn: "9780061120084", author: "Same Person" }),
      book({ id: "c", slug: "z", title: "A Very Long Book Title Here", author: "Same Person" }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].confidence).toBe("high");
    expect(groups[0].signals).toEqual(expect.arrayContaining(["isbn", "title"]));
  });
});

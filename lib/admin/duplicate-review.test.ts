import { describe, it, expect } from "vitest";
import type { DuplicateBook, DuplicateGroup } from "./duplicates";
import {
  DUPLICATE_SORTS,
  SIGNAL_DISPLAY_ORDER,
  filterDuplicateGroups,
  isStrongSignal,
  orderSignals,
  parseConfidence,
  parseSignal,
  parseSort,
  sortDuplicateGroups,
  summarizeDuplicateGroups,
} from "./duplicate-review";

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

function group(partial: Partial<DuplicateGroup> & { key: string; books: DuplicateBook[] }): DuplicateGroup {
  return { confidence: "low", signals: ["title"], ...partial };
}

const HIGH = group({
  key: "a",
  confidence: "high",
  signals: ["isbn", "content-hash"],
  books: [
    book({ id: "1", slug: "educational-research", title: "Educational Research", isbn: "978-0-13-268963-7", author: "John Creswell", createdAt: "2024-01-04" }),
    book({ id: "2", slug: "educational-research-1", title: "Educational Research", isbn: "9780132689637", author: "John Creswell", createdAt: "2025-03-02" }),
  ],
});

const MEDIUM = group({
  key: "b",
  confidence: "medium",
  signals: ["title", "author", "year"],
  books: [
    book({ id: "3", slug: "practical-research-methods", title: "Practical Research Methods", author: "Catherine Dawson", year: 2002, createdAt: "2023-06-01" }),
    book({ id: "4", slug: "practical-research-methods-1", title: "Practical Research Methods", author: "Catherine Dawson", year: 2002, createdAt: "2024-08-11" }),
    book({ id: "5", slug: "practical-research-methods-2", title: "Practical Research Methods", author: "Catherine Dawson", year: 2002, createdAt: "2025-01-09" }),
  ],
});

const LOW = group({
  key: "c",
  confidence: "low",
  signals: ["title-prefix", "author"],
  books: [
    book({ id: "6", slug: "social-research-methods", title: "Social Research Methods", author: "Alan Bryman", createdAt: "2022-02-02" }),
    book({ id: "7", slug: "social-research-methods-4th", title: "Social Research Methods, 4th Edition", author: "Alan Bryman", createdAt: "2026-05-05" }),
  ],
});

const ALL = [HIGH, MEDIUM, LOW];

describe("summarizeDuplicateGroups", () => {
  it("counts groups per confidence and the records they hold", () => {
    expect(summarizeDuplicateGroups(ALL)).toEqual({
      groups: 3,
      high: 1,
      medium: 1,
      low: 1,
      booksAffected: 7,
    });
  });

  it("returns zeroes for an empty queue", () => {
    expect(summarizeDuplicateGroups([])).toEqual({ groups: 0, high: 0, medium: 0, low: 0, booksAffected: 0 });
  });
});

describe("orderSignals", () => {
  it("renders evidence in reading order regardless of detector order", () => {
    expect(orderSignals(["year", "isbn", "title-prefix", "title"])).toEqual([
      "isbn",
      "title",
      "year",
      "title-prefix",
    ]);
  });

  it("never invents a signal the group does not carry", () => {
    expect(orderSignals([])).toEqual([]);
    expect(orderSignals(["author"])).toEqual(["author"]);
  });

  it("classes only ISBN and content hash as identity evidence", () => {
    const strong = SIGNAL_DISPLAY_ORDER.filter(isStrongSignal);
    expect(strong).toEqual(["isbn", "content-hash"]);
  });
});

describe("filterDuplicateGroups", () => {
  it("returns everything by default", () => {
    expect(filterDuplicateGroups(ALL, {})).toHaveLength(3);
  });

  it("filters by confidence", () => {
    expect(filterDuplicateGroups(ALL, { confidence: "high" })).toEqual([HIGH]);
    expect(filterDuplicateGroups(ALL, { confidence: "medium" })).toEqual([MEDIUM]);
    expect(filterDuplicateGroups(ALL, { confidence: "all" })).toHaveLength(3);
  });

  it("filters by an individual signal", () => {
    expect(filterDuplicateGroups(ALL, { signal: "content-hash" })).toEqual([HIGH]);
    expect(filterDuplicateGroups(ALL, { signal: "author" })).toEqual([MEDIUM, LOW]);
    expect(filterDuplicateGroups(ALL, { signal: "file-size" })).toEqual([]);
  });

  it("searches title, author and slug case-insensitively", () => {
    expect(filterDuplicateGroups(ALL, { search: "dawson" })).toEqual([MEDIUM]);
    expect(filterDuplicateGroups(ALL, { search: "EDUCATIONAL" })).toEqual([HIGH]);
    expect(filterDuplicateGroups(ALL, { search: "social-research-methods-4th" })).toEqual([LOW]);
  });

  it("matches a hyphenated ISBN against a record stored without hyphens", () => {
    expect(filterDuplicateGroups(ALL, { search: "978-0-13-268963-7" })).toEqual([HIGH]);
    expect(filterDuplicateGroups(ALL, { search: "9780132689637" })).toEqual([HIGH]);
  });

  it("ignores surrounding whitespace and empty queries", () => {
    expect(filterDuplicateGroups(ALL, { search: "   " })).toHaveLength(3);
    expect(filterDuplicateGroups(ALL, { search: "  bryman  " })).toEqual([LOW]);
  });

  it("combines filters", () => {
    expect(filterDuplicateGroups(ALL, { confidence: "low", search: "bryman" })).toEqual([LOW]);
    expect(filterDuplicateGroups(ALL, { confidence: "high", search: "bryman" })).toEqual([]);
  });
});

describe("sortDuplicateGroups", () => {
  it("leaves the detector's own ordering untouched for the default sort", () => {
    expect(sortDuplicateGroups(ALL, "confidence")).toEqual(ALL);
  });

  it("puts the largest groups first", () => {
    expect(sortDuplicateGroups(ALL, "records").map((g) => g.key)).toEqual(["b", "a", "c"]);
  });

  it("orders by the oldest record in each group", () => {
    expect(sortDuplicateGroups(ALL, "oldest").map((g) => g.key)).toEqual(["c", "b", "a"]);
  });

  it("orders alphabetically by the first record's title", () => {
    expect(sortDuplicateGroups(ALL, "title").map((g) => g.key)).toEqual(["a", "b", "c"]);
  });

  it("never mutates its input", () => {
    const input = [...ALL];
    sortDuplicateGroups(input, "title");
    expect(input).toEqual(ALL);
  });
});

describe("URL state parsing", () => {
  it("falls back to neutral defaults for unknown values", () => {
    expect(parseConfidence(undefined)).toBe("all");
    expect(parseConfidence("critical")).toBe("all");
    expect(parseConfidence("high")).toBe("high");

    expect(parseSignal("nonsense")).toBe("all");
    expect(parseSignal("title-prefix")).toBe("title-prefix");

    expect(parseSort("")).toBe("confidence");
    expect(parseSort("oldest")).toBe("oldest");
  });

  it("accepts every sort it advertises", () => {
    for (const sort of DUPLICATE_SORTS) expect(parseSort(sort)).toBe(sort);
  });
});

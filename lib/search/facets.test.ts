import { describe, expect, it } from "vitest";
import {
  buildFacetCounts,
  matchesFacets,
  parseFacetSelections,
  parseListParam,
  toggleListParam,
  type FacetableRow,
  type FacetSelections,
} from "./facets";

const none: FacetSelections = { types: [], classes: [], subjects: [], langs: [], years: [], availability: [] };

function sel(partial: Partial<FacetSelections>): FacetSelections {
  return { ...none, ...partial };
}

const rows: FacetableRow[] = [
  { type: "book", subject: "Mathematics", language: "English", year: 2023, availability: "Digital" },
  { type: "book", subject: "Mathematics", language: "Khmer", year: 2022, availability: "Digital" },
  { type: "book", subject: "Education", language: "Khmer", year: 2023, availability: "Metadata only" },
  { type: "research", subject: "Mathematics", language: "Khmer", year: 2021, availability: "Digital" },
  { type: "publication", subject: "Science", language: "English", year: 2023, availability: "Digital" },
  { type: "catalog", subject: "Education", language: "Khmer", year: null, availability: "Available" },
];

describe("parseListParam", () => {
  it("splits, trims, and dedupes case-insensitively", () => {
    expect(parseListParam("a, b ,a,A , ,c")).toEqual(["a", "b", "c"]);
  });

  it("handles null/empty", () => {
    expect(parseListParam(null)).toEqual([]);
    expect(parseListParam("")).toEqual([]);
  });

  it("caps the number of selections", () => {
    expect(parseListParam("1,2,3,4,5,6,7,8,9,10")).toHaveLength(8);
  });
});

describe("parseFacetSelections", () => {
  it("reads all dimensions and falls back to legacy category param", () => {
    const params = new URLSearchParams("types=book,research&lang=km&category=Math&year=2023");
    const s = parseFacetSelections((k) => params.get(k));
    expect(s.types).toEqual(["book", "research"]);
    expect(s.langs).toEqual(["km"]);
    expect(s.subjects).toEqual(["Math"]);
    expect(s.years).toEqual(["2023"]);
    expect(s.availability).toEqual([]);
  });

  it("prefers subject over legacy category", () => {
    const params = new URLSearchParams("subject=Science&category=Math");
    expect(parseFacetSelections((k) => params.get(k)).subjects).toEqual(["Science"]);
  });
});

describe("matchesFacets", () => {
  it("is OR within a dimension", () => {
    const s = sel({ langs: ["English", "Khmer"] });
    expect(rows.filter((r) => matchesFacets(r, s))).toHaveLength(6);
  });

  it("is AND across dimensions", () => {
    const s = sel({ langs: ["Khmer"], subjects: ["Mathematics"] });
    const hits = rows.filter((r) => matchesFacets(r, s));
    expect(hits).toHaveLength(2);
    expect(hits.every((r) => r.language === "Khmer" && r.subject === "Mathematics")).toBe(true);
  });

  it("matches values case- and whitespace-insensitively", () => {
    expect(matchesFacets(rows[0], sel({ subjects: ["  mathematics "] }))).toBe(true);
  });

  it("excludes rows missing the facet value when the dimension is selected", () => {
    expect(matchesFacets(rows[5], sel({ years: ["2023"] }))).toBe(false);
  });

  it("skips the excluded dimension", () => {
    const s = sel({ langs: ["Khmer"], subjects: ["Science"] });
    // rows[4] is English/Science: fails langs unless langs is excluded.
    expect(matchesFacets(rows[4], s)).toBe(false);
    expect(matchesFacets(rows[4], s, "langs")).toBe(true);
  });
});

describe("buildFacetCounts", () => {
  it("counts values with no selection active", () => {
    const facets = buildFacetCounts(rows, none);
    expect(facets.langs).toEqual([
      { value: "Khmer", count: 4, selected: false },
      { value: "English", count: 2, selected: false },
    ]);
    expect(facets.types.find((t) => t.value === "book")?.count).toBe(3);
  });

  it("a dimension's counts ignore its own selection but honor the others", () => {
    const facets = buildFacetCounts(rows, sel({ langs: ["Khmer"], subjects: ["Mathematics"] }));
    // langs counts: only Mathematics rows considered, both languages listed.
    expect(facets.langs).toEqual([
      { value: "Khmer", count: 2, selected: true },
      { value: "English", count: 1, selected: false },
    ]);
    // subjects counts: only Khmer rows considered.
    expect(facets.subjects.find((s) => s.value === "Education")?.count).toBe(2);
    expect(facets.subjects.find((s) => s.value === "Mathematics")?.count).toBe(2);
  });

  it("keeps a selected value listed even when its count drops to zero", () => {
    const facets = buildFacetCounts(rows, sel({ subjects: ["History"] }));
    expect(facets.subjects.find((s) => s.value === "History")).toEqual({
      value: "History",
      count: 0,
      selected: true,
    });
  });

  it("sorts years newest-first", () => {
    const facets = buildFacetCounts(rows, none);
    expect(facets.years.map((y) => y.value)).toEqual(["2023", "2022", "2021"]);
  });
});

describe("toggleListParam", () => {
  it("adds, removes, and empties", () => {
    expect(toggleListParam(null, "a")).toBe("a");
    expect(toggleListParam("a", "b")).toBe("a,b");
    expect(toggleListParam("a,b", "A")).toBe("b");
    expect(toggleListParam("b", "b")).toBeNull();
  });
});

describe("the Subject filter is one DDC class vocabulary over both libraries (Phase 9.2)", () => {
  const mixed = [
    { type: "book", subjectClass: "370", subject: "គរុកោសល្យ", language: "Khmer" },
    { type: "catalog", subjectClass: "370", subject: "370 អប់រំ និងគរុកោសល្យ", language: "Khmer" },
    { type: "catalog", subjectClass: "500", subject: "500 វិទ្យាសាស្ត្រធម្មជាតិ និងគណិតវិទ្យា", language: "English" },
    { type: "book", subjectClass: null, subject: "ស្រាវជ្រាវ", language: "English" },
  ];

  it("reads ?class= and matches a digital and a print record under one value", () => {
    const s = parseFacetSelections((k) => (k === "class" ? "370" : null));
    expect(s.classes).toEqual(["370"]);
    expect(mixed.filter((r) => matchesFacets(r, s)).map((r) => r.type)).toEqual(["book", "catalog"]);
  });

  it("counts classes in DDC order, and a record without a class under none", () => {
    const counts = buildFacetCounts(mixed, none);
    expect(counts.classes.map((c) => [c.value, c.count])).toEqual([["370", 2], ["500", 1]]);
  });

  it("keeps the old ?subject= (category name) working beside it", () => {
    const s = parseFacetSelections((k) => (k === "subject" ? "ស្រាវជ្រាវ" : null));
    expect(mixed.filter((r) => matchesFacets(r, s))).toHaveLength(1);
  });
});

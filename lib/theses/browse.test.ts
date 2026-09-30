import { describe, expect, it } from "vitest";
import { parseBrowseMinWorks, programGroups, programSegment, thesisYear, yearGroups, type BrowseThesisRow } from "./browse";

const row = (i: number, over: Partial<BrowseThesisRow> = {}): BrowseThesisRow => ({
  id: `id-${i}`,
  slug: `t-${i}`,
  title: `Thesis ${i}`,
  ...over,
});

describe("thesisYear", () => {
  it("is the publication year, else the year the academic year ends", () => {
    expect(thesisYear({ published_at: "2023-01-01T00:00:00Z", academic_year: "2021-2022" })).toBe(2023);
    expect(thesisYear({ published_at: null, academic_year: "2023-2024" })).toBe(2024);
    expect(thesisYear({ published_at: null, academic_year: "ឆ្នាំសិក្សា ២០២៣" })).toBeNull();
    expect(thesisYear({})).toBeNull();
  });
});

describe("yearGroups / programGroups", () => {
  const rows = [
    ...Array.from({ length: 5 }, (_, i) => row(i, { academic_year: "2023-2024", program: "b_ed_12_4" })),
    ...Array.from({ length: 2 }, (_, i) => row(10 + i, { academic_year: "2022-2023", program: "b_ed_12_2" })),
    row(20, { slug: null, academic_year: "2023-2024" }),
  ];
  it("a year or programme gets a page only with enough works", () => {
    expect(yearGroups(rows).map((g) => [g.key, g.count])).toEqual([[2024, 5]]);
    expect(programGroups(rows).map((g) => [g.key, g.count])).toEqual([["b-ed-12-4", 5]]);
  });
  it("the threshold is configurable, and years come newest first", () => {
    expect(yearGroups(rows, 2).map((g) => g.key)).toEqual([2024, 2023]);
  });
  it("a thesis without a slug has no page to link, so it is not counted", () => {
    expect(yearGroups(rows, 1).find((g) => g.key === 2024)?.count).toBe(5);
  });
});

describe("programSegment / parseBrowseMinWorks", () => {
  it("turns a programme code into a URL segment", () => {
    expect(programSegment("B_Ed_12_4")).toBe("b-ed-12-4");
  });
  it("reads the threshold from config, defaulting to 5", () => {
    expect(parseBrowseMinWorks("3")).toBe(3);
    expect(parseBrowseMinWorks("zero")).toBe(5);
    expect(parseBrowseMinWorks(undefined)).toBe(5);
  });
});

import { describe, expect, it } from "vitest";
import {
  buildQualityReport,
  filterGaps,
  tierOf,
  type ScoredRecord,
} from "./metadata-quality-report";
import { ebookFieldWeights } from "./ebook-quality";
import { thesisFieldWeights } from "./thesis-metadata-quality";

function book(id: string, completeness: number, missing: string[]): ScoredRecord {
  return {
    id,
    type: "book",
    title: `Book ${id}`,
    completeness,
    tier: tierOf(completeness),
    missing: missing.map((key) => ({ key, label: key })),
    editUrl: `/admin/edit/${id}`,
  };
}

function thesis(id: string, completeness: number, missing: string[]): ScoredRecord {
  return {
    id,
    type: "research",
    title: `Thesis ${id}`,
    completeness,
    tier: tierOf(completeness),
    missing: missing.map((key) => ({ key, label: key })),
    editUrl: `/admin/theses/edit/${id}`,
  };
}

describe("field weights", () => {
  it("are derived from the scorers' own checklists and sum to 100", () => {
    for (const weights of [ebookFieldWeights(), thesisFieldWeights()]) {
      const total = Object.values(weights).reduce((sum, weight) => sum + weight, 0);
      expect(total).toBeCloseTo(100, 6);
    }
  });
});

describe("buildQualityReport", () => {
  it("ranks fields by impact on average completeness, not by how often they are missing", () => {
    // License is worth 4 points on a book, Description 14. Three records
    // missing a license (3 × 4 / 4 records = 3.0 points) is worth LESS to the
    // collection than one record missing a description (14 / 4 = 3.5) — the
    // raw counts say the opposite, which is exactly the trap this ranking
    // exists to avoid.
    const report = buildQualityReport([
      book("a", 96, ["license"]),
      book("b", 96, ["license"]),
      book("c", 96, ["license"]),
      book("d", 86, ["description"]),
    ]);

    expect(report.fields.map((field) => field.key)).toEqual(["description", "license"]);
    expect(report.fields[0]).toMatchObject({ key: "description", count: 1, impact: 3.5 });
    expect(report.fields[1]).toMatchObject({ key: "license", count: 3, impact: 3 });
    expect(report.fields[1].share).toBeCloseTo(0.75, 6);
  });

  it("weighs the same field key by the type it was missing from", () => {
    // "license" is 4/100 on a book but 6/120 (=5) on a thesis.
    const report = buildQualityReport([book("a", 96, ["license"]), thesis("b", 95, ["license"])]);
    expect(report.fields[0].impact).toBeCloseTo(4.5, 6); // (4 + 5) / 2 records
    expect(report.fields[0].types.sort()).toEqual(["book", "research"]);
  });

  it("queues only records with gaps, worst first, while scoring every record", () => {
    const report = buildQualityReport([
      book("clean", 100, []),
      book("bad", 30, ["title", "pdf"]),
      book("mid", 75, ["license"]),
    ]);

    expect(report.scoredCount).toBe(3);
    expect(report.completeCount).toBe(1);
    expect(report.gaps.map((record) => record.id)).toEqual(["bad", "mid"]);
    expect(report.averageCompleteness).toBe(68); // (100 + 30 + 75) / 3
  });

  it("reports the tier distribution and per-type averages", () => {
    const report = buildQualityReport([
      book("a", 95, []),
      book("b", 72, ["license"]),
      thesis("c", 45, ["abstract"]),
      thesis("d", 20, ["abstract", "pdf"]),
    ]);

    expect(report.tiers).toEqual([
      { tier: "complete", label: "Complete", count: 1 },
      { tier: "good", label: "Good", count: 1 },
      { tier: "needs_review", label: "Needs Review", count: 1 },
      { tier: "incomplete", label: "Incomplete", count: 1 },
    ]);
    expect(report.byType.book).toEqual({ count: 2, average: 84 });
    expect(report.byType.research).toEqual({ count: 2, average: 33 });
  });

  it("treats an empty library as complete rather than as 0%", () => {
    const report = buildQualityReport([]);
    expect(report.averageCompleteness).toBe(100);
    expect(report.fields).toEqual([]);
  });
});

describe("filterGaps", () => {
  const gaps = [
    book("a", 30, ["license", "pdf"]),
    book("b", 75, ["license"]),
    thesis("c", 45, ["abstract"]),
  ];

  it("narrows by record type", () => {
    expect(filterGaps(gaps, { type: "research" }).map((record) => record.id)).toEqual(["c"]);
    expect(filterGaps(gaps, { type: "all" })).toHaveLength(3);
  });

  it("narrows by the missing field, matching on key rather than label", () => {
    expect(filterGaps(gaps, { field: "license" }).map((record) => record.id)).toEqual(["a", "b"]);
    expect(filterGaps(gaps, { field: "nothing-missing-this" })).toEqual([]);
  });

  it("narrows by tier and combines filters", () => {
    expect(filterGaps(gaps, { tier: "incomplete" }).map((record) => record.id)).toEqual(["a"]);
    expect(filterGaps(gaps, { type: "book", field: "license", tier: "good" }).map((r) => r.id)).toEqual(["b"]);
  });

  it("matches titles case-insensitively", () => {
    expect(filterGaps(gaps, { query: "thesis c" }).map((record) => record.id)).toEqual(["c"]);
  });
});

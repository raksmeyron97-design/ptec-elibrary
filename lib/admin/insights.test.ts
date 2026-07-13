import { describe, expect, it } from "vitest";
import { generateInsights, type InsightInputs } from "./insights";

const base: InsightInputs = {
  views: { current: 0, previous: 0 },
  readerOpens: { current: 0, previous: 0 },
  repeatedZeroResultTerms: 0,
  newContentWithoutViews: 0,
  departments: [],
  storageErrors: { current: 0, previous: 0 },
  khmerSearchShare: { current: null, previous: null, total: 0 },
  periodQuery: "range=30d",
};

describe("generateInsights", () => {
  it("returns nothing on an empty period", () => {
    expect(generateInsights(base)).toEqual([]);
  });

  it("flags views up while reader-open conversion falls (with samples)", () => {
    const out = generateInsights({
      ...base,
      views: { current: 200, previous: 100 },
      readerOpens: { current: 10, previous: 20 }, // conv 5% vs 20%
    });
    expect(out.map((i) => i.key)).toContain("viewsUpConversionDown");
  });

  it("stays silent below the engagement sample threshold", () => {
    const out = generateInsights({
      ...base,
      views: { current: 15, previous: 5 }, // both under 20
      readerOpens: { current: 1, previous: 2 },
    });
    expect(out).toEqual([]);
  });

  it("flags repeated zero-result terms at the ≥3 threshold only", () => {
    expect(generateInsights({ ...base, repeatedZeroResultTerms: 2 })).toEqual([]);
    const out = generateInsights({ ...base, repeatedZeroResultTerms: 5 });
    expect(out[0]).toMatchObject({ key: "zeroResultRepeats", params: { terms: 5 } });
  });

  it("flags departments with outsized demand and a thin collection", () => {
    const out = generateInsights({
      ...base,
      departments: [
        { name: "ស្ថិតិ", resources: 2, viewsPerResource: 12 },
        { name: "A", resources: 30, viewsPerResource: 2 },
        { name: "B", resources: 40, viewsPerResource: 3 },
      ],
    });
    expect(out[0]).toMatchObject({ key: "deptDemandLowCoverage", params: { dept: "ស្ថិតិ" } });
  });

  it("requires at least 3 departments before comparing coverage", () => {
    const out = generateInsights({
      ...base,
      departments: [
        { name: "ស្ថិតិ", resources: 2, viewsPerResource: 12 },
        { name: "A", resources: 30, viewsPerResource: 2 },
      ],
    });
    expect(out).toEqual([]);
  });

  it("flags a storage failure increase only from 3 failures", () => {
    expect(generateInsights({ ...base, storageErrors: { current: 2, previous: 0 } })).toEqual([]);
    const out = generateInsights({ ...base, storageErrors: { current: 4, previous: 1 } });
    expect(out[0].key).toBe("storageFailuresUp");
  });

  it("celebrates Khmer search growth with enough volume", () => {
    const out = generateInsights({
      ...base,
      khmerSearchShare: { current: 45, previous: 30, total: 50 },
    });
    expect(out[0]).toMatchObject({ key: "khmerSearchGrowth", severity: "positive" });
  });

  it("ignores Khmer share moves on tiny samples", () => {
    const out = generateInsights({
      ...base,
      khmerSearchShare: { current: 45, previous: 30, total: 10 },
    });
    expect(out).toEqual([]);
  });
});

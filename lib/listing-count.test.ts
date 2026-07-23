// lib/listing-count.test.ts
//
// Pins the filtered-vs-global rule for listing headers. The failure this
// guards against is a listing quoting the number of rows it happens to have
// loaded, or quoting the global total while filters are narrowing the grid.
import { describe, it, expect } from "vitest";
import { chooseCountLabel } from "./listing-count";

describe("chooseCountLabel", () => {
  it("shows one number when nothing is filtered", () => {
    expect(chooseCountLabel(116, 116, false)).toEqual({ kind: "total", count: 116 });
  });

  it("shows 'N of M' when filters narrow the set", () => {
    expect(chooseCountLabel(24, 116, true)).toEqual({ kind: "filtered", count: 24, total: 116 });
  });

  it("shows one number when filters happen to match everything", () => {
    // "116 of 116" is noise, not information.
    expect(chooseCountLabel(116, 116, true)).toEqual({ kind: "total", count: 116 });
  });

  it("degrades to the filtered figure when the global total is unavailable", () => {
    // Stats service down: state what we know, never invent a denominator.
    expect(chooseCountLabel(24, null, true)).toEqual({ kind: "total", count: 24 });
  });

  it("never renders a nonsensical 'N of M' where N > M", () => {
    // A record published seconds ago can briefly exceed the cached global.
    expect(chooseCountLabel(120, 116, true)).toEqual({ kind: "total", count: 120 });
  });

  it("reports 'none' for an empty result so call sites use their empty copy", () => {
    expect(chooseCountLabel(0, 116, true)).toEqual({ kind: "none" });
    expect(chooseCountLabel(0, 116, false)).toEqual({ kind: "none" });
  });

  it("treats a non-finite filtered total as empty rather than rendering NaN", () => {
    expect(chooseCountLabel(Number.NaN, 116, false)).toEqual({ kind: "none" });
  });

  it("ignores a non-finite global total instead of propagating it", () => {
    expect(chooseCountLabel(24, Number.NaN, true)).toEqual({ kind: "total", count: 24 });
  });
});

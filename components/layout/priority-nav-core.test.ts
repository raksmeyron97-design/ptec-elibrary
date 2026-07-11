import { describe, expect, it } from "vitest";
import { computeVisibleCount } from "./priority-nav-core";

describe("computeVisibleCount", () => {
  it("shows everything when the total fits (More width is not reserved)", () => {
    expect(computeVisibleCount([100, 100, 100], 80, 300)).toBe(3);
  });

  it("absorbs sub-pixel rounding at the exact boundary", () => {
    expect(computeVisibleCount([100.2, 100.2, 100.1], 80, 300.1)).toBe(3);
  });

  it("collapses trailing items and reserves room for the More trigger", () => {
    // 3 items of 100 in 250px: all three don't fit; with More (80) reserved,
    // only one item fits (80 + 100 + 100 = 280 > 250).
    expect(computeVisibleCount([100, 100, 100], 80, 250)).toBe(1);
  });

  it("keeps as many leading items as fit alongside More", () => {
    expect(computeVisibleCount([100, 100, 100], 40, 250)).toBe(2);
  });

  it("collapses everything when even one item cannot fit next to More", () => {
    expect(computeVisibleCount([200, 200], 80, 220)).toBe(0);
  });

  it("handles wide localized labels (Khmer-sized widths)", () => {
    // Approximate Khmer top-level widths at 1024px with ~400px available.
    expect(computeVisibleCount([120, 210, 220, 230, 140], 110, 400)).toBe(1);
  });

  it("returns full length for an empty list", () => {
    expect(computeVisibleCount([], 80, 0)).toBe(0);
  });
});

import { describe, expect, it } from "vitest";
import { computeVirtualRange, mergeRanges, pageAtScroll, rowTop } from "./virtual";

const ROW = 1000;
const INSET = 52;

describe("rowTop / pageAtScroll", () => {
  it("places row 1 below the HUD inset and round-trips", () => {
    expect(rowTop(1, ROW, INSET)).toBe(INSET);
    expect(rowTop(7, ROW, INSET)).toBe(INSET + 6 * ROW);
    for (const p of [1, 2, 50, 499]) {
      expect(pageAtScroll(rowTop(p, ROW, INSET), 800, ROW, 500, INSET)).toBe(p);
    }
  });

  it("turns the indicator over once the next page crosses the 35% line", () => {
    const top = rowTop(3, ROW, INSET);
    expect(pageAtScroll(top + 649, 1000, ROW, 10, INSET)).toBe(3);
    expect(pageAtScroll(top + 651, 1000, ROW, 10, INSET)).toBe(4);
  });

  it("clamps to the document", () => {
    expect(pageAtScroll(-500, 800, ROW, 10, INSET)).toBe(1);
    expect(pageAtScroll(10_000_000, 800, ROW, 10, INSET)).toBe(10);
    expect(pageAtScroll(0, 800, ROW, 0, INSET)).toBe(1);
  });
});

describe("computeVirtualRange", () => {
  const input = { viewportHeight: 800, rowHeight: ROW, numPages: 500, insetTop: INSET };

  it("mounts only the visible window with zero overscan (first-page priority)", () => {
    const r = computeVirtualRange({ ...input, scrollTop: 0, overscan: 0 });
    expect([r.start, r.end]).toEqual([1, 2]);
    expect(r.before).toBe(0);
    expect(r.after).toBe(498 * ROW);
  });

  it("never mounts a whole book — visible + overscan only", () => {
    const r = computeVirtualRange({ ...input, scrollTop: rowTop(250, ROW, INSET), overscan: 3 });
    expect(r.end - r.start + 1).toBeLessThanOrEqual(2 + 3 * 2);
    expect(r.visibleStart).toBe(250);
    expect(r.start).toBe(247);
    expect(r.before + r.after + (r.end - r.start + 1) * ROW).toBe(500 * ROW);
  });

  it("clamps overscan at both ends", () => {
    const first = computeVirtualRange({ ...input, scrollTop: 0, overscan: 2 });
    expect(first.start).toBe(1);
    const last = computeVirtualRange({ ...input, scrollTop: rowTop(500, ROW, INSET), overscan: 2 });
    expect(last.end).toBe(500);
    expect(last.after).toBe(0);
  });

  it("is a single page until there is a document or a viewport", () => {
    expect(computeVirtualRange({ ...input, numPages: 0, scrollTop: 0, overscan: 2 }).end).toBe(1);
    expect(computeVirtualRange({ ...input, viewportHeight: 0, scrollTop: 0, overscan: 2 }).end).toBe(1);
  });
});

describe("mergeRanges", () => {
  it("unions the immediate window with the (possibly lagging) deferred one, ascending", () => {
    expect(mergeRanges({ start: 10, end: 11 }, { start: 8, end: 13 }, 500)).toEqual([8, 9, 10, 11, 12, 13]);
    expect(mergeRanges({ start: 10, end: 11 }, { start: 30, end: 32 }, 500)).toHaveLength(23);
  });
  it("clamps to the document", () => {
    expect(mergeRanges({ start: 1, end: 2 }, { start: -3, end: 900 }, 5)).toEqual([1, 2, 3, 4, 5]);
  });
});

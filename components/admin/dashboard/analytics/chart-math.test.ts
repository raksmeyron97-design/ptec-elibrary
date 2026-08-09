import { describe, expect, it } from "vitest";
import {
  createChartGeometry,
  monotoneAreaPath,
  monotonePath,
  monotoneSegments,
  niceChartMaximum,
  visiblePointIndexes,
} from "./chart-math";

function cubic(a: number, b: number, c: number, d: number, t: number): number {
  const inverse = 1 - t;
  return inverse ** 3 * a + 3 * inverse ** 2 * t * b + 3 * inverse * t ** 2 * c + t ** 3 * d;
}

describe("monotone chart math", () => {
  it("builds a smooth cubic path without a chart dependency", () => {
    const path = monotonePath([
      { x: 0, y: 10 },
      { x: 50, y: 5 },
      { x: 100, y: 20 },
    ]);
    expect(path).toMatch(/^M0,10 C/);
    expect(path).toContain("100,20");
    expect(path).not.toMatch(/NaN|Infinity/);
  });

  it("does not overshoot either endpoint of a monotonic segment", () => {
    const segments = monotoneSegments([
      { x: 0, y: 2 },
      { x: 10, y: 6 },
      { x: 25, y: 7 },
      { x: 40, y: 14 },
    ]);
    for (const segment of segments) {
      const low = Math.min(segment.start.y, segment.end.y);
      const high = Math.max(segment.start.y, segment.end.y);
      for (let step = 0; step <= 20; step++) {
        const y = cubic(
          segment.start.y,
          segment.control1.y,
          segment.control2.y,
          segment.end.y,
          step / 20,
        );
        expect(y).toBeGreaterThanOrEqual(low - 1e-8);
        expect(y).toBeLessThanOrEqual(high + 1e-8);
      }
    }
  });

  it("handles empty, singleton, flat, and area paths", () => {
    expect(monotonePath([])).toBe("");
    expect(monotonePath([{ x: 2, y: 3 }])).toBe("M2,3");
    expect(monotonePath([{ x: 0, y: 4 }, { x: 10, y: 4 }])).not.toMatch(/NaN/);
    expect(monotoneAreaPath([{ x: 2, y: 3 }], 10)).toBe("M2,3 L2,10 L2,10 Z");
  });

  it("rejects duplicate/reversed x coordinates rather than drawing corrupt SVG", () => {
    expect(() => monotonePath([{ x: 1, y: 1 }, { x: 1, y: 2 }])).toThrow(/strictly increasing/);
  });
});

describe("chart geometry", () => {
  it("creates a clean four-step y domain and stable coordinates", () => {
    expect(niceChartMaximum(17)).toBe(20);
    const geometry = createChartGeometry({ width: 600, height: 240, maximum: 17 });
    expect(geometry.ticks.map((tick) => tick.value)).toEqual([0, 5, 10, 15, 20]);
    expect(geometry.x(0, 2)).toBe(geometry.left);
    expect(geometry.x(1, 2)).toBe(600 - geometry.right);
    expect(geometry.y(0)).toBe(240 - geometry.bottom);
  });

  it("caps interactive point complexity while retaining endpoints", () => {
    const indexes = visiblePointIndexes(365, 120);
    expect(indexes).toHaveLength(120);
    expect(indexes[0]).toBe(0);
    expect(indexes.at(-1)).toBe(364);
    expect(visiblePointIndexes(3, 120)).toEqual([0, 1, 2]);
  });
});

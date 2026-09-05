import { describe, expect, it } from "vitest";
import { planMounts, prefetchOrder, readingDirection, splitOverscan } from "./prefetch";

describe("splitOverscan", () => {
  it("is symmetric with no direction, odd page ahead", () => {
    expect(splitOverscan(4, 0)).toEqual({ before: 2, after: 2 });
    expect(splitOverscan(3, 0)).toEqual({ before: 1, after: 2 });
    expect(splitOverscan(0, 0)).toEqual({ before: 0, after: 0 });
  });
  it("leans two thirds into the reading direction", () => {
    expect(splitOverscan(6, 1)).toEqual({ before: 2, after: 4 });
    expect(splitOverscan(6, -1)).toEqual({ before: 4, after: 2 });
    expect(splitOverscan(2, 1)).toEqual({ before: 0, after: 2 });
    expect(splitOverscan(1, -1)).toEqual({ before: 1, after: 0 });
  });
});

describe("prefetchOrder", () => {
  it("puts the nearest page first and the reading direction's side ahead", () => {
    // Reading page 100 forward: 101, 102, 103 come before 99, 98.
    expect(prefetchOrder({ visible: { start: 100, end: 100 }, numPages: 500, overscan: 6, direction: 1 }))
      .toEqual([101, 99, 102, 98, 103, 104]);
    expect(prefetchOrder({ visible: { start: 100, end: 100 }, numPages: 500, overscan: 6, direction: -1 }))
      .toEqual([99, 101, 98, 102, 97, 96]);
  });
  it("after a jump the order is symmetric around the landing page", () => {
    expect(prefetchOrder({ visible: { start: 250, end: 251 }, numPages: 500, overscan: 4, direction: 0 }))
      .toEqual([252, 249, 253, 248]);
  });
  it("never leaves the document and never names a visible page; an end of the book spills the budget to the other side", () => {
    expect(prefetchOrder({ visible: { start: 1, end: 2 }, numPages: 500, overscan: 4, direction: 0 })).toEqual([3, 4, 5, 6]);
    expect(prefetchOrder({ visible: { start: 499, end: 500 }, numPages: 500, overscan: 4, direction: 1 })).toEqual([498, 497, 496, 495]);
    expect(prefetchOrder({ visible: { start: 1, end: 2 }, numPages: 4, overscan: 4, direction: 0 })).toEqual([3, 4]);
    expect(prefetchOrder({ visible: { start: 1, end: 3 }, numPages: 3, overscan: 6, direction: 1 })).toEqual([]);
    expect(prefetchOrder({ visible: { start: 1, end: 1 }, numPages: 0, overscan: 6, direction: 1 })).toEqual([]);
  });
});

describe("planMounts", () => {
  const base = {
    visible: { start: 100, end: 101 },
    numPages: 500,
    maxConcurrent: 2,
    visibleReady: true,
    online: true,
  };
  const order = prefetchOrder({ visible: base.visible, numPages: 500, overscan: 4, direction: 1 });

  it("mounts the visible window and at most maxConcurrent unsettled prefetch pages", () => {
    const plan = planMounts({ ...base, candidates: order, settled: new Set([100, 101]) });
    expect(plan.mounted).toEqual([99, 100, 101, 102]);
    expect(plan.prefetch).toEqual([102, 99]);
    expect(plan.inFlight).toBe(2);
  });

  it("admits the next candidate only once an in-flight one has settled", () => {
    const progressed = planMounts({ ...base, candidates: order, settled: new Set([100, 101, 102]) });
    expect(progressed.prefetch).toEqual([102, 99, 103]);
    expect(progressed.inFlight).toBe(2);
    expect(progressed.mounted).toEqual([99, 100, 101, 102, 103]);
  });

  it("counts a FAILED page as settled, so one bad page cannot stall the window", () => {
    // 102 failed to load; it is settled, so 103 gets the slot rather than the
    // reader waiting forever for a page that will never paint.
    const plan = planMounts({ ...base, candidates: order, settled: new Set([100, 101, 102]) });
    expect(plan.prefetch).toContain(103);
  });

  it("holds every prefetch until the visible pages have painted", () => {
    const plan = planMounts({ ...base, visibleReady: false, candidates: order, settled: new Set() });
    expect(plan.mounted).toEqual([100, 101]);
    expect(plan.prefetch).toEqual([]);
  });

  it("starts nothing new while offline but keeps what is already rendered", () => {
    const plan = planMounts({ ...base, online: false, candidates: order, settled: new Set([100, 101, 102]) });
    expect(plan.prefetch).toEqual([102]);
    expect(plan.inFlight).toBe(0);
    expect(plan.mounted).toEqual([100, 101, 102]);
  });

  it("a jump reprioritises: work on the old neighbours stops, the new ones start", () => {
    const after = prefetchOrder({ visible: { start: 250, end: 250 }, numPages: 500, overscan: 4, direction: 0 });
    const plan = planMounts({
      ...base,
      visible: { start: 250, end: 250 },
      candidates: after,
      settled: new Set([100, 101, 250]),
    });
    expect(plan.mounted).toEqual([249, 250, 251]);
    for (const stale of [99, 101, 102, 103]) expect(plan.mounted).not.toContain(stale);
  });

  it("a prefetch page that scrolls into view is simply a visible page", () => {
    const visible = { start: 102, end: 103 };
    const plan = planMounts({
      ...base,
      visible,
      candidates: prefetchOrder({ visible, numPages: 500, overscan: 4, direction: 1 }),
      settled: new Set([102, 103, 99]),
    });
    // 104 ahead and 101 behind: the nearest unsettled candidates on each side.
    expect(plan.mounted).toEqual([101, 102, 103, 104]);
    expect(plan.prefetch).not.toContain(102);
    expect(plan.prefetch).not.toContain(103);
  });

  it("never mounts beyond visible + overscan, whatever the sequence", () => {
    const settled = new Set<number>();
    let maxMounted = 0;
    for (let step = 0; step < 60; step++) {
      const start = 1 + step * 3;
      const visible = { start, end: Math.min(500, start + 1) };
      const candidates = prefetchOrder({ visible, numPages: 500, overscan: 4, direction: 1 });
      const plan = planMounts({ ...base, visible, candidates, settled });
      for (const p of plan.mounted) settled.add(p);
      maxMounted = Math.max(maxMounted, plan.mounted.length);
    }
    expect(maxMounted).toBeLessThanOrEqual(2 + 4);
  });

  it("mounts nothing for an empty document", () => {
    const plan = planMounts({ ...base, numPages: 0, candidates: [], settled: new Set() });
    expect(plan.mounted).toEqual([]);
  });
});

describe("readingDirection", () => {
  it("reads a page turn as a direction and a jump as unknown", () => {
    expect(readingDirection(10, 11)).toBe(1);
    expect(readingDirection(10, 9)).toBe(-1);
    expect(readingDirection(10, 10)).toBe(0);
    expect(readingDirection(10, 250)).toBe(0);
    expect(readingDirection(10, 13)).toBe(1);
  });
});

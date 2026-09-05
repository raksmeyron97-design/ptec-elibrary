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

  it("mounts the visible window and admits at most maxConcurrent prefetch pages", () => {
    const plan = planMounts({ ...base, candidates: order, admitted: new Set(), rendered: new Set() });
    expect(plan.mounted).toEqual([99, 100, 101, 102]);
    expect(plan.admit).toEqual([102, 99]);
    expect(plan.inFlight).toBe(2);
    expect(plan.evict).toEqual([]);
  });

  it("admits the next candidate only once an in-flight one has rendered", () => {
    const stalled = planMounts({ ...base, candidates: order, admitted: new Set([102, 99]), rendered: new Set() });
    expect(stalled.admit).toEqual([]);
    const progressed = planMounts({ ...base, candidates: order, admitted: new Set([102, 99]), rendered: new Set([102]) });
    expect(progressed.admit).toEqual([103]);
    expect(progressed.mounted).toEqual([99, 100, 101, 102, 103]);
  });

  it("holds every prefetch until the visible pages have painted", () => {
    const plan = planMounts({ ...base, visibleReady: false, candidates: order, admitted: new Set(), rendered: new Set() });
    expect(plan.mounted).toEqual([100, 101]);
    expect(plan.admit).toEqual([]);
  });

  it("admits nothing while offline but keeps what is already mounted", () => {
    const plan = planMounts({ ...base, online: false, candidates: order, admitted: new Set([102]), rendered: new Set([102]) });
    expect(plan.admit).toEqual([]);
    expect(plan.mounted).toEqual([100, 101, 102]);
  });

  it("evicts admitted pages that left the window after a jump, deduplicating with the new window", () => {
    // Reading 100 with 101–103 in flight, then a jump to 250.
    const after = prefetchOrder({ visible: { start: 250, end: 250 }, numPages: 500, overscan: 4, direction: 0 });
    const plan = planMounts({
      ...base,
      visible: { start: 250, end: 250 },
      candidates: after,
      admitted: new Set([101, 102, 103]),
      rendered: new Set([101]),
    });
    expect(plan.evict).toEqual([101, 102, 103]);
    expect(plan.admit).toEqual([251, 249]);
    expect(plan.mounted).toEqual([249, 250, 251]);
    expect(new Set(plan.mounted).size).toBe(plan.mounted.length);
  });

  it("a prefetch page that scrolls into view leaves the admitted set without being evicted", () => {
    const plan = planMounts({
      ...base,
      visible: { start: 102, end: 103 },
      candidates: prefetchOrder({ visible: { start: 102, end: 103 }, numPages: 500, overscan: 4, direction: 1 }),
      admitted: new Set([102, 99]),
      rendered: new Set([102, 99]),
    });
    expect(plan.evict).toEqual([99]);
    expect(plan.mounted).toEqual([101, 102, 103, 104]);
  });

  it("never mounts beyond visible + overscan, whatever the sequence", () => {
    let admitted = new Set<number>();
    const rendered = new Set<number>();
    let maxMounted = 0;
    for (let step = 0; step < 40; step++) {
      const start = 1 + step * 3;
      const visible = { start, end: Math.min(500, start + 1) };
      const candidates = prefetchOrder({ visible, numPages: 500, overscan: 4, direction: 1 });
      const plan = planMounts({ ...base, visible, candidates, admitted, rendered });
      for (const p of plan.mounted) rendered.add(p);
      admitted = new Set([...admitted].filter((p) => !plan.evict.includes(p)).concat(plan.admit));
      admitted = new Set([...admitted].filter((p) => p < visible.start || p > visible.end));
      maxMounted = Math.max(maxMounted, plan.mounted.length);
    }
    expect(maxMounted).toBeLessThanOrEqual(2 + 4);
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

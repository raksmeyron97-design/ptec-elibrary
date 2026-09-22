import { describe, expect, it } from "vitest";
import { computeVirtualRange, mergeRanges, pageAtScroll, rowTop, zoomAnchor } from "./virtual";

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

describe("zoomAnchor — the text under the fingers stays under the fingers", () => {
  // A 300-page A4 book on a 390 px phone: fit width is 358 px (PAD 32), and
  // every row adds SCROLL_PAGE_Y (24) of padding that does not scale.
  const INSET = 52;
  const PAD_TOP = 12;
  const PAD_X = 4;
  const VIEW_W = 390;
  const frame = (pageWidth: number) => {
    const pageHeight = Math.round(pageWidth * Math.SQRT2);
    return { pageWidth, pageHeight, rowHeight: pageHeight + 24 };
  };
  const left = (w: number) => Math.max(PAD_X, (VIEW_W - w) / 2);
  /** Page (1-based), fraction down it and fraction across it, under `focal`. */
  const pointAt = (scrollTop: number, scrollLeft: number, focal: { x: number; y: number }, f: ReturnType<typeof frame>) => {
    const y = scrollTop + focal.y - INSET;
    const row = Math.floor(y / f.rowHeight);
    return {
      page: row + 1,
      down: (y - row * f.rowHeight - PAD_TOP) / f.pageHeight,
      across: (scrollLeft + focal.x - left(f.pageWidth)) / f.pageWidth,
    };
  };
  /** The scrollTop that puts `down` of `page` under the focal line. */
  const scrollFor = (page: number, down: number, focalY: number, f: ReturnType<typeof frame>) =>
    INSET + (page - 1) * f.rowHeight + PAD_TOP + down * f.pageHeight - focalY;
  const anchor = (scrollTop: number, scrollLeft: number, focal: { x: number; y: number }, prev: ReturnType<typeof frame>, next: ReturnType<typeof frame>, rows = 300) =>
    zoomAnchor({ scrollTop, scrollLeft, focal, viewportWidth: VIEW_W, insetTop: INSET, rowPadTop: PAD_TOP, rowPadX: PAD_X, rows, prev, next });

  it("keeps the same spot of page 150 under a pinch (the old ratio maths landed on page 153)", () => {
    const focal = { x: 200, y: 400 };
    const prev = frame(358);
    const next = frame(680);
    const top = scrollFor(150, 0.3, focal.y, prev);
    const out = anchor(top, 0, focal, prev, next);
    const at = pointAt(out.scrollTop, out.scrollLeft, focal, next);
    expect(at.page).toBe(150);
    expect(at.down).toBeCloseTo(0.3, 3);
    expect(at.across).toBeCloseTo(pointAt(top, 0, focal, prev).across, 3);

    // The maths this replaces, kept here as the regression it was.
    const ratio = next.pageWidth / prev.pageWidth;
    const old = Math.max(0, (top + focal.y - INSET) * ratio + INSET - focal.y);
    expect(pointAt(old, 0, focal, next).page).toBeGreaterThanOrEqual(153);
  });

  it("stepping a preset (75 % → 100 %) around the viewport centre keeps the page, deep in the book", () => {
    const focal = { x: VIEW_W / 2, y: 422 };
    const prev = frame(446); // 75 % of a 595 pt page
    const next = frame(595); // 100 %
    const top = scrollFor(250, 0.62, focal.y, prev);
    const at = pointAt(anchor(top, 0, focal, prev, next).scrollTop, 0, focal, next);
    expect(at.page).toBe(250);
    expect(at.down).toBeCloseTo(0.62, 3);
  });

  it("zooming in then back out returns to the same offsets", () => {
    const focal = { x: 120, y: 300 };
    const a = frame(358);
    const b = frame(900);
    const top = scrollFor(80, 0.8, focal.y, a);
    const inward = anchor(top, 0, focal, a, b);
    const back = anchor(inward.scrollTop, inward.scrollLeft, focal, b, a);
    expect(back.scrollTop).toBeCloseTo(top, 6);
    expect(back.scrollLeft).toBeCloseTo(0, 6);
  });

  it("keeps the fraction across a centred page, and never scrolls left of zero", () => {
    const focal = { x: 60, y: 300 };
    const prev = frame(358); // centred: 16 px each side
    const next = frame(716); // overflows: starts at the row padding
    const top = scrollFor(2, 0.5, focal.y, prev);
    const out = anchor(top, 0, focal, prev, next);
    expect(out.scrollLeft).toBeGreaterThanOrEqual(0);
    expect(pointAt(out.scrollTop, out.scrollLeft, focal, next).across).toBeCloseTo((60 - 16) / 358, 3);
  });

  it("single-page mode is one row", () => {
    const focal = { x: 195, y: 500 };
    const prev = frame(358);
    const next = frame(537);
    const top = scrollFor(1, 0.7, focal.y, prev);
    const out = anchor(top, 0, focal, prev, next, 1);
    const at = pointAt(out.scrollTop, out.scrollLeft, focal, next);
    expect(at.page).toBe(1);
    expect(at.down).toBeCloseTo(0.7, 3);
  });
});

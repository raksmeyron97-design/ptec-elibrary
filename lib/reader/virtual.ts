/* Pure virtualisation maths for continuous-scroll mode.

   The scroll content is a column of equal-height rows (one per page) with an
   INSET above the first row and below the last one, so that the overlaid
   reader HUD never sits on top of page 1's first lines at scrollTop 0, nor on
   the last page's final lines at the bottom. Every scroll↔page conversion in
   the reader goes through these two functions so the inset can never be
   forgotten on one side of the round trip. */

export const clamp = (min: number, max: number, v: number): number =>
  Math.max(min, Math.min(max, v));

export type VirtualInput = {
  scrollTop: number;
  viewportHeight: number;
  rowHeight: number;
  numPages: number;
  /** Rows kept mounted before/after the visible window. */
  overscan: number;
  /** Space reserved above row 1 (the top HUD) — see file comment. */
  insetTop: number;
};

export type VirtualRange = {
  /** First and last mounted page (inclusive). */
  start: number;
  end: number;
  /** Spacer heights so the scrollbar reflects the whole document. */
  before: number;
  after: number;
  /** The strictly visible window — what must render first. */
  visibleStart: number;
  visibleEnd: number;
};

/** Top offset of a page's row inside the scroll content. */
export function rowTop(page: number, rowHeight: number, insetTop: number): number {
  return insetTop + (page - 1) * rowHeight;
}

/** The page the reader is "on" for a given scrollTop: the row crossing a line
    35% down the viewport. That line — rather than the top edge — is what makes
    the indicator turn over when most of the next page is in view, and stops a
    sliver of the previous page at the top from counting. */
export function pageAtScroll(
  scrollTop: number,
  viewportHeight: number,
  rowHeight: number,
  numPages: number,
  insetTop: number,
): number {
  if (!numPages || !rowHeight) return 1;
  const line = scrollTop - insetTop + viewportHeight * 0.35;
  return clamp(1, numPages, Math.floor(line / rowHeight) + 1);
}

export function computeVirtualRange(input: VirtualInput): VirtualRange {
  const { scrollTop, viewportHeight, rowHeight, numPages, overscan, insetTop } = input;
  if (!numPages || !rowHeight || !viewportHeight) {
    const only = Math.min(numPages || 1, 1);
    return { start: 1, end: only, before: 0, after: 0, visibleStart: 1, visibleEnd: only };
  }
  const firstVisible = clamp(
    1,
    numPages,
    Math.floor(Math.max(0, scrollTop - insetTop) / rowHeight) + 1,
  );
  const visibleCount = Math.max(1, Math.ceil(viewportHeight / rowHeight));
  const visibleEnd = clamp(1, numPages, firstVisible + visibleCount);
  const start = clamp(1, numPages, firstVisible - overscan);
  const end = clamp(1, numPages, visibleEnd + overscan);
  return {
    start,
    end,
    before: (start - 1) * rowHeight,
    after: (numPages - end) * rowHeight,
    visibleStart: firstVisible,
    visibleEnd,
  };
}

/** Pages to mount, ascending: the immediate visible window merged with a
    (possibly lagging) deferred range that carries the overscan. React renders
    the visible window at normal priority and the overscan in a deferred pass,
    which is what puts the page the reader is looking at ahead of its
    neighbours in pdf.js's render queue. */
export function mergeRanges(
  immediate: { start: number; end: number },
  deferred: { start: number; end: number },
  numPages: number,
): number[] {
  const start = clamp(1, numPages || 1, Math.min(immediate.start, deferred.start));
  const end = clamp(1, numPages || 1, Math.max(immediate.end, deferred.end));
  const pages: number[] = [];
  for (let p = start; p <= end; p++) pages.push(p);
  return pages;
}

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

/** One side of a zoom: the geometry the rows are laid out with. */
export type ZoomFrame = {
  /** Rendered page width, CSS px. */
  pageWidth: number;
  /** Rendered page height — the page box inside every row. */
  pageHeight: number;
  /** Row pitch: the page height plus the row's fixed vertical padding. */
  rowHeight: number;
};

/**
 * Where to scroll after the page width changes (pinch, double-tap, ± and the
 * zoom presets, Ctrl + wheel, a fit mode) so the point under `focal` — the
 * finger midpoint, the tap, the pointer, or the viewport centre — is the SAME
 * point of the SAME page afterwards.
 *
 * Scaling the raw scroll offset by the width ratio, which is what the reader
 * did, is wrong twice over. Every row carries SCROLL_PAGE_Y of padding that
 * does not scale, so the error is (page − 1) × SCROLL_PAGE_Y × (ratio − 1) and
 * grows with depth: measured in the real reader at 390 px, a pinch at page
 * 150 landed on page 153 and one at page 280 on page 286; stepping 75 % →
 * 100 % at page 150 landed on page 152. And a page narrower than the viewport
 * is centred, so its left margin does not scale either.
 *
 * So: map the point to (row, fraction down its page, fraction across it) with
 * the OLD geometry, and back to pixels with the NEW one.
 */
export function zoomAnchor(input: {
  scrollTop: number;
  scrollLeft: number;
  /** The fixed point, in viewport coordinates. */
  focal: { x: number; y: number };
  /** The scroll viewport's clientWidth. */
  viewportWidth: number;
  /** Content above the first row (the top HUD inset). */
  insetTop: number;
  /** Padding above the page inside a row. */
  rowPadTop: number;
  /** Horizontal padding of a row: a page wider than the viewport starts here. */
  rowPadX: number;
  /** Rows in the column: the page count in scroll mode, 1 in single-page mode. */
  rows: number;
  prev: ZoomFrame;
  next: ZoomFrame;
}): { scrollTop: number; scrollLeft: number } {
  const { scrollTop, scrollLeft, focal, viewportWidth, insetTop, rowPadTop, rowPadX, rows, prev, next } = input;

  const y = scrollTop + focal.y - insetTop;
  const row = clamp(0, Math.max(0, rows - 1), Math.floor(y / prev.rowHeight));
  const down = (y - row * prev.rowHeight - rowPadTop) / prev.pageHeight;
  const nextY = insetTop + row * next.rowHeight + rowPadTop + down * next.pageHeight;

  // A page narrower than the viewport is centred; a wider one starts at the
  // row's padding.
  const left = (width: number) => Math.max(rowPadX, (viewportWidth - width) / 2);
  const across = (scrollLeft + focal.x - left(prev.pageWidth)) / prev.pageWidth;
  const nextX = left(next.pageWidth) + across * next.pageWidth;

  return { scrollTop: Math.max(0, nextY - focal.y), scrollLeft: Math.max(0, nextX - focal.x) };
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

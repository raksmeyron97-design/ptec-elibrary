/* The prefetch planner for continuous-scroll mode — pure, so every admission
   and eviction decision is unit-testable.

   The visible window is mounted immediately and unconditionally: it is what
   the reader is looking at. Everything else is PREFETCH, and prefetch is
   admitted, not mounted:

     • pages beyond the window are ordered nearest-first, biased towards the
       direction the reader is moving (a reader going forward gets two rows
       ahead for every one behind);
     • at most `maxConcurrent` prefetch pages may be rendering at once, and
       none is admitted until the visible pages have painted — background
       rasters share pdf.js's 15 ms render slices with the page being read;
     • pages that fall out of the window are dropped, which cancels their
       render task (react-pdf does that on unmount) and releases their canvas.
       A direction change re-orders the candidates, so an in-flight prefetch
       that is no longer the nearest page yields its slot to one that is —
       jumping from page 100 to page 250 stops work on 101–103 rather than
       finishing it;
     • nothing is admitted while offline: an unmounted page costs no request,
       and a request that fails leaves its chunk permanently broken in
       pdf.js's stream manager (see docs/READER-PRODUCTION-AUDIT-2.md, F2).

   "Rendered" is a page whose canvas has painted at the CURRENT geometry; the
   component resets it on zoom/rotation so a resize re-rasterises the visible
   page before any neighbour. */

import { clamp } from "./virtual";

/** +1 reading forward, −1 backward, 0 unknown (fresh open, a jump). */
export type ReadingDirection = 1 | -1 | 0;

export type PageRange = { start: number; end: number };

/** Split an overscan budget between behind and ahead. Forward reading gets
    roughly two thirds ahead; the odd page always goes ahead. */
export function splitOverscan(total: number, direction: ReadingDirection): { before: number; after: number } {
  const t = Math.max(0, Math.floor(total));
  if (t === 0) return { before: 0, after: 0 };
  if (direction === 0) {
    const before = Math.floor(t / 2);
    return { before, after: t - before };
  }
  const major = Math.ceil((t * 2) / 3);
  const minor = t - major;
  return direction > 0 ? { before: minor, after: major } : { before: major, after: minor };
}

/**
 * Prefetch candidates in priority order: distance 1 first, alternating sides
 * with the reading direction's side first, out to the split budget. Page
 * numbers are clamped to the document; the visible window itself is never a
 * candidate.
 */
export function prefetchOrder(input: {
  visible: PageRange;
  numPages: number;
  overscan: number;
  direction: ReadingDirection;
}): number[] {
  const { visible, numPages, overscan, direction } = input;
  if (!numPages || overscan <= 0) return [];
  const { before, after } = splitOverscan(overscan, direction);
  const out: number[] = [];
  const seen = new Set<number>();
  const push = (p: number): boolean => {
    if (p < 1 || p > numPages || seen.has(p)) return false;
    seen.add(p);
    out.push(p);
    return true;
  };
  const max = Math.max(before, after);
  for (let d = 1; d <= max; d++) {
    const ahead = visible.end + d;
    const behind = visible.start - d;
    if (direction < 0) {
      if (d <= before) push(behind);
      if (d <= after) push(ahead);
    } else {
      if (d <= after) push(ahead);
      if (d <= before) push(behind);
    }
  }
  // The budget is a TOTAL. At either end of the document one side runs out of
  // pages; the unused share goes to the other side, nearest first, so the last
  // pages of a book get the same window as the middle.
  for (let d = 1; out.length < overscan && d <= numPages; d++) {
    const grew = push(visible.end + d) || push(visible.start - d);
    if (!grew && visible.end + d > numPages && visible.start - d < 1) break;
  }
  return out.slice(0, overscan);
}

export type MountPlan = {
  /** Every page to mount, ascending. */
  mounted: number[];
  /** The prefetch pages among them, in priority order. */
  prefetch: number[];
  /** Prefetch pages that have not settled yet — the concurrency in use. */
  inFlight: number;
};

/**
 * One planning round. A PURE FUNCTION of the current situation: the same
 * inputs give the same plan, and there is no admitted-set to keep in state
 * (which is what would otherwise need a commit effect, and could drift from
 * what is actually mounted).
 *
 *   visible      the strictly visible window (mounted whatever else is true)
 *   candidates   prefetchOrder() output, nearest first
 *   settled      pages whose canvas has painted OR failed at this geometry
 *   visibleReady every visible page has settled
 *   online       the reader may issue requests
 *
 * A candidate is mounted when it has already settled (keeping it costs
 * nothing and un-mounting it would throw the canvas away) or when fewer than
 * `maxConcurrent` unsettled prefetch pages are already mounted.
 */
export function planMounts(input: {
  visible: PageRange;
  numPages: number;
  candidates: readonly number[];
  settled: ReadonlySet<number>;
  maxConcurrent: number;
  visibleReady: boolean;
  online: boolean;
}): MountPlan {
  const { visible, numPages, candidates, settled, maxConcurrent, visibleReady, online } = input;
  const lo = clamp(1, numPages || 1, visible.start);
  const hi = clamp(1, numPages || 1, visible.end);

  const prefetch: number[] = [];
  let inFlight = 0;
  if (visibleReady && numPages) {
    for (const p of candidates) {
      if (p >= lo && p <= hi) continue; // already visible
      if (settled.has(p)) {
        prefetch.push(p);
        continue;
      }
      if (!online || inFlight >= Math.max(0, maxConcurrent)) continue;
      prefetch.push(p);
      inFlight += 1;
    }
  }

  const set = new Set<number>();
  if (numPages) for (let p = lo; p <= hi; p++) set.add(p);
  for (const p of prefetch) set.add(p);
  return { mounted: Array.from(set).sort((a, b) => a - b), prefetch, inFlight };
}

/** Which way the reader is moving, from two successive current pages. A jump
    of more than `jump` pages is treated as "unknown" — the reader landed
    somewhere and has not started reading in either direction yet. */
export function readingDirection(prev: number, next: number, jump = 3): ReadingDirection {
  const delta = next - prev;
  if (delta === 0 || Math.abs(delta) > jump) return 0;
  return delta > 0 ? 1 : -1;
}

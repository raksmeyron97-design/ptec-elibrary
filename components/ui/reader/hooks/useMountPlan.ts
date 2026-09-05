"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  planMounts,
  prefetchOrder,
  type PageRange,
  type ReadingDirection,
} from "@/lib/reader/prefetch";

/** A set of pages that is only valid for one key (a geometry, a document).
    Carrying the key WITH the value is what lets a stale set be recognised
    during render without touching a ref: a mismatch simply reads as empty. */
type KeyedPages = { key: string; pages: ReadonlySet<number> };

const EMPTY: ReadonlySet<number> = new Set();
const keyed = (key: string, pages: ReadonlySet<number>): KeyedPages => ({ key, pages });
const pagesFor = (state: KeyedPages, key: string): ReadonlySet<number> =>
  state.key === key ? state.pages : EMPTY;

function withPage(state: KeyedPages, key: string, page: number): KeyedPages {
  if (state.key === key && state.pages.has(page)) return state;
  const pages = new Set(state.key === key ? state.pages : []);
  pages.add(page);
  return { key, pages };
}

/**
 * Which pages continuous-scroll mode mounts, and in what order the ones the
 * reader is NOT looking at are allowed to start rendering.
 *
 * The decisions live in lib/reader/prefetch.ts (pure, tested). This hook owns
 * the bookkeeping React needs around them:
 *
 * The mounted set is DERIVED, not accumulated: there is no "admitted" state to
 * commit in an effect and no chance of it drifting from what is on screen.
 * Two pieces of state feed it:
 *
 *   • `settled`      — pages whose canvas painted OR failed at the CURRENT
 *                      geometry. A zoom or rotation changes the geometry key,
 *                      which invalidates the whole set, so a resize
 *                      re-rasterises the visible page before any neighbour is
 *                      admitted. Failures count as settled: a visible page
 *                      that cannot render must not block the window forever.
 *   • `everRendered` — pages that have painted at any geometry for this
 *                      document, i.e. whose bytes pdf.js already holds. It is
 *                      what makes a prefetch hit distinguishable from a miss.
 *
 * Every `onPageSettled` updates `settled`, so the plan is recomputed and the
 * next candidate admitted — that is how "at most N in flight" stays true
 * without a timer.
 *
 * THIS REPLACES the old `useDeferredValue` + `mergeRanges` pair, which took
 * the union of the immediate and the (lagging) deferred window. Those two are
 * adjacent while scrolling and arbitrarily far apart after a jump, so a resume
 * to page 500 or a "go to page" mounted EVERY page in between for as long as
 * the deferred value lagged. Measured on a real 500-page document: 500 pages
 * and 502 canvases mounted at open. Bounded here by construction — the plan
 * is the visible window plus an explicitly admitted set, never a span.
 */
export function useMountPlan({
  active,
  visible,
  numPages,
  overscan,
  direction,
  online,
  maxConcurrent,
  geometryKey,
  documentKey,
}: {
  /** False in single-page mode or before the document loads: the plan is empty. */
  active: boolean;
  visible: PageRange;
  numPages: number;
  /** Total prefetch pages beyond the visible window (already budgeted). */
  overscan: number;
  direction: ReadingDirection;
  online: boolean;
  maxConcurrent: number;
  /** Changes whenever every mounted page must re-render. */
  geometryKey: string;
  /** Changes when a different document is loaded (or reloaded). */
  documentKey: string;
}) {
  // The geometry key alone is not enough to invalidate: two documents can be
  // laid out identically. Both keys travel together.
  const renderKey = `${documentKey}|${geometryKey}`;
  const [settled, setSettled] = useState<KeyedPages>(() => keyed(renderKey, EMPTY));
  const [everRendered, setEverRendered] = useState<KeyedPages>(() => keyed(documentKey, EMPTY));
  const statsRef = useRef({ maxMounted: 0, hits: 0, misses: 0 });

  const settledNow = pagesFor(settled, renderKey);

  const candidates = useMemo(
    () => (active ? prefetchOrder({ visible, numPages, overscan, direction }) : []),
    [active, visible, numPages, overscan, direction],
  );

  const plan = useMemo(() => {
    if (!active || !numPages) return { mounted: [] as number[], prefetch: [] as number[], inFlight: 0 };
    let visibleReady = true;
    for (let p = visible.start; p <= visible.end; p++) {
      if (!settledNow.has(p)) {
        visibleReady = false;
        break;
      }
    }
    return planMounts({
      visible,
      numPages,
      candidates,
      settled: settledNow,
      maxConcurrent,
      visibleReady,
      online,
    });
  }, [active, numPages, visible, candidates, settledNow, maxConcurrent, online]);

  useEffect(() => {
    if (plan.mounted.length > statsRef.current.maxMounted) {
      statsRef.current.maxMounted = plan.mounted.length;
    }
  }, [plan.mounted.length]);

  const onPageSettled = useCallback(
    (page: number, painted: boolean) => {
      setSettled((prev) => withPage(prev, renderKey, page));
      if (painted) setEverRendered((prev) => withPage(prev, documentKey, page));
    },
    [renderKey, documentKey],
  );

  /** Did the reader land on a page the prefetcher had already fetched? */
  const everRenderedNow = pagesFor(everRendered, documentKey);
  const everRenderedRef = useRef(everRenderedNow);
  useEffect(() => {
    everRenderedRef.current = everRenderedNow;
  }, [everRenderedNow]);
  const notePageVisited = useCallback((page: number) => {
    if (everRenderedRef.current.has(page)) statsRef.current.hits += 1;
    else statsRef.current.misses += 1;
  }, []);

  return {
    mountedPages: plan.mounted,
    onPageSettled,
    notePageVisited,
    /** Snapshot for the session telemetry beacon. */
    stats: useCallback(() => ({ ...statsRef.current }), []),
  };
}

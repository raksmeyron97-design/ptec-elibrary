"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  planMounts,
  prefetchOrder,
  type PageRange,
  type ReadingDirection,
} from "@/lib/reader/prefetch";

/**
 * Which pages continuous-scroll mode mounts, and in what order the ones the
 * reader is NOT looking at are allowed to start rendering.
 *
 * The decisions live in lib/reader/prefetch.ts (pure, tested). This hook owns
 * the bookkeeping React needs around them:
 *
 *   • `settled`      — pages whose canvas painted OR failed at the CURRENT
 *                      geometry. Cleared when `geometryKey` changes (zoom,
 *                      rotation, DPR), so a resize re-rasterises the visible
 *                      page before any neighbour is admitted. Failures count
 *                      as settled: a visible page that cannot render must not
 *                      block the window forever.
 *   • `admitted`     — prefetch pages currently mounted beyond the visible
 *                      window.
 *   • `everRendered` — pages that have painted at any geometry for this
 *                      document, i.e. whose bytes pdf.js already holds. Reset
 *                      only when `documentKey` changes. It is what makes a
 *                      prefetch hit distinguishable from a miss.
 *
 * Every `onPageSettled` bumps a version, so the plan is recomputed and the
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
  const [admitted, setAdmitted] = useState<ReadonlySet<number>>(() => new Set());
  const settledRef = useRef<Set<number>>(new Set());
  const renderedRef = useRef<Set<number>>(new Set());
  const everRenderedRef = useRef<Set<number>>(new Set());
  const [version, setVersion] = useState(0);
  const statsRef = useRef({ maxMounted: 0, hits: 0, misses: 0 });

  // A new geometry invalidates every painted canvas; a new document
  // invalidates everything known about the pages themselves. Done during
  // render (not in an effect) so the very first plan after the change already
  // sees the cleared sets — an effect would run after one wrong plan.
  const geometryRef = useRef(geometryKey);
  const documentRef = useRef(documentKey);
  if (documentRef.current !== documentKey) {
    documentRef.current = documentKey;
    geometryRef.current = geometryKey;
    settledRef.current = new Set();
    renderedRef.current = new Set();
    everRenderedRef.current = new Set();
    statsRef.current = { maxMounted: 0, hits: 0, misses: 0 };
  } else if (geometryRef.current !== geometryKey) {
    geometryRef.current = geometryKey;
    settledRef.current = new Set();
    renderedRef.current = new Set();
  }
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAdmitted(new Set());
  }, [geometryKey, documentKey]);

  const candidates = useMemo(
    () => (active ? prefetchOrder({ visible, numPages, overscan, direction }) : []),
    [active, visible, numPages, overscan, direction],
  );

  const plan = useMemo(() => {
    if (!active || !numPages) {
      return { mounted: [] as number[], admit: [] as number[], evict: [] as number[], inFlight: 0 };
    }
    const settled = settledRef.current;
    let visibleReady = true;
    for (let p = visible.start; p <= visible.end; p++) {
      if (!settled.has(p)) {
        visibleReady = false;
        break;
      }
    }
    return planMounts({
      visible,
      numPages,
      candidates,
      admitted,
      rendered: settled,
      maxConcurrent,
      visibleReady,
      online,
    });
    // `version` is the settled-set clock: the sets are refs, so it must be
    // named here for the plan to move when a page paints.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, numPages, visible, candidates, admitted, maxConcurrent, online, version]);

  // Commit admissions and evictions. Only when something changed, so this
  // cannot loop: a plan with nothing to admit or evict leaves state alone.
  useEffect(() => {
    if (plan.admit.length === 0 && plan.evict.length === 0) return;
    setAdmitted((prev) => {
      const next = new Set(prev);
      for (const p of plan.evict) next.delete(p);
      for (const p of plan.admit) next.add(p);
      // A page that scrolled INTO the visible window stops being prefetch.
      for (const p of Array.from(next)) if (p >= visible.start && p <= visible.end) next.delete(p);
      return next.size === prev.size && [...next].every((p) => prev.has(p)) ? prev : next;
    });
  }, [plan, visible.start, visible.end]);

  if (plan.mounted.length > statsRef.current.maxMounted) {
    statsRef.current.maxMounted = plan.mounted.length;
  }

  const onPageSettled = useCallback((page: number, painted: boolean) => {
    settledRef.current.add(page);
    if (painted) {
      renderedRef.current.add(page);
      everRenderedRef.current.add(page);
    }
    setVersion((v) => v + 1);
  }, []);

  /** Did the reader land on a page the prefetcher had already fetched? */
  const notePageVisited = useCallback((page: number) => {
    if (everRenderedRef.current.has(page)) statsRef.current.hits += 1;
    else statsRef.current.misses += 1;
  }, []);

  return {
    mountedPages: plan.mounted,
    onPageSettled,
    notePageVisited,
    isRendered: useCallback((page: number) => renderedRef.current.has(page), []),
    /** Snapshot for the session telemetry beacon. */
    stats: useCallback(() => ({ ...statsRef.current }), []),
  };
}

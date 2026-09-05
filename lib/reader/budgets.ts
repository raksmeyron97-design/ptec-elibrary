/* Every bound the PDF reader enforces, in one place.

   These are the numbers that decide how much memory, how many requests and
   how much background work a reading session may cost. They are constants
   rather than scattered literals so that a test can pin each one, a change
   is a deliberate edit here, and the verification document can cite them.
   Read docs/READER-CACHING-STRATEGY.md before moving one. */

import type { NetworkTier } from "./preload";

const MiB = 1024 * 1024;

export const READER_BUDGETS = {
  /** Hard cap on pages mounted in continuous mode (visible window + overscan),
      whatever the tier says. Pinned by the component test with a 500-page book. */
  MAX_MOUNTED_PAGES: 12,

  /** Overscan pages per network tier — the TOTAL beyond the visible window,
      split between behind and ahead by the reading direction. */
  MAX_PREFETCH_PAGES: { slow: 2, normal: 4, fast: 6 } as Record<NetworkTier, number>,

  /** What the overscan window may cost in bytes, per tier. Divided by the
      document's measured bytes-per-page, so a scanned book prefetches fewer
      pages than a text one on the same link. */
  MAX_PREFETCH_BYTES: { slow: 1 * MiB, normal: 4 * MiB, fast: 12 * MiB } as Record<NetworkTier, number>,

  /** Overscan pages allowed to be rendering at the same time. pdf.js paints
      every in-flight render in 15 ms slices of the same animation frame, so
      each extra concurrent raster takes frames from the page being read. */
  MAX_CONCURRENT_PREFETCH: 2,

  /** Canvas backing-store budget for mounted pages. WebKit enforces a total
      canvas memory limit per page (a few hundred MB on iPad, less on older
      iPhones) and silently stops painting when it is exceeded; the desktop
      figure is a comfort bound, not a browser limit. */
  MAX_CANVAS_BYTES: { touch: 96 * MiB, desktop: 256 * MiB },

  /** In-document search stops collecting after this many matches. */
  MAX_SEARCH_MATCHES: 500,

  /** Thumbnail canvases mounted at once (visible column + overscan). */
  MAX_THUMBNAILS_MOUNTED: 16,

  /** Rendering idle time before `pdf.cleanup()` releases worker-side caches.
      The same value pdf.js's own viewer uses (CLEANUP_TIMEOUT). */
  IDLE_CLEANUP_MS: 30_000,

  /** Reconnect probe schedule. The last entry repeats. */
  RECONNECT_BACKOFF_MS: [2_000, 4_000, 8_000, 16_000, 30_000] as readonly number[],

  /** Requests the first painted page may cost before it is reported slow. */
  FIRST_PAGE_REQUEST_BUDGET: 12,
} as const;

export type DeviceClass = "touch" | "desktop";

/** Bytes one mounted page's canvas takes at the given CSS size and DPR. */
export function canvasBytes(pageWidth: number, pageHeight: number, dpr: number): number {
  if (!pageWidth || !pageHeight) return 0;
  return Math.ceil(pageWidth * dpr) * Math.ceil(pageHeight * dpr) * 4;
}

/** How many pages the canvas budget can hold at this geometry. Always ≥ 1:
    the page being read is rendered whatever it costs. */
export function maxPagesByCanvasBudget(
  perPageBytes: number,
  device: DeviceClass,
  budgets = READER_BUDGETS,
): number {
  if (perPageBytes <= 0) return budgets.MAX_MOUNTED_PAGES;
  return Math.max(1, Math.floor(budgets.MAX_CANVAS_BYTES[device] / perPageBytes));
}

/**
 * The overscan window (pages beyond the visible ones) the reader may mount.
 *
 * The minimum of three independent bounds:
 *   • the tier's page budget;
 *   • the tier's byte budget over the document's bytes per page (unknown →
 *     page budget alone);
 *   • what the canvas budget leaves after the visible pages, and the hard
 *     mount cap.
 */
export function prefetchWindowSize(input: {
  tier: NetworkTier;
  visibleCount: number;
  /** File size ÷ page count, when the length is known; else undefined. */
  bytesPerPage?: number;
  perPageCanvasBytes: number;
  device: DeviceClass;
  budgets?: typeof READER_BUDGETS;
}): number {
  const budgets = input.budgets ?? READER_BUDGETS;
  const byPages = budgets.MAX_PREFETCH_PAGES[input.tier];
  const byBytes =
    input.bytesPerPage && input.bytesPerPage > 0
      ? Math.floor(budgets.MAX_PREFETCH_BYTES[input.tier] / input.bytesPerPage)
      : byPages;
  const mountCap = Math.min(
    budgets.MAX_MOUNTED_PAGES,
    maxPagesByCanvasBudget(input.perPageCanvasBytes, input.device, budgets),
  );
  const byMemory = Math.max(0, mountCap - Math.max(1, input.visibleCount));
  return Math.max(0, Math.min(byPages, byBytes, byMemory));
}

/** Coarse device class for budgets and telemetry — never a user agent string. */
export function classifyDevice(input: {
  coarsePointer: boolean;
  viewportWidth: number;
}): "phone" | "tablet" | "desktop" {
  if (!input.coarsePointer) return "desktop";
  return input.viewportWidth < 768 ? "phone" : "tablet";
}

export const deviceBudgetClass = (d: "phone" | "tablet" | "desktop"): DeviceClass =>
  d === "desktop" ? "desktop" : "touch";

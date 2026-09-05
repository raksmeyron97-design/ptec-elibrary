"use client";

import { useEffect } from "react";
import { READER_BUDGETS } from "@/lib/reader/budgets";

type CleanableDocument = { cleanup?: (keepLoadedFonts?: boolean) => Promise<void> | void };

/**
 * Release pdf.js's WORKER-side caches when rendering has been idle.
 *
 * Per-page cleanup (ReaderPage) frees what the main thread decoded. The worker
 * keeps its own: a global image cache shared across pages, parsed font
 * programs, and the xref/object caches that grow with every page parsed. On a
 * long session through a scanned book those are the largest single allocation
 * in the tab, and nothing releases them while the document is open.
 *
 * `pdf.cleanup(true)` is pdf.js's own answer — the same call its viewer makes
 * on a 30 s idle timer — and `true` keeps loaded fonts, so returning to a page
 * does not re-download or re-parse them.
 *
 * The timer is reset by `activityKey`: any value that changes when a render
 * starts or finishes. Cleaning up while a render is in flight is documented by
 * pdf.js as a cause of rendering errors, so the caller must include in-flight
 * renders in that key.
 */
export function useIdleDocumentCleanup({
  pdf,
  activityKey,
  enabled = true,
  idleMs = READER_BUDGETS.IDLE_CLEANUP_MS,
}: {
  pdf: CleanableDocument | null;
  activityKey: string | number;
  enabled?: boolean;
  idleMs?: number;
}) {
  useEffect(() => {
    if (!enabled || !pdf) return;
    const timer = window.setTimeout(() => {
      try {
        void Promise.resolve(pdf.cleanup?.(true)).catch(() => {});
      } catch {
        /* a document torn down between the timer and here */
      }
    }, idleMs);
    return () => window.clearTimeout(timer);
  }, [pdf, activityKey, enabled, idleMs]);
}

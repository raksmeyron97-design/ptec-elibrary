"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import {
  measurePdfTransfer,
  safePdfPath,
  sendReaderEvent,
  type ReaderDeviceClass,
  type ReaderEventType,
} from "@/lib/reader/telemetry";
import { classifyDevice } from "@/lib/reader/budgets";
import type { MeasuredTransfer } from "@/lib/reader/preload";

export type ReportReaderEvent = (
  type: ReaderEventType,
  details?: {
    message?: string;
    page?: number;
    durationMs?: number;
    requests?: number;
    bytes?: number;
    source?: string;
    kind?: string;
    reloaded?: boolean;
    prefetchHits?: number;
    prefetchMisses?: number;
    maxMounted?: number;
  },
) => void;

/** Pointer type and viewport width only — never a user-agent string. */
function deviceClass(): ReaderDeviceClass {
  if (typeof window === "undefined") return "desktop";
  return classifyDevice({
    coarsePointer: !!window.matchMedia?.("(pointer: coarse)").matches,
    viewportWidth: window.innerWidth,
  });
}

/**
 * Reader telemetry: five event types, counts and enums only.
 *
 * `onFirstPagePainted` is THE number the large-PDF work optimises — emitted
 * once per document from the first page that actually finishes rendering
 * (not the document `load` event, which fires before anything is on screen),
 * with the request count and byte total behind it so a regression shows
 * WHICH of the two moved. It also flips `firstPagePainted`, which the
 * preload policy waits for before mounting any page the reader is not
 * looking at.
 */
export function useReaderTelemetry({
  bookId,
  pdfUrl,
  offline,
  fromCache,
  docKey,
  currentPageRef,
}: {
  bookId: string;
  pdfUrl: string | null | undefined;
  offline: boolean;
  fromCache: boolean;
  docKey: number;
  currentPageRef: RefObject<number>;
}) {
  // Keyed by document rather than a boolean that an effect resets: a page can
  // paint before this hook's own effect has run for the new document, and a
  // boolean reset after the fact would let the same document report twice.
  const docId = `${docKey}|${pdfUrl ?? ""}`;
  const reportedForRef = useRef<string | null>(null);
  const [firstPagePainted, setFirstPagePainted] = useState(false);
  /** What painting the first page cost, for the network tier. Undefined where
      Resource Timing cannot answer — never a guess. */
  const [firstPageTransfer, setFirstPageTransfer] = useState<MeasuredTransfer | undefined>(undefined);
  // The clock for the FIRST document starts at first render (a state
  // initialiser), not in an effect: children's effects — where react-pdf
  // reports a load — run before a parent's, so an effect-started clock could
  // read as "not started" at the very moment it is needed. Later documents
  // (a retry, a new file) load asynchronously, so restarting in an effect is
  // safe for them.
  const [clock, setClock] = useState(() => ({ id: docId, at: performance.now() }));
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (clock.id !== docId) setClock({ id: docId, at: performance.now() });
    if (reportedForRef.current !== docId) {
      setFirstPagePainted(false);
      setFirstPageTransfer(undefined);
    }
  }, [docId, clock.id]);

  const reportReaderEvent = useCallback<ReportReaderEvent>(
    (type, details = {}) => {
      if (offline) return; // nothing to send to, and nothing worth queueing
      sendReaderEvent({
        type,
        bookId,
        file: safePdfPath(pdfUrl, typeof window !== "undefined" ? window.location.origin : undefined),
        page: details.page ?? currentPageRef.current,
        message: details.message?.slice(0, 240),
        durationMs: details.durationMs,
        requests: details.requests,
        bytes: details.bytes,
        source: details.source,
        device: deviceClass(),
        kind: details.kind,
        reloaded: details.reloaded,
        prefetchHits: details.prefetchHits,
        prefetchMisses: details.prefetchMisses,
        maxMounted: details.maxMounted,
      });
    },
    [bookId, pdfUrl, offline, currentPageRef],
  );

  const onFirstPagePainted = useCallback(() => {
    if (reportedForRef.current === docId) return;
    reportedForRef.current = docId;
    setFirstPagePainted(true);
    const durationMs = Math.round(performance.now() - clock.at);
    const entries =
      typeof performance?.getEntriesByType === "function"
        ? (performance.getEntriesByType("resource") as PerformanceResourceTiming[])
        : null;
    const { requests, bytes } = measurePdfTransfer(pdfUrl, entries, window.location.origin);
    // Feeds the network tier where navigator.connection does not exist.
    if (typeof bytes === "number") setFirstPageTransfer({ bytes, durationMs });
    reportReaderEvent("pdf_first_page", {
      durationMs,
      requests,
      bytes,
      source: fromCache ? "cache" : "network",
    });
  }, [docId, clock.at, pdfUrl, fromCache, reportReaderEvent]);

  /** Milliseconds since the current document started loading. */
  const elapsed = useCallback(() => Math.round(performance.now() - clock.at), [clock.at]);

  return { reportReaderEvent, onFirstPagePainted, firstPagePainted, firstPageTransfer, elapsed };
}

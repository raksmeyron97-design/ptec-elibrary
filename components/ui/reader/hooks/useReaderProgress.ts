"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { saveReadingProgress } from "@/app/actions/reading-progress";
import { READER_KEYS, lsGet, lsSet } from "../reader-config";
import { isForeignRecord, parseLocalPosition } from "@/lib/reader/resume";

export const AUTOSAVE_MS = 1500;
export const LOCAL_POSITION_DEBOUNCE_MS = 400;
/** The keepalive endpoint behind the teardown flush. */
export const PROGRESS_BEACON_URL = "/api/reader/progress";

/**
 * Send the position with a request the browser finishes even if the document
 * is torn down mid-flight. Returns nothing: nobody is left to read a reply.
 */
function sendProgressBeacon(
  bookId: string,
  progressPct: number,
  page: number,
  pageCount: number,
): void {
  try {
    void fetch(PROGRESS_BEACON_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookId, progressPct, page, pageCount }),
      keepalive: true,
      // Same-origin only: the endpoint refuses a cross-origin POST anyway.
      credentials: "same-origin",
    }).catch(() => {});
  } catch {
    // A blocked or unsupported fetch must never break the page's teardown.
  }
}

/**
 * Reading progress: the exact page on this device (localStorage, debounced)
 * and — on the server — a rounded percentage AND, since 0141, that same exact
 * page. Both server writes are debounced, and flushed when the tab is hidden.
 *
 * THE PAGE IS SENT WITH THE PERCENTAGE, never on its own schedule. They
 * describe one position, so a transport that carried one without the other
 * would let them disagree in the database, and `serverResumePage()` uses the
 * percentage to sanity-check the page. Nothing here runs per scroll frame —
 * the inputs are the committed `currentPage`, which the scroll handler already
 * throttles to one update per animation frame, and only when the page
 * actually changes.
 *
 * `isLoggedIn` is already `prop && !offline`, so the offline reader never
 * reaches the server.
 *
 * TWO transports, deliberately:
 *   • the debounced autosave calls the `saveReadingProgress` Server Action —
 *     the page is alive and React owns the request;
 *   • the TEARDOWN flush posts to `/api/reader/progress` with
 *     `keepalive: true`. A Server Action is a plain `fetch()` this code cannot
 *     add `keepalive` to, so the browser cancelled it when the tab closed —
 *     losing the position exactly when a reader finishes a session. Both
 *     transports end in the same `upsertReadingProgress()`.
 *
 * NOTHING is persisted until `ready` (the document has loaded). Before that,
 * `numPages` is the `pages` column and `currentPage` a placeholder derived
 * from it — a 12-page file recorded as 120 pages put "page 120, 100%" into
 * localStorage and the server 400 ms after mount, over the real position.
 *
 * A FAILED SAVE IS RETRIED. `lastSaved` used to be advanced before the call,
 * so a save rejected while the link was down counted as done and the position
 * was not sent again until the reader turned another page: read offline to
 * page 80, reconnect, close the tab, and the server still held page 12. The
 * device record was right, so the same device resumed correctly and another
 * device did not — the hardest kind of loss to notice. Now a rejection puts
 * `lastSaved` back, which re-arms the debounce, and the browser's `online`
 * event re-runs it immediately.
 */
export function useReaderProgress({
  bookId,
  isLoggedIn,
  accountId,
  ready,
  numPages,
  currentPage,
  initialProgressPct,
  initialMaxProgressPct,
}: {
  bookId: string;
  isLoggedIn: boolean;
  /** The account this session belongs to, so the device record can say whose
      position it holds. Null on the offline reader and the signed-out
      previews, which keep writing an unstamped record. */
  accountId?: string | null;
  /** The document has loaded: `numPages` and `currentPage` are real. */
  ready: boolean;
  numPages: number;
  currentPage: number;
  initialProgressPct: number;
  initialMaxProgressPct: number;
}) {
  const [maxProgressPct, setMaxProgressPct] = useState(
    initialMaxProgressPct || initialProgressPct || 0,
  );
  const [lastSaved, setLastSaved] = useState(initialProgressPct);
  const lastSavedRef = useRef(initialProgressPct);
  const [, startTransition] = useTransition();

  const progressPct = numPages > 0 ? Math.round((currentPage / numPages) * 100) : 0;
  const progressRef = useRef(progressPct);
  const numPagesRef = useRef(numPages);
  // The exact page, mirrored for the two paths that run outside render: the
  // debounced autosave and the teardown flush, which must send the page the
  // reader is on at the moment they fire, not the one captured when the
  // effect was scheduled.
  const currentPageRef = useRef(currentPage);
  useEffect(() => {
    progressRef.current = progressPct;
    numPagesRef.current = numPages;
    currentPageRef.current = currentPage;
    lastSavedRef.current = lastSaved;
  });

  const markMaxProgressForPage = useCallback((page: number, pages?: number) => {
    const total = pages ?? numPagesRef.current;
    if (!total) return;
    const pct = Math.round((page / total) * 100);
    setMaxProgressPct((prev) => Math.max(prev, pct));
  }, []);

  useEffect(() => {
    if (ready) markMaxProgressForPage(currentPage);
  }, [ready, currentPage, markMaxProgressForPage]);

  /* The device record: exact page, its percentage, when it was written (`t`)
     and the percentage this device last sent to the server (`s`). The resume
     rule uses `t` and `s` to tell "newer here" from "read further elsewhere". */
  const writePosition = useCallback(
    (page: number, pages: number, synced?: number) => {
      const stored = parseLocalPosition(lsGet(READER_KEYS.position(bookId)));
      // Taking over a record left by another account on a shared machine: its
      // `s` names a percentage THEIR account was synced to, and carrying that
      // forward would make `syncedHere` claim this device is level with a
      // server row it has never written. Start clean instead.
      const prev = isForeignRecord(stored, accountId) ? null : stored;
      lsSet(
        READER_KEYS.position(bookId),
        JSON.stringify({
          p: page,
          pct: Math.round((page / pages) * 100),
          t: Date.now(),
          s: synced ?? prev?.s,
          // Stamped with the reader who is actually here, so the next account
          // to sign in on this browser is not resumed onto their page.
          o: accountId ?? prev?.o,
        }),
      );
    },
    [bookId, accountId],
  );

  /* Persist the exact page (debounced) for next-visit resume. */
  useEffect(() => {
    if (!ready || !numPages || !currentPage) return;
    const id = window.setTimeout(() => writePosition(currentPage, numPages), LOCAL_POSITION_DEBOUNCE_MS);
    return () => window.clearTimeout(id);
  }, [ready, currentPage, numPages, bookId, writePosition]);

  /** Record what the server has ACKNOWLEDGED, keeping the exact page. Called
      when a save resolves — a save cancelled by navigation never marks, so
      `s` keeps naming the last value the server is known to hold. */
  const markSynced = useCallback(
    (pct: number) => {
      const prev = parseLocalPosition(lsGet(READER_KEYS.position(bookId)));
      // Never re-adopt a page from another account's record: the acknowledged
      // position belongs to whoever is reading, not to whoever left it here.
      if (isForeignRecord(prev, accountId)) return;
      if (prev?.p && numPagesRef.current) writePosition(prev.p, numPagesRef.current, pct);
    },
    [bookId, accountId, writePosition],
  );

  /* Auto-save to the server (debounced). */
  const [retryTick, setRetryTick] = useState(0);
  useEffect(() => {
    if (!ready || !isLoggedIn || !bookId || numPages === 0 || progressPct === lastSavedRef.current) return;
    const id = window.setTimeout(() => {
      const previous = lastSavedRef.current;
      lastSavedRef.current = progressPct;
      setLastSaved(progressPct);
      const page = currentPageRef.current;
      const pages = numPagesRef.current;
      startTransition(() => {
        void saveReadingProgress(bookId, progressPct, { page, pageCount: pages }).then(
          () => markSynced(progressPct),
          () => {
            // Not saved. Restore the marker so the next page turn — or the
            // `online` handler below — sends this position again.
            if (lastSavedRef.current === progressPct) {
              lastSavedRef.current = previous;
              setLastSaved(previous);
            }
          },
        );
      });
    }, AUTOSAVE_MS);
    return () => window.clearTimeout(id);
  }, [ready, progressPct, bookId, numPages, isLoggedIn, markSynced, retryTick]);

  /* Reconnecting is the moment to flush a position the server never got. */
  useEffect(() => {
    if (!isLoggedIn || !bookId) return;
    const onOnline = () => setRetryTick((t) => t + 1);
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [isLoggedIn, bookId]);

  /* Flush when the tab is hidden or the page is being torn down. */
  const readyRef = useRef(ready);
  useEffect(() => {
    readyRef.current = ready;
  }, [ready]);
  useEffect(() => {
    if (!isLoggedIn || !bookId) return;
    const flush = () => {
      if (readyRef.current && numPagesRef.current > 0 && progressRef.current !== lastSavedRef.current) {
        const pct = progressRef.current;
        lastSavedRef.current = pct;
        setLastSaved(pct);
        // Mark BEFORE sending, unlike the autosave path which marks when the
        // save resolves. Two reasons: localStorage is synchronous, so the
        // record is written even as the document is torn down, whereas a
        // `.then()` here would usually never run; and `keepalive` is the
        // platform's promise that the request WILL be sent, so recording the
        // value optimistically is honest. If the server nonetheless refuses
        // it, `s` names a percentage the server does not hold and the resume
        // rule simply falls through to its timestamp/tolerance branches —
        // which is where it stood before this marker existed.
        markSynced(pct);
        sendProgressBeacon(bookId, pct, currentPageRef.current, numPagesRef.current);
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", flush);
    };
  }, [bookId, isLoggedIn, markSynced]);

  const saveNow = useCallback(() => {
    if (!readyRef.current || !isLoggedIn || !bookId || numPagesRef.current === 0) return;
    const pct = progressRef.current;
    const previous = lastSavedRef.current;
    lastSavedRef.current = pct;
    setLastSaved(pct);
    const page = currentPageRef.current;
    const pages = numPagesRef.current;
    startTransition(() => {
      void saveReadingProgress(bookId, pct, { page, pageCount: pages }).then(
        () => markSynced(pct),
        () => {
          if (lastSavedRef.current === pct) {
            lastSavedRef.current = previous;
            setLastSaved(previous);
          }
        },
      );
    });
  }, [bookId, isLoggedIn, markSynced]);

  return {
    progressPct,
    maxProgressPct,
    isSaved: progressPct === lastSaved,
    saveNow,
    markMaxProgressForPage,
  };
}

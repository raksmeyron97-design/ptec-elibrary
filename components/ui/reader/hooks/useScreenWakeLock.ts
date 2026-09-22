"use client";

import { useEffect, type RefObject } from "react";

/** How long the screen stays on after the last sign of a reader: a touch, a
 *  scroll, a key. Long enough for a dense page, short enough that a phone left
 *  face-up on a desk goes to sleep like it always did. */
export const WAKE_IDLE_MS = 5 * 60_000;

type Sentinel = EventTarget & { released: boolean; release(): Promise<void> };
type WakeLockNavigator = Navigator & { wakeLock?: { request(type: "screen"): Promise<Sentinel> } };

/**
 * Keep the screen on while someone is reading — what every reading app does,
 * and what a phone's 30-second auto-lock fights on a PDF page that takes two
 * minutes to read.
 *
 * - Held only while `active` (the full reader, not the preview on a book's
 *   detail page) and only while the reader is touched, scrolled or typed at
 *   within WAKE_IDLE_MS; after that it is released, and the next sign of a
 *   reader takes it again.
 * - The OS drops the lock whenever the page is hidden (app switch, screen
 *   off); it is re-taken when the page is visible again.
 * - Where the API is missing or refuses (battery saver, an old iOS home-screen
 *   app — fixed in iOS 18.4), nothing happens: the screen sleeps as it always
 *   did. Nothing is shown to the reader either way.
 */
export function useScreenWakeLock({
  active,
  rootRef,
  idleMs = WAKE_IDLE_MS,
}: {
  active: boolean;
  rootRef: RefObject<HTMLElement | null>;
  idleMs?: number;
}) {
  useEffect(() => {
    const wakeLock = (navigator as WakeLockNavigator).wakeLock;
    const root = rootRef.current;
    if (!active || !wakeLock || !root) return;

    let sentinel: Sentinel | null = null;
    let requesting = false;
    let wanted = true;
    let disposed = false;
    let idleTimer: number | undefined;

    const acquire = async () => {
      if (disposed || !wanted || sentinel || requesting || document.visibilityState !== "visible") return;
      requesting = true;
      try {
        const lock = await wakeLock.request("screen");
        if (disposed || !wanted) {
          void lock.release().catch(() => {});
          return;
        }
        sentinel = lock;
        lock.addEventListener("release", () => {
          if (sentinel === lock) sentinel = null;
        });
      } catch {
        // Refused: the screen keeps its normal timeout.
      } finally {
        requesting = false;
      }
    };
    const release = () => {
      const lock = sentinel;
      sentinel = null;
      if (lock && !lock.released) void lock.release().catch(() => {});
    };
    const armIdle = () => {
      window.clearTimeout(idleTimer);
      idleTimer = window.setTimeout(() => {
        wanted = false;
        release();
      }, idleMs);
    };
    const onActivity = () => {
      armIdle();
      if (!wanted) {
        wanted = true;
        void acquire();
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") void acquire();
    };

    void acquire();
    armIdle();
    root.addEventListener("pointerdown", onActivity, { passive: true });
    // `scroll` does not bubble, but a capturing listener on an ancestor still
    // hears the viewport's.
    root.addEventListener("scroll", onActivity, { passive: true, capture: true });
    window.addEventListener("keydown", onActivity, true);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      disposed = true;
      window.clearTimeout(idleTimer);
      release();
      root.removeEventListener("pointerdown", onActivity);
      root.removeEventListener("scroll", onActivity, { capture: true });
      window.removeEventListener("keydown", onActivity, true);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [active, rootRef, idleMs]);
}

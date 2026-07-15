"use client";

import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";

const HIDE_DELAY_MS = 3000;

/**
 * Fullscreen control auto-hide: controls show when fullscreen opens, fade
 * after ~3s of inactivity, and reappear on pointer movement, key presses or
 * touch. While `paused` (a menu/panel/popup is open) or while the toolbar
 * holds keyboard focus, the timer keeps re-arming instead of hiding — so the
 * exit-fullscreen control can always be reached.
 */
export function useAutoHideControls({
  enabled,
  paused,
  rootRef,
}: {
  enabled: boolean;
  paused: boolean;
  rootRef: RefObject<HTMLElement | null>;
}): boolean {
  const [hidden, setHidden] = useState(false);
  const pausedRef = useRef(paused);
  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    if (!enabled) return;
    const root = rootRef.current;
    if (!root) return;

    let timer: number | undefined;
    const arm = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const toolbar = root.querySelector("[data-reader-toolbar]");
        if (pausedRef.current || toolbar?.contains(document.activeElement)) {
          arm(); // keep controls up while the user is inside them
          return;
        }
        setHidden(true);
      }, HIDE_DELAY_MS);
    };
    const show = () => {
      setHidden(false);
      arm();
    };

    // reveal on entry (next frame — never a synchronous set-state-in-effect)
    const raf = requestAnimationFrame(show);
    root.addEventListener("pointermove", show);
    root.addEventListener("keydown", show);
    root.addEventListener("touchstart", show, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(timer);
      root.removeEventListener("pointermove", show);
      root.removeEventListener("keydown", show);
      root.removeEventListener("touchstart", show);
    };
  }, [enabled, rootRef]);

  return !enabled || !hidden;
}

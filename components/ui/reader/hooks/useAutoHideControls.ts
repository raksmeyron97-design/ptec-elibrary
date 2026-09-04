"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

export const HIDE_DELAY_MS = 3000;

/**
 * Reader HUD auto-hide, in every mode.
 *
 * Controls show when the reader opens, fade after ~3 s of inactivity, and
 * come back on pointer movement, touch, or any key. While `paused` (a panel,
 * menu, dialog or selection popup is open) or while the HUD holds keyboard
 * focus or the pointer, the timer re-arms instead of hiding.
 *
 * Cost model: `pointermove` fires continuously, so the handler only stamps a
 * timestamp in a ref and — when the HUD is already visible — sets no state
 * and arms no timer. One timeout is outstanding at a time; when it fires it
 * compares against the stamp and either hides or re-arms for the remainder.
 * State changes exactly twice per show/hide cycle.
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
  const hiddenRef = useRef(false);
  const pausedRef = useRef(paused);
  useEffect(() => {
    pausedRef.current = paused;
    // Opening a panel, menu or dialog IS activity: the controls it belongs to
    // must be visible, whatever the idle timer thought a moment ago.
    if (paused && hiddenRef.current) {
      hiddenRef.current = false;
      setHidden(false);
    }
  }, [paused]);

  useEffect(() => {
    if (!enabled) {
      hiddenRef.current = false;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setHidden(false);
      return;
    }
    const root = rootRef.current;
    if (!root) return;

    let timer: number | undefined;
    let lastActivity = performance.now();
    let hoveringHud = false;

    const check = () => {
      timer = undefined;
      const hud = root.querySelectorAll("[data-reader-hud]");
      const focusInside = Array.from(hud).some((el) => el.contains(document.activeElement));
      const idleFor = performance.now() - lastActivity;
      if (pausedRef.current || focusInside || hoveringHud) {
        timer = window.setTimeout(check, HIDE_DELAY_MS);
        return;
      }
      if (idleFor < HIDE_DELAY_MS) {
        timer = window.setTimeout(check, HIDE_DELAY_MS - idleFor);
        return;
      }
      hiddenRef.current = true;
      setHidden(true);
    };
    const arm = () => {
      if (timer === undefined) timer = window.setTimeout(check, HIDE_DELAY_MS);
    };
    const activity = () => {
      lastActivity = performance.now();
      if (hiddenRef.current) {
        hiddenRef.current = false;
        setHidden(false);
      }
      arm();
    };
    const onPointerOver = (e: Event) => {
      const target = e.target as Element | null;
      hoveringHud = !!target?.closest?.("[data-reader-hud]");
    };
    const onKey = () => activity();

    // Reveal on entry (next frame — never a synchronous set-state-in-effect).
    const raf = requestAnimationFrame(activity);
    root.addEventListener("pointermove", activity, { passive: true });
    root.addEventListener("pointerdown", activity, { passive: true });
    root.addEventListener("pointerover", onPointerOver, { passive: true });
    root.addEventListener("touchstart", activity, { passive: true });
    // Keys reveal even when focus sits outside the reader (e.g. after a menu
    // closed onto body), so a keyboard user is never typing at hidden controls.
    // CAPTURE phase: the reader's shortcut handler stops propagation of "/"
    // (to beat the navbar's site-wide binding) and that must not also stop
    // the controls from coming back.
    window.addEventListener("keydown", onKey, true);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(timer);
      root.removeEventListener("pointermove", activity);
      root.removeEventListener("pointerdown", activity);
      root.removeEventListener("pointerover", onPointerOver);
      root.removeEventListener("touchstart", activity);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [enabled, rootRef]);

  return !enabled || !hidden;
}

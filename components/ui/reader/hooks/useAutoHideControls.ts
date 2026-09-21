"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

export const HIDE_DELAY_MS = 3000;
/** Touch: how far (px) the book must travel DOWN before the bars step aside.
 *  Momentum scrolling jitters by a few px; a bar that flickers is worse than
 *  one that waits a line. */
export const SCROLL_HIDE_PX = 24;
/** Touch: a scroll this soon after a touch ON the controls is that control's
 *  doing (a jump from the scrubber, Go to page) — not the reader reading on. */
export const HUD_GRACE_MS = 600;

/** The reader's controls: both HUD bars, and every overlay they open (Go to
 *  page, the panel, menus, the welcome-back card, the selection popup). A
 *  touch on any of them is a use of the controls, never "reading on". */
const CONTROLS = "[data-reader-hud], [data-reader-overlay]";

export type AutoHideControls = {
  /** Whether the HUD is showing. */
  visible: boolean;
  /** Show now (and restart the idle timer). */
  show: () => void;
  /** A reader's own "hide the controls" — a tap on the page. */
  hide: () => void;
  /** Tap on the page: hidden → show, shown → hide. */
  toggle: () => void;
};

/**
 * Reader HUD auto-hide, in every mode.
 *
 * Mouse, pen and keyboard: controls show when the reader opens, fade after
 * ~3 s of inactivity, and come back on pointer movement or any key. While
 * `paused` (a panel, menu, dialog or selection popup is open) or while the
 * HUD holds keyboard focus or the pointer, the timer re-arms instead of
 * hiding.
 *
 * Touch behaves like a reading app instead:
 *   - a finger on the PAGE is not "activity". On a phone a finger on the page
 *     is how you scroll, and when every touch counted, every scroll brought
 *     both bars back over the text you were reading;
 *   - a TAP on the page toggles them. Taps are classified where swipes, pinch
 *     and double-tap already are (useReaderGestures), which calls `toggle()`;
 *   - scrolling the book DOWN hides them — the reader is reading on. Only
 *     when the page was touched more recently than the controls, though: a
 *     jump from the scrubber or Go to page scrolls the viewport too, and that
 *     scroll must never hide the bars the reader is still using;
 *   - touching the controls themselves keeps them up, like hovering does.
 *
 * Cost model: `pointermove` fires continuously, so the handler only stamps a
 * timestamp in a ref and — when the HUD is already visible — sets no state
 * and arms no timer. One timeout is outstanding at a time; when it fires it
 * compares against the stamp and either hides or re-arms for the remainder.
 * State changes exactly twice per show/hide cycle. The scroll listener is
 * passive and does arithmetic only.
 */
export function useAutoHideControls({
  enabled,
  paused,
  rootRef,
  scrollRef,
}: {
  enabled: boolean;
  paused: boolean;
  rootRef: RefObject<HTMLElement | null>;
  /** The reader's scrolling viewport; on touch, scrolling it down hides the HUD. */
  scrollRef?: RefObject<HTMLElement | null>;
}): AutoHideControls {
  const [hidden, setHidden] = useState(false);
  const hiddenRef = useRef(false);
  const pausedRef = useRef(paused);
  const api = useRef<{ show: () => void; hide: () => void } | null>(null);
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
    // Which input moved the book last. Only a finger's scroll is "reading on";
    // a key (PageDown) or a mouse wheel on a touch laptop is not.
    let lastInput: "touch" | "other" = "other";
    // When a finger last touched the PAGE, and when it last used the CONTROLS.
    let pageTouchedAt = -Infinity;
    let hudTouchedAt = -Infinity;

    const bars = () => Array.from(root.querySelectorAll<HTMLElement>("[data-reader-hud]"));
    const check = () => {
      timer = undefined;
      const focusInside = bars().some((el) => el.contains(document.activeElement));
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
    // An explicit hide (a tap, a touch scroll). Never while something modal
    // is open, and never under a keyboard user's focus. A button a finger
    // just tapped keeps focus on Android; that focus is not a reason to keep
    // the bars up, so it is released first.
    const hide = () => {
      if (hiddenRef.current || pausedRef.current) return;
      const active = document.activeElement;
      if (active instanceof HTMLElement && bars().some((el) => el.contains(active))) {
        if (document.documentElement.dataset.focusModality === "keyboard") return;
        active.blur();
      }
      hiddenRef.current = true;
      setHidden(true);
    };
    api.current = { show: activity, hide };

    const closest = (e: Event, selector: string) => !!(e.target as Element | null)?.closest?.(selector);
    const stampTouch = (e: Event) => {
      if (closest(e, CONTROLS)) hudTouchedAt = performance.now();
      else pageTouchedAt = performance.now();
    };
    const onPointerMove = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      lastInput = "other";
      activity();
    };
    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType !== "touch") {
        lastInput = "other";
        activity();
        return;
      }
      lastInput = "touch";
      stampTouch(e);
      if (closest(e, CONTROLS)) activity();
    };
    // The end of a touch counts as much as its start: a drag on the scrubber
    // ends in a jump, and a flick on the page keeps scrolling after the lift.
    // (A drag on a range input may end in pointercancel rather than pointerup.)
    const onPointerEnd = (e: PointerEvent) => {
      if (e.pointerType === "touch") stampTouch(e);
    };
    // A value committed on the controls (the scrubber's `change`, the Go to
    // page field) is a use of the controls, whatever input produced it.
    const onControlValue = (e: Event) => {
      if (closest(e, CONTROLS)) hudTouchedAt = performance.now();
    };
    const onPointerOver = (e: PointerEvent) => {
      // A finger does not hover: a tapped control must not pin the bars up.
      hoveringHud = e.pointerType !== "touch" && closest(e, "[data-reader-hud]");
    };
    const onKey = () => {
      lastInput = "other";
      activity();
    };

    // Touch: reading on hides the bars.
    const scroller = scrollRef?.current ?? null;
    let lastTop = scroller?.scrollTop ?? 0;
    let travel = 0;
    const onScroll = () => {
      if (!scroller) return;
      const top = scroller.scrollTop;
      const delta = top - lastTop;
      lastTop = top;
      if (
        lastInput !== "touch" ||
        hiddenRef.current ||
        pageTouchedAt < hudTouchedAt ||
        performance.now() - hudTouchedAt < HUD_GRACE_MS
      ) {
        travel = 0;
        return;
      }
      travel = delta > 0 ? travel + delta : 0;
      if (travel > SCROLL_HIDE_PX) {
        travel = 0;
        hide();
      }
    };

    // Reveal on entry (next frame — never a synchronous set-state-in-effect).
    const raf = requestAnimationFrame(activity);
    root.addEventListener("pointermove", onPointerMove, { passive: true });
    root.addEventListener("pointerdown", onPointerDown, { passive: true });
    root.addEventListener("pointerup", onPointerEnd, { passive: true });
    root.addEventListener("pointercancel", onPointerEnd, { passive: true });
    root.addEventListener("pointerover", onPointerOver, { passive: true });
    root.addEventListener("input", onControlValue, { capture: true, passive: true });
    root.addEventListener("change", onControlValue, { capture: true, passive: true });
    scroller?.addEventListener("scroll", onScroll, { passive: true });
    // Keys reveal even when focus sits outside the reader (e.g. after a menu
    // closed onto body), so a keyboard user is never typing at hidden controls.
    // CAPTURE phase: the reader's shortcut handler stops propagation of "/"
    // (to beat the navbar's site-wide binding) and that must not also stop
    // the controls from coming back.
    window.addEventListener("keydown", onKey, true);
    return () => {
      api.current = null;
      cancelAnimationFrame(raf);
      window.clearTimeout(timer);
      root.removeEventListener("pointermove", onPointerMove);
      root.removeEventListener("pointerdown", onPointerDown);
      root.removeEventListener("pointerup", onPointerEnd);
      root.removeEventListener("pointercancel", onPointerEnd);
      root.removeEventListener("pointerover", onPointerOver);
      root.removeEventListener("input", onControlValue, true);
      root.removeEventListener("change", onControlValue, true);
      scroller?.removeEventListener("scroll", onScroll);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [enabled, rootRef, scrollRef]);

  const show = useCallback(() => api.current?.show(), []);
  const hide = useCallback(() => api.current?.hide(), []);
  const toggle = useCallback(() => (hiddenRef.current ? api.current?.show() : api.current?.hide()), []);
  return { visible: !enabled || !hidden, show, hide, toggle };
}

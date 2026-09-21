"use client";

// lib/hooks/useSheetDrag.ts
// Swipe a bottom sheet down to close it — the gesture every phone sheet has,
// and the one a grab handle promises.
//
// Touch only: sheets are a phone surface, and a touch listener is the one
// place a pull-down can be claimed (preventDefault) before the browser turns
// it into a scroll or an iOS rubber-band. The claim is decided on the FIRST
// move, while the event is still cancelable:
//   - moving down, and the list under the finger (if any) is at its top →
//     the sheet follows the finger;
//   - moving up or sideways, or the list can still scroll up → it is a
//     scroll, and the sheet stays out of it for the rest of the touch.
// On release the sheet closes if it travelled a quarter of its height or was
// flicked (≥ 0.5 px/ms), otherwise it springs back. Both ride the sheet's
// own CSS transition, so reduced motion gets the instant version for free.
// A drag that ENDS some other way — a second finger lands, or the OS takes
// the touch (touchcancel) — springs back: it was not a decision to close.
//
// While dragging, the transform is written straight onto the element — one
// style write per frame, no React render. React's own `transform` stays
// "translateY(0)" throughout, so spring-back ends where React expects and a
// close is simply React's exit transition starting from wherever the finger
// let go.

import { useEffect, useEffectEvent, type RefObject } from "react";

export const CLOSE_FRACTION = 0.25;
export const CLOSE_VELOCITY = 0.5; // px per ms, downward
/** A pause this long (ms) between the last move and the lift cancels a flick. */
export const HOLD_MS = 90;

export function useSheetDrag({
  sheetRef,
  scrimRef,
  enabled,
  onClose,
}: {
  sheetRef: RefObject<HTMLElement | null>;
  scrimRef?: RefObject<HTMLElement | null>;
  enabled: boolean;
  onClose: () => void;
}) {
  const close = useEffectEvent(onClose);

  useEffect(() => {
    const sheet = sheetRef.current;
    if (!enabled || !sheet) return;
    const scrim = scrimRef?.current ?? null;

    let tracking = false;
    let dragging = false;
    let startX = 0;
    let startY = 0;
    let lastY = 0;
    let lastT = 0;
    let velocity = 0;
    let offset = 0;
    let height = 1;
    let list: HTMLElement | null = null;

    const reset = () => {
      tracking = false;
      dragging = false;
      offset = 0;
      velocity = 0;
    };
    // Hand the element back to its CSS transition, at rest.
    const springBack = () => {
      sheet.style.transition = "";
      if (scrim) scrim.style.transition = "";
      sheet.style.transform = "translateY(0)";
      if (scrim) scrim.style.opacity = "1";
      reset();
    };

    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) {
        // A second finger mid-pull is not a close; don't leave the sheet
        // hanging where the first one was, with its transition switched off.
        if (dragging) springBack();
        else reset();
        return;
      }
      const target = e.target as Element | null;
      // Fields and anything that opts out (a horizontal chip row, a slider)
      // keep their own gestures.
      if (target?.closest("input, textarea, select, [contenteditable], [data-sheet-nodrag]")) return;
      const touch = e.touches[0];
      startX = touch.clientX;
      startY = lastY = touch.clientY;
      lastT = e.timeStamp;
      list = target?.closest<HTMLElement>("[data-sheet-body]") ?? null;
      tracking = true;
      dragging = false;
    };

    const onMove = (e: TouchEvent) => {
      if (!tracking) return;
      const touch = e.touches[0];
      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;

      if (!dragging) {
        if (dx === 0 && dy === 0) return;
        const downward = dy > 0 && Math.abs(dy) >= Math.abs(dx);
        if (!downward || (list && list.scrollTop > 0) || !e.cancelable) {
          tracking = false; // a scroll: not ours for the rest of this touch
          return;
        }
        dragging = true;
        height = Math.max(1, sheet.getBoundingClientRect().height);
        sheet.style.transition = "none";
        if (scrim) scrim.style.transition = "none";
      }

      e.preventDefault();
      const dt = Math.max(1, e.timeStamp - lastT);
      velocity = 0.7 * ((touch.clientY - lastY) / dt) + 0.3 * velocity;
      lastY = touch.clientY;
      lastT = e.timeStamp;
      offset = Math.max(0, dy);
      sheet.style.transform = `translateY(${offset}px)`;
      if (scrim) scrim.style.opacity = String(1 - Math.min(1, offset / height));
    };

    const onEnd = (e: TouchEvent) => {
      if (!dragging) {
        reset();
        return;
      }
      sheet.style.transition = "";
      if (scrim) scrim.style.transition = "";
      // A finger that stopped before it lifted is not a flick.
      const releaseVelocity = e.timeStamp - lastT > HOLD_MS ? 0 : velocity;
      const shouldClose = offset > height * CLOSE_FRACTION || releaseVelocity >= CLOSE_VELOCITY;
      if (shouldClose) {
        reset();
        close();
      } else {
        springBack();
      }
    };
    // The OS took the touch (a system gesture, an incoming call): whatever
    // the finger was doing, nobody decided to close the sheet.
    const onCancel = () => {
      if (dragging) springBack();
      else reset();
    };

    sheet.addEventListener("touchstart", onStart, { passive: true });
    // Not passive: claiming the pull-down is the whole point.
    sheet.addEventListener("touchmove", onMove, { passive: false });
    sheet.addEventListener("touchend", onEnd, { passive: true });
    sheet.addEventListener("touchcancel", onCancel, { passive: true });
    return () => {
      sheet.removeEventListener("touchstart", onStart);
      sheet.removeEventListener("touchmove", onMove);
      sheet.removeEventListener("touchend", onEnd);
      sheet.removeEventListener("touchcancel", onCancel);
    };
  }, [enabled, sheetRef, scrimRef]);
}

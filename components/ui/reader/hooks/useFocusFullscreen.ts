"use client";

import { useEffect, useEffectEvent, type RefObject } from "react";

type LockableOrientation = ScreenOrientation & { lock?: (orientation: string) => Promise<void> };

/**
 * Reader focus mode on a touch device with ELEMENT fullscreen (Android
 * Chrome): take the whole screen — status and navigation bars too — and let
 * the phone turn sideways for a wide page. The installed app is portrait by
 * its manifest; this orientation lock lasts only while fullscreen does (the
 * browser releases it on exit).
 *
 * - Only when all four hold: `active`, `document.fullscreenEnabled`, nothing
 *   is fullscreen yet, and the pointer is coarse. Desktop focus mode is
 *   unchanged, and iPhone has no element fullscreen, so there focus mode is
 *   what it always was.
 * - Leaving fullscreen from outside (the system Back gesture) calls `onExit`
 *   — which turns focus mode off — but only once OUR element was actually
 *   fullscreen: a refused request is not an exit.
 * - Turning focus mode off exits fullscreen, if the reader is what is
 *   fullscreen (never someone else's element).
 * - Every failure (no activation, a refused lock) is swallowed: focus mode
 *   without fullscreen is still focus mode.
 */
export function useFocusFullscreen({
  active,
  rootRef,
  onExit,
}: {
  active: boolean;
  rootRef: RefObject<HTMLElement | null>;
  onExit: () => void;
}) {
  const exit = useEffectEvent(onExit);

  useEffect(() => {
    if (!active) return;
    const el = rootRef.current;
    if (!el || !document.fullscreenEnabled || document.fullscreenElement) return;
    if (!window.matchMedia("(pointer: coarse)").matches) return;

    let entered = false;
    const onChange = () => {
      if (document.fullscreenElement === el) entered = true;
      else if (entered && !document.fullscreenElement) {
        entered = false;
        exit();
      }
    };
    document.addEventListener("fullscreenchange", onChange);
    el.requestFullscreen({ navigationUI: "hide" })
      .then(() => (screen.orientation as LockableOrientation | undefined)?.lock?.("any"))
      .catch(() => {});

    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      if (document.fullscreenElement === el) void document.exitFullscreen().catch(() => {});
    };
  }, [active, rootRef]);
}

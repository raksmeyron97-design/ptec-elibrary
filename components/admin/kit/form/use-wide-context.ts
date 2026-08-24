"use client";

import { useEffect, useLayoutEffect, useState } from "react";

/**
 * Width at which a form gains its context sidebar.
 *
 * 1440 rather than a Tailwind breakpoint because the number is load-bearing:
 * 840 card + 32 gap + 380 sidebar + gutters needs ~1290px before the sidebar
 * starts squeezing the form, and `xl` (1280) is under that. It lives here, in
 * TypeScript, because the layout decision is made in JS — see below.
 */
export const SPLIT_BREAKPOINT = 1440;

const QUERY = `(min-width: ${SPLIT_BREAKPOINT}px)`;

/**
 * `useLayoutEffect` warns when it runs during server rendering, and a client
 * component still renders on the server. Same hook, no warning.
 */
const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * Whether the context panel belongs in the sidebar (true) or inline in the tab
 * panel (false).
 *
 * This is JS and not a media query on purpose, and the reason is worth stating
 * because "just use CSS" is the obvious objection.
 *
 * The context panel holds interactive things — "jump to this field" buttons in
 * the validation summary, a copy affordance in the SEO preview. Rendering it in
 * both places and hiding one with a breakpoint class would put every one of
 * those buttons in the tab order twice, one copy invisible: a keyboard user tabs
 * into a control they cannot see, and a screen reader reads the whole panel
 * twice. CSS cannot move a DOM node between two parents, so one node means
 * choosing in JS.
 *
 * ── Why useLayoutEffect and not useSyncExternalStore ──
 *
 * The first version used `useSyncExternalStore` with a `false` server snapshot.
 * That is the tidier hook, but its post-hydration correction runs in a passive
 * effect, so a ≥1440px viewport could paint the inline layout for one frame
 * before the panel moved — a visible jump on exactly the widest, most likely
 * admin screen.
 *
 * A layout effect is flushed synchronously after hydration commits and *before*
 * the browser paints, so the corrected layout is the first thing drawn. The
 * initial render still uses `false`, which is what the server produced, so
 * hydration matches and React logs nothing.
 *
 * Narrow-first stays the right initial value: it is the layout that must be
 * correct with no JS at all.
 */
export function useWideContext(): boolean {
  const [wide, setWide] = useState(false);

  useIsomorphicLayoutEffect(() => {
    const mql = window.matchMedia(QUERY);
    // Before paint on mount; on the microtask queue for later resizes, where a
    // frame does not matter because the user is dragging the window themselves.
    setWide(mql.matches);
    const onChange = (e: MediaQueryListEvent) => setWide(e.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return wide;
}

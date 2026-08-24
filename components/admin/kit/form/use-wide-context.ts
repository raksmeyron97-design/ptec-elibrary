"use client";

import { useSyncExternalStore } from "react";

/**
 * Width at which a form gains its context sidebar.
 *
 * 1440 rather than a Tailwind breakpoint because the number is load-bearing:
 * 840 card + 32 gap + 380 sidebar + gutters needs ~1290px before the sidebar
 * stops squeezing the form, and `xl` (1280) is under that. It lives here, in
 * TypeScript, because the layout decision is made in JS — see below.
 */
export const SPLIT_BREAKPOINT = 1440;

const QUERY = `(min-width: ${SPLIT_BREAKPOINT}px)`;

function subscribe(onChange: () => void) {
  const mql = window.matchMedia(QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

const getSnapshot = () => window.matchMedia(QUERY).matches;

/** Server and first client render agree on "narrow" — see the note below. */
const getServerSnapshot = () => false;

/**
 * Whether the context panel belongs in the sidebar (true) or inline in the tab
 * panel (false).
 *
 * This is JS and not a media query on purpose, and the reason is worth stating
 * because "just use CSS" is the obvious objection.
 *
 * The context panel holds interactive things — "jump to this field" buttons in
 * the validation summary, a copy-link button in the SEO preview. Rendering it
 * in both places and hiding one with `lg:hidden` would put every one of those
 * buttons in the tab order twice, one copy invisible: a keyboard user tabs into
 * a control they cannot see, and a screen reader reads the whole panel twice.
 * CSS cannot move a DOM node between two parents, so one node means choosing in
 * JS.
 *
 * The cost, stated plainly: `getServerSnapshot` returns false, so a ≥1440px
 * viewport renders the panel inline for one frame and then moves it to the
 * sidebar on hydration. Narrow-first is the right default — it is the layout
 * that must be correct without JS, and the admin panel is dynamically rendered
 * behind auth, so nothing is cached and served to the wrong viewport.
 */
export function useWideContext(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

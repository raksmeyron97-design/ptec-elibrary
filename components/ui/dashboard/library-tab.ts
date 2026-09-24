// components/ui/dashboard/library-tab.ts
// The My Library tab vocabulary, shared by the tabs themselves and by every
// link that jumps to one (the summary tiles). Pure — no React, no DOM at
// import time.
//
// The URL is the source of truth: `?tab=<id>#library`. That is the contract
// e2e/ai-research.spec.ts relies on (`/dashboard?tab=lists#library`), it makes
// a tab shareable and refresh-proof, and it is written with
// `history.replaceState`, which Next's router syncs into `useSearchParams`
// WITHOUT a server round trip. A `<Link>` to `?tab=saved` would instead
// re-render this force-dynamic page and re-run every one of its queries to
// flip a tab the client already has the data for.

export const LIBRARY_TABS = ["reading", "saved", "lists", "downloads"] as const;
export type LibraryTab = (typeof LIBRARY_TABS)[number];

export const LIBRARY_SECTION_ID = "library";

export function parseLibraryTab(value: string | null | undefined): LibraryTab {
  return (LIBRARY_TABS as readonly string[]).includes(value ?? "") ? (value as LibraryTab) : "reading";
}

/** The no-JS / open-in-new-tab href for a tab. Locale is added by the Link. */
export function libraryTabHref(tab: LibraryTab): string {
  return `/dashboard?tab=${tab}#${LIBRARY_SECTION_ID}`;
}

export function tabButtonId(tab: LibraryTab): string {
  return `dashboard-tab-${tab}`;
}

/**
 * Point the address bar at `tab` without navigating. Keeps path and hash.
 *
 * The state argument must be `null`. Next patches `replaceState` and syncs
 * `useSearchParams` only for calls it did not make itself — and it recognises
 * its own by a marker in the state object. Passing `window.history.state`
 * forwards that marker, so the URL changed and the tabs never heard about it.
 * With `null`, Next attaches its own router state and re-renders.
 */
export function writeLibraryTab(tab: LibraryTab, hash?: string): void {
  const url = new URL(window.location.href);
  url.searchParams.set("tab", tab);
  if (hash !== undefined) url.hash = hash;
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}

// lib/search/open.ts
// Opens the phone search overlay (components/layout/MobileSearchOverlay.tsx)
// from anywhere. Its two entry points live in unrelated trees — the tab bar's
// centre tab (in the footer) and the top bar's search button (in the header) —
// and the overlay itself is loaded at browser idle, so a window event is the
// seam, exactly as lib/ask/open.ts is for the assistant.
//
// SYNCHRONOUS ON PURPOSE. dispatchEvent runs its listeners before it returns,
// so the overlay focuses its field INSIDE the reader's tap. That is the only
// way a phone raises its keyboard for a field focused by script — iOS Safari
// refuses focus() from anything but a user gesture — and it is why this is an
// overlay rather than a link to /search: a navigated-to page can only focus
// its field after the gesture has ended, so the reader had to tap twice.
//
// The return value says whether an overlay took the request. When none did
// (its code has not loaded yet, or the viewport is desktop-sized), the caller
// lets its link navigate to /search — the page a no-JS reader gets anyway.

export const SEARCH_OPEN_EVENT = "ptec:search-open";

export type SearchOpenDetail = {
  /** Set to true by the overlay that handled the request. */
  handled: boolean;
};

export function openSearchOverlay(): boolean {
  if (typeof window === "undefined") return false;
  const detail: SearchOpenDetail = { handled: false };
  window.dispatchEvent(new CustomEvent<SearchOpenDetail>(SEARCH_OPEN_EVENT, { detail }));
  return detail.handled;
}

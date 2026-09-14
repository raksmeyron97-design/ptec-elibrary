"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Whether a media query matches, kept live.
 *
 * `serverValue` is what the server render (and hydration) assumes; the real
 * answer arrives on the next render. So use this for markup that only exists
 * on the client anyway — /search's facets arrive with the first fetch — or
 * where a one-frame correction is harmless. Layout that must be right in the
 * server HTML belongs in CSS breakpoints, not here.
 */
export function useMediaQuery(query: string, serverValue = false): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => serverValue,
  );
}

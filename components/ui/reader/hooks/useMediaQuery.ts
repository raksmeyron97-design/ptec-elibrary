"use client";

import { useCallback, useSyncExternalStore } from "react";

/** Reactive media query. Server and first client render both report `false`
    (the reader only mounts client-side, so there is no hydration mismatch). */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (cb: () => void) => {
      if (typeof window === "undefined" || !window.matchMedia) return () => {};
      const mql = window.matchMedia(query);
      if (typeof mql.addEventListener === "function") {
        mql.addEventListener("change", cb);
        return () => mql.removeEventListener("change", cb);
      }
      return () => {};
    },
    [query],
  );
  const get = useCallback(
    () => (typeof window !== "undefined" && !!window.matchMedia?.(query)?.matches),
    [query],
  );
  return useSyncExternalStore(subscribe, get, () => false);
}

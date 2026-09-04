"use client";

import { useEffect, useMemo, useState } from "react";
import {
  preloadPolicy,
  readNetworkHints,
  type NetworkHints,
  type PreloadPolicy,
} from "@/lib/reader/preload";

/** Network-aware preload policy. Re-evaluated when Network Information
    reports a change (Chromium); elsewhere it is the default tier, which is
    exactly today's behaviour. */
export function useReaderPreload(firstPagePainted: boolean): PreloadPolicy {
  const [hints, setHints] = useState<NetworkHints | undefined>(() =>
    typeof navigator === "undefined" ? undefined : readNetworkHints(navigator),
  );

  useEffect(() => {
    const conn = (navigator as { connection?: EventTarget }).connection;
    if (!conn || typeof conn.addEventListener !== "function") return;
    const update = () => setHints(readNetworkHints(navigator));
    conn.addEventListener("change", update);
    return () => conn.removeEventListener("change", update);
  }, []);

  return useMemo(() => preloadPolicy(hints, firstPagePainted), [hints, firstPagePainted]);
}

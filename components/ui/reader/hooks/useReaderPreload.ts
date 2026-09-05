"use client";

import { useEffect, useMemo, useState } from "react";
import {
  preloadPolicy,
  readNetworkHints,
  type MeasuredTransfer,
  type NetworkHints,
  type PreloadPolicy,
} from "@/lib/reader/preload";

/** Network-aware preload policy. Re-evaluated when Network Information
    reports a change (Chromium); where that API does not exist (Safari,
    Firefox) the tier comes from what painting the first page actually cost,
    so a phone on a poor link is no longer assumed to be "normal". */
export function useReaderPreload(
  firstPagePainted: boolean,
  measured?: MeasuredTransfer,
): PreloadPolicy {
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

  return useMemo(
    () => preloadPolicy(hints, firstPagePainted, measured),
    [hints, firstPagePainted, measured],
  );
}

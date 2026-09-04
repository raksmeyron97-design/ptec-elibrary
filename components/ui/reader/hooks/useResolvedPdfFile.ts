"use client";

import { useEffect, useState } from "react";

/* Offline-first source: if the PDF already lives in the browser's Cache
   Storage (saved by the offline library / service worker), read it from there
   so reading works with zero network. Falls back to the URL.
   `caches.match` (no cache name) searches every cache, so this works no
   matter which cache name the SW used. */
export function useResolvedPdfFile(pdfUrl: string | null | undefined): {
  file: string | null;
  fromCache: boolean;
} {
  const [file, setFile] = useState<string | null>(pdfUrl ?? null);
  const [fromCache, setFromCache] = useState(false);
  const [prevUrl, setPrevUrl] = useState(pdfUrl);

  if (pdfUrl !== prevUrl) {
    setPrevUrl(pdfUrl);
    setFile(pdfUrl ?? null);
    setFromCache(false);
  }

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    if (!pdfUrl || typeof window === "undefined" || !("caches" in window)) return;
    // Already a local blob (the offline reader resolves the bytes itself) —
    // there is nothing to look up and `new URL()` on it would be meaningless.
    if (pdfUrl.startsWith("blob:")) return;
    const abs = new URL(pdfUrl, window.location.origin).href;
    // ignoreSearch is LOAD-BEARING. A download is stored as `…/file?offline=1`
    // (the consent marker, see lib/offline.ts) while the reader asks for the
    // bare `…/file`. Without it this lookup missed every saved book and the
    // reader went to the network for a file that was sitting on disk.
    caches
      .match(abs, { ignoreSearch: true })
      .then(async (res) => {
        if (cancelled || !res) return;
        const blob = await res.blob();
        objectUrl = URL.createObjectURL(blob);
        if (!cancelled) {
          setFile(objectUrl);
          setFromCache(true);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [pdfUrl]);

  return { file, fromCache };
}

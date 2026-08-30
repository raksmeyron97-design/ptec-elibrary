"use client";

import { useEffect } from "react";

/**
 * Keeps unsaved permission edits from disappearing without a word.
 *
 * Two exits had to be covered, because the workspace holds its draft in React
 * state and nothing else:
 *
 *  1. Leaving the tab — a plain `beforeunload`, which is all the browser will
 *     allow (the message is the browser's, not ours).
 *  2. Leaving via the admin sidebar — a client-side navigation, which fires no
 *     unload at all. There is no App Router API to intercept one, so this
 *     listens for the click that starts it: a capture-phase listener on
 *     document, matching same-origin anchors, skipping new-tab intents
 *     (modifier keys, middle click, `target=_blank`, `download`) and letting
 *     anything explicitly opted out (`data-allow-unsaved`) through.
 *
 * `onIntercept` receives the href; the caller is expected to ask, then navigate
 * itself if the answer is yes.
 */
export function useUnsavedGuard(dirty: boolean, onIntercept: (href: string) => void) {
  useEffect(() => {
    if (!dirty) return;

    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      // Legacy browsers only act on a non-empty returnValue.
      e.returnValue = "";
    }

    function onClick(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

      const anchor = (e.target as HTMLElement | null)?.closest?.("a[href]") as
        | HTMLAnchorElement
        | null;
      if (!anchor) return;
      if (anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      if (anchor.dataset.allowUnsaved !== undefined) return;

      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#")) return;

      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;

      e.preventDefault();
      onIntercept(url.pathname + url.search);
    }

    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty, onIntercept]);
}

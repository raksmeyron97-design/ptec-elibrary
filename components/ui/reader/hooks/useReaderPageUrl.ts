"use client";

import { useEffect, useRef } from "react";

/** How long the reader must sit on a page before the URL follows it. Page
    turns are cheap; history entries and address-bar churn are not. */
export const PAGE_URL_DEBOUNCE_MS = 600;

/**
 * Keep `?page=N` in the address bar pointing at the page being read, so the
 * position is shareable and bookmarkable with the browser's own controls
 * (§6) — the same URL the reader route already accepts on the way in.
 *
 * `history.replaceState`, deliberately, on three counts:
 *
 *   • it does not touch the Next.js router, so no RSC request is made and no
 *     re-render is scheduled — a page turn must not cost a round-trip;
 *   • it REPLACES rather than pushes, so a 300-page book does not leave 300
 *     history entries between the reader and the Back button;
 *   • it is debounced, so scrolling through a chapter writes one URL, not
 *     forty.
 *
 * Disabled unless the caller opts in: the same viewer renders as an embedded
 * preview on the book detail page, and rewriting THAT page's URL with a page
 * number would make the reader's scroll position part of the document's
 * canonical address.
 */
export function useReaderPageUrl({
  enabled,
  page,
  ready,
}: {
  enabled: boolean;
  page: number;
  /** The document has loaded, so `page` is real rather than a placeholder. */
  ready: boolean;
}) {
  const lastWritten = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled || !ready || !page || page < 1) return;
    if (lastWritten.current === page) return;

    const id = window.setTimeout(() => {
      try {
        const url = new URL(window.location.href);
        // Page 1 is the default, and a bare URL is the nicer thing to share.
        if (page === 1) url.searchParams.delete("page");
        else url.searchParams.set("page", String(page));
        if (url.href !== window.location.href) {
          window.history.replaceState(window.history.state, "", url.href);
        }
        lastWritten.current = page;
      } catch {
        // A blocked History API (sandboxed frames, some privacy modes) costs
        // the shareable URL and nothing else. Reading continues.
      }
    }, PAGE_URL_DEBOUNCE_MS);

    return () => window.clearTimeout(id);
  }, [enabled, page, ready]);
}

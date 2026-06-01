"use client";

import { useEffect } from "react";

/**
 * ScrollToReader
 * --------------
 * The book detail page is a server component, so it can't run effects.
 * This tiny client helper scrolls the user straight to the PDF reader
 * (#reader) when the page is opened with that hash — e.g. when "View"
 * is tapped on a book card and the link points to /books/{slug}#reader.
 *
 * Why not a plain <a href="#reader">?  On first load the PDF area mounts
 * after hydration, so the browser's native anchor jump often fires before
 * the target exists and does nothing. This waits for the element, then
 * scrolls. It also retries briefly in case the reader is still mounting.
 *
 * Drop it anywhere inside the page (it renders nothing).
 */
export default function ScrollToReader({
  targetId = "reader",
}: {
  targetId?: string;
}) {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.hash !== `#${targetId}`) return;

    let cancelled = false;
    let attempts = 0;

    const tryScroll = () => {
      if (cancelled) return;
      const el = document.getElementById(targetId);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
      // Reader not mounted yet — retry for up to ~2s.
      if (attempts < 20) {
        attempts += 1;
        setTimeout(tryScroll, 100);
      }
    };

    // Defer one frame so layout is ready, then start.
    const raf = requestAnimationFrame(tryScroll);

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [targetId]);

  return null;
}
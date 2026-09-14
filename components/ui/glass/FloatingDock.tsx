"use client";

// components/ui/glass/FloatingDock.tsx
// A page's primary action, floating on glass above the phone tab bar.
//
// The rule that makes a dock worth having is when it stays AWAY:
//   - while the in-page control it stands in for is on screen (`watchId`), so
//     the same button is never drawn twice;
//   - once the footer scrolls in, so it never covers the page's end.
// Both are decided by an IntersectionObserver, not by scroll math, so a
// sticky element that stays in view while pinned counts as in view.
//
// Used by the book page (MobileReadDock) and the learning-path page. The
// visibility breakpoint is the caller's (`className`), because each page's
// in-page action is on screen from a different width.

import { useEffect, useState, type ReactNode } from "react";

export default function FloatingDock({
  watchId,
  className = "",
  children,
}: {
  /** id of the in-page control this dock stands in for. */
  watchId?: string;
  /** e.g. "lg:hidden" — where the dock has no job. */
  className?: string;
  children: ReactNode;
}) {
  // Start hidden when there is something to watch: a dock that flashes in on
  // load and then leaves is worse than one that arrives a frame late.
  const [watchedVisible, setWatchedVisible] = useState(Boolean(watchId));
  const [footerVisible, setFooterVisible] = useState(false);

  // Where the observer cannot run, or the watched control is missing, the dock
  // simply stays away — the page's own in-page action is still there.
  useEffect(() => {
    if (typeof IntersectionObserver !== "function") return;
    const watched = watchId ? document.getElementById(watchId) : null;
    if (watchId && !watched) return;
    const footer = document.querySelector("footer");
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === watched) setWatchedVisible(entry.isIntersecting);
        else setFooterVisible(entry.isIntersecting);
      }
    });
    if (watched) observer.observe(watched);
    if (footer) observer.observe(footer);
    return () => observer.disconnect();
  }, [watchId]);

  const shown = !watchedVisible && !footerVisible;

  return (
    <div
      aria-hidden={!shown}
      inert={!shown}
      className={`glass-surface glass-surface--strong fixed inset-x-2.5 bottom-[calc(var(--ptec-mobile-nav-clearance)+0.5rem)] z-40 mx-auto flex max-w-md items-center gap-1.5 rounded-[22px] p-1.5 transition-[transform,opacity] duration-200 ease-out motion-reduce:transition-none print:hidden ${className} ${
        shown ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-3 opacity-0"
      }`}
    >
      {children}
    </div>
  );
}

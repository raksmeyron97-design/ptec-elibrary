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
  revealAfterPassed = false,
  children,
}: {
  /** id of the in-page control this dock stands in for. */
  watchId?: string;
  /** e.g. "lg:hidden" — where the dock has no job. */
  className?: string;
  /**
   * Show only once the watched control has scrolled ABOVE the viewport, not
   * while the reader has yet to reach it. For a page whose action row sits a
   * screen down (a journal article's header), a dock at load would repeat the
   * row the reader is about to see; the book page leaves this off on purpose,
   * because there the dock IS how "Read online" gets above the fold.
   */
  revealAfterPassed?: boolean;
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
    if (footer) observer.observe(footer);

    // "Passed" is a question about position, not about crossing: a jump from
    // below the control straight back to the top (Home key, a back-to-top
    // link) never intersects it, so an observer would never report the change
    // and the dock would stay up over the header it stands in for. So in this
    // mode the watched control is read on scroll instead — one rect per frame.
    let frame = 0;
    const check = () => {
      frame = 0;
      if (watched) setWatchedVisible(watched.getBoundingClientRect().bottom > 0);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(check);
    };
    if (revealAfterPassed && watched) {
      check();
      window.addEventListener("scroll", onScroll, { passive: true });
      window.addEventListener("resize", onScroll);
    } else if (watched) {
      observer.observe(watched);
    }

    return () => {
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [watchId, revealAfterPassed]);

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

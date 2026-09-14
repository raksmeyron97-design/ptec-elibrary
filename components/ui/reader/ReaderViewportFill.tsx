"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";

/* Sizes the dedicated reader routes to the viewport that is actually free.
   The public layout is shared and prerendered: a sticky navbar (and an
   optional announcement banner) above. Below `lg` the site also has a fixed
   bottom tab bar — but NOT on this route: lib/nav/shell-routes.ts hides it
   here, because the reader carries its own top bar (with Back) and bottom
   bar, and two stacked bottom bars cost a phone ~74px of page. So nothing is
   reserved at the bottom; `--reader-bottom-reserve` stays available (0 by
   default) for a shell that ever needs one.

   Height = viewport − this element's document offset − the reserved strip.
   The offset is re-measured when the document resizes (the banner being
   dismissed shifts it). Only custom properties are written, so the rule
   itself stays in CSS and the server render already has a sane height. */
export default function ReaderViewportFill({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const apply = () => {
      const top = Math.max(0, Math.round(el.getBoundingClientRect().top + window.scrollY));
      el.style.setProperty("--reader-top-offset", `${top}px`);
    };
    apply();
    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(apply) : null;
    ro?.observe(document.body);
    window.addEventListener("resize", apply);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", apply);
    };
  }, []);

  return (
    <div
      ref={ref}
      data-reader-fill
      className="flex min-h-[420px] flex-col"
      style={{ height: "calc(100dvh - var(--reader-top-offset, 0px) - var(--reader-bottom-reserve, 0px))" }}
    >
      {children}
    </div>
  );
}

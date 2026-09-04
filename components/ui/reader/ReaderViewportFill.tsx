"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";

/* Sizes the dedicated reader routes to the viewport that is actually free.
   The public layout is shared and prerendered: a sticky navbar (and an
   optional announcement banner) above, and below `lg` a FIXED bottom
   navigation the layout reserves 4.5 rem + the safe-area inset for. A plain
   `h-dvh` reader therefore ran past the bottom of the screen on phones, with
   its own bottom bar and its sheet behind the site's tab bar.

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
      className="flex min-h-[420px] flex-col [--reader-bottom-reserve:calc(4.5rem+env(safe-area-inset-bottom))] lg:[--reader-bottom-reserve:0px]"
      style={{ height: "calc(100dvh - var(--reader-top-offset, 0px) - var(--reader-bottom-reserve, 0px))" }}
    >
      {children}
    </div>
  );
}

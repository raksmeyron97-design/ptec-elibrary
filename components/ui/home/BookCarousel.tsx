// components/ui/BookCarousel.tsx
"use client";

import { useRef, useState, useEffect, useCallback, type ReactNode } from "react";

type Props = {
  /** Each child is rendered as one snap item. */
  children: ReactNode[];
  /** Tailwind width per item, responsive. Defaults to book-card sizing. */
  itemClassName?: string;
  className?: string;
  "aria-label"?: string;
};

/**
 * Horizontal, scroll-snap carousel.
 * - Mobile: native swipe, no chrome.
 * - Desktop: fading edge masks + circular arrow buttons that disable at ends.
 */
export default function BookCarousel({
  children,
  itemClassName = "w-[150px] sm:w-[180px] lg:w-[200px]",
  className = "",
  ...rest
}: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);

  const update = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setAtStart(scrollLeft <= 2);
    setAtEnd(scrollLeft + clientWidth >= scrollWidth - 2);
  }, []);

  useEffect(() => {
    update();
    const el = scroller.current;
    if (!el) return;
    el.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      el.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [update]);

  const scrollBy = (dir: 1 | -1) => {
    const el = scroller.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.round(el.clientWidth * 0.85), behavior: "smooth" });
  };

  return (
    <div className={`group/carousel relative ${className}`} {...rest}>
      {/* Track */}
      <div
        ref={scroller}
        className="flex gap-4 overflow-x-auto scroll-smooth pb-3 snap-x snap-mandatory
                   [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden
                   sm:gap-5"
      >
        {children.map((child, i) => (
          <div key={i} className={`shrink-0 snap-start ${itemClassName}`}>
            {child}
          </div>
        ))}
      </div>

      {/* Edge fade masks (desktop) */}
      <div
        aria-hidden
        className={`pointer-events-none absolute inset-y-0 left-0 hidden w-16 bg-gradient-to-r from-paper to-transparent transition-opacity sm:block ${
          atStart ? "opacity-0" : "opacity-100"
        }`}
      />
      <div
        aria-hidden
        className={`pointer-events-none absolute inset-y-0 right-0 hidden w-16 bg-gradient-to-l from-paper to-transparent transition-opacity sm:block ${
          atEnd ? "opacity-0" : "opacity-100"
        }`}
      />

      {/* Arrows (desktop, fade in on hover) */}
      <button
        type="button"
        aria-label="Scroll left"
        onClick={() => scrollBy(-1)}
        disabled={atStart}
        className="absolute left-1 top-1/2 z-10 hidden h-10 w-10 -translate-y-1/2 items-center justify-center
                   rounded-full border border-divider bg-bg-surface/95 text-text-heading shadow-md backdrop-blur-sm
                   transition-all hover:border-brand/30 hover:text-brand disabled:pointer-events-none disabled:opacity-0
                   sm:flex group-hover/carousel:opacity-100 sm:opacity-0"
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
          <path d="m15 18-6-6 6-6" />
        </svg>
      </button>
      <button
        type="button"
        aria-label="Scroll right"
        onClick={() => scrollBy(1)}
        disabled={atEnd}
        className="absolute right-1 top-1/2 z-10 hidden h-10 w-10 -translate-y-1/2 items-center justify-center
                   rounded-full border border-divider bg-bg-surface/95 text-text-heading shadow-md backdrop-blur-sm
                   transition-all hover:border-brand/30 hover:text-brand disabled:pointer-events-none disabled:opacity-0
                   sm:flex group-hover/carousel:opacity-100 sm:opacity-0"
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
          <path d="m9 18 6-6-6-6" />
        </svg>
      </button>
    </div>
  );
}

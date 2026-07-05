"use client";

import { useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * Hand-rolled scroll-snap carousel — no carousel dependency in this project.
 * Prev/next buttons are real controls (not drag-only) so the carousel stays
 * keyboard operable.
 */
export default function HorizontalCarousel({ children }: { children: React.ReactNode }) {
  const trackRef = useRef<HTMLDivElement>(null);

  const scrollBy = (dir: 1 | -1) => {
    const el = trackRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.round(el.clientWidth * 0.85), behavior: "smooth" });
  };

  return (
    <div className="relative">
      <div
        ref={trackRef}
        className="flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth pb-2 sm:gap-5 [&>*]:snap-start"
        style={{ scrollbarWidth: "thin" }}
      >
        {children}
      </div>
      <button
        type="button"
        onClick={() => scrollBy(-1)}
        aria-label="Scroll left"
        className="absolute -left-3 top-1/2 hidden -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border border-divider bg-bg-surface p-2 text-text-muted shadow-md transition-all hover:border-brand/40 hover:text-brand active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50 sm:flex"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => scrollBy(1)}
        aria-label="Scroll right"
        className="absolute -right-3 top-1/2 hidden -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border border-divider bg-bg-surface p-2 text-text-muted shadow-md transition-all hover:border-brand/40 hover:text-brand active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50 sm:flex"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}

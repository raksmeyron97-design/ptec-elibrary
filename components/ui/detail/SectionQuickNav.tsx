"use client";

import { useEffect, useRef, useState } from "react";

export type QuickNavSection = {
  id: string;
  label: string;
  /** Set false for jump-only links (e.g. into a sticky sidebar) that
   *  shouldn't participate in scrollspy active-state tracking. */
  track?: boolean;
};

/**
 * Sticky section nav with IntersectionObserver-based scrollspy. Unlike
 * click-to-switch tabs, this assumes the sections it links to are stacked,
 * always-mounted <section id="..."> blocks on the page (true scroll, not
 * tab panels) so highlighting the "current" section is actually meaningful.
 */
export default function SectionQuickNav({ sections }: { sections: QuickNavSection[] }) {
  const [activeId, setActiveId] = useState<string | null>(sections[0]?.id ?? null);
  const navRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const elements = sections
      .filter((s) => s.track !== false)
      .map((s) => document.getElementById(s.id))
      .filter((el): el is HTMLElement => !!el);
    if (elements.length === 0) return;

    const visible = new Map<string, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            visible.set(entry.target.id, entry.intersectionRatio);
          } else {
            visible.delete(entry.target.id);
          }
        }
        if (visible.size > 0) {
          const topMost = [...visible.entries()].sort((a, b) => b[1] - a[1])[0];
          setActiveId(topMost[0]);
        }
      },
      { rootMargin: "-15% 0px -70% 0px", threshold: [0, 0.25, 0.5, 0.75, 1] },
    );

    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [sections]);

  if (sections.length === 0) return null;

  return (
    <div
      ref={navRef}
      className="sticky top-0 z-40 -mx-4 mb-7 overflow-x-auto border-b border-divider bg-bg-body/95 px-4 py-2.5 backdrop-blur-sm sm:-mx-6 sm:px-6 md:-mx-12 md:px-12 lg:top-[72px]"
    >
      <nav aria-label="Section navigation" className="mx-auto flex max-w-[1200px] flex-nowrap items-center gap-2">
        {sections.map((s) => {
          const active = s.id === activeId;
          return (
            <a
              key={s.id}
              href={`#${s.id}`}
              aria-current={active ? "true" : undefined}
              onClick={(e) => {
                e.preventDefault();
                document.getElementById(s.id)?.scrollIntoView({ behavior: "smooth", block: "start" });
                setActiveId(s.id);
              }}
              className={`qlink shrink-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50 ${
                active ? "!border-brand !bg-brand/10 !text-brand" : ""
              }`}
            >
              {s.label}
            </a>
          );
        })}
      </nav>
    </div>
  );
}

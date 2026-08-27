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
 *
 * The bar can also carry one persistent action (`action`). It is revealed only
 * once `revealActionAfterId` has scrolled out of view — which is what lets the
 * page drop its duplicate "Quick Actions" card: the recap now exists exactly
 * when the original is off screen, rather than permanently beside it.
 */
export default function SectionQuickNav({
  sections,
  label = "Section navigation",
  action,
  revealActionAfterId,
}: {
  sections: QuickNavSection[];
  /** Accessible name for the nav landmark. Localise it at the call site. */
  label?: string;
  /** Optional trailing control (e.g. Download). Rendered server-side. */
  action?: React.ReactNode;
  /** Element whose exit from the viewport reveals `action`. */
  revealActionAfterId?: string;
}) {
  const [activeId, setActiveId] = useState<string | null>(sections[0]?.id ?? null);
  const [actionVisible, setActionVisible] = useState(false);
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

  // Reveal the trailing action once its origin block is fully above the fold.
  useEffect(() => {
    if (!action || !revealActionAfterId) return;
    const target = document.getElementById(revealActionAfterId);
    if (!target) return;
    const observer = new IntersectionObserver(
      ([entry]) => setActionVisible(!entry.isIntersecting),
      { threshold: 0 },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [action, revealActionAfterId]);

  if (sections.length === 0) return null;

  return (
    <div
      ref={navRef}
      className="sticky top-0 z-40 -mx-4 mb-7 border-b border-divider bg-bg-body/95 px-4 py-2.5 backdrop-blur-sm sm:-mx-6 sm:px-6 md:-mx-12 md:px-12 lg:top-[72px]"
    >
      <div className="mx-auto flex max-w-[1200px] items-center gap-3">
        {/* The chip row scrolls; the mask tells you so. Without it a row cut
            off at the viewport edge looks like the list simply ends. */}
        <nav
          aria-label={label}
          className="quicknav-scroller flex min-w-0 flex-1 flex-nowrap items-center gap-2 overflow-x-auto"
        >
          {sections.map((s) => {
            const active = s.id === activeId;
            return (
              <a
                key={s.id}
                href={`#${s.id}`}
                // "location" is the correct token for "this is where you are in
                // the document"; "true" implies a current *page*.
                aria-current={active ? "location" : undefined}
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
        {action && (
          <div
            // Kept out of the tab order and off the a11y tree while hidden:
            // the same control is still reachable in the masthead above.
            inert={!actionVisible ? true : undefined}
            aria-hidden={!actionVisible ? true : undefined}
            className={`hidden shrink-0 transition-opacity duration-200 motion-reduce:transition-none sm:block ${
              actionVisible ? "opacity-100" : "pointer-events-none opacity-0"
            }`}
          >
            {action}
          </div>
        )}
      </div>
    </div>
  );
}

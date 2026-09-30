"use client";

// The record's section index — a sticky row of anchors over the reading card.
//
// It used to be mounted twice (a disclosure above the content on phones, a
// list in the sidebar on laptops) because the two slots were different grid
// cells. One horizontal bar serves every width, so it is mounted once and the
// sidebar is left to the reader's actions: access and citation.
//
// The bar lists only sections this record has (lib/theses/record.ts), so no
// anchor points at an empty heading. The active marker answers "which heading
// did I last scroll past?", measured from element tops — intersection alone
// picks the wrong section after a jump, because the tall section above the
// target still intersects the viewport.
//
// Smooth scrolling is CSS (`scroll-behavior` on the page, `scroll-mt` on the
// targets), so it honours prefers-reduced-motion with no code here.

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { RecordSection } from "@/lib/theses/record";

function useActiveSection(ids: string[]): string {
  const [active, setActive] = useState(ids[0] ?? "");
  const key = ids.join(",");

  useEffect(() => {
    const list = key.split(",").filter(Boolean);
    // Below the phone's top bar and this bar itself.
    const TRIGGER = 160;

    const recompute = () => {
      let current = list[0] ?? "";
      for (const id of list) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= TRIGGER) current = id;
      }
      // The last section can be too short to reach the trigger line; pin the
      // marker to it once the page cannot scroll any further.
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2 && list.length > 0) {
        current = list[list.length - 1];
      }
      setActive((prev) => (prev === current ? prev : current));
    };

    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        recompute();
      });
    };

    recompute();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [key]);

  return active;
}

export default function SectionNav({ sections }: { sections: RecordSection[] }) {
  const t = useTranslations("thesisDetail");
  const active = useActiveSection(sections.map((s) => s.id));
  const listRef = useRef<HTMLUListElement>(null);

  // Keep the active chip in view on a phone, where the row scrolls sideways.
  // The row is scrolled directly: scrollIntoView() would also scroll the
  // PAGE whenever the bar itself is off screen.
  useEffect(() => {
    const list = listRef.current;
    const chip = list?.querySelector<HTMLElement>(`[data-section="${active}"]`);
    if (!list || !chip) return;
    const row = list.getBoundingClientRect();
    const box = chip.getBoundingClientRect();
    if (box.left < row.left) list.scrollLeft -= row.left - box.left + 16;
    else if (box.right > row.right) list.scrollLeft += box.right - row.right + 16;
  }, [active]);

  if (sections.length < 2) return null;

  return (
    <nav
      aria-label={t("onThisPage")}
      className="sticky top-[var(--ptec-sticky-top)] z-20 -mx-4 bg-bg-app px-4 py-3 sm:mx-0 sm:px-0 print:hidden"
    >
      <ul ref={listRef} className="flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {sections.map((s) => {
          const current = s.id === active;
          return (
            <li key={s.id} className="shrink-0">
              <a
                href={`#${s.id}`}
                data-section={s.id}
                aria-current={current ? "location" : undefined}
                className={`inline-flex h-9 items-center whitespace-nowrap rounded-full border px-3.5 text-[13.5px] font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50 ${
                  current
                    ? "border-info-line bg-info-soft text-info-text"
                    : "border-border bg-bg-surface text-text-heading hover:border-brand hover:text-brand"
                }`}
              >
                {s.label}
                {s.count != null && (
                  <span className={`ml-1.5 tabular-nums ${current ? "" : "text-text-muted"}`}>{s.count}</span>
                )}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

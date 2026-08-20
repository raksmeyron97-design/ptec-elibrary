"use client";

// "On this page" — section navigation for the record.
//
// Two presentations of one list, selected by the `variant` prop:
//
//   • "rail" (large screens): a plain list at the top of the supporting rail. The STICKINESS
//     lives on the rail (see the <aside> on the record page), not here — a
//     sticky element keeps its siblings scrolling past underneath it, so
//     pinning only this list made the citation and status cards slide under
//     it and overlap.
//   • "disclosure" (small screens): a <details>. A vertical list of five
//     links is a lot of screen to spend before the abstract on a phone.
//     <details> gets the open/close behaviour, keyboard support and the
//     expanded state announced for free — no state, no listener, and it works
//     before hydration.
//
// The active marker answers "which heading did I last scroll past?" — see
// useActiveSection below for why that is measured from element tops rather
// than from IntersectionObserver entries.
//
// Smooth scrolling is left to CSS (`scroll-behavior` on the anchor targets'
// container plus `scroll-mt` for the offset), not JavaScript, so it honours
// prefers-reduced-motion without any code here.

import { useEffect, useState } from "react";
import { ChevronDown, List } from "lucide-react";

export type RecordSection = {
  id: string;
  label: string;
  /** Rendered after the label in the muted colour, e.g. "16". */
  meta?: string;
};

function useActiveSection(sections: RecordSection[]) {
  const [active, setActive] = useState(sections[0]?.id ?? "");

  useEffect(() => {
    const ids = sections.map((s) => s.id);

    // The active section is the LAST one whose top has crossed the trigger
    // line — not the first box that happens to intersect a band.
    //
    // Intersection alone gets this wrong on a jump: click "References" and the
    // Publication details section above it is still tall enough to intersect
    // the band, so it sorts first and wins. Measuring tops instead asks the
    // question the marker is actually answering — "which heading did I last
    // scroll past?" — and is correct whether the reader jumped or scrolled.
    const TRIGGER = 140; // px below the viewport top; clears the docked navbar

    const recompute = () => {
      let current = ids[0] ?? "";
      for (const id of ids) {
        const el = document.getElementById(id);
        if (!el) continue;
        if (el.getBoundingClientRect().top <= TRIGGER) current = id;
      }
      // Bottom of the document: the last section can be too short to ever
      // reach the trigger line, so pin the marker to it once the page cannot
      // scroll any further.
      const atBottom =
        window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
      if (atBottom && ids.length > 0) current = ids[ids.length - 1];
      setActive((prev) => (prev === current ? prev : current));
    };

    // The observer is only a cheap "something moved" trigger; the answer comes
    // from recompute(). rAF-throttled so a fast scroll does not run the
    // measurement loop on every frame.
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
  }, [sections]);

  return active;
}

function SectionLinks({
  sections,
  active,
  onNavigate,
}: {
  sections: RecordSection[];
  active: string;
  onNavigate?: () => void;
}) {
  return (
    <ul className="flex flex-col">
      {sections.map((s) => {
        const isActive = s.id === active;
        return (
          <li key={s.id}>
            <a
              href={`#${s.id}`}
              onClick={onNavigate}
              aria-current={isActive ? "location" : undefined}
              className={`flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-[13.5px] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50 ${
                isActive
                  ? "bg-surface-brand-soft font-semibold text-brand"
                  : "text-text-body hover:bg-bg-app hover:text-text-heading"
              }`}
            >
              <span className="min-w-0 truncate">{s.label}</span>
              {s.meta && (
                <span className="shrink-0 text-[12px] tabular-nums text-text-muted">{s.meta}</span>
              )}
            </a>
          </li>
        );
      })}
    </ul>
  );
}

export default function ThesisSectionNav({
  sections,
  variant,
  heading = "On this page",
}: {
  sections: RecordSection[];
  /**
   * Which presentation to render. The page mounts this component twice —
   * above the content on small screens, inside the supporting rail on large
   * ones — because the two slots are in different grid cells and CSS cannot
   * move an element between them.
   *
   * Each mount renders ONE presentation rather than both-with-one-hidden.
   * Rendering both put two `<nav aria-label="On this page">` landmarks and two
   * <h2>s in the DOM at every width, and relying on a `display:none` utility
   * to keep one of them out of the accessibility tree is a guarantee that
   * quietly breaks the first time somebody changes the breakpoint utility.
   */
  variant: "disclosure" | "rail";
  heading?: string;
}) {
  const active = useActiveSection(sections);
  const activeLabel = sections.find((s) => s.id === active)?.label ?? sections[0]?.label;

  if (variant === "disclosure") {
    return (
      <details className="group rounded-2xl border border-divider bg-bg-surface shadow-sm">
        <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2.5 px-4 py-3 text-[14px] font-semibold text-text-heading [&::-webkit-details-marker]:hidden">
          <List className="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
          <span className="shrink-0">{heading}</span>
          <span className="min-w-0 flex-1 truncate text-right text-[13px] font-normal text-text-muted">
            {activeLabel}
          </span>
          <ChevronDown
            className="h-4 w-4 shrink-0 text-text-muted transition-transform duration-150 group-open:rotate-180 motion-reduce:transition-none"
            aria-hidden="true"
          />
        </summary>
        <div className="border-t border-divider p-2">
          <SectionLinks sections={sections} active={active} />
        </div>
      </details>
    );
  }

  return (
    <nav aria-label={heading}>
      <h2 className="px-3 text-[11px] font-bold uppercase tracking-[0.14em] text-text-muted">
        {heading}
      </h2>
      <div className="mt-2">
        <SectionLinks sections={sections} active={active} />
      </div>
    </nav>
  );
}

"use client";

// "On this record" — the left rail of the Modernist record page.
//
// This is what replaced the tab strip. Tabs hid two thirds of the record
// behind a click and gave a reader arriving from a search result no way to
// see that a full text or a reference list existed at all; the design puts
// every section in one scrolling column and uses this index to move through
// it. Sections that do not exist for a given thesis are simply not passed in,
// so the index never advertises an empty panel.
//
// The active marker is driven by IntersectionObserver rather than by scroll
// position arithmetic: `rootMargin` puts the trigger line just under the
// sticky page chrome, so a section becomes current when its heading reaches
// the top of the readable area, which is where a reader thinks they are.

import { useEffect, useRef, useState } from "react";

export type RecordSection = {
  id: string;
  label: string;
  /** Rendered after the label in the muted colour, e.g. "48 pp." or "0". */
  meta?: string;
};

export default function RecordIndex({
  sections,
  heading = "On this record",
}: {
  sections: RecordSection[];
  heading?: string;
}) {
  const [active, setActive] = useState(sections[0]?.id ?? "");
  // The observer only ever narrows the candidate set; keeping the last known
  // active id in a ref means scrolling past the final section (whose heading
  // has left the trigger band) does not blank the marker.
  const lastActive = useRef(active);

  useEffect(() => {
    const targets = sections
      .map((s) => document.getElementById(s.id))
      .filter((el): el is HTMLElement => el != null);
    if (targets.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        const next = visible[0]?.target.id ?? lastActive.current;
        lastActive.current = next;
        setActive(next);
      },
      // Top inset clears the docked navbar; the large bottom inset keeps only
      // the band near the top of the viewport eligible, so two sections are
      // never "current" at once on a tall screen.
      { rootMargin: "-96px 0px -65% 0px", threshold: 0 },
    );

    targets.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [sections]);

  return (
    <nav aria-label={heading} className="lg:sticky lg:top-24">
      <h2 className="text-[11px] font-bold uppercase tracking-[0.14em] text-text-muted mb-3">{heading}</h2>
      <ul className="flex flex-col">
        {sections.map((s) => {
          const isActive = s.id === active;
          return (
            <li key={s.id}>
              <a
                href={`#${s.id}`}
                aria-current={isActive ? "true" : undefined}
                className={`block border-l-[3px] py-2 pl-2.5 text-[13px] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring/50 ${
                  isActive
                    ? "border-brand font-extrabold text-text-heading"
                    : "border-transparent text-text-muted hover:text-text-heading"
                }`}
              >
                {s.label}
                {s.meta && <span className="ml-1 font-normal text-text-muted">({s.meta})</span>}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

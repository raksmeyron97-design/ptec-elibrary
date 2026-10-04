"use client";
// The description on a physical-library record (/catalogs/[slug]).
//
// The paragraphs arrive already reflowed (lib/catalogs/description-text.ts):
// pasted text is often hard-wrapped every ~57 characters, and rendering its
// line breaks made a ragged narrow column. A long description folds behind
// "Read more" — the excerpt on the-body-institute-riggs-carol is 3,113
// characters, and it pushed the book's details and copies three screens down.
//
// As in PublicationAbstractSection, the full text always stays in the DOM and
// the fold is CSS clipping, so search engines, print and readers without
// JavaScript all get the whole description.

import { useId, useLayoutEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import type { DescriptionParagraph } from "@/lib/catalogs/description-text";

/** About nine lines at the body size below: enough to know what the book is. */
const COLLAPSED_MAX_HEIGHT = "16.5em";

export default function CatalogDescription({
  paragraphs,
  collapsible,
  showMoreLabel,
  showLessLabel,
}: {
  paragraphs: DescriptionParagraph[];
  /** Decided on length by the page, so a short description never shows a control. */
  collapsible: boolean;
  showMoreLabel: string;
  showLessLabel: string;
}) {
  const reactId = useId();
  const contentId = `catalog-description-${reactId.replace(/:/g, "")}`;
  const rootRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  // Assumed true for a long text, so the server's HTML already has the fade and
  // the control: before hydration (a slow phone) a reader never meets clipped
  // text with no way to open it. The measurement below corrects it.
  const [overflowing, setOverflowing] = useState(collapsible);

  // Show the control only when the folded text is actually clipped.
  useLayoutEffect(() => {
    if (expanded) return;
    const el = contentRef.current;
    if (!el || !collapsible) return;
    const measure = () => setOverflowing(el.scrollHeight > el.clientHeight + 1);
    measure();
    if (typeof ResizeObserver === "undefined") return; // an old browser: one measurement
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [expanded, collapsible]);

  const toggle = () => {
    const next = !expanded;
    setExpanded(next);
    if (!next) {
      // Folding a long text can leave the reader far below it.
      requestAnimationFrame(() => {
        const root = rootRef.current;
        if (root && root.getBoundingClientRect().top < 0) {
          const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
          root.scrollIntoView({ block: "start", behavior: reduce ? "auto" : "smooth" });
        }
      });
    }
  };

  const folded = collapsible && !expanded;

  return (
    <div ref={rootRef} className="scroll-mt-28">
      <div className="relative">
        <div
          id={contentId}
          ref={contentRef}
          className="max-w-[68ch] space-y-4 overflow-hidden text-[15.5px] leading-[1.8] text-text-body print:!max-h-none"
          style={folded ? { maxHeight: COLLAPSED_MAX_HEIGHT } : undefined}
        >
          {paragraphs.map((lines, i) => (
            <p key={i} className="text-pretty">
              {lines.map((line, j) => (
                <span key={j}>
                  {j > 0 && <br />}
                  {line}
                </span>
              ))}
            </p>
          ))}
        </div>
        {folded && overflowing && (
          <div
            aria-hidden="true"
            data-fold-control={contentId}
            className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-bg-surface via-bg-surface/80 to-transparent print:hidden"
          />
        )}
        {/* Without JavaScript nothing can open the fold: never clip, and hide
            the fade and the control the server rendered. */}
        <noscript>
          <style>{`#${contentId}{max-height:none!important}[data-fold-control="${contentId}"]{display:none!important}`}</style>
        </noscript>
      </div>

      {collapsible && (overflowing || expanded) && (
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={contentId}
          data-fold-control={contentId}
          onClick={toggle}
          className="mt-3 inline-flex min-h-9 cursor-pointer items-center gap-1 rounded-lg px-2.5 py-1 -ml-2.5 text-[13.5px] font-semibold text-brand transition-colors hover:bg-brand/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50 print:hidden"
        >
          {expanded ? showLessLabel : showMoreLabel}
          <ChevronDown
            aria-hidden="true"
            className={`h-4 w-4 transition-transform motion-reduce:transition-none ${expanded ? "rotate-180" : ""}`}
          />
        </button>
      )}
    </div>
  );
}

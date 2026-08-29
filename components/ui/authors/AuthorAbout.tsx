"use client";

import { useId, useState } from "react";
import { ChevronDown } from "lucide-react";

/** Above this many characters a biography gets a collapse control. */
const LONG_BIO_CHARS = 620;

/**
 * The author's biography.
 *
 * Two rules from the brief, both load-bearing:
 *
 *  1. Never render an empty section. The caller is expected not to mount this
 *     at all without text, but it also returns null defensively — a biography
 *     that is whitespace in the database is an absent biography.
 *  2. Do not truncate important information unnecessarily. Short and
 *     medium-length biographies render in full with no control at all; only a
 *     genuinely long one is collapsed, and its full text is IN THE DOM the
 *     whole time (clipped with max-height, not sliced), so it is searchable
 *     with the browser's own find, selectable, and readable by a screen reader
 *     regardless of the collapsed state.
 *
 * Paragraphs are split on blank lines and rendered as real <p> elements — the
 * bio field is plain text, so nothing here interprets markup.
 */
export default function AuthorAbout({
  heading,
  bio,
  bioKm,
  labels,
}: {
  heading: string;
  bio: string | null;
  bioKm: string | null;
  labels: { more: string; less: string };
}) {
  const [expanded, setExpanded] = useState(false);
  const bodyId = useId();

  const primary = bio?.trim() || null;
  const khmer = bioKm?.trim() || null;
  if (!primary && !khmer) return null;

  const combinedLength = (primary?.length ?? 0) + (khmer?.length ?? 0);
  const collapsible = combinedLength > LONG_BIO_CHARS;
  const clipped = collapsible && !expanded;

  const paragraphs = (text: string) =>
    text
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean);

  return (
    <section aria-labelledby={`${bodyId}-heading`}>
      <h2
        id={`${bodyId}-heading`}
        className="text-[13px] font-bold uppercase tracking-[0.12em] text-text-muted"
      >
        {heading}
      </h2>

      <div className="relative mt-3">
        <div
          id={bodyId}
          // max-h + overflow-hidden rather than slicing the string: the whole
          // biography stays in the document when collapsed.
          className={clipped ? "max-h-[13.5rem] overflow-hidden" : ""}
        >
          {primary &&
            paragraphs(primary).map((p, i) => (
              <p
                key={`en-${i}`}
                className="mt-3 max-w-[68ch] text-[15.5px] leading-[1.75] text-text-body first:mt-0"
              >
                {p}
              </p>
            ))}
          {khmer &&
            paragraphs(khmer).map((p, i) => (
              <p
                key={`km-${i}`}
                lang="km"
                className="mt-3 max-w-[68ch] font-khmer-serif text-[15px] leading-[2] text-text-body"
              >
                {p}
              </p>
            ))}
        </div>

        {/* Fades the clipped edge so it reads as "there is more" rather than
            as a paragraph that stops mid-sentence. Purely decorative and
            pointer-transparent, so it never eats a click on the text under it. */}
        {clipped && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-bg-body to-transparent"
          />
        )}
      </div>

      {collapsible && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-controls={bodyId}
          className="focus-field mt-3 inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-lg text-[13px] font-bold text-brand transition-colors hover:text-brand-hover"
        >
          {expanded ? labels.less : labels.more}
          <ChevronDown
            aria-hidden="true"
            className={`h-3.5 w-3.5 transition-transform duration-150 ${expanded ? "rotate-180" : ""}`}
          />
        </button>
      )}
    </section>
  );
}

// components/ui/home/SectionHeader.tsx
//
// The homepage's one section header, and the one place its vertical rhythm is
// declared. Every band used to hand-roll the same eyebrow rule + clamped title
// + muted lede, with the padding scale drifting between `py-12 sm:py-14
// md:py-16` and `py-12 sm:py-16 md:py-20` — close enough to look accidental
// rather than intentional when two of them met.
//
// Server component: it takes resolved strings, so it works under any locale
// without a client boundary.

import type { ReactNode } from "react";

/** Outer <section> padding. One scale, every band. */
export const SECTION_SHELL = "mx-auto max-w-[1400px] px-4 py-12 sm:py-14 md:px-12 md:py-16";

/**
 * Alternating surface, so adjacent bands separate without a border on every
 * one of them. Index is the section's position in the page, not its identity.
 */
export function sectionSurface(index: number): string {
  return index % 2 === 0
    ? "border-b border-divider/60 bg-paper"
    : "border-b border-divider/60 bg-bg-surface";
}

/**
 * Latin eyebrows are set in small caps with wide tracking; Khmer must not be —
 * uppercase does nothing to Khmer glyphs and letter-spacing pulls the
 * subscript consonants (ជើង) away from the base they attach to.
 */
export function eyebrowCase(locale: string): string {
  return locale === "en" ? "uppercase tracking-[0.2em]" : "tracking-normal";
}

export default function SectionHeader({
  id,
  eyebrow,
  title,
  body,
  locale,
  accent = "brand",
  action,
}: {
  /** Must match the parent section's aria-labelledby. */
  id: string;
  eyebrow: string;
  title: string;
  body?: string;
  locale: string;
  /** Which end of the brand ramp the eyebrow rule starts from. */
  accent?: "brand" | "accent";
  /** Optional right-aligned "view all" affordance (desktop). */
  action?: ReactNode;
}) {
  const rule =
    accent === "brand"
      ? "bg-gradient-to-r from-brand to-accent"
      : "bg-gradient-to-r from-accent to-brand";
  const eyebrowTone = accent === "brand" ? "text-brand" : "text-accent-text";

  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="max-w-2xl">
        <div className="mb-2 flex items-center gap-3">
          <span className={`h-[3px] w-7 rounded-full ${rule}`} aria-hidden />
          <span className={`text-[11px] font-bold ${eyebrowTone} ${eyebrowCase(locale)}`}>
            {eyebrow}
          </span>
        </div>
        <h2
          id={id}
          className="font-khmer-serif font-bold leading-tight tracking-tight text-text-heading"
          // Khmer needs the extra leading: at the ~1.25 the Latin branch is
          // happy with, stacked vowel signs clip against the line above.
          style={{ fontSize: "clamp(22px, 2.4vw, 32px)", lineHeight: locale === "km" ? 1.45 : 1.2 }}
        >
          {title}
        </h2>
        {body && (
          <p
            className="mt-2 text-[14.5px] text-text-muted"
            style={{ lineHeight: locale === "km" ? 1.85 : 1.6 }}
          >
            {body}
          </p>
        )}
      </div>
      {action}
    </div>
  );
}

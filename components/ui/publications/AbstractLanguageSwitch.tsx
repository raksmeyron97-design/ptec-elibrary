"use client";

import type { AbstractLang } from "@/lib/publications/abstract-language";

/**
 * The abstract's language switch: `EN | ខ្មែរ`.
 *
 * A bilingual record used to print both abstracts one after the other, which
 * on a phone put the second language — and everything after it — a screen
 * further down for a reader who cannot read it. One is shown at a time; the
 * other stays in the DOM (see PublicationAbstractSection), so nothing is lost
 * to a crawler, a printer, a citation back-link or a reader without
 * JavaScript.
 *
 * `role="group"` + `aria-pressed`, the same vocabulary CitePublication's format
 * buttons use on this page, rather than the APG tab pattern: every option stays
 * a real button in the tab order, with no roving tabindex to get wrong, and the
 * panel it governs is named by `aria-controls`.
 *
 * Rendered only when BOTH languages carry text — a switch with one reachable
 * side is a control that decides nothing.
 */
export default function AbstractLanguageSwitch({
  active,
  onChange,
  groupLabel,
  options,
  className = "",
}: {
  active: AbstractLang;
  onChange: (lang: AbstractLang) => void;
  /** Names the control itself, e.g. "Abstract language". */
  groupLabel: string;
  /** In display order. `label` is the short chip, `name` the accessible name. */
  options: { lang: AbstractLang; label: string; name: string; controls: string }[];
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label={groupLabel}
      // A recessed track with the chosen side raised out of it, rather than two
      // bordered buttons one of which is filled brand: a filled navy chip sat
      // directly above the abstract and was the loudest thing on the screen
      // after the primary button — a language switch should not out-weigh the
      // text it governs.
      //
      // Hidden from print: the print stylesheet reveals both languages, so a
      // control offering a choice that no longer exists would be noise on paper.
      className={`inline-flex shrink-0 items-center gap-0.5 rounded-xl border border-divider bg-paper p-0.5 print:hidden ${className}`}
    >
      {options.map((option) => {
        const isActive = option.lang === active;
        return (
          <button
            key={option.lang}
            type="button"
            lang={option.lang}
            onClick={() => onChange(option.lang)}
            aria-pressed={isActive}
            aria-controls={option.controls}
            // The visible chip is short ("EN"); the accessible name is the
            // language in full, so a screen reader says "English abstract"
            // rather than spelling two letters.
            aria-label={option.name}
            // Khmer is set a step larger with room to breathe: Hanuman draws
            // "ខ្មែរ" as a stacked cluster, and at the English chip's 13 px it
            // measured 16.5 px wide — present, but not readable. Khmer has no
            // case either, so the chip is not uppercased.
            className={`inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-[0.6rem] px-3.5 font-semibold transition-colors duration-150 ${
              option.lang === "km"
                ? "font-khmer-serif text-[15px] leading-[1.8] tracking-normal"
                : "text-[13px]"
            } ${
              // Never colour alone: the chosen side is also raised (its own
              // surface + shadow) and set in bold.
              isActive
                ? "bg-bg-surface font-bold text-brand shadow-sm"
                : "text-text-muted hover:text-text-heading"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

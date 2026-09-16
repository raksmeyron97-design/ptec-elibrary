// Which language of a bilingual abstract is shown, and whether the reader is
// offered a choice at all. Pure and browser-safe, so the rule is decided once
// and exercised offline rather than re-derived by each surface that renders an
// abstract (the section on the page, and the fullscreen reader opened from it).
//
// The rule the page needs is small but has a real fallback matrix: a record may
// carry both languages, either one, or neither, and the reader's locale is a
// preference rather than an instruction — an English-only article on /km still
// has to render its English abstract rather than an empty panel.

export type AbstractLang = "en" | "km";

export type AbstractLanguageChoice = {
  /** The language whose panel is visible first. Meaningless when `none`. */
  active: AbstractLang;
  /** Both texts exist, so the reader is offered the switch. */
  switchable: boolean;
  /** Neither text exists — the caller renders its own empty state. */
  none: boolean;
};

/**
 * Resolve the opening language for an abstract.
 *
 * Preference, never coercion: the reader's locale wins only where that
 * language actually has text. Availability is decided on TRIMMED content, so a
 * column holding `"  "` is absent rather than an empty panel the switch can
 * reach.
 */
export function resolveAbstractLanguage(
  english: string | null | undefined,
  khmer: string | null | undefined,
  locale: string,
): AbstractLanguageChoice {
  const hasEn = !!english?.trim();
  const hasKm = !!khmer?.trim();

  if (!hasEn && !hasKm) return { active: "en", switchable: false, none: true };
  if (hasEn && !hasKm) return { active: "en", switchable: false, none: false };
  if (!hasEn && hasKm) return { active: "km", switchable: false, none: false };
  return { active: locale === "km" ? "km" : "en", switchable: true, none: false };
}

/**
 * Whether a whitespace word count means anything for this language.
 *
 * Khmer is written without spaces between words and this repository has no
 * segmenter (the same constraint that bounds AI spellchecking to entity
 * vocabulary), so `split(/\s+/)` reports a 200-word Khmer abstract as one or
 * two "words". The reading meter is therefore shown for English only: an
 * absent estimate is honest, a wrong one is not.
 */
export function wordCountIsMeaningful(lang: AbstractLang): boolean {
  return lang === "en";
}

// lib/seo/intro-drafts.ts
//
// The rules an introduction must pass before it may reach a public page (SEO
// Phases 2.2 and 2.3). Pure, so the importer, the hub-intro loader and their
// tests share one definition of "approved".
//
// Drafts are written by scripts and reviewed by librarians; the one thing
// this module guarantees is that a DRAFT cannot be published by accident: an
// entry must say `approved`, must no longer carry a review marker, and must be
// of the length the programme asked for.

/** Words in a text. Khmer has no spaces, so it is segmented with the ICU word
 *  dictionary (Intl.Segmenter), as the title fitter does; Latin splits on it too. */
export function countWords(text: string, locale: string): number {
  const seg = new Intl.Segmenter(locale === "km" ? "km" : "en", { granularity: "word" });
  let n = 0;
  for (const s of seg.segment(text)) if (s.isWordLike) n += 1;
  return n;
}

/** Anything a reviewer must clear before a text may be published. */
export const REVIEW_MARKER = /TODO\(|needs_review|\bTODO\b|\bTBD\b|lorem ipsum/i;

export type IntroBounds = { min: number; max: number };
export const SUBJECT_INTRO_WORDS: IntroBounds = { min: 80, max: 150 };
export const HUB_INTRO_WORDS: IntroBounds = { min: 60, max: 120 };

/** English words are checked against the bounds. Khmer word counts from the
 *  segmenter are not comparable to English ones (a compound can be one word or
 *  three), so a Khmer text is only required to exist and be marker-free. */
export function introProblems(
  text: string | null | undefined,
  locale: "en" | "km",
  bounds: IntroBounds,
): string[] {
  const value = text?.trim() ?? "";
  if (!value) return [];
  const problems: string[] = [];
  if (REVIEW_MARKER.test(value)) problems.push(`${locale}: still carries a review marker`);
  if (locale === "en") {
    const words = countWords(value, "en");
    if (words < bounds.min || words > bounds.max) {
      problems.push(`en: ${words} words, outside ${bounds.min}–${bounds.max}`);
    }
  }
  return problems;
}

export type SubjectIntroEntry = {
  slug: string;
  name_en?: { value: string | null; status: string } | null;
  intro_en?: string | null;
  intro_km?: string | null;
  km_review?: string | null;
  status: string;
};

export type SubjectIntroUpdate = {
  slug: string;
  name_en?: string;
  intro_en: string | null;
  intro_km: string | null;
  intro_status: "approved";
};

/**
 * What an approved entry would write, or why it may not. A `needs_review`
 * entry is SKIPPED (not an error: the file is mostly drafts); an `approved`
 * entry with a problem is refused whole, never half-imported.
 */
export function planSubjectIntro(
  entry: SubjectIntroEntry,
): { kind: "skip" } | { kind: "refuse"; problems: string[] } | { kind: "write"; update: SubjectIntroUpdate } {
  if (entry.status !== "approved") return { kind: "skip" };
  const en = entry.intro_en?.trim() || null;
  const km = entry.intro_km?.trim() || null;
  const problems = [
    ...introProblems(en, "en", SUBJECT_INTRO_WORDS),
    ...introProblems(km, "km", SUBJECT_INTRO_WORDS),
  ];
  if (!en && !km) problems.push("approved, but neither intro_en nor intro_km has text");
  if (km && entry.km_review && REVIEW_MARKER.test(entry.km_review)) {
    problems.push("km: km_review still says TODO(km-review) — a Khmer reader must approve intro_km first");
  }
  const nameEn = entry.name_en?.status === "approved" ? entry.name_en.value?.trim() || null : null;
  if (nameEn && REVIEW_MARKER.test(nameEn)) problems.push("name_en: still carries a review marker");
  if (problems.length > 0) return { kind: "refuse", problems };
  return {
    kind: "write",
    update: {
      slug: entry.slug,
      ...(nameEn ? { name_en: nameEn } : {}),
      intro_en: en,
      intro_km: km,
      intro_status: "approved",
    },
  };
}

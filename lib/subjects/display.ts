// lib/subjects/display.ts
//
// How a subject is NAMED on its own page (SEO Phase 2.1), pure so the rule is
// testable without rendering. Every category in this library is named in
// Khmer; 0161 lets a librarian approve an English name and an introduction.

export type SubjectNaming = {
  /** The Khmer name — `categories.name`, which every reader and the slug use. */
  name: string;
  /** The librarian-approved English name, or null. */
  nameEn: string | null;
  /** Approved introductions only; a draft never reaches this type. */
  intro: { en: string | null; km: string | null } | null;
};

/**
 * `heading` is the H1; `short` is the name a title or description uses.
 * An English page shows the approved English name with the Khmer one in
 * parentheses; without an approved English name it shows the Khmer name,
 * never a guessed translation. A Khmer page always shows the Khmer name.
 */
export function subjectNames(subject: Pick<SubjectNaming, "name" | "nameEn">, locale: string) {
  const en = subject.nameEn?.trim();
  if (locale !== "km" && en) {
    return { heading: `${en} (${subject.name})`, short: en };
  }
  return { heading: subject.name, short: subject.name };
}

/** The approved introduction in the page's language, or null. No fallback to
 *  the other language: an English paragraph on /km is not a Khmer page. */
export function approvedIntro(subject: Pick<SubjectNaming, "intro">, locale: string): string | null {
  const text = locale === "km" ? subject.intro?.km : subject.intro?.en;
  return text?.trim() ? text.trim() : null;
}

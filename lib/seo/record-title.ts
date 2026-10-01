// lib/seo/record-title.ts
//
// A book record's <title> (SEO Phase 2.4, finding F3):
//
//   {title} — {subject}{, Grade N}{ (PDF)} · {brand}
//
// Each part appears only when the record carries the fact, and only when it
// adds something: a subject or grade the title already states is not
// repeated. When the whole runs past the locale's budget (TITLE_BUDGET in
// text-fit.ts), parts are dropped in a fixed order — brand, format, grade,
// subject — and the item title itself is never cut. Pure and browser-safe.

import { graphemeLength, TITLE_BUDGET, type FittedTitle } from "@/lib/seo/text-fit";

export type RecordTitleParts = {
  title: string;
  /** The subject's name in the page's language, or null. */
  subject?: string | null;
  /** The grade as a number, or null. */
  grade?: number | null;
  /** The format cue, e.g. "(PDF)", or null. */
  format?: string | null;
};

const KHMER_DIGITS = "០១២៣៤៥៦៧៨៩";
const toKhmerDigits = (n: number) => String(n).replace(/\d/g, (d) => KHMER_DIGITS[Number(d)]);
const fromKhmerDigits = (s: string) => s.replace(/[០-៩]/g, (d) => String(KHMER_DIGITS.indexOf(d)));

/** "Grade 8" / "ថ្នាក់ទី៨" — the grade label a title carries in each language. */
export function gradeLabel(grade: number, locale: string): string {
  return locale === "km" ? `ថ្នាក់ទី${toKhmerDigits(grade)}` : `Grade ${grade}`;
}

// A grade and any list or range that continues it: "ថ្នាក់ទី១ ដល់ទី៣",
// "ថ្នាក់ទី១ ទី២ និងទី៣", "Grades 1–3", "Grade 1 and 2". Every number in the
// match is a grade, so a range reads as several grades, never as its first.
const GRADE_PATTERNS = [
  /ថ្នាក់ទី\s*[០-៩\d]{1,2}(?:\s*(?:,|និង|ដល់|–|-)?\s*ទី\s*[០-៩\d]{1,2})*(?![០-៩\d])/gu,
  /\bgrades?\s*\d{1,2}(?:\s*(?:,|and|to|–|-)\s*\d{1,2})*\b/giu,
];

/** Every distinct grade a text names. */
function gradesIn(text: string): Set<number> {
  const found = new Set<number>();
  for (const pattern of GRADE_PATTERNS) {
    for (const m of text.matchAll(pattern)) {
      for (const n of fromKhmerDigits(m[0]).match(/\d{1,2}/g) ?? []) found.add(Number(n));
    }
  }
  return found;
}

/**
 * The single grade a book is for, from its tags first and then its title, or
 * null. Several different grades ("Grades 1–3", "ថ្នាក់ទី១ ដល់ទី៣") are not ONE
 * grade, and a title part that asserted one of them would be wrong, so they
 * yield null. Grades outside 1–12 are not school grades.
 */
export function bookGrade(book: { title: string; tags?: readonly string[] | null }): number | null {
  for (const source of [(book.tags ?? []).join(" | "), book.title]) {
    const grades = [...gradesIn(source)].filter((g) => g >= 1 && g <= 12);
    if (grades.length === 1) return grades[0];
    if (grades.length > 1) return null;
  }
  return null;
}

const fold = (s: string) => s.normalize("NFC").toLocaleLowerCase().replace(/\s+/g, " ").trim();

function assemble(p: RecordTitleParts, locale: string): string {
  const title = p.title.trim();
  let tail = "";
  const subject = p.subject?.trim();
  if (subject && !fold(title).includes(fold(subject))) tail += subject;
  if (p.grade != null && !gradesIn(title).has(p.grade)) {
    tail += `${tail ? ", " : ""}${gradeLabel(p.grade, locale)}`;
  }
  let out = tail ? `${title} — ${tail}` : title;
  const format = p.format?.trim();
  if (format && !title.includes(format)) out += ` ${format}`;
  return out;
}

/**
 * The fitted title. A string goes through the layout's template (which adds
 * the brand); `{ absolute }` is used once the brand has been dropped.
 */
export function composeRecordTitle(
  parts: RecordTitleParts,
  { locale, brandSuffix }: { locale: string; brandSuffix: string },
): FittedTitle {
  const budget = locale === "km" ? TITLE_BUDGET.km : TITLE_BUDGET.en;
  const fits = (s: string) => graphemeLength(s, locale) <= budget;

  const full = assemble(parts, locale);
  if (fits(`${full}${brandSuffix}`)) return full;
  // Brand first, then format, grade and subject, one at a time.
  const steps: RecordTitleParts[] = [
    parts,
    { ...parts, format: null },
    { ...parts, format: null, grade: null },
    { ...parts, format: null, grade: null, subject: null },
  ];
  for (const step of steps) {
    const text = assemble(step, locale);
    if (fits(text)) return { absolute: text };
  }
  return { absolute: parts.title.trim() };
}

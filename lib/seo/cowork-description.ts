// lib/seo/cowork-description.ts
//
// The rules for description drafts WRITTEN by Claude in a supervised batch
// (scripts/seo-cowork-descriptions.ts, source 'claude_cowork', 0165). Pure.
//
// The batch has two halves with a person-readable file between them: `export`
// writes each candidate book's metadata and the readable text of its front
// pages to a bundle; Claude writes one draft per book from that bundle alone;
// `apply` checks every draft against the bundle it came from and stores the
// ones that pass in book_description_drafts, where they wait for a librarian.
//
// Nothing here can say a draft is TRUE — that is the librarian's job, and why
// a draft is never published without approval. What it can refuse is the
// failure a model is known for and a reviewer is least likely to notice:
//   • a NUMBER the source material does not contain (an invented year, page
//     count or edition) — every number in a draft must appear in the bundle;
//   • the wrong language for the book (approval publishes the draft in the
//     book's own language — lib/seo/description-review.ts draftToPublish);
//   • Arabic digits in Khmer prose, and Khmer that breaks orthography;
//   • a length outside the band, a review marker, markup, a link.

import { citationLocale } from "@/lib/seo/citation";
import { countWords, REVIEW_MARKER, SUBJECT_INTRO_WORDS } from "@/lib/seo/intro-drafts";
import { DESCRIPTION_DRAFT_MAX } from "@/lib/seo/description-review";
import { countOrthographicViolations } from "@/lib/text/khmer-reassemble";

export const COWORK_SOURCE = "claude_cowork";

/** English is held to the 80–150-word band. */
export const COWORK_EN_WORDS = SUBJECT_INTRO_WORDS;
/**
 * Khmer has no spaces, and Intl.Segmenter's Khmer "words" are dictionary
 * splits rather than English words (a compound is one word or three). On a
 * parallel pair it counted 44 Khmer against 48 English, so 80–150 English
 * words is roughly 70–140 here; the band is wider at the top because one pair
 * is not a calibration.
 */
export const COWORK_KM_WORDS = { min: 70, max: 180 } as const;

/** One book as the export writes it — everything a draft may draw on. */
export type CoworkBook = {
  book_id: string;
  slug: string;
  title: string;
  language: string | null;
  /** The language the description is published in (citationLocale). */
  locale: "en" | "km";
  author: string | null;
  publisher: string | null;
  /** The TRUSTED year only (lib/seo/dates.ts), never a placeholder. */
  year: number | null;
  pages: number | null;
  subject: { name: string; name_en: string | null } | null;
  tags: string[];
  views: number;
  current_description: string | null;
  readable: boolean;
  downloadable: boolean;
  /** Headings read off the contents page, when one was found. */
  contents_headings: string[];
  /** Readable front-matter and sampled body pages, trimmed. */
  pages_text: { page: number; kind: string; text: string }[];
};

export type CoworkDraft = { book_id: string; slug: string; draft_km?: string | null; draft_en?: string | null };

export type CoworkProblem =
  | "unknown_book"
  | "slug_mismatch"
  | "missing_km"
  | "missing_en"
  | "km_has_arabic_digits"
  | "km_not_khmer"
  | "km_orthography"
  | "km_length"
  | "en_length"
  | "review_marker"
  | "markup"
  | "too_long"
  | "same_as_current"
  | "unsupported_number";

const KHMER_DIGITS = "០១២៣៤៥៦៧៨៩";
const toArabic = (s: string) => s.replace(/[០-៩]/gu, (d) => String(KHMER_DIGITS.indexOf(d)));

/** Every number written in a text, in either script, as Arabic digits. */
export function numbersIn(text: string): string[] {
  return (toArabic(text).match(/\d+/g) ?? []).map((n) => String(Number(n)));
}

/**
 * Arabic digits in Khmer prose, except inside a Latin name: "Excel 2013",
 * "Orange 3", "5E", "ISO-9001". Khmer numbers are written in Khmer numerals;
 * a product or model name keeps its own spelling ("Excel ២០១៣" is wrong).
 */
export function arabicDigitsInKhmerProse(text: string): string[] {
  return [...text.matchAll(/[0-9]+/g)]
    .filter((m) => {
      const before = text.slice(0, m.index);
      const after = text.slice((m.index ?? 0) + m[0].length);
      const inLatinName = /[A-Za-z][A-Za-z.\-]*[ \-]?$/.test(before) || /^[A-Za-z]/.test(after);
      return !inLatinName;
    })
    .map((m) => m[0]);
}

/** Everything the export put in front of the writer, as one string. */
export function sourceMaterial(book: CoworkBook): string {
  return [
    book.title,
    book.author,
    book.publisher,
    book.year,
    book.pages,
    book.subject?.name,
    book.subject?.name_en,
    ...book.tags,
    ...book.contents_headings,
    ...book.pages_text.map((p) => p.text),
  ]
    .filter((v) => v !== null && v !== undefined && v !== "")
    .join("\n");
}

/** Numbers the draft states that the source material never does. */
export function unsupportedNumbers(draft: string, book: CoworkBook): string[] {
  const known = new Set(numbersIn(sourceMaterial(book)));
  return [...new Set(numbersIn(draft))].filter((n) => !known.has(n));
}

function khmerShare(text: string): number {
  const letters = text.match(/[\p{L}\p{M}]/gu) ?? [];
  const khmer = letters.filter((c) => /[ក-៿]/u.test(c));
  return letters.length ? khmer.length / letters.length : 0;
}

const MARKUP = /https?:\/\/|www\.|[*_#`<>[\]]|\n\s*[-•]\s/u;

function sameText(a: string | null | undefined, b: string | null | undefined): boolean {
  const norm = (s: string | null | undefined) => (s ?? "").normalize("NFC").replace(/\s+/gu, " ").trim();
  return norm(a) !== "" && norm(a) === norm(b);
}

export type CoworkVerdict = {
  ok: boolean;
  problems: { problem: CoworkProblem; detail?: string }[];
  locale: "en" | "km" | null;
  words: { km: number | null; en: number | null };
};

/**
 * Whether a draft may be stored. A Khmer draft is always required (the site's
 * readers are Khmer first); an English one too when the book itself is
 * English, because that is the draft approval publishes.
 */
export function checkCoworkDraft(draft: CoworkDraft, books: ReadonlyMap<string, CoworkBook>): CoworkVerdict {
  const problems: CoworkVerdict["problems"] = [];
  const book = books.get(draft.book_id);
  if (!book) return { ok: false, problems: [{ problem: "unknown_book" }], locale: null, words: { km: null, en: null } };
  if (draft.slug !== book.slug) problems.push({ problem: "slug_mismatch", detail: `${draft.slug} ≠ ${book.slug}` });

  const locale = citationLocale(book.language, book.title);
  const km = draft.draft_km?.trim() || null;
  const en = draft.draft_en?.trim() || null;
  if (!km) problems.push({ problem: "missing_km" });
  if (locale === "en" && !en) problems.push({ problem: "missing_en" });

  const words = { km: km ? countWords(km, "km") : null, en: en ? countWords(en, "en") : null };

  if (km) {
    const stray = arabicDigitsInKhmerProse(km);
    if (stray.length) problems.push({ problem: "km_has_arabic_digits", detail: stray.join(", ") });
    // An English book's title stays in Latin inside Khmer prose; the rest is Khmer.
    if (khmerShare(km) < 0.5) problems.push({ problem: "km_not_khmer", detail: khmerShare(km).toFixed(2) });
    const ortho = countOrthographicViolations(km);
    if (ortho.violations > 0) problems.push({ problem: "km_orthography", detail: JSON.stringify(ortho.byKind) });
    if (words.km! < COWORK_KM_WORDS.min || words.km! > COWORK_KM_WORDS.max) {
      problems.push({ problem: "km_length", detail: String(words.km) });
    }
  }
  if (en && (words.en! < COWORK_EN_WORDS.min || words.en! > COWORK_EN_WORDS.max)) {
    problems.push({ problem: "en_length", detail: String(words.en) });
  }

  for (const text of [km, en]) {
    if (!text) continue;
    if (REVIEW_MARKER.test(text)) problems.push({ problem: "review_marker" });
    if (MARKUP.test(text)) problems.push({ problem: "markup" });
    if (text.length > DESCRIPTION_DRAFT_MAX) problems.push({ problem: "too_long", detail: String(text.length) });
    if (sameText(text, book.current_description)) problems.push({ problem: "same_as_current" });
    const invented = unsupportedNumbers(text, book);
    if (invented.length) problems.push({ problem: "unsupported_number", detail: invented.join(", ") });
  }

  return { ok: problems.length === 0, problems, locale, words };
}

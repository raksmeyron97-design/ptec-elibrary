// lib/seo/description-draft.ts
//
// Rule-built description DRAFTS for the review queue (SEO Phase 5.3, F3).
// No model writes here (D7 keeps model drafts off): every sentence is a fact
// the database already holds — the byline, the publisher, the trusted year,
// the subject, the page count, whether the text can be read — plus the one
// fact that makes a description this book's and nobody else's: the chapter
// headings printed on its own contents page.
//
// That last fact is the point. A draft built from metadata alone is the
// template problem again (1,530 books share one sentence with the title
// swapped in — docs/seo/description-quality.md), so a book whose contents
// page yields too few headings gets NO draft; it is listed for a librarian
// instead. Short drafts are reported as short, never padded.
//
// Headings are read from `book_pages`, which the indexer (lib/pdf-page-index)
// and the Khmer OCR batch have already filled — text arrives with its line
// breaks collapsed, so an entry is bounded by its NUMBER and its PAGE
// NUMBER, not by a newline. Two rules keep a page number from posing as a
// chapter: an unlabelled entry must end in a page locator, and the chapter
// numbers kept must form a consecutive run (1, 2, 3 …). A two-digit page
// number read as a chapter gives 1, 15, 42, which is no run at all.
//
// Pure: the script (scripts/seo-draft-book-descriptions.ts) does the I/O.

import { assessPageText } from "@/lib/ai/page-quality";
import { toKhmerDigits } from "@/lib/ai/citations";
import { countOrthographicViolations } from "@/lib/text/khmer-reassemble";
import { citationNames } from "@/lib/resources/contributor-identity";
import { isUnidentifiedContributorName } from "@/lib/resources/contributor-trust";
import { citationLocale } from "@/lib/seo/citation";
import { countWords, SUBJECT_INTRO_WORDS } from "@/lib/seo/intro-drafts";
import { bookGrade, gradeLabel } from "@/lib/seo/record-title";
import { subjectLabel } from "@/lib/subjects/display";

/** Fewest informative chapter headings a draft needs to say anything a
 *  template does not. */
export const MIN_HEADINGS = 3;
/** Most headings a draft names — a description, not the contents page. */
export const MAX_HEADINGS = 8;
/** Contents pages sit in the front matter; nothing past this is read. */
export const CONTENTS_PAGE_LIMIT = 25;
/** The 80–150 words the description should reach (the subject-intro band). */
export const DESCRIPTION_WORDS = SUBJECT_INTRO_WORDS;

const CONTENTS_MARKER = [/\b(?:detailed\s+)?c\s?o\s?n\s?t\s?e\s?n\s?t\s?s\b/iu, /\btable\s+of\s+contents\b/iu, /មាតិកា/u];

const KHMER_DIGITS = "០១២៣៤៥៦៧៨៩";
const toArabic = (s: string) => s.replace(/[០-៩]/gu, (d) => String(KHMER_DIGITS.indexOf(d)));

/** Entries that are on every contents page and say nothing about this book. */
const UNINFORMATIVE = new Set(
  [
    "introduction", "conclusion", "conclusions", "summary", "preface", "foreword", "references",
    "bibliography", "index", "appendix", "appendices", "acknowledgements", "acknowledgments",
    "glossary", "contents", "abbreviations", "about the authors", "about the author",
    "សេចក្តីផ្តើម", "សេចក្ដីផ្ដើម", "សេចក្តីសន្និដ្ឋាន", "សេចក្ដីសន្និដ្ឋាន", "ឯកសារយោង",
    "ឧបសម្ព័ន្ធ", "អារម្ភកថា", "មាតិកា", "សេចក្តីថ្លែងអំណរគុណ", "សេចក្ដីថ្លែងអំណរគុណ",
  ].map((s) => s.normalize("NFC")),
);

// "Chapter 3: Sampling 41", "Unit 2 Fractions", "ជំពូកទី៣ លទ្ធផល ៤២". The title
// runs to the next digit or dot leader; a label makes the page locator optional.
const LABELLED =
  /(?:\b(?:chapter|unit|part|lesson|module)\s+|(?:ជំពូក|មេរៀន|ផ្នែក|ភាគ)(?:ទី)?\s*)([0-9០-៩]{1,2})\s*[:.\-–៖]?\s*([^0-9០-៩.…]+?)\s*(?=\.{2,}|…|[0-9០-៩]|$)/giu;
// "12 Sampling 202", "1. Introduction 1" — no label, so the page locator is
// required, and the number must not be the tail of "11.13" or of "188".
const NUMBERED = /(?<![0-9០-៩.])([0-9០-៩]{1,2})\.?\s+([^0-9០-៩.…]+?)\s*(?:\.{2,}\s*|…\s*)?(?=[0-9០-៩]{1,4}(?:\s|$))/gu;

type Entry = { n: number; title: string };

function cleanHeading(raw: string): string | null {
  const t = raw.replace(/\s+/gu, " ").replace(/^[\s:;,.\-–៖]+|[\s:;,.\-–៖]+$/gu, "").trim().normalize("NFC");
  if (!t || [...t].length < 3 || [...t].length > 80) return null;
  if (!/^[\p{Lu}\p{Script=Khmer}]/u.test(t)) return null;
  if (t.split(" ").length > 12) return null;
  return t;
}

function entriesOf(text: string, re: RegExp): Entry[] {
  const out: Entry[] = [];
  for (const m of text.matchAll(re)) {
    const title = cleanHeading(m[2] ?? "");
    if (title) out.push({ n: Number(toArabic(m[1])), title });
  }
  return out;
}

/** The longest run of consecutive chapter numbers, in order. */
function longestRun(entries: readonly Entry[]): Entry[] {
  let best: Entry[] = [];
  let run: Entry[] = [];
  for (const e of entries) {
    const last = run[run.length - 1];
    if (last && e.n === last.n) continue; // the same chapter printed twice (running head)
    run = last && e.n === last.n + 1 ? [...run, e] : [e];
    if (run.length > best.length) best = run;
  }
  return best;
}

/**
 * Is this heading legal Khmer (or not Khmer at all)?
 *
 * A Khmer PDF whose font has no usable character map extracts with marks cut
 * loose from their syllables — `គីម្ី` (a coeng followed by a vowel, which
 * Khmer never allows) or `រ ៀន` (a dependent vowel after a space, which cannot
 * begin a syllable). The first production dry run drafted a Khmer description
 * from exactly such headings. Khmer's own orthography rules decide it, through
 * the same checker the text-repair module uses
 * (lib/text/khmer-reassemble.ts): any impossible sequence and the heading is
 * not used. It cannot catch a legacy font that swapped one valid letter for
 * another; nothing structural can.
 */
export function isReadableHeading(text: string): boolean {
  return countOrthographicViolations(text).violations === 0;
}

/** Is this page the book's table of contents (not its list of figures)? */
export function isContentsPage(text: string): boolean {
  return CONTENTS_MARKER.some((re) => re.test(text)) && assessPageText(text).kind === "front_matter";
}

/**
 * The book's top-level chapter headings, from its own contents pages, in
 * order. Empty when no contents page is found or no consecutive run of
 * chapters can be read from it — never a guess.
 */
export function contentsHeadings(pages: readonly { pageNo: number; content: string }[]): string[] {
  return readContents(pages).headings;
}

/**
 * The headings a draft may use, and how many were found but refused as
 * unreadable Khmer — so a book that falls short for that reason says so
 * (`unreadable_contents`) rather than reading as having no contents page.
 */
export function readContents(pages: readonly { pageNo: number; content: string }[]): {
  headings: string[];
  unreadable: number;
} {
  const contents = [...pages]
    .filter((p) => p.pageNo <= CONTENTS_PAGE_LIMIT)
    .sort((a, b) => a.pageNo - b.pageNo)
    // A contents page that continues onto the next page usually repeats the
    // running head ("c o n t e n t s") but not always; keep the page after a
    // contents page while it still reads as front matter.
    .filter((p, i, all) => isContentsPage(p.content) || (i > 0 && isContentsPage(all[i - 1].content) && assessPageText(p.content).kind !== "prose"));
  if (contents.length === 0) return { headings: [], unreadable: 0 };
  const text = contents.map((p) => p.content).join(" ");
  const labelled = longestRun(entriesOf(text, LABELLED));
  const run = labelled.length >= 2 ? labelled : longestRun(entriesOf(text, NUMBERED));
  if (run.length < 2) return { headings: [], unreadable: 0 };
  const seen = new Set<string>();
  const informative = run
    .map((e) => e.title)
    .filter((t) => !UNINFORMATIVE.has(t.toLowerCase()))
    .filter((t) => (seen.has(t.toLowerCase()) ? false : (seen.add(t.toLowerCase()), true)));
  const headings = informative.filter(isReadableHeading);
  return { headings, unreadable: informative.length - headings.length };
}

export type DraftFacts = {
  title: string;
  author: string | null;
  publisher: string | null;
  /** The TRUSTED year (lib/seo/dates.ts trustedPublicationDate), or null. */
  year: number | null;
  language: string | null;
  pages: number | null;
  subject: { name: string; nameEn?: string | null } | null;
  tags?: readonly string[] | null;
  readable: boolean;
  downloadable: boolean;
  headings: readonly string[];
  /** Headings found but refused as unreadable Khmer (readContents). */
  unreadableHeadings?: number;
};

export type DescriptionDraft =
  | { status: "drafted"; locale: "en" | "km"; text: string; words: number; short: boolean; headings: number }
  | { status: "skipped"; reason: "no_contents" | "too_few_headings" | "unreadable_contents"; headings: number };

/** Marks a draft whose wording a Khmer reader has not checked (KM-REVIEW.md). */
export const KM_REVIEW_MARKER = "TODO(km-review)";

function listEn(items: readonly string[]): string {
  return items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}
function listKm(items: readonly string[]): string {
  return items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} និង ${items[items.length - 1]}`;
}

/** The people a byline names — none when it names nobody (contributor trust). */
function people(byline: string | null): string[] {
  return citationNames(byline).filter((n) => !isUnidentifiedContributorName(n));
}

/**
 * The draft, in the language its description is published in (the same rule
 * approval uses — lib/seo/description-review.ts), or why there is none.
 */
export function composeDescriptionDraft(facts: DraftFacts): DescriptionDraft {
  if (facts.headings.length < MIN_HEADINGS) {
    // Short because the contents page's Khmer is broken, not because it has
    // too few chapters: a different fix (OCR), so a different reason.
    if ((facts.unreadableHeadings ?? 0) > 0) {
      return { status: "skipped", reason: "unreadable_contents", headings: facts.headings.length };
    }
    if (facts.headings.length === 0) return { status: "skipped", reason: "no_contents", headings: 0 };
    return { status: "skipped", reason: "too_few_headings", headings: facts.headings.length };
  }
  const headings = facts.headings.slice(0, MAX_HEADINGS);
  const locale = citationLocale(facts.language, facts.title);
  const authors = people(facts.author);
  const grade = bookGrade({ title: facts.title, tags: facts.tags });
  const subject = facts.subject ? subjectLabel(facts.subject, locale) : null;
  const pages = facts.pages && facts.pages > 0 ? facts.pages : null;
  const sentences: string[] = [];

  if (locale === "km") {
    const lang = facts.language === "km" ? "ភាសាខ្មែរ" : facts.language === "en" ? "ភាសាអង់គ្លេស" : null;
    sentences.push(
      `${facts.title} គឺជាសៀវភៅ${lang ? lang : ""}${authors.length ? ` ដោយ ${listKm(authors)}` : ""}` +
        `${facts.publisher ? ` បោះពុម្ពដោយ ${facts.publisher}` : ""}${facts.year ? ` ឆ្នាំ ${toKhmerDigits(facts.year)}` : ""}។`,
    );
    // Khmer digits in Khmer prose (ថ្នាក់ទី១១, ២១០ ទំព័រ), as every Khmer page
    // on the site writes them; the first dry run printed "ថ្នាក់ទី 11".
    if (subject) sentences.push(`សៀវភៅនេះស្ថិតក្នុងប្រធានបទ ${subject}${grade ? ` សម្រាប់${gradeLabel(grade, "km")}` : ""}។`);
    if (pages) sentences.push(`សៀវភៅនេះមាន ${toKhmerDigits(pages)} ទំព័រ។`);
    sentences.push(`ជំពូកនានារួមមាន៖ ${listKm(headings)}។`);
    if (facts.readable) {
      sentences.push(`អ្នកអានអាចអានអត្ថបទពេញតាមអនឡាញដោយឥតគិតថ្លៃ${facts.downloadable ? " និងអាចទាញយកបាន" : ""}។`);
    }
  } else {
    const lang = facts.language === "km" ? "Khmer-language " : facts.language === "en" ? "English-language " : "";
    sentences.push(
      `${facts.title} is ${/^[aeiou]/i.test(lang || "book") ? "an" : "a"} ${lang}book` +
        `${authors.length ? ` by ${listEn(authors)}` : ""}${facts.publisher ? `, published by ${facts.publisher}` : ""}` +
        `${facts.year ? ` in ${facts.year}` : ""}.`,
    );
    if (subject) sentences.push(`It is catalogued under ${subject}${grade ? `, for ${gradeLabel(grade, "en")}` : ""}.`);
    if (pages) sentences.push(`It runs to ${pages} ${pages === 1 ? "page" : "pages"}.`);
    sentences.push(`Its chapters cover ${listEn(headings)}.`);
    if (facts.readable) {
      sentences.push(`The full text can be read online free of charge${facts.downloadable ? " and downloaded" : ""}.`);
    }
  }

  const body = sentences.join(" ");
  // The Khmer wording is a draft until a Khmer reader has checked it; approval
  // refuses a draft that still carries the marker (description-review.ts).
  const text = locale === "km" ? `${KM_REVIEW_MARKER} ${body}` : body;
  const words = countWords(body, locale);
  return { status: "drafted", locale, text, words, short: words < DESCRIPTION_WORDS.min, headings: headings.length };
}

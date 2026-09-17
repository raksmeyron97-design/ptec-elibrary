// lib/ai/page-target.ts
// The PAGE a question names, read out of the question. Pure — no I/O.
//
// WHY THIS EXISTS
//
// "What is on page 87 of Practical Research Methods?" names no topic at all.
// The page number is the only thing in the sentence that can find the answer,
// and until this module nothing downstream could use it: `extractPage()` in
// lib/ai/intent.ts pulled the number out for the CITATION intent's reference
// line, and every retrieval path then searched `book_pages` for the WORDS
// "page 87 of practical research methods". Measured against production with
// scripts/ai-answer-benchmark.ts (--suite v2.1, 2026-09-17): the `exact_page`
// scope scored retrieval 0% and context relevance 13%, and `page_range` 50%
// and 33% — the two lowest scores of any scope in the suite, on the one shape
// of question whose answer the database can hand over without ranking
// anything.
//
// A page reference is IDENTITY, in the same sense an ISBN is (CLAUDE.md, book
// ingestion): "page 294 of X" designates one row of `book_pages`, and a
// semantically similar page is not a worse answer to it, it is the wrong
// answer. So the rule this module serves is the ISBN rule verbatim — resolve
// it exactly, or say it could not be resolved; never fall through to
// neighbours that merely look like it.
//
// THE PARSER IS DELIBERATELY NARROW. A number in a question is usually not a
// page: an edition, a year, a grade, a count and an ISBN are all numbers a
// reader writes, and reading one of them as a page would scope an answer to a
// page nobody asked about — which is worse than the corpus search it replaces,
// because it looks precise. Every match therefore needs an explicit page WORD
// ("page", "p.", "pp.", "ទំព័រ"), and a range must be ascending and short
// enough to be a passage rather than a third of a book.

/** A page reference: one page (`from === to`) or a short ascending run. */
export interface PageTarget {
  from: number;
  to: number;
  /** True when the reader wrote a range rather than a single page. */
  range: boolean;
}

/**
 * The longest run of pages that is still a PASSAGE.
 *
 * "pages 274 to 290" is a section of a chapter; "pages 1 to 400" is the book,
 * and answering it as a page lookup would hand the model a third of a
 * textbook. Above this the reference is not treated as a page target at all,
 * and the question falls back to ordinary topic retrieval inside the document
 * — which is the right answer to "explain pages 1 to 400", if anything is.
 */
export const MAX_PAGE_SPAN = 40;

/** Highest page number that can be a real page rather than a typo or an id. */
export const MAX_PAGE_NUMBER = 9_999;

const KHMER_DIGITS = "០១២៣៤៥៦៧៨៩";

/** Khmer digits → Arabic. A no-op on text that has none. */
export function arabicDigits(raw: string): string {
  return raw.replace(/[០-៩]/gu, (d) => String(KHMER_DIGITS.indexOf(d)));
}

const D = String.raw`(?:\d{1,4}|[០-៩]{1,4})`;
// "to", "through", "–", "-", "—", "..", Khmer "ដល់" / "រហូតដល់".
const TO = String.raw`(?:\s*(?:-|–|—|\.\.|to|through|until|ដល់|រហូតដល់|ទៅ)\s*)`;
// The page word. `pp` and `pages` are plural forms that imply a range but are
// also written for a single page, so neither shape is assumed from the word.
const PAGE_WORD = String.raw`(?:pp?\.?|pages?|pgs?\.?|ទំព័រ(?:ទី|លេខ)?)`;

/**
 * Word boundaries that work in BOTH scripts.
 *
 * `\b` is defined over `[A-Za-z0-9_]`, so `\bទំព័រ` asks for an ASCII word
 * character immediately before a Khmer word and therefore never matches —
 * every Khmer page reference was silently unparseable, which is precisely the
 * failure mode this module exists to remove. These look-arounds ask the real
 * question (is the neighbour a letter or a digit?) for any script.
 */
const NOT_WORD_BEFORE = String.raw`(?<![\p{L}\p{N}])`;
const NOT_WORD_AFTER = String.raw`(?![\p{L}\p{N}])`;

/**
 * A range first, then a single page. Order matters: the single-page pattern
 * would match the first half of "pages 274 to 290" and silently drop the rest,
 * which reads as a confident answer about one page of a section the reader
 * asked about whole.
 */
const RANGE_RE = new RegExp(
  `${NOT_WORD_BEFORE}${PAGE_WORD}\\s*(${D})${TO}(${D})${NOT_WORD_AFTER}`,
  "iu",
);
const SINGLE_RE = new RegExp(
  `${NOT_WORD_BEFORE}${PAGE_WORD}\\s*(${D})${NOT_WORD_AFTER}`,
  "iu",
);

/**
 * An identifier wearing a page word: "p 978-0-415-27410-4".
 *
 * Ten or more digits once separators are removed is an ISBN, not a page, and
 * the range pattern would otherwise read its first two groups as 978–0 and
 * then fall back to "page 978". `\d{1,4}` plus `NOT_WORD_AFTER` already
 * refuses a bare long run; this covers the hyphenated form.
 */
const ISBN_SHAPED = new RegExp(`${NOT_WORD_BEFORE}${PAGE_WORD}\\s*((?:[\\d០-៩][\\s-]?){10,})`, "iu");

function toPage(raw: string): number | null {
  const n = Number.parseInt(arabicDigits(raw), 10);
  if (!Number.isFinite(n) || n < 1 || n > MAX_PAGE_NUMBER) return null;
  return n;
}

/**
 * The page or page range this question names, or null.
 *
 * Null is the common case and the safe one: with no page target the question
 * is answered by topic retrieval exactly as before, so a phrasing this parser
 * does not recognise costs nothing.
 */
export function parsePageTarget(text: string): PageTarget | null {
  const t = text.trim();
  if (!t || ISBN_SHAPED.test(t)) return null;

  const r = RANGE_RE.exec(t);
  if (r) {
    const from = toPage(r[1]);
    const to = toPage(r[2]);
    // A descending or equal "range" is a typo or a false positive ("pages 12-3
    // of the report"); a span longer than a passage is the whole document.
    if (from !== null && to !== null && to > from && to - from <= MAX_PAGE_SPAN) {
      return { from, to, range: true };
    }
    // A malformed range still names its first page, and that is more than the
    // words can find. Fall through to the single-page reading of the same text.
  }

  const s = SINGLE_RE.exec(t);
  if (!s) return null;
  const page = toPage(s[1]);
  return page === null ? null : { from: page, to: page, range: false };
}

/** Every page the target names, in order. Bounded by MAX_PAGE_SPAN. */
export function pagesOf(target: PageTarget): number[] {
  const out: number[] = [];
  for (let p = target.from; p <= target.to; p++) out.push(p);
  return out;
}

/** How a page target reads in a citation or a refusal: "294" / "274–290". */
export function formatPageTarget(target: PageTarget): string {
  return target.range ? `${target.from}–${target.to}` : String(target.from);
}

/**
 * The question with its page reference removed, for the TOPIC.
 *
 * "What does page 294 of X say about triangulation?" is about triangulation;
 * leaving "page 294" in the text being searched adds two terms that appear on
 * every page carrying a running header and none that carry the topic. The
 * page itself is retrieved by number, so nothing is lost by taking it out.
 */
export function stripPageTarget(text: string): string {
  return text
    .replace(RANGE_RE, " ")
    .replace(SINGLE_RE, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Does a retrieved page satisfy the target? A merged run of adjacent pages
 * (lib/ai/evidence.ts `mergeAdjacentPages`) covers `page`…`pageEnd`, and the
 * page the reader named may be any of them.
 */
export function coversTarget(
  target: PageTarget,
  page: number,
  pageEnd: number = page,
): boolean {
  return page <= target.to && pageEnd >= target.from;
}

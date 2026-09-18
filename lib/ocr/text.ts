/* lib/ocr/text.ts
 *
 * What happens to a page of Tesseract output between the process exiting 0 and
 * a row appearing in `book_pages` — and the rule about whether that row is
 * allowed to replace what is already there.
 *
 * Pure: no spawn, no database, no filesystem. Every decision that can destroy
 * existing text is made here so it can be exercised without a binary.
 *
 * ── The order is the argument ───────────────────────────────────────────────
 *
 *     page image → tesseract → normalize → reassemble → analyzeTextHealth
 *
 * It runs in that direction and not the other one, and the distinction is the
 * whole point of adding OCR at all. `lib/text/khmer-reassemble.ts` repairs
 * Khmer whose code points are all PRESENT and merely spaced apart; it never
 * inserts a character and never substitutes one, which is why it cannot touch
 * a legacy-font PDF where the character that spells the word was never in the
 * file. OCR reads the rendered glyph and produces the character. Reassembly
 * then runs on OCR OUTPUT for the ordinary reason it runs on any extracted
 * Khmer — a recognizer can emit a coeng with a space beside it too — and
 * `analyzeTextHealth` judges the result.
 *
 * What this module must never become is the reverse: a regex pass that
 * improves a health score by rearranging damage. `analyzeTextHealth`'s verdict
 * is satisfied by removing spaces, so a flip to `healthy` proves the pipeline
 * RAN. It is not by itself proof that the words are right, and nothing here
 * quotes it as if it were.
 *
 * ── Nothing is invented ─────────────────────────────────────────────────────
 *
 * No dictionary, no language model, no "did you mean". OCR output is grounded
 * in the page image or it is not written. The only transformations below are
 * lossless-in-intent: Unicode normalization, control-character removal,
 * whitespace collapsing, and the orthographically FORCED joins the reassembler
 * already owns.
 */

import { analyzeTextHealth, type TextHealth } from "@/lib/semantic/text-quality";
import { reassembleKhmerText } from "@/lib/text/khmer-reassemble";
import { MAX_PAGE_CHARS, MIN_PAGE_CHARS } from "@/lib/pdf-page-index";

/**
 * Strip a page of everything Postgres, a log line or a trigram index should
 * never see, without touching a letter.
 *
 * NUL is not squeamishness: `text` columns reject it outright, and legacy-font
 * PDFs emit it — lib/pdf-page-index.ts carries the same replacement for the
 * same reason. Tesseract adds its own: a form feed at the end of every page,
 * and occasional control bytes from a noisy scan.
 *
 * NFC is applied because Khmer has composed and decomposed orderings that look
 * identical and compare unequal, and `book_pages` is searched with `ilike` and
 * trigrams — two spellings of one word would make a phrase findable only if
 * the reader happened to type the same one.
 */
export function normalizeOcrText(raw: string): string {
  return (raw ?? "")
    .normalize("NFC")
    // Line endings first, so the blank-line rule below sees one form.
    .replace(/\r\n?/g, "\n")
    // Everything in C0/C1 except newline and tab. Form feed is in here:
    // tesseract ends every page with one.
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/g, " ")
    // Zero-width and bidi marks — invisible, and they break trigram matching.
    .replace(/[\u200B-\u200F\u202A-\u202E\u2060\uFEFF]/g, "")
    // Horizontal runs only; a newline is structure and survives.
    .replace(/[^\S\n]+/g, " ")
    .replace(/ *\n */g, "\n")
    // A scanned page yields long ladders of blank lines. Two is a paragraph.
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export type OcrPageText = {
  /** The text as it would be stored: normalized, reassembled, length-capped. */
  content: string;
  /** Health of `content`. */
  health: TextHealth;
  /** Did the Khmer reassembler change anything? */
  reassembled: boolean;
  /** Characters before the length cap, for reporting. */
  rawChars: number;
};

/**
 * Turn one page of Tesseract stdout into the value that would be stored.
 *
 * The reassembler is applied only to text the health check calls Khmer or
 * mixed. Running it over Latin costs nothing and does nothing — its rules are
 * all anchored on Khmer code points — but the guard states the intent, and it
 * keeps the `reassembled` flag honest for an English book.
 *
 * `collapseGlyphSpacing` stays OFF. That rule is the one the reassembler's own
 * header calls unforced: a space between two consonants may be glyph spacing
 * or a real phrase break, and nothing in the text says which. A recognizer's
 * spacing is a guess to begin with; layering an unforced repair on top of it
 * is how two guesses become a confident wrong word.
 */
export function postProcessOcrPage(raw: string): OcrPageText {
  const normalized = normalizeOcrText(raw);
  const firstPass = analyzeTextHealth(normalized);

  let content = normalized;
  let reassembled = false;
  if (firstPass.script === "khmer" || firstPass.script === "mixed") {
    const result = reassembleKhmerText(normalized, { collapseGlyphSpacing: false });
    if (result.text !== normalized) {
      content = result.text;
      reassembled = true;
    }
  }

  const rawChars = content.length;
  // The same cap the pdf.js path applies, from the same constant — a page row
  // that is bounded in one pipeline and unbounded in the other would make the
  // insert budget in lib/pdf-page-index.ts a guess again.
  if (rawChars > MAX_PAGE_CHARS) content = content.slice(0, MAX_PAGE_CHARS);

  return { content, health: analyzeTextHealth(content), reassembled, rawChars };
}

/** Is this page worth a row? Same floor as the pdf.js path. */
export function isStorablePage(content: string): boolean {
  return content.trim().length >= MIN_PAGE_CHARS;
}

/**
 * A health verdict for a whole record, from the first few pages.
 *
 * `analyzeTextHealth` asks for a SAMPLE and says so: the damage modes are
 * properties of the font, so they are uniform across a file, and a few
 * thousand characters is enough for every ratio to converge. Front matter is
 * skipped where there is enough book to skip it — a title page is three words
 * and a logo, and judging a 400-page book on it measures the cover.
 */
export function sampleForHealth(
  pages: readonly { pageNo: number; content: string }[],
  sampleSize = 10,
): TextHealth {
  if (pages.length === 0) return analyzeTextHealth("");
  const ordered = [...pages].sort((a, b) => a.pageNo - b.pageNo);
  const skip = ordered.length > sampleSize * 2 ? Math.min(3, ordered.length - sampleSize) : 0;
  return analyzeTextHealth(
    ordered
      .slice(skip, skip + sampleSize)
      .map((p) => p.content)
      .join("\n\n"),
  );
}

export type WriteDecision =
  | { write: true; replaces: "nothing" | "damaged-text" | "unjudged-text" | "healthy-text" }
  | { write: false; code: "OCR_EMPTY" | "TEXT_HEALTH_FAILED" | "EXISTING_TEXT_HEALTHY" };

/**
 * May this OCR result replace what the record currently holds?
 *
 * Three rules, in this order, and the order matters:
 *
 * 1. **Empty is never a write.** A recognizer that returned nothing has not
 *    established that the book is empty.
 *
 * 2. **Damaged OCR is never written, and `--force` does not change that.**
 *    `--force` exists to let an operator overwrite text they judge to be worse
 *    than what OCR produced; it is not a way to put text nothing can read into
 *    a table that feeds search, citations and the assistant. A zero exit code
 *    from tesseract means the process ran, not that the output is Khmer — that
 *    gap is the entire reason `analyzeTextHealth` is consulted here rather
 *    than the return code.
 *
 * 3. **Healthy existing text wins by default.** A book whose pages already
 *    read correctly has better data than any recognizer will produce from a
 *    300 DPI raster of the same pages, and replacing it silently is a
 *    destructive no-op with extra steps. `--force` is the deliberate override
 *    and the caller logs it.
 *
 * `unjudged-text` is separated from `damaged-text` on purpose: "too short to
 * measure" and "measured and broken" are different statements, and the first
 * is exactly what a book of near-empty pages — the `low-text-yield` candidate
 * signal — produces.
 */
export function decideRecordWrite(input: {
  existing: { pages: number; health: TextHealth | null };
  ocr: { pages: number; health: TextHealth };
  force: boolean;
}): WriteDecision {
  if (input.ocr.pages === 0) return { write: false, code: "OCR_EMPTY" };
  if (input.ocr.health.verdict === "damaged") return { write: false, code: "TEXT_HEALTH_FAILED" };

  if (input.existing.pages === 0) return { write: true, replaces: "nothing" };

  const existingVerdict = input.existing.health?.verdict ?? "unknown";
  if (existingVerdict === "healthy") {
    if (!input.force) return { write: false, code: "EXISTING_TEXT_HEALTHY" };
    return { write: true, replaces: "healthy-text" };
  }
  return { write: true, replaces: existingVerdict === "damaged" ? "damaged-text" : "unjudged-text" };
}

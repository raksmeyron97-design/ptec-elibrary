// lib/seo/text-fit.ts
//
// The ONE way a meta description or a <title> is made to fit. Pure: no server
// imports, so every builder in lib/seo and every page can use it, and the
// tests run offline.
//
// ── Why this exists ──────────────────────────────────────────────────────────
//
// Eight builders each cut text at a fixed count of UTF-16 code units and
// appended "..." (docs/seo/AUDIT-VERIFICATION.md F7). Measured on production
// 2026-09-30, 10 of 60 URLs published descriptions like "…analysis and wr..."
// and "…ការពិសោធន៍ និងក...", and an article <title> was clamped to 60
// characters mid-title. A code-unit cut can also split a Khmer consonant from
// its subscript or vowel, leaving a broken glyph at the end of the snippet.
//
// Three rules:
//   1. A description ends on a SENTENCE boundary when one falls late enough to
//      keep the description useful, otherwise on a WORD boundary. Boundaries
//      come from Intl.Segmenter in the page's locale — ICU's Khmer dictionary
//      finds Khmer words, which have no spaces — with grapheme clusters as the
//      floor, so a cluster is never split.
//   2. A meta description never ends in an ellipsis. Search engines add their
//      own when they shorten a snippet; ours only advertised a cut.
//   3. A title never loses any of the ITEM's name. When "<item> · <brand>" is
//      too long, the brand goes first (the site template is bypassed with
//      `{ absolute }`), and a long item name is published whole.

/** Longest meta description, in code points. Google shows roughly 150–160
 *  Latin characters; Khmer glyphs are wider, so the same count is safe. */
export const META_DESCRIPTION_MAX = 155;

/** A sentence cut is preferred only if it keeps at least this much. */
const SENTENCE_MIN_SHARE = 0.55;

/** Title budget in graphemes before the brand suffix is dropped. Khmer glyphs
 *  render wider than Latin ones, so its budget is shorter. */
export const TITLE_BUDGET = { en: 65, km: 50 } as const;

const TRAILING_ELLIPSIS = /(?:\s*(?:\.{2,}|…))+\s*$/u;
const TRAILING_JOINERS = /[\s,;:·—–\-/(«“"']+$/u;

function clean(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function segmenter(locale: string, granularity: "grapheme" | "word" | "sentence"): Intl.Segmenter | null {
  try {
    return new Intl.Segmenter(locale === "km" ? "km" : "en", { granularity });
  } catch {
    return null;
  }
}

/** Code-point length — the unit META_DESCRIPTION_MAX is expressed in. */
export function codePoints(text: string): number {
  return [...text].length;
}

/** Grapheme-cluster length — what a reader counts as characters. */
export function graphemeLength(text: string, locale = "en"): number {
  const seg = segmenter(locale, "grapheme");
  if (!seg) return codePoints(text);
  return [...seg.segment(text)].length;
}

/**
 * The end offsets (in UTF-16 units) at which `text` may be cut, from the
 * requested segmentation. Every offset is also a grapheme boundary, because
 * ICU's word and sentence boundaries are.
 */
function boundaries(text: string, locale: string, granularity: "word" | "sentence" | "grapheme"): number[] {
  const seg = segmenter(locale, granularity);
  if (!seg) return [];
  const ends: number[] = [];
  for (const s of seg.segment(text)) {
    // A word boundary is a place to cut only AFTER a word, never after the
    // space or punctuation that follows it — that is trimmed separately.
    if (granularity === "word" && !s.isWordLike) continue;
    ends.push(s.index + s.segment.length);
  }
  return ends;
}

function tidyEnd(text: string): string {
  let out = text.replace(TRAILING_ELLIPSIS, "");
  // Strip joiners a cut can strand ("…analysis and", "…, ", "— ").
  for (let i = 0; i < 3; i++) out = out.replace(TRAILING_JOINERS, "");
  return out.trim();
}

/**
 * Fit a meta description to `max` code points without an ellipsis, cutting at
 * a sentence boundary when one keeps enough text, else at a word boundary,
 * else at a grapheme boundary. Text that already fits is returned cleaned,
 * minus any trailing ellipsis it arrived with (a stored summary cut upstream).
 */
export function fitDescription(
  value: string | null | undefined,
  locale: string,
  max: number = META_DESCRIPTION_MAX,
): string {
  const text = clean(value);
  if (!text) return "";
  if (codePoints(text) <= max) return tidyEndIfEllipsis(text);

  const withinBudget = (end: number) => codePoints(text.slice(0, end)) <= max;

  const sentenceEnds = boundaries(text, locale, "sentence").filter(withinBudget);
  const bestSentence = sentenceEnds.at(-1);
  if (bestSentence !== undefined && codePoints(text.slice(0, bestSentence)) >= max * SENTENCE_MIN_SHARE) {
    const out = text.slice(0, bestSentence).trim();
    if (out) return out;
  }

  for (const granularity of ["word", "grapheme"] as const) {
    const ends = boundaries(text, locale, granularity).filter(withinBudget);
    const end = ends.at(-1);
    if (end !== undefined && end > 0) {
      const out = tidyEnd(text.slice(0, end));
      if (out) return out;
    }
  }
  // No segmenter at all (a runtime without ICU): cut on the last space.
  const hard = [...text].slice(0, max).join("");
  const space = hard.lastIndexOf(" ");
  return tidyEnd(space > max * SENTENCE_MIN_SHARE ? hard.slice(0, space) : hard);
}

function tidyEndIfEllipsis(text: string): string {
  return TRAILING_ELLIPSIS.test(text) ? tidyEnd(text) : text;
}

/** Title as Next's Metadata accepts it: a string goes through the layout's
 *  template (adding the brand); `{ absolute }` bypasses it. */
export type FittedTitle = string | { absolute: string };

/**
 * A record's <title>: the full item name, plus the site brand when the whole
 * fits `TITLE_BUDGET` for the locale. `brand` is the suffix the layout's
 * template would add (with its separator), used only to measure.
 *
 *   fitTitle("រលក", { locale: "km", brandSuffix: " · បណ្ណាល័យ វ.គ.ភ" }) → "រលក"
 *   fitTitle("<a 70-character title>", { … })                        → { absolute: "<the same title>" }
 */
export function fitTitle(
  item: string | null | undefined,
  { locale, brandSuffix }: { locale: string; brandSuffix: string },
): FittedTitle {
  const title = clean(item);
  const budget = locale === "km" ? TITLE_BUDGET.km : TITLE_BUDGET.en;
  if (graphemeLength(`${title}${brandSuffix}`, locale) <= budget) return title;
  return { absolute: title };
}

/** The text a FittedTitle renders (without the brand when absolute). */
export function fittedTitleText(title: FittedTitle): string {
  return typeof title === "string" ? title : title.absolute;
}

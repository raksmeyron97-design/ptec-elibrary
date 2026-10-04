/**
 * A catalogue description as paragraphs a reader can read — whatever shape it
 * was pasted in. Pure.
 *
 * Descriptions are pasted from PDFs, e-book samples and publisher pages, and
 * many arrive HARD-WRAPPED: a line break every ~57 characters, mid-sentence
 * (measured 2026-10-04 on /catalogs/the-body-institute-riggs-carol: 76 lines,
 * none longer than 57 characters). Rendered with `white-space: pre-line` that
 * was a ragged 420 px column inside a 660 px card.
 *
 * So a break is undone only when the text is evidently hard-wrapped, and then
 * only where it was a wrap:
 *   • the text is wrapped when several of its line breaks continue a sentence
 *     onto a line that starts in lowercase — poetry, lists and addresses
 *     almost never do;
 *   • a break is a wrap when the next line starts in lowercase, or when the
 *     next line's first word would not have fitted on this line (that is what
 *     made the wrapping program break there);
 *   • a list item, or a short line such as a title ("Excerpt of The Body
 *     Institute by Carol Riggs"), keeps its break.
 * Blank lines always separate paragraphs.
 */

/** Each paragraph is its lines; a paragraph of one line is the usual case. */
export type DescriptionParagraph = string[];

const LIST_MARKER = /^(?:[•▪◦‣\-*–—]|\d{1,3}[.)]|[a-z][.)])\s/i;
const STARTS_LOWER = /^[\p{Ll}]/u;

function percentile(sorted: number[], p: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0;
}

export function descriptionParagraphs(raw: string | null | undefined): DescriptionParagraph[] {
  const text = (raw ?? "").replace(/\r\n?/g, "\n").replace(/[ \t ]+$/gm, "").trim();
  if (!text) return [];

  const blocks = text
    .split(/\n[ \t]*\n+/)
    .map((b) => b.split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean))
    .filter((b) => b.length > 0);

  // Is it hard-wrapped at all?
  let breaks = 0;
  let continuing = 0;
  for (const b of blocks) {
    for (let i = 1; i < b.length; i++) {
      breaks++;
      if (STARTS_LOWER.test(b[i])) continuing++;
    }
  }
  const lengths = blocks.flat().map((l) => l.length).sort((a, b) => a - b);
  const width = percentile(lengths, 0.9);
  const wrapped = breaks >= 3 && continuing / breaks >= 0.3 && width <= 110;
  if (!wrapped) return blocks;

  const isWrap = (prev: string, next: string): boolean => {
    if (LIST_MARKER.test(next) || LIST_MARKER.test(prev)) return false;
    if (STARTS_LOWER.test(next)) return true;
    const firstWord = next.split(" ")[0] ?? "";
    return prev.length + 1 + firstWord.length > width * 0.95;
  };

  return blocks.map((b) => {
    const out: string[] = [b[0]];
    for (const line of b.slice(1)) {
      const prev = out[out.length - 1];
      if (!isWrap(prev, line)) out.push(line);
      // "self-" + "esteem" was one word split by the wrap.
      else if (/\p{L}-$/u.test(prev) && STARTS_LOWER.test(line)) out[out.length - 1] = prev + line;
      else out[out.length - 1] = `${prev} ${line}`;
    }
    return out;
  });
}

/** The description's length as a reader meets it — what decides whether it folds. */
export function descriptionLength(paragraphs: DescriptionParagraph[]): number {
  return paragraphs.reduce((n, p) => n + p.reduce((m, l) => m + l.length, 0), 0);
}

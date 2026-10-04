// Plain text from a markup fragment someone else wrote (a registry's HTML
// record page, a Crossref JATS abstract). Pure.
//
// The text only ever becomes a form field's VALUE or React text, but it is
// made safe as text anyway, in an order that cannot be undone:
//   1. tags are replaced by spaces (a block tag also ends a paragraph);
//   2. entities are decoded in ONE pass, so `&amp;lt;` becomes the literal
//      text `&lt;`, never `<` (decoding in sequence unescapes twice —
//      CodeQL js/double-escaping, alert #166);
//   3. any angle bracket left over — from a malformed tag, or decoded from
//      `&lt;` — is removed, so no tag survives in any spelling (CodeQL
//      js/incomplete-multi-character-sanitization, alert #165).
// Verified against the CodeQL 2.27.1 queries, before and after (#295).

const BLOCK_END = /<\/(?:p|div|li|h[1-6]|title|sec|jats:p|jats:title|jats:sec)\s*>/gi;

/** One line of plain text: whitespace collapsed. */
export function plainText(fragment: string): string {
  return decode(fragment.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}

/** Paragraphs kept: block-level ends become blank lines, other whitespace collapses. */
export function plainParagraphs(fragment: string): string {
  const marked = fragment.replace(BLOCK_END, "\u0000").replace(/<[^>]*>/g, " ");
  return decode(marked)
    .split("\u0000")
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n\n");
}

// Named references publisher pages actually use; any other stays as written.
const NAMED: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  ndash: "\u2013", mdash: "\u2014", hellip: "\u2026", lsquo: "\u2018", rsquo: "\u2019",
  ldquo: "\u201c", rdquo: "\u201d", laquo: "\u00ab", raquo: "\u00bb", bull: "\u2022", middot: "\u00b7", copy: "\u00a9",
};

function fromCodePoint(n: number, raw: string): string {
  // Control characters, surrogates and out-of-range numbers are not text; keep the reference as written.
  return n > 31 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : raw;
}

function decode(s: string): string {
  // ONE pass over every reference, so nothing is unescaped twice: `&amp;lt;`
  // becomes the text `&lt;` and `&#38;lt;` the text `&lt;`, never `<`. Any
  // angle bracket that does come out (from `&lt;` or `&#60;`) is then removed.
  return s
    .replace(/&(?:#(\d{1,7})|#x([0-9a-f]{1,6})|([a-z]+));/gi, (raw, dec?: string, hex?: string, name?: string) =>
      dec ? fromCodePoint(Number(dec), raw) : hex ? fromCodePoint(parseInt(hex, 16), raw) : (NAMED[name!.toLowerCase()] ?? raw),
    )
    .replace(/[<>]/g, "");
}

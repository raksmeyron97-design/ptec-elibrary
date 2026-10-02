// Plain text from a markup fragment someone else wrote (a registry's HTML
// record page, a Crossref JATS abstract). Pure.
//
// The text only ever becomes a form field's VALUE or React text, but it is
// made safe as text anyway, in an order that cannot be undone:
//   1. tags are replaced by spaces (a block tag also ends a paragraph);
//   2. entities are decoded with `&amp;` LAST, so `&amp;lt;` becomes the
//      literal text `&lt;`, never `<` (decoding it first unescapes twice —
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

function decode(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/[<>]/g, "");
}

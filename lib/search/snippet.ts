// One definition of "show the reader where the match is".
//
// Shared by /api/search/native's "found inside" cards and the AI evidence
// layer, so a page hit reads the same whether it is rendered as a search
// result or cited under an answer. Pure.

/**
 * A window of `content` centred on the first occurrence of `query`, with
 * ellipses where text was cut. Falls back to the head of the page when the
 * query does not appear literally (a semantic hit, or a match that survived
 * normalization the raw text does not).
 */
export function makeSnippet(content: string, query: string, radius = 90): string {
  const clean = content.replace(/\s+/g, " ").trim();
  if (!clean) return "";
  const idx = query ? clean.toLowerCase().indexOf(query.toLowerCase()) : -1;
  if (idx === -1) {
    const head = clean.slice(0, radius * 2).trim();
    return clean.length > head.length ? `${head}…` : head;
  }
  const start = Math.max(0, idx - radius);
  const end = Math.min(clean.length, idx + query.length + radius);
  return `${start > 0 ? "…" : ""}${clean.slice(start, end).trim()}${end < clean.length ? "…" : ""}`;
}

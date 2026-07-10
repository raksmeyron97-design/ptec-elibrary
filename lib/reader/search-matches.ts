/**
 * Pure text-match logic for the in-document PDF reader search.
 *
 * Offsets returned here are in the coordinates of the NFC-normalized item
 * strings produced by `itemStrings()`. The viewer must normalize each item
 * the same way (`nfc()`) before slicing with these offsets.
 */

export type MatchSpan = {
  /** Index into pdf.js `textContent.items` — matches react-pdf's `itemIndex`. */
  itemIndex: number;
  /** Char offsets within the normalized item string (end exclusive). */
  start: number;
  end: number;
};

export type PageMatch = {
  /** One match may cross text runs, so it can cover several items. */
  spans: MatchSpan[];
  snippet: string;
};

export type ItemDecoration = { start: number; end: number; cls: string };

const SNIPPET_BEFORE = 30;
const SNIPPET_AFTER = 40;

export function nfc(s: string): string {
  try {
    return s.normalize("NFC");
  } catch {
    return s;
  }
}

/**
 * Per-item strings from pdf.js text content, index-aligned with react-pdf's
 * `customTextRenderer` itemIndex (non-text/marked-content items become "").
 */
export function itemStrings(items: Array<{ str?: unknown }>): string[] {
  return items.map((it) => (typeof it.str === "string" ? nfc(it.str) : ""));
}

/**
 * Find every occurrence of `rawQuery` in one page. Items are joined WITHOUT a
 * separator: Khmer PDFs routinely split a single word across many text runs,
 * so matches must be allowed to cross item boundaries.
 */
export function findPageMatches(nItems: string[], rawQuery: string): PageMatch[] {
  const query = nfc(rawQuery).toLowerCase();
  if (!query) return [];

  const starts: number[] = new Array(nItems.length);
  let joined = "";
  for (let i = 0; i < nItems.length; i++) {
    starts[i] = joined.length;
    joined += nItems[i];
  }
  const hay = joined.toLowerCase();

  const matches: PageMatch[] = [];
  let from = 0;
  for (;;) {
    const at = hay.indexOf(query, from);
    if (at === -1) break;
    const end = at + query.length;
    matches.push({
      spans: spansFor(nItems, starts, at, end),
      snippet: snippetFor(joined, at, end),
    });
    from = end;
  }
  return matches;
}

function spansFor(
  nItems: string[],
  starts: number[],
  at: number,
  end: number,
): MatchSpan[] {
  const spans: MatchSpan[] = [];
  for (let i = 0; i < nItems.length; i++) {
    const s = starts[i];
    const e = s + nItems[i].length;
    if (e <= at || s === e) continue;
    if (s >= end) break;
    spans.push({
      itemIndex: i,
      start: Math.max(at, s) - s,
      end: Math.min(end, e) - s,
    });
  }
  return spans;
}

function snippetFor(joined: string, at: number, end: number): string {
  return joined
    .slice(Math.max(0, at - SNIPPET_BEFORE), Math.min(joined.length, end + SNIPPET_AFTER))
    .replace(/\s+/g, " ")
    .trim();
}

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
};

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (ch) => HTML_ESCAPES[ch]);
}

/**
 * Wrap decorated ranges of a normalized item string in <mark> tags, escaping
 * everything else. Overlaps are flattened; where ranges overlap, the LAST
 * decoration in the array wins — callers pass lowest-priority first.
 */
export function renderItemHtml(nStr: string, decorations: ItemDecoration[]): string {
  if (!decorations.length) return escapeHtml(nStr);

  const cuts = new Set<number>([0, nStr.length]);
  for (const d of decorations) {
    cuts.add(Math.max(0, Math.min(nStr.length, d.start)));
    cuts.add(Math.max(0, Math.min(nStr.length, d.end)));
  }
  const points = [...cuts].sort((a, b) => a - b);

  let html = "";
  let open: string | null = null;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (a === b) continue;
    let cls: string | null = null;
    for (const d of decorations) {
      if (d.start <= a && d.end >= b) cls = d.cls;
    }
    if (cls !== open) {
      if (open) html += "</mark>";
      if (cls) html += `<mark class="${cls}">`;
      open = cls;
    }
    html += escapeHtml(nStr.slice(a, b));
  }
  if (open) html += "</mark>";
  return html;
}

// Conservative sanitizer for turning raw reference strings into JSON-LD
// `citation` values. Pure + browser-safe (unit-tested in references.test.ts).
//
// The problem: thesis references are extracted from PDFs and split on line
// wraps, so the raw list contains fragments — half-sentences, orphaned page
// ranges, a title continued on the next "reference". Publishing those as
// schema.org `citation` values pollutes structured data with garbage.
//
// The rule (from the SEO brief): only emit a reference as a citation when it is
// clearly a COMPLETE bibliographic entry; otherwise omit it. The full raw list
// stays visible on the page — this only governs what reaches JSON-LD. When in
// doubt we drop, because a missing citation is strictly better than a broken one.

/** Collapse internal whitespace/newlines to single spaces and trim. */
export function normalizeReferenceText(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

// A trailing token that signals the entry was cut mid-citation by a line wrap.
// Tolerates a single trailing period so "…, pp." is still caught as a fragment.
const CONTINUATION_TAIL = /(?:[,\-–—&/:;]|\b(?:and|pp|vol|no|eds?|the|of|in|a|an))\.?$/i;
// A leading token that signals this entry is the tail of the previous one.
const CONTINUATION_HEAD = /^(?:and\b|&|pp\.?\b|\d+[-–]\d+\s*\.?$|[a-z])/;
// A complete citation ends like a finished sentence/field — a period, a closing
// paren/bracket, or (rarely) a bare year. Anything ending mid-word ("…through",
// "…cooperative") is almost certainly a PDF line-wrap fragment, so it's dropped.
const TERMINAL = /[.)\]]$|\b(?:1[6-9]|20)\d{2}$/;
const HAS_YEAR = /\b(?:1[6-9]|20)\d{2}\b/;
const HAS_LETTERS = /\p{L}/u;

/**
 * Decide whether a single normalized reference string looks like a complete,
 * publishable citation. Heuristics tuned to drop PDF-wrap fragments while
 * keeping genuine entries:
 *  - must be reasonably long and contain letters (not a bare page range),
 *  - must contain a 4-digit year (near-universal in academic references),
 *  - must not end on an obvious continuation token (comma, hyphen, "and", …),
 *  - must not start as a continuation of a previous line.
 */
export function isCompleteReference(text: string): boolean {
  const t = normalizeReferenceText(text);
  if (t.length < 30) return false;
  if (!HAS_LETTERS.test(t)) return false;
  if (t.split(/\s+/).length < 5) return false;
  if (!HAS_YEAR.test(t)) return false;
  if (CONTINUATION_HEAD.test(t)) return false;
  if (CONTINUATION_TAIL.test(t)) return false;
  // Must finish like a complete citation, not mid-word.
  if (!TERMINAL.test(t)) return false;
  return true;
}

/**
 * Turn a raw reference list into the set of citation strings safe to embed in
 * JSON-LD: normalized, completeness-filtered, de-duplicated, order-preserving.
 * Returns [] when nothing qualifies (the page still shows the raw list).
 */
export function schemaCitations(
  references: Array<string | null | undefined> | null | undefined,
): string[] {
  if (!references || references.length === 0) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of references) {
    if (!raw) continue;
    const t = normalizeReferenceText(raw);
    if (!isCompleteReference(t)) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

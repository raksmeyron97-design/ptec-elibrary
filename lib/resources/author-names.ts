// lib/resources/author-names.ts
//
// Parse a thesis free-text author string ("A, B and C" / "A; B" / "A / B")
// into ordered individual names. This MIRRORS the SQL split used by migration
// 0105's contributor backfill, so the app and the one-time backfill agree on
// how a legacy `research_reports.author_names` string decomposes.
//
// Fidelity note: the SQL delimiter regex is
//   \s*,\s*|\s*;\s*|\s*/\s*|\s*&\s*|\s+and\s+
// Postgres regex is case-sensitive by default, so the spelled-out separator is
// lowercase " and " only — "AND"/"And" are intentionally NOT split (safer than
// splitting a name that happens to contain those letters). This helper matches
// that exactly; do not add the /i flag without changing 0105 too.

// Same alternation as the SQL, translated to a JS RegExp (/ escaped).
const DELIMITER = /\s*,\s*|\s*;\s*|\s*\/\s*|\s*&\s*|\s+and\s+/;

/** Split a legacy author string into trimmed, non-empty names in order. */
export function parseAuthorNames(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(DELIMITER)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

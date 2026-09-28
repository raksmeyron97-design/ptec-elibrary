// lib/db/postgrest-url.ts
//
// A PostgREST filter travels in the URL, and the URL has a ceiling.
//
// Kong, in front of PostgREST on the self-hosted stack, refuses a request line
// over 8 KB (measured on the local stack, 2026-09-28: an 8,077-character URL
// answered, 8,277 came back `414 URI too long`). Khmer makes that easy to
// reach: every Khmer letter is three UTF-8 bytes, nine characters once
// percent-encoded, and a search `.or()` repeats each query word once per
// column. A 53-letter Khmer book title over the physical catalogue's ten match
// columns was 10 KB — the leg failed and the book could not be found by its
// own title.
//
// So an `.or()` built from what a reader typed is BUDGETED: clauses are kept
// in the order given (most valuable first) while they fit, and one that would
// not fit is left out rather than failing the whole query. The budget leaves
// room for the rest of the request line (path, select list, other filters,
// order and range).
//
// Pure: no Supabase import.

/** Characters an `.or()` filter may use once percent-encoded. */
export const POSTGREST_OR_BUDGET = 6_000;

/**
 * The clauses, in the order given, that fit in `budget` encoded characters
 * together with the `.or()` punctuation. A clause that alone would not fit is
 * skipped and the later, shorter ones still considered.
 */
export function clausesWithinBudget(clauses: readonly string[], budget: number = POSTGREST_OR_BUDGET): string[] {
  const kept: string[] = [];
  let used = encodeURIComponent("()").length;
  for (const clause of clauses) {
    const cost = encodeURIComponent(clause).length + (kept.length ? encodeURIComponent(",").length : 0);
    if (used + cost > budget) continue;
    kept.push(clause);
    used += cost;
  }
  return kept;
}

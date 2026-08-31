// lib/postgrest-filter.ts
//
// PostgREST parses `.or(...)` / `.ilike(...)` filters as a comma-separated
// mini-language, so a value carrying `,` `(` `)` `%` `*` or `\` does not fail
// loudly — it re-partitions the filter into different conditions than the one
// intended. Every filter string built from a name, a search term, or any other
// non-literal value must go through this first.
//
// The rule is the one three call sites already spell out inline
// (lib/posts-data.ts, lib/admin/theses.ts, lib/admin/posts.ts); this is the
// shared home for it. Those copies are unchanged here — they work, and folding
// them in is a refactor for its own commit.

/** Strip PostgREST filter metacharacters and bound the length. */
export function sanitizeFilterTerm(input: string): string {
  return input
    .replace(/[%,()\\*]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

// lib/search/budgets.ts
//
// One search fans out to six collections plus the text inside PDFs. Before
// Phase 9.1 they ran under one `Promise.all` with no time limit, so:
//
//   • a leg that THREW failed the whole search (500, "Search failed");
//   • a leg whose query ERRORED returned an empty list — the Physical section
//     simply vanished with a count of 0, indistinguishable from "the library
//     has no such book", and that answer was cached for 45 s;
//   • a leg that HUNG held the whole page for as long as it hung.
//
// Now every leg runs inside a budget and reports one of two things: its
// answer, or that it FAILED (threw, errored, or ran out of time). A failed
// leg is named in the response's `partial` list; the page says which
// collection could not be searched rather than showing nothing, and a partial
// answer is never cached or logged as a zero-result query.
//
// The numbers are per-leg wall-clock ceilings, set from the per-leg
// `Server-Timing` measurements of Phase 9.0 in production (see the constant
// below) — not guesses: too tight and a slow-but-correct leg is cut off under
// load, too loose and a stuck catalogue query still holds the page.
// A leg that times out keeps running on the server; its answer is simply no
// longer waited for.
//
// Pure: no server imports, so the rules are unit-testable offline.

export type SearchLeg =
  | "book"
  | "research"
  | "publication"
  | "catalog"
  | "learning_path"
  | "post"
  | "pagehits"
  | "semantic"
  | "seeds";

/**
 * Per-leg ceilings in ms, measured on production 2026-09-28 (Server-Timing,
 * query set v4, 252 requests one at a time; docs/UNIFIED-DISCOVERY.md).
 *
 * In a quiet run every leg answered within about a second (p95 ≤ 0.37 s, max
 * 1.03 s). The ceilings are set instead from a run taken while production was
 * OVERLOADED by concurrent audits (Lighthouse + entity verification), because
 * that is when they bite: the slowest answer each leg still COMPLETED there,
 * rounded up to the next second — book 5.9 s → 6 s; page text 3.6 s → 4 s;
 * trigram seeds 3.6 s → 4 s. So no answer production actually gave is cut,
 * even under load, while a hung leg — one query in that window never answered
 * for 11 minutes — now ends within seconds. Cutting at the quiet tail (~1.5 s)
 * would make every loaded answer partial, and a partial answer is never
 * cached: more load exactly when there is too much.
 *
 * The six collection legs share one number (they run against the same
 * database; books is the heaviest). Seeds and page text run BEFORE them, so a
 * search's worst case is about 4 s + 6 s. Re-measure before changing:
 * `npx tsx scripts/search-benchmark.ts --base https://library.ptec.edu.kh`.
 */
export const SEARCH_LEG_BUDGET_MS: Record<SearchLeg, number> = {
  book: 6_000,
  research: 6_000,
  publication: 6_000,
  catalog: 6_000,
  learning_path: 6_000,
  post: 6_000,
  pagehits: 4_000,
  // The query embedding: an external API call (quiet max 0.33 s).
  semantic: 3_000,
  seeds: 4_000,
};

export type LegOutcome<T> = { value: T; failed: boolean };

/**
 * Wait for `work` at most `budgetMs`. A throw, a timeout, or a value
 * `isFailure` recognises becomes `{ value: fallback, failed: true }`; nothing
 * rejects, so one leg can no longer fail the whole search.
 */
export async function withinBudget<T>(
  work: Promise<T>,
  budgetMs: number,
  fallback: T,
  isFailure: (value: T) => boolean = () => false,
): Promise<LegOutcome<T>> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => resolve("timeout"), budgetMs);
  });
  try {
    const settled = await Promise.race([work.then((value) => ({ value })), timeout]);
    if (settled === "timeout") return { value: fallback, failed: true };
    return isFailure(settled.value) ? { value: fallback, failed: true } : { value: settled.value, failed: false };
  } catch {
    return { value: fallback, failed: true };
  } finally {
    clearTimeout(timer);
    // A leg that lost the race may still reject later; that must not surface
    // as an unhandled rejection.
    work.catch(() => {});
  }
}

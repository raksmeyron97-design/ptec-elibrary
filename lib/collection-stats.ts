// lib/collection-stats.ts
//
// THE single source of truth for public collection counts.
//
// Every public surface that shows "how many resources does the library have"
// must read from getCollectionStats() — never run its own count query. The
// counting rule is deliberate and documented here once:
//
//   totalDigitalResources = published e-books
//                         + published theses (research_reports)
//                         + published publications
//
// Physical catalog records are NOT digital resources; they are reported
// separately as `physicalCatalogs`. Drafts, archived, pending-review and
// soft-hidden records are excluded by the `is_published` / `is_active`
// predicates (is_published is trigger-synced from `status`).
//
// All counts are EXACT (head-only count queries — no rows transferred). Do
// not switch these to count: "estimated": the planner estimate drifts with
// table statistics and made the public totals flap (113 vs 116) even though
// the data never changed.
//
// Cached under the "collection-stats" tag; every admin mutation that can
// change a count invalidates it via lib/cache/revalidate.ts.

import { unstable_cache } from "next/cache";
import { createPublicClient } from "./supabase/public";

export type PublicCollectionStats = {
  books: number;
  theses: number;
  publications: number;
  physicalCatalogs: number;
  learningPaths: number;
  totalDigitalResources: number;
  /** Server-generated timestamp — for logging and test assertions, not UI. */
  calculatedAt: string;
};

async function countExact(
  supabase: ReturnType<typeof createPublicClient>,
  table: string,
  publishedColumn: "is_published" | "is_active",
): Promise<number> {
  const { count, error } = await supabase
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq(publishedColumn, true);
  if (error) throw new Error(`[collection-stats] ${table}: ${error.message}`);
  return count ?? 0;
}

/**
 * Uncached compute — used by the cached getCollectionStats() below and by
 * the /api/health reconciliation probe (which needs a fresh figure to
 * compare against the cached one). Returns null when the database is
 * unreachable — callers must OMIT the figure rather than render a stale or
 * zero fallback.
 */
export async function computeCollectionStats(): Promise<PublicCollectionStats | null> {
    const supabase = createPublicClient();
    try {
      const [books, theses, publications, physicalCatalogs, learningPaths] =
        await Promise.all([
          countExact(supabase, "books", "is_published"),
          countExact(supabase, "research_reports", "is_published"),
          countExact(supabase, "publications", "is_published"),
          countExact(supabase, "catalog_books", "is_active"),
          countExact(supabase, "learning_paths", "is_published"),
        ]);
      return {
        books,
        theses,
        publications,
        physicalCatalogs,
        learningPaths,
        totalDigitalResources: books + theses + publications,
        calculatedAt: new Date().toISOString(),
      };
    } catch (e) {
      console.error(
        JSON.stringify({
          event: "collection_stats_failed",
          route: "lib/collection-stats",
          ts: new Date().toISOString(),
          error: e instanceof Error ? e.message : String(e),
        }),
      );
      return null;
    }
}

/** Exact public collection counts, cached for 5 minutes under the
 *  "collection-stats" tag (invalidated by every counted-entity mutation). */
export const getCollectionStats = unstable_cache(
  computeCollectionStats,
  ["collection-stats"],
  { revalidate: 300, tags: ["collection-stats"] },
);

/**
 * Marketing-style rounded count ("116" → "110+"). Always floors, so the
 * claim is truthful ("at least N"), and stays stable while the exact total
 * moves within a decade — the exact figure must still be exposed to screen
 * readers or supporting text where useful.
 */
export function formatApproximateCount(value: number): string {
  if (!Number.isFinite(value) || value < 0) return "0";
  if (value < 10) return String(Math.floor(value));
  return `${Math.floor(value / 10) * 10}+`;
}

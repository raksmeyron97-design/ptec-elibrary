// lib/collection-stats.ts
//
// THE single source of truth for public resource counts.
//
// Every public surface that shows "how many resources does the library have"
// must read from getCollectionStats() — never run its own count query. Three
// surfaces used to (the auth screens, /llms.txt, the get_home_stats RPC) and
// they drifted apart, which is the whole reason this file is load-bearing.
//
// ── Metric definitions ──────────────────────────────────────────────────────
//
//   books              published e-books                    (books)
//   theses             published theses                     (research_reports)
//   publications       published academic publications      (publications)
//   physicalCatalogs   active PHYSICAL catalog records      (catalog_books)
//   learningPaths      published guided routes              (learning_paths)
//
//   totalDigitalResources = books + theses + publications
//
// Physical catalog records are NOT digital resources. Learning paths are
// curated routes THROUGH resources already counted above, so counting them
// as digital resources would count the same material twice — they get their
// own figure. Both rules live in SQL (migration 0103) and are mirrored by
// DIGITAL_RESOURCE_KEYS below purely so the TypeScript side can be tested;
// if the rule ever changes, change the view and that constant together.
//
// Public visibility is one predicate, `is_published` (`is_active` for the
// physical catalog). It is not a hand-maintained flag: a BEFORE trigger keeps
// it in lock-step with `status` (migrations 0061 / 0075 / 0086), so drafts,
// pending_review, scheduled-but-not-yet-live and archived rows are excluded
// by construction. There is no soft-delete column on these tables and no
// version table, so neither deleted rows nor historical versions can inflate
// a figure.
//
// Counts come from ONE query against public.public_resource_statistics — a
// security_invoker view of joinless per-table counts. No join means a
// resource with several authors, subjects, keywords or copies is structurally
// incapable of being counted twice.
//
// All counts are EXACT. Do not switch to count: "estimated": the planner
// estimate drifts with table statistics and made the public totals flap
// (113 vs 116) even though the data never changed.
//
// Cached under the "collection-stats" tag; every admin mutation that can
// change a count invalidates it via lib/cache/revalidate.ts.

import { unstable_cache } from "next/cache";
import { createPublicClient } from "./supabase/public";

/** The resource types summed into `totalDigitalResources`. Mirrors the
 *  `digital_resources` expression in migration 0103 — keep them together. */
export const DIGITAL_RESOURCE_KEYS = ["books", "theses", "publications"] as const;

/**
 * Metric → base table + visibility predicate. ONE declaration, used by the
 * degraded path below. It is not a second counting rule: migration 0103's
 * view is generated from exactly these pairs, and
 * lib/resource-stats-consistency.test.ts asserts the two agree.
 */
export const RESOURCE_SOURCES = [
  { key: "books", table: "books", flag: "is_published" },
  { key: "theses", table: "research_reports", flag: "is_published" },
  { key: "publications", table: "publications", flag: "is_published" },
  { key: "physicalCatalogs", table: "catalog_books", flag: "is_active" },
  { key: "learningPaths", table: "learning_paths", flag: "is_published" },
] as const satisfies ReadonlyArray<{
  key: keyof Omit<
    PublicCollectionStats,
    "totalDigitalResources" | "searchableResources" | "calculatedAt"
  >;
  table: string;
  flag: "is_published" | "is_active";
}>;

export type PublicCollectionStats = {
  /** Published e-books. */
  books: number;
  /** Published theses (DB table: research_reports). */
  theses: number;
  /** Published academic publications. */
  publications: number;
  /** Active PHYSICAL catalog records — never part of totalDigitalResources. */
  physicalCatalogs: number;
  /** Published guided routes — never part of totalDigitalResources. */
  learningPaths: number;
  /** books + theses + publications. */
  totalDigitalResources: number;
  /** Digital resources carrying a pgvector embedding, i.e. reachable by
   *  semantic search. ≤ totalDigitalResources; the gap is reported in the
   *  admin Data Quality screen, never shown as a public total. */
  searchableResources: number;
  /** Server-generated timestamp — for logging and test assertions, not UI. */
  calculatedAt: string;
};

type StatsRow = {
  books: number | string;
  theses: number | string;
  publications: number | string;
  physical_catalogs: number | string;
  learning_paths: number | string;
  digital_resources: number | string;
  searchable_resources: number | string;
};

/** PostgREST returns bigint as a string. Anything that is not a finite,
 *  non-negative integer is treated as a failed read, not coerced to 0 —
 *  a wrong number on the busiest page is worse than no number. */
function toCount(value: unknown, field: string): number {
  const n = typeof value === "string" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
    throw new Error(`[collection-stats] ${field}: invalid count ${JSON.stringify(value)}`);
  }
  return n;
}

/**
 * Degraded path: count each base table directly, using the predicates
 * declared once in RESOURCE_SOURCES.
 *
 * Reached only while the canonical view is missing — realistically the window
 * between a deploy landing and migration 0103 being applied. It produces the
 * same numbers by the same rule; what it loses is the single round-trip and
 * the searchable-resources figure (which needs the embedding columns), so
 * `searchableResources` is reported as 0 and the admin reconciliation panel
 * shows the view as unavailable rather than claiming an index gap.
 */
async function computeFromBaseTables(
  supabase: ReturnType<typeof createPublicClient>,
): Promise<PublicCollectionStats> {
  const counts = await Promise.all(
    RESOURCE_SOURCES.map(async ({ key, table, flag }) => {
      const { count, error } = await supabase
        .from(table)
        .select("id", { count: "exact", head: true })
        .eq(flag, true);
      if (error) throw new Error(`${table}: ${error.message}`);
      return [key, toCount(count, key)] as const;
    }),
  );
  const byKey = Object.fromEntries(counts) as Record<
    (typeof RESOURCE_SOURCES)[number]["key"],
    number
  >;
  return {
    ...byKey,
    totalDigitalResources: DIGITAL_RESOURCE_KEYS.reduce((n, key) => n + byKey[key], 0),
    searchableResources: 0,
    calculatedAt: new Date().toISOString(),
  };
}

/**
 * Uncached compute — used by the cached getCollectionStats() below and by
 * the /api/health reconciliation probe (which needs a fresh figure to
 * compare against the cached one). Returns null when the database is
 * unreachable or returns something non-numeric — callers must OMIT the
 * figure rather than render a stale, zero or invented fallback.
 */
export async function computeCollectionStats(): Promise<PublicCollectionStats | null> {
  const supabase = createPublicClient();
  try {
    const { data, error } = await supabase
      .from("public_resource_statistics")
      .select(
        "books, theses, publications, physical_catalogs, learning_paths, digital_resources, searchable_resources",
      )
      .single<StatsRow>();

    // 42P01 (undefined_table) / PGRST205 (not in the schema cache) mean the
    // view isn't there yet, not that the database is broken. Fall back to the
    // per-table counts — same rule, same numbers — instead of blanking the
    // figure off every public page for the length of a migration window.
    if (error && (error.code === "42P01" || error.code === "PGRST205")) {
      console.warn(
        JSON.stringify({
          event: "collection_stats_view_missing",
          route: "lib/collection-stats",
          ts: new Date().toISOString(),
          detail: "public_resource_statistics unavailable; counting base tables",
        }),
      );
      return await computeFromBaseTables(supabase);
    }
    if (error) throw new Error(error.message);
    if (!data) throw new Error("empty result");

    const stats: PublicCollectionStats = {
      books: toCount(data.books, "books"),
      theses: toCount(data.theses, "theses"),
      publications: toCount(data.publications, "publications"),
      physicalCatalogs: toCount(data.physical_catalogs, "physicalCatalogs"),
      learningPaths: toCount(data.learning_paths, "learningPaths"),
      totalDigitalResources: toCount(data.digital_resources, "totalDigitalResources"),
      searchableResources: toCount(data.searchable_resources, "searchableResources"),
      calculatedAt: new Date().toISOString(),
    };

    // The view computes the total itself; re-deriving it here catches a view
    // that was edited out of step with DIGITAL_RESOURCE_KEYS rather than
    // letting the two definitions quietly disagree in production.
    const summed = DIGITAL_RESOURCE_KEYS.reduce((n, key) => n + stats[key], 0);
    if (summed !== stats.totalDigitalResources) {
      throw new Error(
        `[collection-stats] total mismatch: view says ${stats.totalDigitalResources}, parts sum to ${summed}`,
      );
    }
    if (stats.searchableResources > stats.totalDigitalResources) {
      throw new Error("[collection-stats] searchable exceeds total");
    }

    return stats;
  } catch (e) {
    console.error(
      JSON.stringify({
        event: "collection_stats_failed",
        route: "lib/collection-stats",
        entityType: "collection-stats",
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
 * Locale-aware display formatting for a resource count. This is the only
 * formatter public surfaces should use — never `String(n)`, and never a
 * number baked into a translation string.
 *
 * Khmer uses Western digits throughout this site's UI (the `km` numbering
 * system would render ០-៩, which the rest of the interface does not), so the
 * locale only controls grouping.
 */
export function formatCount(value: number, locale: string = "en"): string {
  if (!Number.isFinite(value) || value < 0) return "0";
  return new Intl.NumberFormat(locale === "km" ? "km-u-nu-latn" : locale).format(
    Math.floor(value),
  );
}

/**
 * Marketing-style rounded count ("116" → "110+"). Always floors, so the claim
 * is truthful ("at least N").
 *
 * DO NOT pair this with the exact figure in adjacent inline elements. Doing
 * that is what produced the "110+115 Digital resources" defect: an
 * `<span aria-hidden>110+</span><span class="sr-only">115</span>` pair has no
 * separator in the DOM's text content, so every consumer that reads text
 * rather than pixels — copy/paste, search-engine snippets, translation tools,
 * a page rendered before CSS lands — concatenated the two numbers. Where the
 * database knows the exact value, show the exact value (formatCount).
 */
export function formatApproximateCount(value: number): string {
  if (!Number.isFinite(value) || value < 0) return "0";
  if (value < 10) return String(Math.floor(value));
  return `${Math.floor(value / 10) * 10}+`;
}

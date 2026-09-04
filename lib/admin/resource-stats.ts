// lib/admin/resource-stats.ts
//
// Admin-side resource statistics and reconciliation.
//
// Two things live here, and they are deliberately separate from the public
// service in lib/collection-stats.ts:
//
//  1. getAdminResourceStats() — per-type counts broken down BY STATUS. These
//     are labelled ("Published", "Draft", "Archived"...) and are never a
//     public resource count. An admin "all records" figure quoted publicly is
//     how a library with 112 published e-books ends up advertising 115.
//
//  2. reconcilePublicResourceStats() — recomputes the canonical public
//     figures from the database, compares them with what the cache is
//     serving, and reports the difference. It RECALCULATES; it never writes
//     a counter. There is no stored counter to write.
//
// Both require the `analytics` permission at read level, checked by the
// server action that calls them.

import { createServiceClient } from "@/lib/supabase/server";
import {
  computeCollectionStats,
  getCollectionStats,
  type PublicCollectionStats,
} from "@/lib/collection-stats";

/** Status breakdown for one content type. Every bucket is explicitly named —
 *  nothing here may be rendered as "resources" without its label. */
export type AdminTypeStats = {
  type: "book" | "thesis" | "publication" | "learning_path" | "physical_catalog";
  /** Every row, regardless of status. ADMIN ONLY. */
  all: number;
  /** The public figure — identical predicate to lib/collection-stats.ts. */
  published: number;
  draft: number;
  pendingReview: number;
  scheduled: number;
  archived: number;
};

export type SearchIndexHealthRow = {
  resourceType: string;
  published: number;
  embedded: number;
  missingEmbedding: number;
};

/**
 * Full-text extraction coverage — the OTHER half of "is this findable?", and
 * the half nothing reported until migration 0133.
 *
 * `SearchIndexHealthRow` measures the embedding ON the resource row, which
 * makes a book reachable by a semantic match against its title and
 * description. This measures whether the words INSIDE the PDF were extracted,
 * which is what "found inside" page hits and every page-cited AI answer are
 * built from. A collection can score perfectly on the first and hold nothing
 * at all on the second — production did, for five weeks.
 *
 * `neverAttempted` is deliberately its own number rather than being folded
 * into a "not indexed" total. "We have never run the indexer over these" and
 * "we ran it and they are scans" call for opposite responses, and the whole
 * defect was that they looked the same.
 */
export type FullTextIndexHealthRow = {
  resourceType: string;
  published: number;
  indexed: number;
  /** Parsed fine, but every page was an image. Permanent without OCR. */
  noTextLayer: number;
  /** File could not be fetched — transient, worth retrying. */
  unfetchable: number;
  /** The attempt threw. Always a bug or an outage on our side. */
  failed: number;
  /** No attempt has ever been recorded for these. */
  neverAttempted: number;
  totalPages: number;
  totalChunks: number;
};

export type ResourceStatsReconciliation = {
  /** Fresh recount straight from the canonical view. */
  actual: PublicCollectionStats | null;
  /** What the cached public service is currently serving. */
  cached: PublicCollectionStats | null;
  /** Fields where the two disagree — empty when the cache is correct. */
  drift: Array<{ metric: string; cached: number; actual: number }>;
  /** Per-type published vs embedded, for the search-index reconciliation. */
  searchIndex: SearchIndexHealthRow[] | null;
  /** Per-type full-text extraction coverage (migration 0133). Null while the
   *  view is missing — i.e. between a deploy and its migration. */
  fullTextIndex: FullTextIndexHealthRow[] | null;
  /** Published rows whose normalised title collides with another published
   *  row of the same type. NOT excluded from counts — two editions can share
   *  a title legitimately — but surfaced so a librarian can judge. */
  possibleDuplicates: Array<{ type: string; title: string; count: number }>;
  checkedAt: string;
};

const NUMERIC_METRICS = [
  "books",
  "theses",
  "publications",
  "physicalCatalogs",
  "learningPaths",
  "totalDigitalResources",
  "searchableResources",
] as const;

async function countByStatus(
  supabase: ReturnType<typeof createServiceClient>,
  table: string,
  status: string,
): Promise<number> {
  const { count, error } = await supabase
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("status", status);
  // `publications` and `learning_paths` have no `status` column — they are
  // published/unpublished only. Report 0 rather than failing the whole panel.
  return error ? 0 : (count ?? 0);
}

async function countAll(
  supabase: ReturnType<typeof createServiceClient>,
  table: string,
): Promise<number> {
  const { count } = await supabase.from(table).select("id", { count: "exact", head: true });
  return count ?? 0;
}

async function countFlag(
  supabase: ReturnType<typeof createServiceClient>,
  table: string,
  column: "is_published" | "is_active",
  value: boolean,
): Promise<number> {
  const { count } = await supabase
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq(column, value);
  return count ?? 0;
}

/**
 * Per-type, per-status counts for the admin panel. Service-role: it must see
 * drafts and archived rows, which is exactly why its output may never be
 * rendered as a public figure.
 */
export async function getAdminResourceStats(): Promise<AdminTypeStats[]> {
  const supabase = createServiceClient();

  const statusTable = async (
    type: AdminTypeStats["type"],
    table: string,
  ): Promise<AdminTypeStats> => {
    const [all, published, draft, pendingReview, scheduled, archived] = await Promise.all([
      countAll(supabase, table),
      countFlag(supabase, table, "is_published", true),
      countByStatus(supabase, table, "draft"),
      countByStatus(supabase, table, "pending_review"),
      countByStatus(supabase, table, "scheduled"),
      countByStatus(supabase, table, "archived"),
    ]);
    return { type, all, published, draft, pendingReview, scheduled, archived };
  };

  const [books, theses, publications, paths, catalogs] = await Promise.all([
    statusTable("book", "books"),
    statusTable("thesis", "research_reports"),
    statusTable("publication", "publications"),
    statusTable("learning_path", "learning_paths"),
    (async (): Promise<AdminTypeStats> => {
      const [all, active] = await Promise.all([
        countAll(supabase, "catalog_books"),
        countFlag(supabase, "catalog_books", "is_active", true),
      ]);
      return {
        type: "physical_catalog",
        all,
        published: active,
        draft: 0,
        pendingReview: 0,
        scheduled: 0,
        archived: all - active,
      };
    })(),
  ]);

  return [books, theses, publications, paths, catalogs];
}

/** Published rows sharing a normalised title within one type. */
async function findPossibleDuplicates(
  supabase: ReturnType<typeof createServiceClient>,
): Promise<ResourceStatsReconciliation["possibleDuplicates"]> {
  const sources: Array<[string, string, "is_published" | "is_active"]> = [
    ["book", "books", "is_published"],
    ["thesis", "research_reports", "is_published"],
    ["publication", "publications", "is_published"],
  ];
  const out: ResourceStatsReconciliation["possibleDuplicates"] = [];
  for (const [type, table, flag] of sources) {
    const { data, error } = await supabase
      .from(table)
      .select("title")
      .eq(flag, true)
      .limit(10_000);
    if (error || !data) continue;
    const seen = new Map<string, { title: string; count: number }>();
    for (const row of data as { title: string | null }[]) {
      const key = (row.title ?? "").trim().toLowerCase().replace(/\s+/g, " ");
      if (!key) continue;
      const hit = seen.get(key);
      if (hit) hit.count += 1;
      else seen.set(key, { title: row.title ?? "", count: 1 });
    }
    for (const { title, count } of seen.values()) {
      if (count > 1) out.push({ type, title, count });
    }
  }
  return out.sort((a, b) => b.count - a.count).slice(0, 50);
}

/**
 * Recalculate the public figures and report how they compare with what the
 * cache is serving and with the search index. Read-only: it recomputes from
 * canonical rows and never overwrites a counter with a number.
 */
export async function reconcilePublicResourceStats(): Promise<ResourceStatsReconciliation> {
  const supabase = createServiceClient();

  const [actual, cached, searchRes, indexRes, possibleDuplicates] = await Promise.all([
    computeCollectionStats(),
    getCollectionStats(),
    supabase
      .from("public_resource_search_health")
      .select("resource_type, published, embedded, missing_embedding"),
    supabase
      .from("public_resource_index_health")
      .select(
        "record_type, published, indexed, no_text_layer, unfetchable, failed, never_attempted, total_pages, total_chunks",
      ),
    findPossibleDuplicates(supabase),
  ]);

  const drift: ResourceStatsReconciliation["drift"] = [];
  if (actual && cached) {
    for (const metric of NUMERIC_METRICS) {
      if (cached[metric] !== actual[metric]) {
        drift.push({ metric, cached: cached[metric], actual: actual[metric] });
      }
    }
  }

  const searchIndex = searchRes.error
    ? null
    : (searchRes.data ?? []).map((r) => ({
        resourceType: String(r.resource_type),
        published: Number(r.published),
        embedded: Number(r.embedded),
        missingEmbedding: Number(r.missing_embedding),
      }));

  /* Null (not an empty list) while migration 0133 is unapplied, so the panel
     can say "run the migration" instead of rendering a confident row of
     zeroes. A zero here reads as "nothing to index", which is the exact
     misreading this whole change exists to prevent. */
  const fullTextIndex = indexRes.error
    ? null
    : (indexRes.data ?? []).map((r) => ({
        resourceType: String(r.record_type),
        published: Number(r.published),
        indexed: Number(r.indexed),
        noTextLayer: Number(r.no_text_layer),
        unfetchable: Number(r.unfetchable),
        failed: Number(r.failed),
        neverAttempted: Number(r.never_attempted),
        totalPages: Number(r.total_pages),
        totalChunks: Number(r.total_chunks),
      }));

  if (drift.length > 0) {
    console.error(
      JSON.stringify({
        event: "collection_stats_drift",
        entityType: "collection-stats",
        route: "lib/admin/resource-stats",
        env: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
        ts: new Date().toISOString(),
        drift,
      }),
    );
  }

  return {
    actual,
    cached,
    drift,
    searchIndex,
    fullTextIndex,
    possibleDuplicates,
    checkedAt: new Date().toISOString(),
  };
}

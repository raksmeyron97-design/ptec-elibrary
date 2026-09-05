// lib/ai/readiness.ts
// What retrieval can actually do for ONE resource, right now. Server-only.
//
// The library already knows this per TYPE — `public_resource_index_health`
// says 203 books were never attempted — but nothing could say it per RECORD,
// so no surface could tell a reader why the assistant had nothing to cite
// about the book in front of them, and the assistant could not tell itself
// either: it asked for semantic passages from a document with no embeddings
// and reported "no evidence", which reads as "the book does not discuss this"
// when the truth is "this book has never been indexed".
//
// Two facts are counted rather than read from `resource_index_state.pages` /
// `.chunks`: those are the last attempt's numbers, and they drift. A record
// can say `indexed, chunks: 340` while `book_chunks` holds nothing, because
// extraction succeeded and the embedding pass then hit a daily quota — the
// exact case `embedRecordChunksSafe` was written to record. Counting is one
// cheap head query per table and it cannot lie.

import "server-only";

import { createServiceClient } from "@/lib/supabase/server";
import { readIndexState } from "@/lib/indexing/state";
import type { IndexStatus } from "@/lib/indexing/state";
import { cacheKey, cached } from "./cache";
import type { EvidenceRecordType } from "./evidence";

export interface ResourceReadiness {
  recordType: EvidenceRecordType;
  recordId: string;
  /** Last recorded indexing outcome, or null when never attempted. */
  status: IndexStatus | null;
  pages: number;
  chunks: number;
  /** Exact page-text search can answer questions about this resource. */
  lexicalReady: boolean;
  /** Vector search can — requires embedded chunks AND a configured embedder. */
  semanticReady: boolean;
  /** The document is an image-only scan: no amount of retrying adds text. */
  isScan: boolean;
}

const TABLE_FOR: Record<EvidenceRecordType, string> = {
  book: "books",
  research: "research_reports",
  publication: "publications",
};

async function countRows(
  db: ReturnType<typeof createServiceClient>,
  table: "book_pages" | "book_chunks",
  recordType: EvidenceRecordType,
  recordId: string,
): Promise<number> {
  const { count, error } = await db
    .from(table)
    .select("*", { count: "exact", head: true })
    .eq("record_type", recordType)
    .eq("record_id", recordId);
  if (error) {
    // A counting failure must degrade to "assume nothing is ready" rather
    // than to a thrown request: the caller's fallback is exact-text-only or
    // an honest "not indexed", both of which are better than a 500.
    console.error(`[ai/readiness] ${table}:`, error.message);
    return 0;
  }
  return count ?? 0;
}

/**
 * Retrieval readiness for one record. Cached briefly — a reader asking three
 * questions about the same book must not pay three times, and indexing state
 * changes on the scale of a cron run, not a conversation.
 */
export async function getResourceReadiness(
  recordType: EvidenceRecordType,
  recordId: string,
): Promise<ResourceReadiness> {
  const key = cacheKey(["readiness", recordType, recordId]);
  const { value } = await cached<ResourceReadiness>("retrieval", key, async () => {
    const db = createServiceClient();
    const [state, pages, chunks] = await Promise.all([
      readIndexState(db, recordType, recordId),
      countRows(db, "book_pages", recordType, recordId),
      countRows(db, "book_chunks", recordType, recordId),
    ]);
    return {
      recordType,
      recordId,
      status: state?.status ?? null,
      pages,
      chunks,
      lexicalReady: pages > 0,
      semanticReady: chunks > 0 && Boolean(process.env.GEMINI_API_KEY),
      isScan: state?.status === "no_text_layer",
    };
  });
  return value;
}

/** Readiness for a resource named by slug, for pages that hold no record id. */
export async function getReadinessBySlug(
  recordType: EvidenceRecordType,
  slug: string,
): Promise<ResourceReadiness | null> {
  const db = createServiceClient();
  const { data, error } = await db
    .from(TABLE_FOR[recordType])
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (error || !data) return null;
  return getResourceReadiness(recordType, (data as { id: string }).id);
}

/**
 * What to tell a reader about this document's searchability, or null when
 * there is nothing worth saying (the normal, fully-indexed case).
 *
 * Returns a message KEY, not prose: the two surfaces that render it are
 * localized, and an English sentence returned from a server module is exactly
 * how untranslated strings reach a Khmer page.
 */
export type ReadinessNotice = "scan" | "not_indexed" | "exact_only";

export function readinessNotice(readiness: ResourceReadiness): ReadinessNotice | null {
  if (readiness.isScan) return "scan";
  if (!readiness.lexicalReady) return "not_indexed";
  if (!readiness.semanticReady) return "exact_only";
  return null;
}

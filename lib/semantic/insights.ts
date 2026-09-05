/* lib/semantic/insights.ts
 *
 * Reading the precomputed semantic insights for a resource.
 *
 * This module is the ONLY way the public site reaches
 * `resource_semantic_insights`. The table is service-role only (0137), like
 * every other derived-corpus table in this codebase, so a page reaches it
 * through a server component and a cached read — never through PostgREST from
 * the browser, and never by recomputing.
 *
 * The read is one row by primary key, wrapped in `unstable_cache` under the
 * `books` tag so a republish refreshes it with everything else about the book.
 * Nothing here parses a PDF, scans pages, or calls a model: by the time a
 * request arrives the answer already exists or it does not.
 */

import "server-only";
import { unstable_cache } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { TAGS } from "@/lib/cache/revalidate";
import { SEMANTIC_VERSION, type InsightStatus, type InsightTopic } from "@/lib/semantic/build";

export type ResourceRecordType = "book" | "research" | "publication";

export type StoredInsights = {
  status: InsightStatus;
  topics: InsightTopic[];
  computedAt: string | null;
};

/** Topics shown on a detail page. Beyond this the list stops being a summary. */
export const MAX_TOPICS_RENDERED = 6;

type Row = {
  status: string | null;
  topics: unknown;
  semantic_version: number | null;
  computed_at: string | null;
};

function parseTopics(value: unknown): InsightTopic[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry): InsightTopic[] => {
    if (!entry || typeof entry !== "object") return [];
    const t = entry as Record<string, unknown>;
    const label = typeof t.label === "string" ? t.label.trim() : "";
    if (!label) return [];
    const pages = Array.isArray(t.pages)
      ? t.pages.filter((p): p is number => typeof p === "number" && Number.isInteger(p) && p > 0)
      : [];
    return [
      {
        label,
        pages,
        morePages: typeof t.morePages === "number" && t.morePages > 0 ? t.morePages : 0,
        mentions: typeof t.mentions === "number" && t.mentions > 0 ? t.mentions : 0,
        score: typeof t.score === "number" ? t.score : 0,
      },
    ];
  });
}

async function loadInsights(
  recordType: ResourceRecordType,
  recordId: string,
): Promise<StoredInsights | null> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("resource_semantic_insights")
    .select("status, topics, semantic_version, computed_at")
    .eq("record_type", recordType)
    .eq("record_id", recordId)
    .maybeSingle<Row>();

  // A database without 0137 answers 42P01, and every book detail page in the
  // library must survive that: the enrichment is additive, so its absence
  // renders nothing rather than failing the page. Same defensive posture as
  // the allow_download reads on this route.
  if (error || !data) return null;

  // A row from an older generation of the pure logic describes rules that are
  // no longer in force. Recomputing is the script's job; the reader's job is
  // to not publish a claim it can no longer justify.
  if (data.semantic_version !== SEMANTIC_VERSION) return null;

  const status = data.status as InsightStatus;
  return {
    status,
    topics: status === "ok" ? parseTopics(data.topics) : [],
    computedAt: data.computed_at,
  };
}

const cachedInsights = unstable_cache(loadInsights, ["resource-semantic-insights-v1"], {
  revalidate: 3600,
  tags: [TAGS.books],
});

/**
 * Precomputed insights for a resource, or null when there are none.
 *
 * Null is the normal answer for most of this collection today and callers must
 * treat it as "render nothing", never as an error: 99 Khmer-script books are
 * excluded by the text-health gate, and every record is excluded until the
 * build script has run over it.
 */
export async function getResourceInsights(
  recordType: ResourceRecordType,
  recordId: string,
): Promise<StoredInsights | null> {
  try {
    return await cachedInsights(recordType, recordId);
  } catch {
    return null;
  }
}

/** The topics a detail page may render, best-evidenced first, capped. */
export async function getPublicTopics(
  recordType: ResourceRecordType,
  recordId: string,
): Promise<InsightTopic[]> {
  const insights = await getResourceInsights(recordType, recordId);
  if (!insights || insights.status !== "ok") return [];
  return insights.topics.slice(0, MAX_TOPICS_RENDERED);
}

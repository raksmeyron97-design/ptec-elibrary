import "server-only";

// Best-effort side effects shared by the publication Server Actions. These
// are deliberately NOT Server Actions themselves: they run with the service
// role and perform no permission checks, so they must only ever be invoked
// from already-guarded actions.

import { createServiceClient } from "@/lib/supabase/server";
import { generateDocumentEmbedding } from "@/lib/gemini-embeddings";
import { broadcastPush } from "@/lib/push";
import {
  academicTextToPlainText,
  normalizePublicationReferences,
} from "@/lib/publications/citations";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// Embed title + abstract + keywords so the article is findable via
// /api/search (match_library). Best-effort: an embedding failure must never
// fail the admin save — the backfill script (scripts/embed-library.ts)
// catches any rows left with a null embedding.
export async function queuePublicationEmbedding(publicationId: string): Promise<void> {
  try {
    const supabase = createServiceClient();
    const { data: row } = await supabase
      .from("publications")
      .select("title, title_km, journal_name, abstract, keywords, references")
      .eq("id", publicationId)
      .single();
    if (!row) return;

    const text = [
      row.title,
      row.title_km,
      row.journal_name,
      academicTextToPlainText(row.abstract, normalizePublicationReferences(row.references)),
      Array.isArray(row.keywords) ? row.keywords.join(" ") : "",
    ]
      .map((s) => (typeof s === "string" ? s.replace(/\s+/g, " ").trim() : ""))
      .filter(Boolean)
      .join(" — ");
    if (!text) return;

    const embedding = await generateDocumentEmbedding(text);
    const { error } = await supabase
      .from("publications")
      .update({ embedding })
      .eq("id", publicationId);
    if (error) console.error("[publications] embedding update failed:", error.message);
  } catch (e) {
    console.error("[publications] embedding generation failed:", errorMessage(e));
  }
}

// Web-push everyone subscribed to the 'publications' channel (migration 0054).
// Best-effort: a push failure must never fail the publish itself.
export async function notifyPublicationSubscribers(publicationId: string): Promise<void> {
  try {
    const supabase = createServiceClient();
    const { data: pub } = await supabase
      .from("publications")
      .select("title, slug")
      .eq("id", publicationId)
      .single();
    if (!pub) return;

    const { data: subs } = await supabase
      .from("content_subscriptions")
      .select("user_id")
      .eq("filter_type", "publications");
    const userIds = [...new Set((subs ?? []).map((s) => s.user_id as string))];
    if (userIds.length === 0) return;

    await broadcastPush(userIds, {
      title: "New publication",
      body: pub.title,
      url: `/publications/${pub.slug}`,
    });
  } catch (e) {
    console.error("[publications] subscriber push failed:", errorMessage(e));
  }
}

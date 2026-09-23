import "server-only";

import { createServiceClient } from "@/lib/supabase/server";
import { dedupeWindowStart, type ViewerIdentity } from "./counting";

/**
 * The two reads that decide whether a public lifetime counter may move.
 *
 * They live together because the counters they guard are read together — a
 * book card shows views beside downloads, so the moment the two apply
 * different windows, or one of them silently stops asking, the pair stops
 * meaning anything. The rule itself is lib/analytics/counting.ts.
 *
 * A FAILED read answers `false` (not counted yet) on purpose. The opposite
 * choice — treating an unreadable log as proof of a repeat — is how a counter
 * freezes without anyone noticing, which is the defect these modules exist to
 * undo. Inflation is visible in the number; a freeze is not.
 */

async function hasRow(
  table: "view_logs" | "download_logs",
  timeColumn: "viewed_at" | "downloaded_at",
  bookId: string,
  identity: ViewerIdentity,
): Promise<boolean> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from(table)
    .select("id")
    .eq("content_type", "book")
    .eq("content_id", bookId)
    .eq(identity.column, identity.value)
    .gte(timeColumn, dedupeWindowStart())
    .limit(1);
  if (error) {
    console.error(`[lifetime-counters] ${table} dedupe read:`, error.message);
    return false;
  }
  return (data?.length ?? 0) > 0;
}

/** Has this viewer already moved `books.view_count` inside the window? */
export function viewCountedWithinWindow(bookId: string, identity: ViewerIdentity): Promise<boolean> {
  return hasRow("view_logs", "viewed_at", bookId, identity);
}

/** Has this reader already moved `books.download_count` inside the window? */
export function downloadCountedWithinWindow(bookId: string, userId: string): Promise<boolean> {
  return hasRow("download_logs", "downloaded_at", bookId, { column: "user_id", value: userId });
}

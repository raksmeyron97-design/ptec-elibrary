// app/actions/view-count.ts
"use server";

import { createServiceClient } from "@/lib/supabase/server";
import { getViewerContext, logContentView } from "@/lib/analytics/events";
import { decideLifetimeCount, viewerIdentity } from "@/lib/analytics/counting";
import { viewCountedWithinWindow } from "@/lib/analytics/lifetime-counters";

/**
 * Called from the book detail page's view ping (one call per detail view).
 *
 * Two write paths with different rules:
 *  - books.view_count (the public lifetime counter) counts every human
 *    visitor, signed in or not, once per rolling 24 hours — the rule is
 *    lib/analytics/counting.ts, shared with the download counter so the two
 *    numbers on a book card mean the same kind of thing.
 *  - view_logs (period analytics) records EVERY view, repeats included, with
 *    the daily-rotating session hash. Bot-filtered and rate-limited inside
 *    logContentView.
 *
 * The RPC argument is `row_id`. It is not a detail: `increment_view_count`
 * has been declared `(row_id uuid)` since the initial schema, this call site
 * passed `book_id`, and PostgREST resolves functions BY ARGUMENT NAME — so
 * every call answered 404 PGRST202 ("Perhaps you meant … (row_id)") and
 * books.view_count had not moved since. The download path made the identical
 * mistake but carried a read-then-write fallback that quietly did the update,
 * which is the whole of why downloads climbed while views stood still.
 */
export async function incrementViewCount(bookId: string) {
  if (!bookId) return;

  const viewer = await getViewerContext();
  const identity = viewerIdentity(viewer);

  const countedWithinWindow =
    !viewer.isBot && identity ? await viewCountedWithinWindow(bookId, identity) : false;

  if (decideLifetimeCount({ isBot: viewer.isBot, identity, countedWithinWindow }) === "count") {
    const supabase = createServiceClient();
    const { error } = await supabase.rpc("increment_view_count", { row_id: bookId });
    if (error) console.error("[incrementViewCount]", error.message);
  }

  // Always after the dedupe read — this is the row that read looks for.
  await logContentView("book", bookId);
}

// app/actions/view-count.ts
"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { logContentView } from "@/lib/analytics/events";

/**
 * Called from the book detail page's view ping (one call per detail view).
 *
 * Two write paths with different rules:
 *  - books.view_count (the public lifetime counter) still only increments
 *    for signed-in users — unchanged since 0019, keeps the public badge
 *    spam-resistant.
 *  - view_logs (period analytics) records every human visitor, anonymous
 *    included, with the daily-rotating session hash. Bot-filtered and
 *    rate-limited inside logContentView.
 */
export async function incrementViewCount(bookId: string) {
  if (!bookId) return;

  const authClient = await createClient();
  const { data: { user } } = await authClient.auth.getUser();

  if (user) {
    const supabase = createServiceClient();
    const { error } = await supabase.rpc("increment_view_count", {
      book_id: bookId,
    });
    if (error) {
      console.error("[incrementViewCount]", error.message);
    }
  }

  await logContentView("book", bookId);
}

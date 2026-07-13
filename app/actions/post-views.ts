"use server";

import { createServiceClient } from "@/lib/supabase/server";
import { logContentView } from "@/lib/analytics/events";

export async function incrementPostViews(postId: string) {
  if (!postId) return;

  const supabase = createServiceClient();
  await supabase.rpc("increment_post_views", { p_post_id: postId });

  // Timestamped log so post views appear in period analytics (the counter
  // above is all-time only). Anonymous views log with a null user_id and a
  // daily-rotating session hash; bots are skipped (lib/analytics/events).
  await logContentView("post", postId);
}

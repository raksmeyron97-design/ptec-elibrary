"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";

export async function incrementPostViews(postId: string) {
  if (!postId) return;

  const supabase = createServiceClient();
  await supabase.rpc("increment_post_views", { p_post_id: postId });

  // Timestamped log so post views appear in period analytics (the counter
  // above is all-time only). Anonymous views log with a null user_id.
  const authClient = await createClient();
  const { data: { user } } = await authClient.auth.getUser();
  const { error } = await supabase.from("view_logs").insert({
    content_type: "post",
    content_id: postId,
    user_id: user?.id ?? null,
  });
  if (error) {
    console.error("[incrementPostViews] view_logs insert failed:", error.message);
  }
}

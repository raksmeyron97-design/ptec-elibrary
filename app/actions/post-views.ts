"use server";

import { createServiceClient } from "@/lib/supabase/server";

export async function incrementPostViews(postId: string) {
  const supabase = createServiceClient();
  await supabase.rpc("increment_post_views", { p_post_id: postId });
}

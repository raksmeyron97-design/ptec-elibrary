// app/actions/view-count.ts
"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";

export async function incrementViewCount(bookId: string) {
  if (!bookId) return;

  const authClient = await createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return;

  const supabase = createServiceClient();
  const { error } = await supabase.rpc("increment_view_count", {
    book_id: bookId,
  });

  await supabase.from("view_logs").insert({
    content_type: "book",
    content_id: bookId,
    user_id: user.id,
  });

  if (error) {
    console.error("[incrementViewCount]", error.message);
  }
}
// app/actions/view-count.ts
"use server";

import { createServiceClient } from "@/lib/supabase/server";

export async function incrementViewCount(bookId: string) {
  if (!bookId) return;

  const supabase = createServiceClient();
  const { error } = await supabase.rpc("increment_view_count", {
    book_id: bookId,
  });

  if (error) {
    console.error("[incrementViewCount]", error.message);
  }
}
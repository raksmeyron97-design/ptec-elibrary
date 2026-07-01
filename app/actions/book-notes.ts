"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";

export async function getBookNote(bookId: string): Promise<string> {
  const authClient = await createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return "";

  const supabase = createServiceClient();
  const { data } = await supabase
    .from("book_notes")
    .select("content")
    .eq("book_id", bookId)
    .eq("user_id", user.id)
    .maybeSingle();

  return data?.content ?? "";
}

export async function saveBookNote(
  bookId: string,
  content: string
): Promise<{ success: boolean; error?: string }> {
  const authClient = await createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { success: false, error: "Not authenticated" };

  if (content.length > 10000) {
    return { success: false, error: "Note is too long (max 10,000 characters)." };
  }

  const supabase = createServiceClient();
  const { error } = await supabase
    .from("book_notes")
    .upsert(
      { user_id: user.id, book_id: bookId, content: content.trim() },
      { onConflict: "user_id,book_id" }
    );

  if (error) {
    console.error("[saveBookNote]:", error);
    return { success: false, error: "Failed to save note." };
  }

  return { success: true };
}

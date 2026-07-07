"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";
import { ratePolicy } from "@/lib/rate-limit-policy";
import { logSecurityEvent } from "@/lib/security-log";

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

  // Generous cap: the editor autosaves on a 1s debounce, so a fast typist
  // legitimately produces many saves — this only stops scripted floods.
  const { limit, windowMs } = ratePolicy("noteSave");
  const rl = await rateLimit(`note-save:${user.id}`, limit, windowMs);
  if (!rl.success) {
    logSecurityEvent({ type: "rate_limited", where: "saveBookNote", userId: user.id });
    return { success: false, error: "Saving too quickly. Your note will be saved when you pause." };
  }

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

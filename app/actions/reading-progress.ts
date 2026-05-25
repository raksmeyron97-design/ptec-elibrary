"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";

// ── Load saved progress for a book ───────────────────────────────────────────
export async function getReadingProgress(
  bookId: string
): Promise<{ progressPct: number; lastReadAt: string | null } | null> {
  // createClient() reads session cookies → auth.getUser() works correctly
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // Use service client for DB read so RLS never blocks
  const db = createServiceClient();

  const { data, error } = await db
    .from("reading_progress")
    .select("progress_pct, last_read_at")
    .eq("user_id", user.id)
    .eq("book_id", bookId)
    .maybeSingle();

  if (error) {
    console.error("[getReadingProgress]", error.message);
    return null;
  }

  return data
    ? { progressPct: Number(data.progress_pct), lastReadAt: data.last_read_at }
    : null;
}

// ── Upsert progress (called from client via server action) ────────────────────
export async function saveReadingProgress(
  bookId: string,
  progressPct: number
): Promise<void> {
  // Same fix: get user from cookie client first
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  // Service client bypasses RLS for the write
  const db = createServiceClient();

  const { error } = await db.from("reading_progress").upsert(
    {
      user_id:      user.id,
      book_id:      bookId,
      progress_pct: Math.min(100, Math.max(0, progressPct)),
      last_read_at: new Date().toISOString(),
    },
    {
      onConflict: "user_id,book_id",
    }
  );

  if (error) {
    console.error("[saveReadingProgress]", error.message);
  }
}
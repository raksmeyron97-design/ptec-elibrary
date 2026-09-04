"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { upsertReadingProgress } from "@/lib/reading-progress";

// ── Load saved progress for a book ───────────────────────────────────────────
export async function getReadingProgress(
  bookId: string
): Promise<{ progressPct: number; maxProgressPct: number; lastReadAt: string | null } | null> {
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
    .select("progress_pct, max_progress_pct, last_read_at")
    .eq("user_id", user.id)
    .eq("book_id", bookId)
    .maybeSingle();

  if (error) {
    console.error("[getReadingProgress]", error.message);
    return null;
  }

  return data
    ? { 
        progressPct: Number(data.progress_pct), 
        maxProgressPct: Number(data.max_progress_pct ?? data.progress_pct ?? 0), 
        lastReadAt: data.last_read_at 
      }
    : null;
}

// ── Upsert progress (called from client via server action) ────────────────────
//
// The DEBOUNCED autosave path, used while the reader is open and the page is
// alive. The teardown flush cannot use this — a Server Action is a plain
// `fetch()` with no `keepalive`, so the browser cancels it when the tab closes
// — and goes to POST /api/reader/progress instead. Both share
// `upsertReadingProgress()`, so the high-water rule for `max_progress_pct` is
// defined exactly once.
export async function saveReadingProgress(
  bookId: string,
  progressPct: number
): Promise<void> {
  // Get the user from the cookie client first; the write then runs through the
  // service client, which bypasses RLS.
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await upsertReadingProgress(user.id, bookId, progressPct);
}
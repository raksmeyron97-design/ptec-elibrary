"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { upsertReadingProgress } from "@/lib/reading-progress";

// ── Load saved progress for a book ───────────────────────────────────────────
export type SavedReadingProgress = {
  progressPct: number;
  maxProgressPct: number;
  lastReadAt: string | null;
  /** Exact page (0141). Null on a row written before it, or by a client that
      sent only a percentage — every reader of this must have a fallback. */
  lastPage: number | null;
  /** Page count `lastPage` was measured against. */
  lastPageCount: number | null;
};

export async function getReadingProgress(
  bookId: string
): Promise<SavedReadingProgress | null> {
  // createClient() reads session cookies → auth.getUser() works correctly
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // Use service client for DB read so RLS never blocks
  const db = createServiceClient();

  const BASE = "progress_pct, max_progress_pct, last_read_at";
  // Asked for defensively, the same shape the read route uses for
  // allow_download: on a database without 0141 the whole select fails, and
  // losing resume entirely is far worse than losing its precision.
  let { data, error } = await db
    .from("reading_progress")
    .select(`${BASE}, last_page, last_page_count`)
    .eq("user_id", user.id)
    .eq("book_id", bookId)
    .maybeSingle();

  if (error && (error.code === "42703" || error.code === "PGRST204")) {
    ({ data, error } = await db
      .from("reading_progress")
      .select(BASE)
      .eq("user_id", user.id)
      .eq("book_id", bookId)
      .maybeSingle());
  }

  if (error) {
    console.error("[getReadingProgress]", error.message);
    return null;
  }
  if (!data) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row = data as any;
  const num = (v: unknown): number | null => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
  };

  return {
    progressPct: Number(row.progress_pct),
    maxProgressPct: Number(row.max_progress_pct ?? row.progress_pct ?? 0),
    lastReadAt: row.last_read_at,
    lastPage: num(row.last_page),
    lastPageCount: num(row.last_page_count),
  };
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
  progressPct: number,
  position?: { page?: number | null; pageCount?: number | null },
): Promise<void> {
  // Get the user from the cookie client first; the write then runs through the
  // service client, which bypasses RLS.
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await upsertReadingProgress(user.id, bookId, progressPct, position);
}
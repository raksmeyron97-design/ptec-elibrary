/**
 * The one definition of "save this reader's position".
 *
 * Two callers reach it and they must not drift:
 *   • `saveReadingProgress` (app/actions/reading-progress.ts) — the debounced
 *     autosave while the reader is open;
 *   • `POST /api/reader/progress` — the teardown flush, which has to be a real
 *     endpoint because a Server Action is a plain `fetch()` with no
 *     `keepalive`, and the browser cancels it when the tab closes.
 *
 * `max_progress_pct` is a high-water mark: it only ever rises, so a reader
 * who scrolls back to chapter one does not lose the "you have read 80% of
 * this" figure the dashboard shows.
 */
import { createServiceClient } from "@/lib/supabase/server";

export const clampProgressPct = (value: number): number =>
  Math.min(100, Math.max(0, Math.round(value)));

/**
 * Upsert one reader's position for one book. The caller has already
 * authenticated `userId`; this function never reads a session, so it can be
 * used from both a Server Action and a route handler.
 *
 * Returns false (and logs) on a database error rather than throwing: a lost
 * progress write must never surface as an error to someone who is reading.
 */
export async function upsertReadingProgress(
  userId: string,
  bookId: string,
  progressPct: number,
): Promise<boolean> {
  const db = createServiceClient();

  // Read the current high-water mark first so it can only move up.
  const { data: existing } = await db
    .from("reading_progress")
    .select("max_progress_pct")
    .eq("user_id", userId)
    .eq("book_id", bookId)
    .maybeSingle();

  const currentMax = existing?.max_progress_pct ? Number(existing.max_progress_pct) : 0;
  const clampedProgress = clampProgressPct(progressPct);
  const newMax = Math.max(currentMax, clampedProgress);

  const { error } = await db.from("reading_progress").upsert(
    {
      user_id: userId,
      book_id: bookId,
      progress_pct: clampedProgress,
      max_progress_pct: newMax,
      last_read_at: new Date().toISOString(),
    },
    { onConflict: "user_id,book_id" },
  );

  if (error) {
    console.error("[upsertReadingProgress]", error.message);
    return false;
  }
  return true;
}

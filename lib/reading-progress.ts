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
 *
 * `last_page`/`last_page_count` (0141) are the EXACT position, written beside
 * the percentage rather than instead of it. Unlike the high-water mark they
 * track the reader in both directions: turning back to re-read chapter one
 * must resume at chapter one. They are optional at every level — a caller
 * that knows no page omits them, and a database without 0141 has the write
 * retried without them rather than losing the percentage too.
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
  position?: { page?: number | null; pageCount?: number | null },
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

  const base = {
    user_id: userId,
    book_id: bookId,
    progress_pct: clampedProgress,
    max_progress_pct: newMax,
    last_read_at: new Date().toISOString(),
  };

  const page = validPage(position?.page);
  const pageCount = validPage(position?.pageCount);
  // A page beyond the count it was measured against is not a position, it is
  // a bug upstream; record the percentage alone rather than a page that would
  // resume past the end of the book.
  const exact =
    page !== null && (pageCount === null || page <= pageCount)
      ? { last_page: page, last_page_count: pageCount }
      : null;

  const write = (row: Record<string, unknown>) =>
    db.from("reading_progress").upsert(row, { onConflict: "user_id,book_id" });

  let { error } = await write(exact ? { ...base, ...exact } : base);

  // A database without 0141 rejects the whole upsert for the unknown columns,
  // which would lose the percentage as well. The position is the enhancement;
  // the percentage is the thing every existing surface reads.
  if (error && exact && (error.code === "42703" || error.code === "PGRST204")) {
    ({ error } = await write(base));
  }

  if (error) {
    console.error("[upsertReadingProgress]", error.message);
    return false;
  }
  return true;
}

/** A page number is a positive integer or nothing. Anything else is dropped
    rather than clamped: a caller that sent NaN does not know the position. */
function validPage(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const n = Math.floor(value);
  return n > 0 ? n : null;
}

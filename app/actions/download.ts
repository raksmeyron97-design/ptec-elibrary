/* eslint-disable @typescript-eslint/no-explicit-any */
"use server";

// app/actions/download.ts
import { createServiceClient } from "@/lib/supabase/server";
import { createClient } from "@/lib/supabase/server";
import { getViewerContext } from "@/lib/analytics/events";
import { decideLifetimeCount } from "@/lib/analytics/counting";
import { downloadCountedWithinWindow } from "@/lib/analytics/lifetime-counters";

// ── Get current download count for a book ────────────────────
export async function getDownloadCount(bookId: string): Promise<number> {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("books")
    .select("download_count")
    .eq("id", bookId)
    .single();

  if (error) {
    console.error("[getDownloadCount]", error.message);
    return 0;
  }

  return data?.download_count ?? 0;
}

// `downloadBook(bookFileId)` used to live here: it inserted a log row and
// bumped the counter on EVERY call, with no dedupe. Nothing in the app called
// it, but `app/actions/download.ts` is in the module graph, so every "use
// server" export in it is a live action id — one that moved a public number
// once per invocation while every other path moved it once per reader per 24
// hours. A second rule for the same counter is the defect this file's rule
// exists to remove, so the dead path goes rather than gets a copy of the rule.

// ── Increment download count + record per-user history ───────
// Called from PDFViewer whenever a user clicks Download.
// Requires an authenticated session — silently no-ops for guests.
//
// The counter moves once per reader per rolling 24 hours
// (lib/analytics/counting.ts), so a retry, a second device or a double-click
// in the viewer serves the file without moving the public badge. Every
// download still writes a download_logs row: that table is the history the
// dashboard and "my downloads" read, and it is what the dedupe reads back.
export async function incrementDownloadCount(bookId: string): Promise<void> {
  if (!bookId) return;

  const viewer = await getViewerContext();
  if (!viewer.userId) return;
  const userId = viewer.userId;

  const supabase = createServiceClient();

  const outcome = decideLifetimeCount({
    isBot: viewer.isBot,
    identity: { column: "user_id", value: userId },
    countedWithinWindow: await downloadCountedWithinWindow(bookId, userId),
  });

  if (outcome === "count") {
    // `row_id`, not `book_id`: PostgREST resolves functions by argument name,
    // and the wrong name answers 404 rather than throwing. This one bumps
    // books.download_count AND book_files.download_count.
    const { error } = await supabase.rpc("increment_download_count", { row_id: bookId });
    if (error) console.error("[incrementDownloadCount]", error.message);
  }

  // Always logged, counted or not.
  const { data: fileData } = await supabase
    .from("book_files")
    .select("id")
    .eq("book_id", bookId)
    .limit(1)
    .maybeSingle();

  // content_type/content_id are stated rather than left to the 0072 trigger,
  // which only fills them from a book_file_id — a book with no file row would
  // otherwise log a NULL content_id that the dedupe read can never match.
  const { error: logError } = await supabase.from("download_logs").insert({
    user_id: userId,
    book_file_id: fileData?.id ?? null,
    content_type: "book",
    content_id: bookId,
    downloaded_at: new Date().toISOString(),
  });
  if (logError) console.error("[incrementDownloadCount] log insert failed:", logError.message);
}

// ── Types ─────────────────────────────────────────────────────
export type DownloadHistoryItem = {
  bookId:       string;
  slug:         string;
  title:        string;
  author:       string;
  coverUrl:     string | null;
  cover:        string;
  downloadedAt: string;
};

// ── Fetch per-user download history ──────────────────────────
export async function getMyDownloadHistory(): Promise<DownloadHistoryItem[]> {
  const authClient = await createClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();

  if (!user) return [];

  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("download_logs")
    .select(
      `
      downloaded_at,
      book_files (
        books (
          id, slug, title, cover_url, cover_color,
          authors ( name )
        )
      )
      `
    )
    .eq("user_id", user.id)
    .order("downloaded_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("[getMyDownloadHistory]", error.message);
    return [];
  }

  // Deduplicate by bookId
  const historyMap = new Map<string, DownloadHistoryItem>();

  (data ?? []).forEach((row: any) => {
    const book = row.book_files?.books;
    if (!book) return;
    
    if (!historyMap.has(book.id)) {
      historyMap.set(book.id, {
        bookId:       book.id,
        slug:         book.slug,
        title:        book.title,
        author:       book.authors?.name ?? "Unknown",
        coverUrl:     book.cover_url   ?? null,
        cover:        book.cover_color ?? "bg-blue-950",
        downloadedAt: row.downloaded_at,
      });
    }
  });

  return Array.from(historyMap.values());
}
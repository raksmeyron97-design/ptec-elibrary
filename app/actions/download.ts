"use server";

// app/actions/download.ts
import { createServiceClient } from "@/lib/supabase/server";
import { createClient } from "@/lib/supabase/server";

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

export async function downloadBook(bookFileId: string) {
  const authClient = await createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) {
    throw new Error("Unauthorized");
  }

  const supabase = createServiceClient();

  // Insert into download_logs
  const { error: logError } = await supabase.from("download_logs").insert({
    user_id: user.id,
    book_file_id: bookFileId,
  });

  if (logError) {
    console.error("[downloadBook] log error:", logError);
  }

  // Find book_id from book_file_id to increment book download_count
  const { data: fileData } = await supabase
    .from("book_files")
    .select("book_id")
    .eq("id", bookFileId)
    .single();

  if (fileData?.book_id) {
    const { error: rpcError } = await supabase.rpc("increment_download_count", {
      book_id: fileData.book_id,
    });

    if (rpcError) {
      const { data: book } = await supabase
        .from("books")
        .select("download_count")
        .eq("id", fileData.book_id)
        .single();

      if (book) {
        await supabase
          .from("books")
          .update({ download_count: (book.download_count ?? 0) + 1 })
          .eq("id", fileData.book_id);
      }
    }
    
    // Also increment book_files download_count
    const { data: bFile } = await supabase
      .from("book_files")
      .select("download_count")
      .eq("id", bookFileId)
      .single();
      
    if (bFile) {
      await supabase
        .from("book_files")
        .update({ download_count: (bFile.download_count ?? 0) + 1 })
        .eq("id", bookFileId);
    }
  }
}

// ── Increment download count + record per-user history ───────
// Called from PDFViewer whenever a user clicks Download.
export async function incrementDownloadCount(bookId: string): Promise<void> {
  const supabase = createServiceClient();

  // 1. Atomic global counter via RPC (with manual fallback)
  const { error: rpcError } = await supabase.rpc("increment_download_count", {
    book_id: bookId,
  });

  if (rpcError) {
    // Fallback: manual increment if RPC doesn't exist yet
    const { data } = await supabase
      .from("books")
      .select("download_count")
      .eq("id", bookId)
      .single();

    await supabase
      .from("books")
      .update({ download_count: (data?.download_count ?? 0) + 1 })
      .eq("id", bookId);
  }

  // 2. Record analytics log (best-effort — don't block on failure)
  try {
    const authClient = await createClient();
    const {
      data: { user },
    } = await authClient.auth.getUser();

    const now = new Date().toISOString();
    const { data: fileData } = await supabase.from("book_files").select("id").eq("book_id", bookId).limit(1).single();
    
    const logData: any = { downloaded_at: now };
    if (user) {
      logData.user_id = user.id;
    }
    if (fileData?.id) {
      logData.book_file_id = fileData.id;
    }
    
    const res = await supabase.from("download_logs").insert(logData);
    if (res.error) {
      console.error("[incrementDownloadCount] insert into download_logs failed:", res.error);
    }
  } catch (err) {
    console.error("[incrementDownloadCount] history insert failed:", err);
  }
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
        cover:        book.cover_color ?? "bg-[#0a1629]",
        downloadedAt: row.downloaded_at,
      });
    }
  });

  return Array.from(historyMap.values());
}
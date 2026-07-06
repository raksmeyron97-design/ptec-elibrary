// Server-only helpers for PDF duplicate detection (migration 0060).
// sha256 of the original uploaded bytes identifies a file regardless of the
// title/filename a librarian gives it.

import { createHash } from "crypto";
import { createServiceClient } from "@/lib/supabase/server";

export function sha256Hex(bytes: ArrayBuffer): string {
  return createHash("sha256").update(Buffer.from(bytes)).digest("hex");
}

export type DuplicateFile = {
  type: "book" | "research";
  title: string;
  url: string;
};

/**
 * Look up a PDF hash across book_files and research_reports.
 * `exclude` skips the record the file already belongs to, so replacing a
 * thesis PDF with the identical file on the edit form is not a "duplicate".
 */
export async function findDuplicatePdf(
  contentHash: string,
  exclude?: { type: "book" | "research"; id: string },
): Promise<DuplicateFile | null> {
  const db = createServiceClient();

  let bookQ = db
    .from("book_files")
    .select("book_id, books!inner(title, slug)")
    .eq("content_hash", contentHash)
    .limit(1);
  if (exclude?.type === "book") bookQ = bookQ.neq("book_id", exclude.id);

  let researchQ = db
    .from("research_reports")
    .select("id, title")
    .eq("content_hash", contentHash)
    .limit(1);
  if (exclude?.type === "research") researchQ = researchQ.neq("id", exclude.id);

  const [{ data: bookHit, error: bookErr }, { data: researchHit, error: researchErr }] =
    await Promise.all([bookQ.maybeSingle(), researchQ.maybeSingle()]);

  // Fail open: a broken dedupe lookup must never block a legitimate upload.
  if (bookErr) console.error("[content-hash] book lookup failed:", bookErr.message);
  if (researchErr) console.error("[content-hash] research lookup failed:", researchErr.message);

  if (bookHit) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const book = bookHit.books as any;
    return { type: "book", title: book?.title ?? "Unknown", url: `/books/${book?.slug ?? ""}` };
  }
  if (researchHit) {
    return { type: "research", title: researchHit.title, url: `/theses/${researchHit.id}` };
  }
  return null;
}

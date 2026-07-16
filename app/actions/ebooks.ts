"use server";

// Row/bulk mutations for the admin Manage E-books page (/admin/manage).
// Create/update/delete live in app/(admin)/admin/(protected)/books/actions.ts —
// this file only adds the status transitions and bulk operations the list
// page needs, following app/actions/theses.ts conventions (books:write
// permission, DB-backed rate limit, audit log with request metadata).

import { revalidateLocalizedPath as revalidatePath, revalidateBook } from "@/lib/cache/revalidate";
import { headers } from "next/headers";
import { after } from "next/server";
import { requirePermission } from "@/lib/auth/requireAdmin";
import { deleteBook } from "@/app/(admin)/admin/(protected)/books/actions";
import { logAdminAction } from "@/app/actions/audit";
import { rateLimit } from "@/lib/rate-limit";
import { zimaDelete } from "@/lib/zima";
import { indexPdfPagesSafe } from "@/lib/pdf-page-index";
import { normalizeEbookStatus, type EbookStatus } from "@/lib/admin/ebooks-shared";
import { notifyNewBookPublished } from "@/lib/push-events";
import { shouldNotifyPublishedTransition } from "@/lib/push-utils";

const REVALIDATE_PATHS = ["/admin/manage", "/admin", "/books", "/"];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type ActionResult = { success: boolean; error?: string };
type BulkResult = { success: number; failed: number; error?: string };

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Forbidden";
}

/** Best-effort request metadata for audit logs — never blocks the action. */
async function requestMeta(): Promise<{ ip?: string; userAgent?: string }> {
  try {
    const h = await headers();
    const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || undefined;
    return { ip, userAgent: h.get("user-agent") ?? undefined };
  } catch {
    return {};
  }
}

async function enforceRateLimit(userId: string) {
  const { success } = await rateLimit(`ebook-mutate:${userId}`, 30, 60_000);
  if (!success) throw new Error("Too many changes — please wait a moment and try again.");
}

function revalidateAll(slug?: string | null) {
  // Status transitions (publish/unpublish/archive/delete) change the public
  // counters, listings and — via affectsHome — the homepage shelves, so go
  // through the central helper rather than hand-picking tags.
  revalidateBook(slug, { affectsHome: true });
  REVALIDATE_PATHS.forEach((p) => revalidatePath(p));
}

/** Archive lands in the books_status_check constraint only after 0077. */
function friendlyStatusError(message: string): string {
  if (message.includes("books_status_check")) {
    return "Archiving needs migration 0077_ebook_admin.sql applied to the database first.";
  }
  return message;
}

const STATUS_AUDIT_ACTIONS: Record<EbookStatus, string> = {
  published: "book.publish",
  draft: "book.unpublish",
  pending_review: "book.submit_for_review",
  rejected: "book.reject",
  archived: "book.archive",
};

async function setEbookStatus(
  id: string,
  status: EbookStatus,
  auditAction: string = STATUS_AUDIT_ACTIONS[status],
): Promise<ActionResult> {
  if (!UUID_RE.test(id)) return { success: false, error: "Invalid book id" };

  let admin: Awaited<ReturnType<typeof requirePermission>>;
  try {
    admin = await requirePermission("books", "write");
    await enforceRateLimit(admin.user.id);
  } catch (error) {
    return { success: false, error: errorMessage(error) };
  }
  const { supabase, user } = admin;

  if (status === "published") {
    const { data: files } = await supabase
      .from("book_files")
      .select("id")
      .eq("book_id", id)
      .not("file_url", "is", null)
      .limit(1);
    if (!files?.length) {
      return { success: false, error: "Cannot publish an e-book that has no PDF file. Upload one first." };
    }
  }

  const { data: before } = await supabase
    .from("books")
    .select("title, slug, status")
    .eq("id", id)
    .single();
  const shouldNotify = shouldNotifyPublishedTransition(
    normalizeEbookStatus(before?.status as string | null),
    status,
  );

  const { data: row, error } = await supabase
    .from("books")
    .update({ status })
    .eq("id", id)
    .select("title, slug")
    .single();
  if (error) return { success: false, error: friendlyStatusError(error.message) };

  const meta = await requestMeta();
  await logAdminAction(user.id, auditAction, "books", id, { title: row?.title, ...meta });

  revalidateAll(row?.slug);
  if (shouldNotify && row?.slug && row?.title) {
    after(() => notifyNewBookPublished({ id, title: row.title, slug: row.slug }));
  }
  return { success: true };
}

export async function publishEbook(id: string): Promise<ActionResult> {
  return setEbookStatus(id, "published");
}

export async function unpublishEbook(id: string): Promise<ActionResult> {
  return setEbookStatus(id, "draft");
}

export async function archiveEbook(id: string): Promise<ActionResult> {
  return setEbookStatus(id, "archived");
}

export async function restoreEbook(id: string): Promise<ActionResult> {
  return setEbookStatus(id, "draft", "book.restore");
}

/**
 * Thin result-shaped wrapper around the existing deleteBook action (which
 * requires the full admin role and already removes files from storage,
 * dependent rows, and writes the book.delete audit entry).
 */
export async function deleteEbook(id: string): Promise<ActionResult> {
  if (!UUID_RE.test(id)) return { success: false, error: "Invalid book id" };
  try {
    await deleteBook(id);
    return { success: true };
  } catch (error) {
    return { success: false, error: errorMessage(error) };
  }
}

/**
 * Swaps a book's PDF file. The upload itself (MIME-sniffing, malware hash
 * check, duplicate-content check via findDuplicatePdf) already happened in
 * /api/admin/upload — this just points the book_files row at the new URL,
 * drops the stale file_health verdict (it described the old file), re-runs
 * full-text indexing, and best-effort deletes the old file from storage.
 */
export async function replaceBookFile(
  bookId: string,
  file: { fileUrl: string; fileSizeKb: number; contentHash?: string | null },
): Promise<ActionResult> {
  if (!UUID_RE.test(bookId)) return { success: false, error: "Invalid book id" };
  if (!file.fileUrl?.startsWith("http")) return { success: false, error: "Invalid file URL" };

  let admin: Awaited<ReturnType<typeof requirePermission>>;
  try {
    admin = await requirePermission("books", "write");
    await enforceRateLimit(admin.user.id);
  } catch (error) {
    return { success: false, error: errorMessage(error) };
  }
  const { supabase, user } = admin;

  const { data: book } = await supabase.from("books").select("title, slug").eq("id", bookId).single();
  if (!book) return { success: false, error: "Book not found" };

  const { data: existing } = await supabase
    .from("book_files")
    .select("id, file_url")
    .eq("book_id", bookId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const payload = {
    file_url: file.fileUrl,
    file_size_kb: Math.max(0, Math.round(file.fileSizeKb)),
    content_hash: file.contentHash?.trim() || null,
  };

  const { error } = existing
    ? await supabase.from("book_files").update(payload).eq("id", existing.id)
    : await supabase.from("book_files").insert({ book_id: bookId, format: "pdf", download_count: 0, ...payload });
  if (error) {
    if (error.code === "23505" && error.message.includes("content_hash")) {
      return { success: false, error: "This PDF was just uploaded as another book — duplicate file rejected." };
    }
    return { success: false, error: error.message };
  }

  // The old file_health verdict described the file we just replaced.
  await supabase.from("file_health").delete().eq("record_type", "book").eq("record_id", bookId).eq("field", "file_url");

  const meta = await requestMeta();
  await logAdminAction(user.id, "book.replace_pdf", "books", bookId, { title: book.title, ...meta });

  revalidateAll(book.slug);

  const oldUrl = existing?.file_url;
  if (oldUrl && oldUrl !== file.fileUrl) {
    await zimaDelete(oldUrl).catch(() => null);
  }

  after(() => indexPdfPagesSafe("book", bookId, file.fileUrl));

  return { success: true };
}

export type BulkEbookAction = "publish" | "unpublish" | "archive" | "delete" | "department" | "addTag";

const BULK_MAX = 100;

export async function bulkUpdateEbooks(
  ids: string[],
  action: BulkEbookAction,
  payload?: { departmentId?: string; tag?: string },
): Promise<BulkResult> {
  const cleanIds = Array.from(new Set((ids ?? []).filter((id) => typeof id === "string" && UUID_RE.test(id)))).slice(0, BULK_MAX);
  if (!cleanIds.length) return { success: 0, failed: 0 };

  let admin: Awaited<ReturnType<typeof requirePermission>>;
  try {
    admin = await requirePermission("books", "write");
    await enforceRateLimit(admin.user.id);
  } catch (error) {
    return { success: 0, failed: cleanIds.length, error: errorMessage(error) };
  }
  const { supabase, user } = admin;
  const meta = await requestMeta();

  async function logBulk(extra?: Record<string, unknown>) {
    await logAdminAction(user.id, "book.bulk_action", "books", undefined, { action, ids: cleanIds, ...extra, ...meta });
  }

  if (action === "delete") {
    // deleteBook re-checks the admin role per call and cleans up storage +
    // dependent rows + its own audit entry; the loop keeps that behaviour.
    let success = 0;
    let firstError: string | undefined;
    for (const id of cleanIds) {
      try {
        await deleteBook(id);
        success += 1;
      } catch (error) {
        firstError ??= errorMessage(error);
      }
    }
    await logBulk();
    revalidateAll();
    return { success, failed: cleanIds.length - success, error: firstError };
  }

  if (action === "publish") {
    // Never bulk-publish a book with no PDF — those count as failed.
    const [{ data: fileRows }, { data: bookRows }] = await Promise.all([
      supabase
        .from("book_files")
        .select("book_id")
        .in("book_id", cleanIds)
        .not("file_url", "is", null),
      supabase
        .from("books")
        .select("id, title, slug, status")
        .in("id", cleanIds),
    ]);
    const booksById = new Map((bookRows ?? []).map((book) => [book.id as string, book]));
    const publishable = cleanIds.filter((id) => (fileRows ?? []).some((f: { book_id: string }) => f.book_id === id));
    const newlyPublished = publishable
      .map((id) => booksById.get(id))
      .filter((book): book is { id: string; title: string; slug: string; status: string | null } =>
        !!book &&
        typeof book.id === "string" &&
        typeof book.title === "string" &&
        typeof book.slug === "string" &&
        shouldNotifyPublishedTransition(normalizeEbookStatus(book.status), "published"),
      );
    if (publishable.length) {
      const { error } = await supabase.from("books").update({ status: "published" }).in("id", publishable);
      if (error) return { success: 0, failed: cleanIds.length, error: error.message };
    }
    await logBulk();
    revalidateAll();
    if (newlyPublished.length) {
      after(() => Promise.all(newlyPublished.map((book) => notifyNewBookPublished({
        id: book.id,
        title: book.title,
        slug: book.slug,
      }))).then(() => undefined));
    }
    const failed = cleanIds.length - publishable.length;
    return {
      success: publishable.length,
      failed,
      error: failed ? `${failed} e-book(s) skipped — no PDF file, cannot publish.` : undefined,
    };
  }

  if (action === "unpublish" || action === "archive") {
    const status = normalizeEbookStatus(action === "archive" ? "archived" : "draft");
    const { error, count } = await supabase.from("books").update({ status }, { count: "exact" }).in("id", cleanIds);
    if (error) return { success: 0, failed: cleanIds.length, error: friendlyStatusError(error.message) };
    await logBulk();
    revalidateAll();
    return { success: count ?? cleanIds.length, failed: cleanIds.length - (count ?? cleanIds.length) };
  }

  if (action === "department") {
    const departmentId = payload?.departmentId ?? "";
    if (!UUID_RE.test(departmentId)) return { success: 0, failed: cleanIds.length, error: "Choose a department first." };
    const { data: dept } = await supabase.from("departments").select("id, name").eq("id", departmentId).maybeSingle();
    if (!dept) return { success: 0, failed: cleanIds.length, error: "Department not found." };

    // Keep the legacy text column in sync, same as updateDepartment does.
    const { error, count } = await supabase
      .from("books")
      .update({ department_id: dept.id, department: dept.name }, { count: "exact" })
      .in("id", cleanIds);
    if (error) return { success: 0, failed: cleanIds.length, error: error.message };
    await logBulk({ departmentId: dept.id, departmentName: dept.name });
    revalidateAll();
    return { success: count ?? cleanIds.length, failed: cleanIds.length - (count ?? cleanIds.length) };
  }

  if (action === "addTag") {
    const tag = (payload?.tag ?? "").trim().slice(0, 40);
    if (!tag) return { success: 0, failed: cleanIds.length, error: "Enter a tag first." };

    const { data: rows } = await supabase.from("books").select("id, tags").in("id", cleanIds);
    let success = 0;
    let firstError: string | undefined;
    for (const row of (rows ?? []) as { id: string; tags: string[] | null }[]) {
      const tags = Array.isArray(row.tags) ? row.tags : [];
      if (tags.includes(tag)) {
        success += 1;
        continue;
      }
      const { error } = await supabase
        .from("books")
        .update({ tags: [...tags, tag].slice(0, 20) })
        .eq("id", row.id);
      if (error) firstError ??= error.message;
      else success += 1;
    }
    await logBulk({ tag });
    revalidateAll();
    return { success, failed: cleanIds.length - success, error: firstError };
  }

  return { success: 0, failed: cleanIds.length, error: "Unknown bulk action" };
}

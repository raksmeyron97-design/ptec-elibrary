"use server";

// The private rights-basis review (migration 0174, SEO audit 2026-10 WI-5).
//
// Three mutations, one registry gate (`books.rights.review`), each run before
// any service client is opened:
//   confirmBookRights        one book, the basis the reviewer chose
//   bulkConfirmBookRights    every UNREVIEWED row matching an explicit filter
//                            (one draft basis, optionally one rule), refused
//                            unless the count the reviewer was shown still
//                            matches — the dialog states that count
//   generateRightsDrafts     fills draft_basis for books with no row yet, in a
//                            bounded batch; idempotent; never touches a row a
//                            librarian has reviewed
// Audit rows carry ids and counts only: the basis of a title is rights
// material and never reaches a log.

import { requireAction } from "@/lib/admin/route-guard";
import { logAdminAction } from "@/app/actions/audit";
import { rateLimit } from "@/lib/rate-limit";
import { revalidateLocalizedPath } from "@/lib/cache/revalidate";
import { pagedScan } from "@/lib/db/paged-scan";
import { isRightsBasis, type RightsBasis } from "@/lib/books/rights";
import { draftRightsBasis } from "@/lib/books/rights-draft";

export type BookRightsResult =
  | { success: true; count?: number; remaining?: number }
  | { success: false; code: "forbidden" | "rate_limited" | "invalid" | "not_found" | "stale" | "failed"; detail?: string };

const PAGE = "/admin/data-quality/rights";
/** One "Generate drafts" press drafts at most this many books. */
const DRAFT_BATCH = 500;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SOURCE_RE = /^rule:[a-z_]{1,40}$/;

type Admin = Awaited<ReturnType<typeof requireAction>>;

async function open(): Promise<Admin> {
  const admin = await requireAction("books.rights.review");
  const { success } = await rateLimit(`book-rights:${admin.user.id}`, 60, 60_000);
  if (!success) throw Object.assign(new Error("rate_limited"), { code: "rate_limited" as const });
  return admin;
}

function toResult(error: unknown): BookRightsResult {
  const code = (error as { code?: string })?.code;
  if (code === "rate_limited") return { success: false, code: "rate_limited" };
  const status = (error as { status?: number })?.status;
  if (status === 403 || status === 401) return { success: false, code: "forbidden" };
  return { success: false, code: "failed", detail: error instanceof Error ? error.message : undefined };
}

/** Confirm one book's basis. `evidence` is the reviewer's optional note. */
export async function confirmBookRights(input: {
  bookId: string;
  basis: string;
  evidence?: string | null;
}): Promise<BookRightsResult> {
  try {
    const { supabase, user } = await open();
    if (!UUID_RE.test(input.bookId) || !isRightsBasis(input.basis)) return { success: false, code: "invalid" };
    const evidence = input.evidence?.trim().slice(0, 2000) || null;
    const { data, error } = await supabase
      .from("book_rights")
      .upsert(
        {
          book_id: input.bookId,
          basis: input.basis,
          evidence,
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "book_id" },
      )
      .select("book_id");
    if (error) return { success: false, code: error.code === "23503" ? "not_found" : "failed", detail: error.message };
    if (!data?.length) return { success: false, code: "not_found" };
    await logAdminAction(user.id, "book.rights_confirmed", "book_rights", input.bookId, { count: 1 });
    revalidateLocalizedPath(PAGE);
    return { success: true, count: 1 };
  } catch (error) {
    return toResult(error);
  }
}

/**
 * Confirm the draft of every unreviewed row in one explicit set. The set is
 * re-derived here from the filter — the browser sends no ids — and the write
 * happens only if it is still the size the reviewer confirmed.
 */
export async function bulkConfirmBookRights(input: {
  draftBasis: string;
  source?: string | null;
  expectedCount: number;
}): Promise<BookRightsResult> {
  try {
    const { supabase, user } = await open();
    if (!isRightsBasis(input.draftBasis) || input.draftBasis === "unknown") return { success: false, code: "invalid" };
    if (input.source && !SOURCE_RE.test(input.source)) return { success: false, code: "invalid" };
    if (!Number.isInteger(input.expectedCount) || input.expectedCount < 1) return { success: false, code: "invalid" };

    const set = await pagedScan<{ book_id: string }>(
      (from, to) => {
        let q = supabase.from("book_rights").select("book_id").is("basis", null).eq("draft_basis", input.draftBasis);
        if (input.source) q = q.eq("draft_source", input.source);
        return q.order("book_id").range(from, to);
      },
      50_000,
    );
    if (set.error) return { success: false, code: "failed" };
    const ids = set.data.map((r) => r.book_id);
    if (ids.length !== input.expectedCount) return { success: false, code: "stale" };

    const now = new Date().toISOString();
    let count = 0;
    // UUIDs are fixed-length: 100 per `.in()` keeps the request line short.
    for (let i = 0; i < ids.length; i += 100) {
      const chunk = ids.slice(i, i + 100);
      const { data, error } = await supabase
        .from("book_rights")
        .update({ basis: input.draftBasis as RightsBasis, reviewed_by: user.id, reviewed_at: now, updated_at: now })
        .in("book_id", chunk)
        .is("basis", null)
        .select("book_id");
      if (error) return { success: false, code: "failed", detail: error.message };
      count += data?.length ?? 0;
    }
    await logAdminAction(user.id, "book.rights_confirmed", "book_rights", undefined, { count, bulk: true });
    revalidateLocalizedPath(PAGE);
    return { success: true, count };
  } catch (error) {
    return toResult(error);
  }
}

type BookForDraft = {
  id: string;
  publisher: string | null;
  isbn: string | null;
  authors: { name: string | null } | null;
};

/** Draft a basis for up to DRAFT_BATCH books that have no row yet. */
export async function generateRightsDrafts(): Promise<BookRightsResult> {
  try {
    const { supabase, user } = await open();
    const [books, existing] = await Promise.all([
      pagedScan<BookForDraft>(
        (from, to) => supabase.from("books").select("id, publisher, isbn, authors(name)").order("id").range(from, to),
        50_000,
      ),
      pagedScan<{ book_id: string }>(
        (from, to) => supabase.from("book_rights").select("book_id").order("book_id").range(from, to),
        50_000,
      ),
    ]);
    if (books.error || existing.error) return { success: false, code: "failed" };
    const have = new Set(existing.data.map((r) => r.book_id));
    const missing = books.data.filter((b) => !have.has(b.id));
    const batch = missing.slice(0, DRAFT_BATCH);

    const rows = batch.map((b) => {
      const draft = draftRightsBasis({ publisher: b.publisher, authors: [b.authors?.name], isbn: b.isbn });
      return { book_id: b.id, draft_basis: draft.basis, draft_source: draft.source };
    });
    let count = 0;
    for (let i = 0; i < rows.length; i += 200) {
      // ignoreDuplicates: a row that appeared meanwhile — possibly reviewed —
      // is left exactly as it is.
      const { data, error } = await supabase
        .from("book_rights")
        .upsert(rows.slice(i, i + 200), { onConflict: "book_id", ignoreDuplicates: true })
        .select("book_id");
      if (error) return { success: false, code: "failed", detail: error.message };
      count += data?.length ?? 0;
    }
    await logAdminAction(user.id, "book.rights_drafts_generated", "book_rights", undefined, {
      count,
      remaining: missing.length - batch.length,
    });
    revalidateLocalizedPath(PAGE);
    return { success: true, count, remaining: missing.length - batch.length };
  } catch (error) {
    return toResult(error);
  }
}

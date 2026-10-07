"use server";

// Type, grade and part as confirmed data (migration 0175, SEO audit 2026-10
// WI-6; owner decision D-C = yes).
//
// A rule drafts into the PRIVATE book_classification_drafts table; only
// confirmBookClassification and bulkConfirmClassification write the public
// columns on `books`, and only behind `books.classification.review`. A draft
// never reaches `books`. Every confirmation is audited (ids and counts).

import { requireAction } from "@/lib/admin/route-guard";
import { logAdminAction } from "@/app/actions/audit";
import { rateLimit } from "@/lib/rate-limit";
import { revalidateBook, revalidateLocalizedPath } from "@/lib/cache/revalidate";
import { pagedScan } from "@/lib/db/paged-scan";
import { draftClassification, draftKey, isResourceType } from "@/lib/books/classification/draft";

export type ClassificationResult =
  | { success: true; count?: number; remaining?: number }
  | { success: false; code: "forbidden" | "rate_limited" | "invalid" | "not_found" | "stale" | "failed"; detail?: string };

const PAGE = "/admin/data-quality/classification";
const DRAFT_BATCH = 500;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Admin = Awaited<ReturnType<typeof requireAction>>;

async function open(): Promise<Admin> {
  const admin = await requireAction("books.classification.review");
  const { success } = await rateLimit(`book-classification:${admin.user.id}`, 60, 60_000);
  if (!success) throw Object.assign(new Error("rate_limited"), { code: "rate_limited" as const });
  return admin;
}

function toResult(error: unknown): ClassificationResult {
  const code = (error as { code?: string })?.code;
  if (code === "rate_limited") return { success: false, code: "rate_limited" };
  const status = (error as { status?: number })?.status;
  if (status === 403 || status === 401) return { success: false, code: "forbidden" };
  return { success: false, code: "failed", detail: error instanceof Error ? error.message : undefined };
}

export type ClassificationValues = {
  resourceType: string | null;
  gradeFrom: number | null;
  gradeTo: number | null;
  partNo: number | null;
};

/** The values a confirmation may write, or null when they are not coherent. */
function validValues(v: ClassificationValues) {
  const g = (n: number | null) => n === null || (Number.isInteger(n) && n >= 0 && n <= 12);
  if (v.resourceType !== null && !isResourceType(v.resourceType)) return null;
  if (!g(v.gradeFrom) || !g(v.gradeTo)) return null;
  if ((v.gradeFrom === null) !== (v.gradeTo === null)) return null;
  if (v.gradeFrom !== null && v.gradeTo !== null && v.gradeTo < v.gradeFrom) return null;
  if (v.partNo !== null && !(Number.isInteger(v.partNo) && v.partNo > 0 && v.partNo < 100)) return null;
  if (v.resourceType === null && v.gradeFrom === null && v.partNo === null) return null;
  return {
    resource_type: v.resourceType,
    grade_from: v.gradeFrom,
    grade_to: v.gradeTo,
    part_no: v.partNo,
  };
}

/** Confirm one book: the librarian's values (edited from the draft, or not). */
export async function confirmBookClassification(input: { bookId: string } & ClassificationValues): Promise<ClassificationResult> {
  try {
    const { supabase, user } = await open();
    if (!UUID_RE.test(input.bookId)) return { success: false, code: "invalid" };
    const values = validValues(input);
    if (!values) return { success: false, code: "invalid" };
    const { data, error } = await supabase
      .from("books")
      .update({
        ...values,
        classification_status: "confirmed",
        classification_reviewed_by: user.id,
        classification_reviewed_at: new Date().toISOString(),
      })
      .eq("id", input.bookId)
      .select("id, slug");
    if (error) return { success: false, code: "failed", detail: error.message };
    if (!data?.length) return { success: false, code: "not_found" };
    await logAdminAction(user.id, "book.classification_confirmed", "books", input.bookId, { count: 1 });
    revalidateBook(data[0].slug);
    revalidateLocalizedPath(PAGE);
    return { success: true, count: 1 };
  } catch (error) {
    return toResult(error);
  }
}

type DraftRow = {
  book_id: string;
  resource_type: string | null;
  grade_from: number | null;
  grade_to: number | null;
  part_no: number | null;
};

/**
 * Confirm every still-unconfirmed book whose draft is exactly `key`. The set
 * is re-derived here; it is written only if it still has `expectedCount`
 * members — the count the dialog showed.
 */
export async function bulkConfirmClassification(input: { key: string; expectedCount: number }): Promise<ClassificationResult> {
  try {
    const { supabase, user } = await open();
    if (typeof input.key !== "string" || !Number.isInteger(input.expectedCount) || input.expectedCount < 1) {
      return { success: false, code: "invalid" };
    }
    const [drafts, unconfirmed] = await Promise.all([
      pagedScan<DraftRow>(
        (from, to) =>
          supabase
            .from("book_classification_drafts")
            .select("book_id, resource_type, grade_from, grade_to, part_no")
            .order("book_id")
            .range(from, to),
        50_000,
      ),
      pagedScan<{ id: string }>(
        (from, to) => supabase.from("books").select("id").neq("classification_status", "confirmed").order("id").range(from, to),
        50_000,
      ),
    ]);
    if (drafts.error || unconfirmed.error) return { success: false, code: "failed" };
    const open_ = new Set(unconfirmed.data.map((r) => r.id));
    const set = drafts.data.filter(
      (d) =>
        open_.has(d.book_id) &&
        draftKey({ resourceType: d.resource_type as never, gradeFrom: d.grade_from, gradeTo: d.grade_to, partNo: d.part_no }) ===
          input.key,
    );
    if (set.length !== input.expectedCount) return { success: false, code: "stale" };
    const values = validValues({
      resourceType: set[0]?.resource_type ?? null,
      gradeFrom: set[0]?.grade_from ?? null,
      gradeTo: set[0]?.grade_to ?? null,
      partNo: set[0]?.part_no ?? null,
    });
    if (!values) return { success: false, code: "invalid" };

    const now = new Date().toISOString();
    let count = 0;
    for (let i = 0; i < set.length; i += 100) {
      const ids = set.slice(i, i + 100).map((d) => d.book_id);
      const { data, error } = await supabase
        .from("books")
        .update({ ...values, classification_status: "confirmed", classification_reviewed_by: user.id, classification_reviewed_at: now })
        .in("id", ids)
        .neq("classification_status", "confirmed")
        .select("id");
      if (error) return { success: false, code: "failed", detail: error.message };
      count += data?.length ?? 0;
    }
    await logAdminAction(user.id, "book.classification_confirmed", "books", undefined, { count, bulk: true });
    revalidateLocalizedPath(PAGE);
    return { success: true, count };
  } catch (error) {
    return toResult(error);
  }
}

type BookForDraft = {
  id: string;
  title: string | null;
  classification_status: string | null;
  categories: { name: string | null } | null;
};

/** Draft up to DRAFT_BATCH books that have neither a draft nor a confirmation. */
export async function generateClassificationDrafts(): Promise<ClassificationResult> {
  try {
    const { supabase, user } = await open();
    const [books, existing] = await Promise.all([
      pagedScan<BookForDraft>(
        (from, to) =>
          supabase.from("books").select("id, title, classification_status, categories(name)").order("id").range(from, to),
        50_000,
      ),
      pagedScan<{ book_id: string }>(
        (from, to) => supabase.from("book_classification_drafts").select("book_id").order("book_id").range(from, to),
        50_000,
      ),
    ]);
    if (books.error || existing.error) return { success: false, code: "failed" };
    const have = new Set(existing.data.map((r) => r.book_id));
    const candidates = books.data.filter((b) => b.classification_status === "none" && !have.has(b.id));

    // Read EVERY candidate (pure, cheap) and bound only the WRITES. Bounding
    // the read instead would re-read the same unreadable titles on every
    // press and never reach the rest of the queue.
    const drafts = candidates.flatMap((b) => {
      const d = draftClassification(b.title, b.categories?.name);
      return d
        ? [{ book_id: b.id, resource_type: d.resourceType, grade_from: d.gradeFrom, grade_to: d.gradeTo, part_no: d.partNo, rule: d.rule }]
        : [];
    });
    const rows = drafts.slice(0, DRAFT_BATCH);
    let count = 0;
    for (let i = 0; i < rows.length; i += 200) {
      const chunk = rows.slice(i, i + 200);
      const { data, error } = await supabase
        .from("book_classification_drafts")
        .upsert(chunk, { onConflict: "book_id", ignoreDuplicates: true })
        .select("book_id");
      if (error) return { success: false, code: "failed", detail: error.message };
      const drafted = (data ?? []).map((r) => r.book_id as string);
      count += drafted.length;
      if (drafted.length) {
        const { error: statusError } = await supabase
          .from("books")
          .update({ classification_status: "draft" })
          .in("id", drafted)
          .eq("classification_status", "none")
          .select("id");
        if (statusError) return { success: false, code: "failed", detail: statusError.message };
      }
    }
    const remaining = drafts.length - rows.length;
    await logAdminAction(user.id, "book.classification_drafts_generated", "books", undefined, { count, remaining });
    revalidateLocalizedPath(PAGE);
    return { success: true, count, remaining };
  } catch (error) {
    return toResult(error);
  }
}

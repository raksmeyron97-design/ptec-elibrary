"use server";

// Editorial review workflow (migrations 0061 → 0086): books and theses move
// through draft → needs_review → in_review → verified/changes_requested →
// published/scheduled/archived, with provenance (created_by/updated_by),
// reviewer assignment, review notes, and version history captured by DB
// trigger (content_versions).
//
// Pre-migration safety: until 0086 is applied, the workflow columns don't
// exist — every select/update falls back to the 0061/0075 column set (the
// same rich-select → legacy-select pattern used when 0062 shipped), so the
// queue keeps working with the old approve/reject semantics.
//
// Role separation lives in lib/content-status.ts (canActorTransition):
// librarians cannot verify their own records; admins can, but the action is
// audit-logged as a self-approval override.

import { revalidatePath, revalidateTag } from "next/cache";
import { requireLibrarian, requirePermission } from "@/lib/auth/requireAdmin";
import { logAdminAction } from "@/app/actions/audit";
import {
  canActorTransition,
  canonicalize,
  type CanonicalStatus,
} from "@/lib/content-status";
import { evaluateQuality, type QualityReport } from "@/lib/metadata-quality";
import { apa } from "@/lib/citations";
import { SITE_URL } from "@/lib/seo/site";

export type ReviewItemType = "book" | "research";

/** Kept for backward compatibility with older imports. */
export type ReviewStatus = "pending_review" | "rejected";

export type ReviewPerson = { id: string; name: string };

export type ReviewItem = {
  id: string;
  type: ReviewItemType;
  title: string;
  author: string;
  coverUrl: string | null;
  status: CanonicalStatus;
  createdAt: string;
  submittedAt: string | null;
  verifiedAt: string | null;
  reviewNote: string | null;
  createdBy: ReviewPerson | null;
  assignedReviewer: ReviewPerson | null;
  license: string | null;
  quality: QualityReport;
  /** APA line built strictly from stored fields — what an export would emit */
  citationPreview: string;
  /** Admin edit page for the record */
  editUrl: string;
  /** Public page (side-by-side preview target); null when not derivable */
  previewUrl: string | null;
};

const QUEUE_STATUSES = [
  "imported",
  "needs_review",
  "pending_review",
  "in_review",
  "changes_requested",
  "rejected",
  "verified",
  "scheduled",
] as const;

const WORKFLOW_COLS =
  "created_by, updated_by, review_note, assigned_reviewer, submitted_at, verified_at, license";

const BOOK_BASE_COLS =
  "id, title, slug, cover_url, status, created_at, language, published_at, description, category_id, isbn, pages, tags, authors(name)";
const RESEARCH_BASE_COLS =
  "id, title, cover_url, status, created_at, author_names, advisor_name, abstract, academic_year, file_url, file_size_kb, keywords, doi, department_id";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

/** 42703 = unknown column in SELECT; PGRST204 = unknown column in write. */
function isMissingColumn(error: { code?: string } | null): boolean {
  return error?.code === "42703" || error?.code === "PGRST204";
}

async function fetchQueueRows(db: Db, table: string, baseCols: string): Promise<{ rows: Row[]; hasWorkflowCols: boolean }> {
  const rich = await db
    .from(table)
    .select(`${baseCols}, ${WORKFLOW_COLS}`)
    .in("status", QUEUE_STATUSES as unknown as string[])
    .order("created_at", { ascending: false });
  if (!rich.error) return { rows: rich.data ?? [], hasWorkflowCols: true };
  if (!isMissingColumn(rich.error)) throw new Error(rich.error.message);

  const basic = await db
    .from(table)
    .select(baseCols)
    .in("status", ["pending_review", "rejected"])
    .order("created_at", { ascending: false });
  if (basic.error) throw new Error(basic.error.message);
  return { rows: basic.data ?? [], hasWorkflowCols: false };
}

async function fetchPeople(db: Db, ids: string[]): Promise<Map<string, ReviewPerson>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return new Map();
  const { data } = await db.from("profiles").select("id, full_name, email").in("id", unique);
  const map = new Map<string, ReviewPerson>();
  for (const p of data ?? []) {
    map.set(p.id, { id: p.id, name: p.full_name || p.email || "Unknown" });
  }
  return map;
}

function yearOf(row: Row, isBook: boolean): string | null {
  const source = isBook ? row.published_at : (row.published_at ?? row.academic_year);
  const match = typeof source === "string" ? source.match(/\b(1[89]|20)\d{2}\b/) : null;
  return match ? match[0] : null;
}

function toItem(type: ReviewItemType, row: Row, people: Map<string, ReviewPerson>): ReviewItem {
  const isBook = type === "book";
  const author = isBook ? (row.authors?.name ?? "Unknown") : (row.author_names ?? "Unknown");
  const previewUrl = isBook ? (row.slug ? `/books/${row.slug}` : null) : `/theses/${row.id}`;
  return {
    id: row.id,
    type,
    title: row.title,
    author,
    coverUrl: row.cover_url ?? null,
    status: canonicalize(row.status),
    createdAt: row.created_at,
    submittedAt: row.submitted_at ?? null,
    verifiedAt: row.verified_at ?? null,
    reviewNote: row.review_note ?? null,
    createdBy: row.created_by ? (people.get(row.created_by) ?? null) : null,
    assignedReviewer: row.assigned_reviewer ? (people.get(row.assigned_reviewer) ?? null) : null,
    license: row.license ?? null,
    quality: evaluateQuality(isBook ? "book" : "thesis", row),
    citationPreview: apa({
      kind: isBook ? "book" : "thesis",
      title: row.title ?? "",
      authors: author && author !== "Unknown" ? [author] : [],
      year: yearOf(row, isBook),
      noteType: isBook ? null : "Thesis",
      doi: row.doi ?? null,
      url: previewUrl ? `${SITE_URL}${previewUrl}` : SITE_URL,
    }),
    editUrl: isBook ? `/admin/edit/${row.id}` : `/admin/theses/edit/${row.id}`,
    previewUrl,
  };
}

export async function getReviewQueue(): Promise<ReviewItem[]> {
  const { supabase } = await requireLibrarian();

  const [books, research] = await Promise.all([
    fetchQueueRows(supabase, "books", BOOK_BASE_COLS),
    fetchQueueRows(supabase, "research_reports", RESEARCH_BASE_COLS),
  ]);

  const personIds = [...books.rows, ...research.rows].flatMap((r) =>
    [r.created_by, r.assigned_reviewer].filter(Boolean),
  ) as string[];
  const people = await fetchPeople(supabase, personIds);

  const items = [
    ...books.rows.map((r) => toItem("book", r, people)),
    ...research.rows.map((r) => toItem("research", r, people)),
  ];
  return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Reviewer candidates for the assign dropdown (librarian and above). */
export async function getReviewerOptions(): Promise<ReviewPerson[]> {
  const { supabase } = await requireLibrarian();
  const { data } = await supabase
    .from("profiles")
    .select("id, full_name, email, role")
    .in("role", ["librarian", "admin", "super_admin"])
    .order("full_name", { ascending: true });
  return (data ?? []).map((p: Row) => ({ id: p.id, name: p.full_name || p.email || "Unknown" }));
}

/** Count shown as the sidebar badge; returns 0 on any failure. */
export async function getPendingReviewCount(): Promise<number> {
  try {
    const { supabase } = await requireLibrarian();
    const actionable = ["needs_review", "pending_review", "in_review"];
    const [{ count: books }, { count: research }] = await Promise.all([
      supabase.from("books").select("id", { count: "exact", head: true }).in("status", actionable),
      supabase.from("research_reports").select("id", { count: "exact", head: true }).in("status", actionable),
    ]);
    return (books ?? 0) + (research ?? 0);
  } catch {
    return 0;
  }
}

function revalidateFor(type: ReviewItemType) {
  if (type === "book") {
    revalidateTag("books", "max");
    revalidatePath("/books");
  } else {
    revalidatePath("/theses");
  }
  revalidatePath("/");
  revalidatePath("/admin/review");
}

type ActionResult = { success: true } | { error: string };

/**
 * Core state-machine transition. `note` is required for changes_requested
 * (the recorded reason) and stored on the row for every transition that
 * carries one. `emergency` lets admins bypass the state machine for
 * authorized corrections — always audit-logged as an override.
 */
export async function transitionContent(
  type: ReviewItemType,
  id: string,
  to: CanonicalStatus,
  opts?: { note?: string; scheduledAt?: string; emergency?: boolean },
): Promise<ActionResult> {
  try {
    const resource = type === "book" ? "books" : "research";
    const { supabase, user, role } = await requirePermission(resource, "write");
    const table = type === "book" ? "books" : "research_reports";
    const note = opts?.note?.trim() || null;

    if (to === "changes_requested" && !note) {
      return { error: "A reason is required when requesting changes" };
    }

    // Current row: status + creator for the role-separation check.
    let current: Row | null = null;
    {
      const rich = await supabase.from(table).select("id, title, status, created_by").eq("id", id).maybeSingle();
      if (rich.error && isMissingColumn(rich.error)) {
        const basic = await supabase.from(table).select("id, title, status").eq("id", id).maybeSingle();
        if (basic.error) return { error: basic.error.message };
        current = basic.data;
      } else if (rich.error) {
        return { error: rich.error.message };
      } else {
        current = rich.data;
      }
    }
    if (!current) return { error: "Record not found" };

    const isOwnContent = Boolean(current.created_by && current.created_by === user.id);
    const emergency = Boolean(opts?.emergency) && (role === "admin" || role === "super_admin");

    let override: string | null = emergency ? "emergency" : null;
    if (!emergency) {
      const check = canActorTransition({ role, from: current.status, to, isOwnContent });
      if (!check.allowed) return { error: check.reason ?? "Transition not allowed" };
      if (check.override) override = check.override;
    }

    const now = new Date().toISOString();
    const updates: Row = { status: to, updated_by: user.id };
    if (note !== null) updates.review_note = note;
    if (to === "needs_review") updates.submitted_at = now;
    if (to === "verified" || to === "published") {
      updates.verified_at = now;
      updates.verified_by = user.id;
    }
    if (to === "scheduled") {
      if (!opts?.scheduledAt) return { error: "A publish date is required to schedule" };
      updates.scheduled_at = opts.scheduledAt;
    }

    let { data: row, error } = await supabase.from(table).update(updates).eq("id", id).select("title").maybeSingle();
    if (error && isMissingColumn(error)) {
      // Pre-0086 fallback: only the 0061/0062 columns exist.
      const legacy: Row = { status: to === "changes_requested" ? "rejected" : to };
      if (to === "published") {
        legacy.verified_at = now;
        legacy.verified_by = user.id;
      }
      ({ data: row, error } = await supabase.from(table).update(legacy).eq("id", id).select("title").maybeSingle());
    }
    if (error) return { error: error.message };
    if (!row) return { error: "Record not found" };

    await logAdminAction(user.id, `content.${to}`, table, id, {
      title: row.title,
      from: canonicalize(current.status),
      ...(note ? { note } : {}),
      ...(override ? { override } : {}),
    });

    revalidateFor(type);
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Update failed" };
  }
}

/** Assign (or clear) a reviewer. Requires 0086; fails gracefully before it. */
export async function assignReviewer(
  type: ReviewItemType,
  id: string,
  reviewerId: string | null,
): Promise<ActionResult> {
  try {
    const { supabase, user } = await requireLibrarian();
    const table = type === "book" ? "books" : "research_reports";
    const { error } = await supabase
      .from(table)
      .update({ assigned_reviewer: reviewerId, updated_by: user.id })
      .eq("id", id);
    if (error) {
      if (isMissingColumn(error)) return { error: "Reviewer assignment needs migration 0086 applied" };
      return { error: error.message };
    }
    await logAdminAction(user.id, "content.assign_reviewer", table, id, { reviewerId });
    revalidatePath("/admin/review");
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Update failed" };
  }
}

// ── Backward-compatible wrappers (pre-0086 call sites & simple buttons) ──

export async function approveContent(type: ReviewItemType, id: string) {
  return transitionContent(type, id, "published");
}

export async function rejectContent(type: ReviewItemType, id: string, note?: string) {
  return transitionContent(type, id, "changes_requested", {
    note: note ?? "Rejected without a stated reason (legacy action)",
  });
}

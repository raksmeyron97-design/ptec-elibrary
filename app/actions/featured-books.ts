"use server";

// The "Featured by PTEC Library" shelf (migration 0149).
//
// Three mutations — feature, unfeature, reorder — and one read. They follow
// the conventions of app/actions/ebooks.ts exactly: the named action policy
// from lib/admin/access-policy.ts is the gate, lib/books/featured.ts is the
// rule, logAdminAction is the record, and lib/cache/revalidate.ts is the
// invalidation. There is no second permission helper, no second audit table
// and no second copy of the eligibility rule.
//
// The one thing worth reading twice is the concurrency contract on
// reorderFeaturedBooks(): the client sends the order it SAW, and the database
// function refuses it if the shelf has changed underneath. Two librarians
// cannot silently overwrite one another.

import { requireAction } from "@/lib/admin/route-guard";
import { logAdminAction } from "@/app/actions/audit";
import { revalidateLocalizedPath as revalidatePath, revalidateBook } from "@/lib/cache/revalidate";
import { rateLimit } from "@/lib/rate-limit";
import {
  assessFeatureEligibility,
  isReorderOf,
  type FeatureBlocker,
} from "@/lib/books/featured";
import { EBOOKS_BASE_PATH, EBOOKS_FEATURED_PATH } from "@/lib/admin/ebooks-url";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Machine-readable outcomes. The client turns each into translated copy, so
 * an error message is never an untranslated English sentence from the server
 * and never a raw Postgres string.
 */
export type FeaturedErrorCode =
  | "invalid_id"
  | "forbidden"
  | "rate_limited"
  | "not_found"
  | "not_published"
  | "not_verified"
  | "already_featured"
  | "not_featured"
  | "stale_order"
  | "migration_missing"
  | "failed";

export type FeaturedResult =
  | { success: true; position?: number }
  | { success: false; code: FeaturedErrorCode; detail?: string };

/** A book on the shelf, as the management page needs it. */
export type FeaturedBookRow = {
  id: string;
  title: string;
  slug: string;
  coverUrl: string | null;
  author: string | null;
  category: string | null;
  position: number;
  featuredAt: string;
  featuredBy: { id: string; name: string } | null;
  /** Live values, so the page can flag a row that no longer qualifies. */
  status: string;
  verifiedAt: string | null;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

/** 42703 = unknown column in SELECT; PGRST204 = unknown column in write. */
function isMissingColumn(error: { code?: string; message?: string } | null): boolean {
  return error?.code === "42703" || error?.code === "PGRST204";
}

/** 42883 = the RPC itself does not exist yet. */
function isMissingFunction(error: { code?: string; message?: string } | null): boolean {
  return error?.code === "42883" || (error?.message ?? "").includes("set_featured_book_order");
}

const SELECT_COLS =
  "id, title, slug, cover_url, status, verified_at, featured_at, featured_by, featured_position, authors(name), categories(name)";

function relName(rel: unknown): string | null {
  if (Array.isArray(rel)) return (rel[0] as { name?: string })?.name ?? null;
  return (rel as { name?: string } | null)?.name ?? null;
}

const BLOCKER_CODE: Record<FeatureBlocker, FeaturedErrorCode> = {
  not_published: "not_published",
  not_verified: "not_verified",
};

/**
 * Every mutation here runs the same three steps first: the named policy, a
 * rate limit, and the live row. Sharing them is what keeps the three actions
 * from drifting into three slightly different gates.
 */
async function openMutation(actionId: string) {
  const admin = await requireAction(actionId);
  const { success } = await rateLimit(`book-feature:${admin.user.id}`, 40, 60_000);
  if (!success) throw Object.assign(new Error("rate_limited"), { code: "rate_limited" as const });
  return admin;
}

function toResult(error: unknown): FeaturedResult {
  const code = (error as { code?: string })?.code;
  if (code === "rate_limited") return { success: false, code: "rate_limited" };
  const status = (error as { status?: number })?.status;
  if (status === 403 || status === 401) return { success: false, code: "forbidden" };
  return {
    success: false,
    code: "failed",
    detail: error instanceof Error ? error.message : undefined,
  };
}

/**
 * Invalidate everything a curation change touches.
 *
 * `affectsHome` is false on purpose: the homepage shelves are ranked by
 * download and view counts (see revalidateBook's own note) and curation does
 * not feed them. The featured shelf lives on /books, which revalidateBook
 * already covers — and the admin pages are listed explicitly because they read
 * the same rows through the service client.
 */
function revalidateShelf(slug?: string | null) {
  revalidateBook(slug, { affectsHome: false });
  revalidatePath(EBOOKS_FEATURED_PATH);
  revalidatePath(EBOOKS_BASE_PATH);
}

// ── Read ────────────────────────────────────────────────────────────────────

/**
 * The shelf, in public order.
 *
 * READ-level, like the collection workspace it lives in: a `books: read`
 * account may see what the library is promoting and none of the controls that
 * change it. Two queries, never N+1 — one for the books, one for the
 * librarians who featured them.
 */
export async function getFeaturedBooksAdmin(): Promise<{
  rows: FeaturedBookRow[];
  /** True when the columns are not in the database yet (0149 not applied). */
  unavailable: boolean;
}> {
  const { supabase } = await requireAction("books.featured.view");

  const { data, error } = await supabase
    .from("books")
    .select(SELECT_COLS)
    .not("featured_at", "is", null)
    .order("featured_position", { ascending: true });

  if (error) {
    if (isMissingColumn(error)) return { rows: [], unavailable: true };
    throw new Error(error.message);
  }

  const rows = (data ?? []) as Row[];
  const curatorIds = [...new Set(rows.map((r) => r.featured_by).filter(Boolean))] as string[];
  const curators = new Map<string, { id: string; name: string }>();
  if (curatorIds.length > 0) {
    const { data: people } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .in("id", curatorIds);
    for (const p of (people ?? []) as Row[]) {
      curators.set(p.id, { id: p.id, name: p.full_name || p.email || "Unknown" });
    }
  }

  return {
    unavailable: false,
    rows: rows.map((r, i) => ({
      id: r.id,
      title: r.title,
      slug: r.slug,
      coverUrl: r.cover_url ?? null,
      author: relName(r.authors),
      category: relName(r.categories),
      // Trust the stored position for ordering, but present a contiguous
      // 1..n index: a gap left by a failed write is a display artefact, not
      // something a librarian should have to reason about.
      position: i + 1,
      featuredAt: r.featured_at,
      featuredBy: r.featured_by ? (curators.get(r.featured_by) ?? null) : null,
      status: r.status ?? "draft",
      verifiedAt: r.verified_at ?? null,
    })),
  };
}

// ── Feature ─────────────────────────────────────────────────────────────────

/**
 * Add a book to the shelf, at the end.
 *
 * Appending rather than inserting is deliberate: an insert at position N
 * renumbers every book below it, which is a public reordering the librarian
 * did not ask for. They place it where they want it on the management page,
 * where the move is visible and saved on purpose.
 */
export async function featureBook(bookId: string): Promise<FeaturedResult> {
  if (!UUID_RE.test(bookId)) return { success: false, code: "invalid_id" };

  try {
    const { supabase, user } = await openMutation("books.feature");

    const { data: book, error: readError } = await supabase
      .from("books")
      .select("id, title, slug, status, verified_at, featured_at")
      .eq("id", bookId)
      .maybeSingle();
    if (readError) {
      if (isMissingColumn(readError)) return { success: false, code: "migration_missing" };
      return { success: false, code: "failed", detail: readError.message };
    }
    if (!book) return { success: false, code: "not_found" };
    if (book.featured_at) return { success: false, code: "already_featured" };

    // The server decides eligibility, from the live row, through the same pure
    // function the row menu used to decide whether to draw the control.
    const { eligible, blockers } = assessFeatureEligibility({
      status: book.status,
      verifiedAt: book.verified_at,
    });
    if (!eligible) return { success: false, code: BLOCKER_CODE[blockers[0]] };

    const { data: last } = await supabase
      .from("books")
      .select("featured_position")
      .not("featured_at", "is", null)
      .order("featured_position", { ascending: false })
      .limit(1)
      .maybeSingle();
    const position = ((last?.featured_position as number | null) ?? 0) + 1;

    const { data: updated, error } = await supabase
      .from("books")
      .update({
        featured_at: new Date().toISOString(),
        featured_by: user.id,
        featured_position: position,
      })
      .eq("id", bookId)
      // The guard against a double submit: a second click finds featured_at
      // already set and changes no row, rather than minting a second slot.
      .is("featured_at", null)
      .select("id, title, slug, featured_position")
      .maybeSingle();

    if (error) {
      if (isMissingColumn(error)) return { success: false, code: "migration_missing" };
      return { success: false, code: "failed", detail: error.message };
    }
    // Zero rows changed. The row exists (we just read it), so the only way
    // here is a concurrent feature — report it as such rather than as success.
    if (!updated) return { success: false, code: "already_featured" };

    await logAdminAction(user.id, "book.featured", "books", bookId, {
      title: updated.title,
      position: updated.featured_position,
    });

    revalidateShelf(updated.slug);
    return { success: true, position: updated.featured_position as number };
  } catch (error) {
    return toResult(error);
  }
}

// ── Unfeature ───────────────────────────────────────────────────────────────

/**
 * Take a book off the shelf. It stays published.
 *
 * That sentence is the whole contract, and it is why this action writes only
 * the three curation columns: `status`, `is_published` and `verified_at` are
 * not in the update object at all, so there is no path by which unfeaturing
 * can unpublish. The gap it leaves is closed by renumbering the rest.
 */
export async function unfeatureBook(bookId: string): Promise<FeaturedResult> {
  if (!UUID_RE.test(bookId)) return { success: false, code: "invalid_id" };

  try {
    const { supabase, user } = await openMutation("books.feature");

    const { data: cleared, error } = await supabase
      .from("books")
      .update({ featured_at: null, featured_by: null, featured_position: null })
      .eq("id", bookId)
      .not("featured_at", "is", null)
      .select("id, title, slug")
      .maybeSingle();

    if (error) {
      if (isMissingColumn(error)) return { success: false, code: "migration_missing" };
      return { success: false, code: "failed", detail: error.message };
    }
    // A mutation that never asks for its affected rows cannot know whether it
    // changed any (lib/db/changed-row.ts's reasoning): no row here means the
    // book was already off the shelf, which is the requested state — but it is
    // reported honestly rather than as a change that happened.
    if (!cleared) return { success: false, code: "not_featured" };

    // Close the gap. A failure here leaves the shelf correct but with a hole
    // in the numbering, which the read path already presents contiguously —
    // so it is logged, not surfaced as a failed unfeature.
    const { data: remaining } = await supabase
      .from("books")
      .select("id")
      .not("featured_at", "is", null)
      .order("featured_position", { ascending: true });
    const ids = ((remaining ?? []) as Row[]).map((r) => r.id as string);
    const { error: renumberError } = await supabase.rpc("set_featured_book_order", { p_ids: ids });
    if (renumberError && !isMissingFunction(renumberError)) {
      console.error("[unfeatureBook] renumber failed:", renumberError.message);
    }

    await logAdminAction(user.id, "book.unfeatured", "books", bookId, { title: cleared.title });

    revalidateShelf(cleared.slug);
    return { success: true };
  } catch (error) {
    return toResult(error);
  }
}

// ── Reorder ─────────────────────────────────────────────────────────────────

/**
 * Apply a new public order.
 *
 * `orderedIds` must be exactly the shelf the librarian was looking at, in the
 * order they want it. Two checks, deliberately not one:
 *
 *   1. Here, against the rows this request reads — so a stale page is refused
 *      before it spends a write, with a message that says the shelf changed.
 *   2. Inside set_featured_book_order(), against the rows at write time — the
 *      guarantee, because between (1) and the write another librarian can
 *      still act. It raises 40001 and the whole renumber rolls back; there is
 *      no half-applied order.
 */
export async function reorderFeaturedBooks(orderedIds: string[]): Promise<FeaturedResult> {
  if (!Array.isArray(orderedIds) || orderedIds.some((id) => !UUID_RE.test(id))) {
    return { success: false, code: "invalid_id" };
  }

  try {
    const { supabase, user } = await openMutation("books.feature");

    const { data, error: readError } = await supabase
      .from("books")
      .select("id")
      .not("featured_at", "is", null)
      .order("featured_position", { ascending: true });
    if (readError) {
      if (isMissingColumn(readError)) return { success: false, code: "migration_missing" };
      return { success: false, code: "failed", detail: readError.message };
    }

    const current = ((data ?? []) as Row[]).map((r) => r.id as string);
    if (!isReorderOf(current, orderedIds)) return { success: false, code: "stale_order" };

    const { error } = await supabase.rpc("set_featured_book_order", { p_ids: orderedIds });
    if (error) {
      if (isMissingFunction(error)) return { success: false, code: "migration_missing" };
      // The database's own concurrency refusal (0149 raises SQLSTATE 40001).
      if (error.code === "40001" || (error.message ?? "").includes("featured_set_changed")) {
        return { success: false, code: "stale_order" };
      }
      return { success: false, code: "failed", detail: error.message };
    }

    await logAdminAction(user.id, "book.feature_reordered", "books", undefined, {
      count: orderedIds.length,
      order: orderedIds,
    });

    revalidateShelf(null);
    return { success: true };
  } catch (error) {
    return toResult(error);
  }
}

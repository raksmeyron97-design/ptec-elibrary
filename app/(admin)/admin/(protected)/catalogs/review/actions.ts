"use server";
// app/admin/catalogs/review/actions.ts
// Review transitions for one Physical Library record (docs/CATALOG-REVIEW.md):
// claim, release, take over, verify, block, unblock, reopen.
//
// What these write: catalog_review_state, and one admin_audit_log row each.
// What they never write: catalog_books, catalog_copies, Koha. Editing the
// record is the existing updateCatalogBook (Koha first, three-way conflict
// check); "Verify & next" calls it first and calls verify only after it
// succeeded, and verify fingerprints the row AS STORED — never anything the
// browser says the record holds.
//
// Concurrency: every transition names the `version` it read. The write is a
// compare-and-set on that version (or an insert that collides on the primary
// key), so two librarians pressing at once cannot both claim or verify — the
// second is told the record changed, and nothing is overwritten.

import { requireAction } from "@/lib/admin/route-guard";
import { logAdminAction } from "@/app/actions/audit";
import { changedRow } from "@/lib/db/changed-row";
import { catalogReviewEnabled } from "@/lib/catalogs/review-flag";
import { loadReviewRow, reviewFingerprint, summariseCopies } from "@/lib/catalogs/review-server";
import {
  planReviewTransition,
  planTaskWaiver,
  reviewQueueOf,
  statusOf,
  type ReviewAction,
  type ReviewRow,
  type ReviewStatus,
  type TransitionRefusal,
  type WaiverPlan,
} from "@/lib/catalogs/review";
import { openBlockingTasks, reviewTasks, type ReviewTaskId, type TaskInput } from "@/lib/catalogs/review-tasks";

export type ReviewActionResult =
  | { ok: true; status: ReviewStatus; version: number; waivedTasks?: string[] }
  | {
      ok: false;
      error:
        | TransitionRefusal
        | WaiverRefusal
        | "open_tasks"
        | "stale"
        | "disabled"
        | "not_found"
        | "invalid"
        | "failed";
      /** Present on `stale`: the version the record holds now, so the page can offer a reload. */
      version?: number;
      /** Present on `open_tasks`: the blocking tasks verification is waiting on. */
      tasks?: ReviewTaskId[];
    };

type WaiverRefusal = Extract<WaiverPlan, { ok: false }>["reason"];
type Refused = Extract<ReviewActionResult, { ok: false }>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Columns verify reads: the fingerprinted fields, plus what the blocking tasks need. */
const BOOK_COLUMNS =
  "id, title, author, isbn, publisher, year, language, category, department, ddc, shelf_location, cover_url, description, keywords, catalog_copies(status, shelf_location)";

type BookRow = TaskInput & { id: string; keywords: string[] | null; catalog_copies: { status: string | null; shelf_location: string | null }[] | null };

/**
 * The one guarded entry: switch, then the registry, then the record and its
 * review row — and a press made against an older page is refused before
 * anything is planned, because what the librarian saw is not what the record is.
 */
type Prepared = {
  supabase: Awaited<ReturnType<typeof requireAction>>["supabase"];
  userId: string;
  book: BookRow;
  row: ReviewRow | null;
};

async function prepare(bookId: string, expectedVersion: number): Promise<{ refused: Refused } | Prepared> {
  if (!catalogReviewEnabled()) return { refused: { ok: false, error: "disabled" } as Refused };
  const { supabase, userId } = await requireAction("catalog.review.transition");

  if (typeof bookId !== "string" || !UUID.test(bookId)) return { refused: { ok: false, error: "invalid" } as Refused };
  if (!Number.isInteger(expectedVersion) || expectedVersion < 0) return { refused: { ok: false, error: "invalid" } as Refused };

  const { data, error: bookError } = await supabase.from("catalog_books").select(BOOK_COLUMNS).eq("id", bookId).maybeSingle();
  if (bookError) return { refused: { ok: false, error: "failed" } as Refused };
  if (!data) return { refused: { ok: false, error: "not_found" } as Refused };
  const book = data as unknown as BookRow;

  const current = await loadReviewRow(supabase, bookId);
  if (!current.ok) return { refused: { ok: false, error: "failed" } as Refused };
  const row = current.row;
  const heldVersion = row?.version ?? 0;
  if (heldVersion !== expectedVersion) return { refused: { ok: false, error: "stale", version: heldVersion } as Refused };

  return { supabase, userId, book, row };
}

/** Compare-and-set on the version read, or an insert that collides on the primary key. */
async function writeRow(p: Prepared, patch: Record<string, unknown>): Promise<{ version: number } | Refused> {
  const updatedAt = new Date().toISOString();
  if (!p.row) {
    const { error } = await p.supabase
      .from("catalog_review_state")
      .insert({ book_id: p.book.id, status: "needs_review", ...patch, version: 1, updated_at: updatedAt });
    // 23505: another librarian's first write landed between the read and this insert.
    if (error) return error.code === "23505" ? { ok: false, error: "stale" } : { ok: false, error: "failed" };
    return { version: 1 };
  }
  const written = changedRow<{ version: number }>(
    await p.supabase
      .from("catalog_review_state")
      .update({ ...patch, version: p.row.version + 1, updated_at: updatedAt })
      .eq("book_id", p.book.id)
      .eq("version", p.row.version)
      .select("version"),
  );
  if (!written.ok) return written.reason === "no_match" ? { ok: false, error: "stale" } : { ok: false, error: "failed" };
  return { version: written.row.version };
}

async function transition(
  bookId: string,
  action: ReviewAction,
  expectedVersion: number,
  extra: { block?: { reason: string; note?: string | null } } = {},
): Promise<ReviewActionResult> {
  const p = await prepare(bookId, expectedVersion);
  if ("refused" in p) return p.refused;

  // Verification waits on the blocking tasks of the record AS SAVED — the
  // editor saves first, so a subject typed a moment ago already counts.
  if (action === "verify") {
    const tasks = reviewTasks(p.book, summariseCopies(p.book.catalog_copies), false, p.row?.waivedTasks ?? []);
    const blocking = openBlockingTasks(tasks).map((t) => t.id);
    if (blocking.length) return { ok: false, error: "open_tasks", tasks: blocking };
  }

  const plan = planReviewTransition({
    action,
    row: p.row,
    actorId: p.userId,
    now: new Date(),
    fingerprint: action === "verify" ? reviewFingerprint(p.book) : null,
    block: extra.block,
  });
  if (!plan.ok) return { ok: false, error: plan.reason };

  const written = await writeRow(p, plan.patch);
  if ("ok" in written) return written;

  await logAdminAction(p.userId, `catalogReview.${action}`, "catalog_books", p.book.id, {
    from: plan.from,
    to: plan.to,
    queue: reviewQueueOf(p.book.language),
    ...(plan.previousHolder ? { previousHolder: plan.previousHolder } : {}),
    ...(plan.patch.blocked_reason ? { reason: plan.patch.blocked_reason } : {}),
  });

  return { ok: true, status: plan.to, version: written.version };
}

/** Waive or un-waive one task. Changes no review status, and never over someone else's fresh claim. */
async function waiver(bookId: string, expectedVersion: number, task: string, waive: boolean): Promise<ReviewActionResult> {
  const p = await prepare(bookId, expectedVersion);
  if ("refused" in p) return p.refused;

  const plan = planTaskWaiver({ row: p.row, actorId: p.userId, now: new Date(), task: typeof task === "string" ? task : "", waive });
  if (!plan.ok) return { ok: false, error: plan.reason };

  const written = await writeRow(p, { waived_tasks: plan.waivedTasks });
  if ("ok" in written) return written;

  await logAdminAction(p.userId, waive ? "catalogReview.waive" : "catalogReview.unwaive", "catalog_books", p.book.id, {
    task,
    queue: reviewQueueOf(p.book.language),
  });
  return { ok: true, status: statusOf(p.row), version: written.version, waivedTasks: plan.waivedTasks };
}

export async function claimCatalogReview(bookId: string, expectedVersion: number) {
  return transition(bookId, "claim", expectedVersion);
}

export async function releaseCatalogReview(bookId: string, expectedVersion: number) {
  return transition(bookId, "release", expectedVersion);
}

export async function takeOverCatalogReview(bookId: string, expectedVersion: number) {
  return transition(bookId, "takeover", expectedVersion);
}

export async function verifyCatalogReview(bookId: string, expectedVersion: number) {
  return transition(bookId, "verify", expectedVersion);
}

export async function blockCatalogReview(bookId: string, expectedVersion: number, reason: string, note?: string | null) {
  return transition(bookId, "block", expectedVersion, {
    block: { reason: typeof reason === "string" ? reason : "", note: typeof note === "string" ? note : null },
  });
}

export async function unblockCatalogReview(bookId: string, expectedVersion: number) {
  return transition(bookId, "unblock", expectedVersion);
}

export async function reopenCatalogReview(bookId: string, expectedVersion: number) {
  return transition(bookId, "reopen", expectedVersion);
}

export async function waiveCatalogTask(bookId: string, expectedVersion: number, task: string) {
  return waiver(bookId, expectedVersion, task, true);
}

export async function unwaiveCatalogTask(bookId: string, expectedVersion: number, task: string) {
  return waiver(bookId, expectedVersion, task, false);
}

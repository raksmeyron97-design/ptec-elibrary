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
import { loadReviewRow, reviewFingerprint } from "@/lib/catalogs/review-server";
import {
  planReviewTransition,
  reviewQueueOf,
  type ReviewAction,
  type ReviewStatus,
  type TransitionRefusal,
} from "@/lib/catalogs/review";

export type ReviewActionResult =
  | { ok: true; status: ReviewStatus; version: number }
  | {
      ok: false;
      error: TransitionRefusal | "stale" | "disabled" | "not_found" | "invalid" | "failed";
      /** Present on `stale`: the version the record holds now, so the page can offer a reload. */
      version?: number;
    };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function transition(
  bookId: string,
  action: ReviewAction,
  expectedVersion: number,
  extra: { block?: { reason: string; note?: string | null } } = {},
): Promise<ReviewActionResult> {
  if (!catalogReviewEnabled()) return { ok: false, error: "disabled" };
  const { supabase, userId } = await requireAction("catalog.review.transition");

  if (typeof bookId !== "string" || !UUID.test(bookId)) return { ok: false, error: "invalid" };
  if (!Number.isInteger(expectedVersion) || expectedVersion < 0) return { ok: false, error: "invalid" };

  // The record itself: it must exist, and verify fingerprints exactly what is stored.
  const { data: book, error: bookError } = await supabase
    .from("catalog_books")
    .select("id, title, author, isbn, publisher, year, language, category, ddc, description, keywords")
    .eq("id", bookId)
    .maybeSingle();
  if (bookError) return { ok: false, error: "failed" };
  if (!book) return { ok: false, error: "not_found" };

  const current = await loadReviewRow(supabase, bookId);
  if (!current.ok) return { ok: false, error: "failed" };
  const row = current.row;
  const heldVersion = row?.version ?? 0;
  // A press made against an older page is refused before anything is planned:
  // what the librarian saw is not what the record is.
  if (heldVersion !== expectedVersion) return { ok: false, error: "stale", version: heldVersion };

  const plan = planReviewTransition({
    action,
    row,
    actorId: userId,
    now: new Date(),
    fingerprint: action === "verify" ? reviewFingerprint(book) : null,
    block: extra.block,
  });
  if (!plan.ok) return { ok: false, error: plan.reason };

  const updatedAt = new Date().toISOString();
  let version: number;
  if (!row) {
    const { error } = await supabase
      .from("catalog_review_state")
      .insert({ book_id: bookId, ...plan.patch, version: 1, updated_at: updatedAt });
    // 23505: another librarian's first transition landed between the read and this insert.
    if (error) return error.code === "23505" ? { ok: false, error: "stale" } : { ok: false, error: "failed" };
    version = 1;
  } else {
    const written = changedRow<{ version: number }>(
      await supabase
        .from("catalog_review_state")
        .update({ ...plan.patch, version: row.version + 1, updated_at: updatedAt })
        .eq("book_id", bookId)
        .eq("version", row.version)
        .select("version"),
    );
    if (!written.ok) return written.reason === "no_match" ? { ok: false, error: "stale" } : { ok: false, error: "failed" };
    version = written.row.version;
  }

  await logAdminAction(userId, `catalogReview.${action}`, "catalog_books", bookId, {
    from: plan.from,
    to: plan.to,
    queue: reviewQueueOf(book.language),
    ...(plan.previousHolder ? { previousHolder: plan.previousHolder } : {}),
    ...(plan.patch.blocked_reason ? { reason: plan.patch.blocked_reason } : {}),
  });

  return { ok: true, status: plan.to, version };
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

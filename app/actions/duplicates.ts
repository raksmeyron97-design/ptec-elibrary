"use server";

// Admin action: retire a duplicate e-book onto a surviving canonical record.
//
// Retiring is deliberately NON-DESTRUCTIVE: the duplicate is archived (status →
// 'archived', which the 0061 sync trigger turns into is_published = false), so
// it leaves every public query, view, and the sitemap, but its reviews,
// reading-list entries, download logs, and analytics stay attached to the
// archived row in the DB — nothing is deleted or merged away. A permanent 301
// redirect (book_slug_redirects, migration 0091) then consolidates the old
// slug's links and search signals onto the canonical page.
//
// Chain/loop safety (mirrors the migration comment):
//   * redirects always store a book_id, never a slug → a redirect can't target
//     another redirect;
//   * any existing redirects pointing at the retired book are re-pointed to the
//     canonical book in the same call (no chains);
//   * a redirect whose old_slug equals the canonical slug is never created
//     (no self-loop).

import { revalidateLocalizedPath as revalidatePath, revalidateBookSlugChange } from "@/lib/cache/revalidate";
import { headers } from "next/headers";
import { requirePermission } from "@/lib/auth/requireAdmin";
import { logAdminAction } from "@/app/actions/audit";
import { rateLimit } from "@/lib/rate-limit";
import { clientIpOrUndefined } from "@/lib/client-ip";
import { EBOOKS_BASE_PATH, EBOOKS_DUPLICATES_PATH } from "@/lib/admin/ebooks-url";
import { duplicateGroupFingerprint } from "@/lib/admin/duplicate-dismissal";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REVALIDATE_PATHS = [EBOOKS_BASE_PATH, EBOOKS_DUPLICATES_PATH, "/admin", "/books", "/"];

type RetireResult = { success: true; redirectFrom: string; redirectTo: string } | { success: false; error: string };

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Forbidden";
}

async function requestMeta(): Promise<{ ip?: string; userAgent?: string }> {
  try {
    const h = await headers();
    const ip = clientIpOrUndefined(h);
    return { ip, userAgent: h.get("user-agent") ?? undefined };
  } catch {
    return {};
  }
}

/**
 * Retire `retiredId` in favour of `canonicalId`.
 * Idempotent-ish: re-running after a partial failure re-applies the archive and
 * upserts the redirect.
 */
export async function retireDuplicateBook(input: {
  retiredId: string;
  canonicalId: string;
}): Promise<RetireResult> {
  const { retiredId, canonicalId } = input;
  if (!UUID_RE.test(retiredId) || !UUID_RE.test(canonicalId)) {
    return { success: false, error: "Invalid book id." };
  }
  if (retiredId === canonicalId) {
    return { success: false, error: "The retired and canonical records must be different." };
  }

  let admin: Awaited<ReturnType<typeof requirePermission>>;
  try {
    admin = await requirePermission("books", "write");
    const { success } = await rateLimit(`dup-retire:${admin.user.id}`, 20, 60_000);
    if (!success) throw new Error("Too many changes — please wait a moment and try again.");
  } catch (error) {
    return { success: false, error: errorMessage(error) };
  }
  const { supabase, user } = admin;

  // Both records must exist; the canonical must be a live, published book so we
  // never redirect to a dead target.
  const { data: rows, error: fetchErr } = await supabase
    .from("books")
    .select("id, slug, is_published, status")
    .in("id", [retiredId, canonicalId]);
  if (fetchErr) return { success: false, error: fetchErr.message };

  const retired = rows?.find((r) => r.id === retiredId);
  const canonical = rows?.find((r) => r.id === canonicalId);
  if (!retired || !canonical) return { success: false, error: "One of the records no longer exists." };
  if (!canonical.slug || !retired.slug) return { success: false, error: "A record is missing its slug." };
  if (!canonical.is_published) {
    return { success: false, error: "Choose a published book as the canonical record — redirects must not point to an unpublished page." };
  }
  if (retired.slug === canonical.slug) {
    return { success: false, error: "Both records share a slug; resolve that first." };
  }

  // Archive the duplicate (keeps all attached data; leaves public surfaces).
  const { error: archiveErr } = await supabase
    .from("books")
    .update({ status: "archived" })
    .eq("id", retiredId);
  if (archiveErr) {
    const msg = archiveErr.message.includes("books_status_check")
      ? "Archiving needs migration 0077_ebook_admin.sql applied first."
      : archiveErr.message;
    return { success: false, error: msg };
  }

  // Re-point any redirects that currently target the retired book onto the
  // canonical book (prevents a → b, b → c chains from forming).
  await supabase
    .from("book_slug_redirects")
    .update({ book_id: canonicalId })
    .eq("book_id", retiredId);

  // A redirect FROM the canonical slug would loop the canonical page onto
  // itself — make sure none exists (shouldn't, but be defensive).
  await supabase.from("book_slug_redirects").delete().eq("old_slug", canonical.slug);

  // Upsert the retired slug → canonical book redirect.
  const { error: redirectErr } = await supabase
    .from("book_slug_redirects")
    .upsert({ old_slug: retired.slug, book_id: canonicalId }, { onConflict: "old_slug" });
  if (redirectErr) {
    const msg = redirectErr.message.includes("book_slug_redirects")
      ? "The redirect table is missing — apply migration 0091_book_slug_redirects.sql first."
      : redirectErr.message;
    return { success: false, error: msg };
  }

  const meta = await requestMeta();
  await logAdminAction(user.id, "book.retire_duplicate", "books", retiredId, {
    canonicalId,
    redirectFrom: retired.slug,
    redirectTo: canonical.slug,
    ...meta,
  });

  // Retiring a duplicate removes one published book and 301s its old URL —
  // both slugs' pages, the listings, and the public counters must all drop
  // the retired record together.
  revalidateBookSlugChange(retired.slug, canonical.slug);
  REVALIDATE_PATHS.forEach((p) => revalidatePath(p));

  return { success: true, redirectFrom: retired.slug, redirectTo: canonical.slug };
}

// ── "These are not duplicates" ──────────────────────────────────────────────
//
// The queue is DERIVED: detection re-runs over the whole collection on every
// page load, so a group nobody retires comes back forever. Before this, the
// only way to make a group leave was to archive a record — the page rewarded
// retiring a book over correctly deciding not to. Dismissal is the other
// verdict, and it is reversible: the row is a memo, not a state change on any
// book. Nothing about the records themselves is touched.

const MAX_DISMISSAL_NOTE = 500;
const MAX_GROUP_MEMBERS = 50;

type DismissResult = { success: true } | { success: false; error: string };

/**
 * Remember that this exact set of records has been reviewed and is not a
 * duplicate.
 *
 * The fingerprint is RECOMPUTED here from the ids rather than taken from the
 * client: it is a derived value, and a derived value accepted from a caller is
 * a value the caller chose. Restoring goes the other way (see below) because
 * there the fingerprint is the row's own key.
 *
 * It deliberately does NOT re-run detection to prove the ids really group. That
 * would re-scan the collection to defend against an actor who already holds
 * books:write — i.e. who can archive these books outright — and the worst a
 * fabricated set can do is leave an inert row that no real group ever matches.
 * The ids are checked to EXIST, so a typo cannot bury a live group by accident.
 */
export async function dismissDuplicateGroup(input: {
  bookIds: string[];
  note?: string;
}): Promise<DismissResult> {
  const bookIds = [...new Set(input.bookIds ?? [])];
  if (bookIds.length < 2 || bookIds.length > MAX_GROUP_MEMBERS) {
    return { success: false, error: "A duplicate group must name between 2 and 50 records." };
  }
  if (!bookIds.every((id) => UUID_RE.test(id))) {
    return { success: false, error: "Invalid book id." };
  }
  const note = input.note?.trim().slice(0, MAX_DISMISSAL_NOTE) || null;

  let admin: Awaited<ReturnType<typeof requirePermission>>;
  try {
    admin = await requirePermission("books", "write");
    const { success } = await rateLimit(`dup-dismiss:${admin.user.id}`, 60, 60_000);
    if (!success) throw new Error("Too many changes — please wait a moment and try again.");
  } catch (error) {
    return { success: false, error: errorMessage(error) };
  }
  const { supabase, user } = admin;

  const { data: found, error: lookupErr } = await supabase.from("books").select("id").in("id", bookIds);
  if (lookupErr) return { success: false, error: lookupErr.message };
  if ((found?.length ?? 0) !== bookIds.length) {
    return { success: false, error: "One of the records no longer exists — refresh and try again." };
  }

  const fingerprint = duplicateGroupFingerprint(bookIds);
  // Upsert, not insert: dismissing a group twice (two tabs, a double click) is
  // the same statement made twice, not an error to show a librarian.
  const { error: writeErr } = await supabase
    .from("duplicate_dismissals")
    .upsert(
      { fingerprint, book_ids: bookIds, note, dismissed_by: user.id, dismissed_at: new Date().toISOString() },
      { onConflict: "fingerprint" },
    );
  if (writeErr) {
    const msg = writeErr.message.includes("duplicate_dismissals")
      ? "The dismissals table is missing — apply migration 0153_duplicate_dismissals.sql first."
      : writeErr.message;
    return { success: false, error: msg };
  }

  const meta = await requestMeta();
  await logAdminAction(user.id, "book.duplicate_group_dismissed", "books", bookIds[0], {
    fingerprint,
    bookIds,
    records: bookIds.length,
    note,
    ...meta,
  });

  // Only the queue changes — no book's status, slug or visibility moved, so the
  // public cache is deliberately left alone.
  revalidatePath(EBOOKS_DUPLICATES_PATH);
  return { success: true };
}

/** Put a dismissed group back in the queue. Keyed by the row's own primary key,
 *  and safe in the only direction it can fail: a wrong fingerprint deletes
 *  nothing, and a right one only ever makes a group visible again. */
export async function restoreDuplicateGroup(input: { fingerprint: string }): Promise<DismissResult> {
  const fingerprint = (input.fingerprint ?? "").trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(fingerprint)) {
    return { success: false, error: "Invalid dismissal reference." };
  }

  let admin: Awaited<ReturnType<typeof requirePermission>>;
  try {
    admin = await requirePermission("books", "write");
    const { success } = await rateLimit(`dup-dismiss:${admin.user.id}`, 60, 60_000);
    if (!success) throw new Error("Too many changes — please wait a moment and try again.");
  } catch (error) {
    return { success: false, error: errorMessage(error) };
  }
  const { supabase, user } = admin;

  // A delete that matched nothing has still reached the requested state, but the
  // audit trail must not claim a restore that did not happen — so the row is
  // asked for on the way out.
  const { data: removed, error: deleteErr } = await supabase
    .from("duplicate_dismissals")
    .delete()
    .eq("fingerprint", fingerprint)
    .select("fingerprint, book_ids");
  if (deleteErr) return { success: false, error: deleteErr.message };
  if (!removed || removed.length === 0) {
    return { success: false, error: "That group is already back in the queue." };
  }

  const meta = await requestMeta();
  await logAdminAction(user.id, "book.duplicate_group_restored", "books", removed[0].book_ids?.[0], {
    fingerprint,
    bookIds: removed[0].book_ids,
    ...meta,
  });

  revalidatePath(EBOOKS_DUPLICATES_PATH);
  return { success: true };
}

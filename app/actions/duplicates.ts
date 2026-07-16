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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REVALIDATE_PATHS = ["/admin/manage", "/admin/manage/duplicates", "/admin", "/books", "/"];

type RetireResult = { success: true; redirectFrom: string; redirectTo: string } | { success: false; error: string };

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Forbidden";
}

async function requestMeta(): Promise<{ ip?: string; userAgent?: string }> {
  try {
    const h = await headers();
    const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || undefined;
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

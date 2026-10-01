"use server";

// The book description review queue (SEO Phase 5.2, migration 0164).
//
// A draft is written, reviewed and only then published. Drafts live in
// `book_description_drafts` (service role only — `books` is anon-readable, and
// an unreviewed draft must not be). Nothing here changes a book's live
// `description` except `approveBookDescription`, which copies the draft in the
// book's own language (lib/seo/description-review.ts). Every mutation goes
// through the one registry gate (`books.description.review`), asks for its
// affected row (lib/db/changed-row.ts's reasoning) and writes an audit row.

import { requireAction } from "@/lib/admin/route-guard";
import { logAdminAction } from "@/app/actions/audit";
import { revalidateBook } from "@/lib/cache/revalidate";
import { rateLimit } from "@/lib/rate-limit";
import { carriesReviewMarker, cleanDraft, draftToPublish } from "@/lib/seo/description-review";

export type DescriptionReviewResult =
  | { success: true }
  | { success: false; code: "forbidden" | "rate_limited" | "not_found" | "no_draft" | "needs_review" | "failed"; detail?: string };

async function openMutation() {
  const admin = await requireAction("books.description.review");
  const { success } = await rateLimit(`book-description:${admin.user.id}`, 60, 60_000);
  if (!success) throw Object.assign(new Error("rate_limited"), { code: "rate_limited" as const });
  return admin;
}

function toResult(error: unknown): DescriptionReviewResult {
  const code = (error as { code?: string })?.code;
  if (code === "rate_limited") return { success: false, code: "rate_limited" };
  const status = (error as { status?: number })?.status;
  if (status === 403 || status === 401) return { success: false, code: "forbidden" };
  return { success: false, code: "failed", detail: error instanceof Error ? error.message : undefined };
}

/** Save (or replace) the drafts. The live description is untouched. */
export async function saveBookDescriptionDraft(
  bookId: string,
  drafts: { en?: string | null; km?: string | null },
): Promise<DescriptionReviewResult> {
  try {
    const { supabase, user } = await openMutation();
    const en = cleanDraft(drafts.en);
    const km = cleanDraft(drafts.km);
    const { data: book, error: bookError } = await supabase
      .from("books")
      .update({ description_status: en || km ? "draft" : "none" })
      .eq("id", bookId)
      .select("id, title")
      .maybeSingle();
    if (bookError) return { success: false, code: "failed", detail: bookError.message };
    if (!book) return { success: false, code: "not_found" };

    const write = en || km
      ? supabase
          .from("book_description_drafts")
          .upsert({ book_id: bookId, draft_en: en, draft_km: km, source: "librarian", updated_by: user.id, updated_at: new Date().toISOString() })
          .select("book_id")
      : supabase.from("book_description_drafts").delete().eq("book_id", bookId).select("book_id");
    const { error } = await write;
    if (error) return { success: false, code: "failed", detail: error.message };

    await logAdminAction(user.id, "book.description_draft", "books", bookId, {
      title: book.title,
      has_en: Boolean(en),
      has_km: Boolean(km),
    });
    return { success: true };
  } catch (error) {
    return toResult(error);
  }
}

/** Publish the draft in the book's own language as its description. */
export async function approveBookDescription(bookId: string): Promise<DescriptionReviewResult> {
  try {
    const { supabase, user } = await openMutation();
    const [{ data: book, error: bookError }, { data: draft, error: draftError }] = await Promise.all([
      supabase.from("books").select("id, slug, title, language").eq("id", bookId).maybeSingle(),
      supabase.from("book_description_drafts").select("draft_en, draft_km").eq("book_id", bookId).maybeSingle(),
    ]);
    if (bookError || draftError) {
      return { success: false, code: "failed", detail: (bookError ?? draftError)?.message };
    }
    if (!book) return { success: false, code: "not_found" };
    const publish = draft ? draftToPublish(book, { en: draft.draft_en, km: draft.draft_km }) : null;
    if (!publish) return { success: false, code: "no_draft" };
    if (carriesReviewMarker(publish.text)) return { success: false, code: "needs_review" };

    const { data, error } = await supabase
      .from("books")
      .update({
        description: publish.text,
        description_status: "approved",
        description_reviewed_by: user.id,
        description_reviewed_at: new Date().toISOString(),
      })
      .eq("id", bookId)
      .select("id")
      .maybeSingle();
    if (error) return { success: false, code: "failed", detail: error.message };
    if (!data) return { success: false, code: "not_found" };
    await logAdminAction(user.id, "book.description_approved", "books", bookId, {
      title: book.title,
      locale: publish.locale,
    });
    revalidateBook(book.slug);
    return { success: true };
  } catch (error) {
    return toResult(error);
  }
}

/** Discard the drafts; the live description is untouched. */
export async function discardBookDescriptionDraft(bookId: string): Promise<DescriptionReviewResult> {
  try {
    const { supabase, user } = await openMutation();
    const { data: book, error: bookError } = await supabase
      .from("books")
      .select("id, title, description_status")
      .eq("id", bookId)
      .maybeSingle();
    if (bookError) return { success: false, code: "failed", detail: bookError.message };
    if (!book) return { success: false, code: "not_found" };
    const { error } = await supabase.from("book_description_drafts").delete().eq("book_id", bookId).select("book_id");
    if (error) return { success: false, code: "failed", detail: error.message };
    // An approved description stays approved; only a pending draft resets.
    if (book.description_status === "draft") {
      const { error: statusError } = await supabase
        .from("books")
        .update({ description_status: "none" })
        .eq("id", bookId)
        .select("id");
      if (statusError) return { success: false, code: "failed", detail: statusError.message };
    }
    await logAdminAction(user.id, "book.description_discarded", "books", bookId, { title: book.title });
    return { success: true };
  } catch (error) {
    return toResult(error);
  }
}

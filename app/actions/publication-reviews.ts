"use server";

// Ratings & comments for publications — mirrors app/actions/reviews.ts (books).
// One review (rating 1–5 + optional comment) per user per publication, stored
// in publication_reviews (migration 0056).

import { revalidateLocalizedPath as revalidatePath } from "@/lib/cache/revalidate";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";
import { ratePolicy } from "@/lib/rate-limit-policy";
import { logSecurityEvent } from "@/lib/security-log";
import type { Review } from "@/app/actions/reviews";

export type SubmitPublicationReviewResult =
  | { success: true }
  | { success: false; error: string };

// ── Submit (insert or update own) ─────────────────────────────────────────────
export async function submitPublicationReview(
  publicationId: string,
  publicationSlug: string,
  formData: FormData
): Promise<SubmitPublicationReviewResult> {
  const authClient = await createClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();

  if (!user) return { success: false, error: "You must be signed in to leave a review." };

  /* The same rate limit the book twin has. This file says at the top that it
     mirrors app/actions/reviews.ts, and it did — except for this, so one of
     the two authenticated review endpoints was unthrottled. Same policy key,
     so a burst spends one budget across both rather than one each. */
  const { limit, windowMs } = ratePolicy("review");
  const rl = await rateLimit(`review:${user.id}`, limit, windowMs);
  if (!rl.success) {
    logSecurityEvent({ type: "rate_limited", where: "submitPublicationReview", userId: user.id });
    return { success: false, error: "You are reviewing too quickly. Please try again in a few minutes." };
  }

  const rating = Number(formData.get("rating"));
  if (!rating || rating < 1 || rating > 5) {
    return { success: false, error: "Please select a rating between 1 and 5." };
  }

  const content = formData.get("content")?.toString().trim() || null;
  if (content && content.length > 2000) {
    return { success: false, error: "Review is too long (max 2000 characters)." };
  }

  const supabase = createServiceClient();

  /* Establish the target before writing — see the note in submitReview. The
     id arrives from the client and everything below bypasses RLS. */
  const { data: publication, error: pubError } = await supabase
    .from("publications")
    .select("id, slug")
    .eq("id", publicationId)
    .eq("is_published", true)
    .maybeSingle();

  if (pubError) {
    console.error("[submitPublicationReview] publication lookup:", pubError);
    return { success: false, error: "Could not submit your review. Please try again." };
  }
  if (!publication) {
    return { success: false, error: "That publication is not available for review." };
  }

  const { data: existing, error: selectError } = await supabase
    .from("publication_reviews")
    .select("id")
    .eq("publication_id", publicationId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (selectError) {
    console.error("[submitPublicationReview] select:", selectError);
    return { success: false, error: "Could not submit your review. Please try again." };
  }

  if (existing) {
    const { error } = await supabase
      .from("publication_reviews")
      .update({ rating, content, created_at: new Date().toISOString() })
      .eq("id", existing.id);

    if (error) {
      console.error("[submitPublicationReview] update:", error);
      return { success: false, error: "Could not submit your review. Please try again." };
    }
  } else {
    const { error } = await supabase.from("publication_reviews").insert({
      publication_id: publicationId,
      user_id: user.id,
      rating,
      content,
    });

    if (error) {
      console.error("[submitPublicationReview] insert:", error);
      return { success: false, error: "Could not submit your review. Please try again." };
    }
  }

  revalidatePath(`/publications/${publication.slug ?? publicationSlug}`);
  return { success: true };
}

// ── Fetch all reviews for a publication ──────────────────────────────────────
export async function getPublicationReviews(publicationId: string): Promise<Review[]> {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("publication_reviews")
    .select(
      `id, rating, content, created_at,
       profiles ( full_name, avatar_url )`
    )
    .eq("publication_id", publicationId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[getPublicationReviews]", error.message);
    return [];
  }

  return (data ?? []) as unknown as Review[];
}

// ── Current user's review (if any) ────────────────────────────────────────────
export async function getUserPublicationReview(
  publicationId: string
): Promise<{ rating: number; content: string | null } | null> {
  const authClient = await createClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();

  if (!user) return null;

  const supabase = createServiceClient();
  const { data } = await supabase
    .from("publication_reviews")
    .select("rating, content")
    .eq("publication_id", publicationId)
    .eq("user_id", user.id)
    .maybeSingle();

  return data ?? null;
}

// ── Aggregate stats (for hero, JSON-LD aggregateRating) ──────────────────────
export async function getPublicationRatingStats(
  publicationId: string
): Promise<{ count: number; average: number }> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("publication_reviews")
    .select("rating")
    .eq("publication_id", publicationId);

  if (error || !data || data.length === 0) return { count: 0, average: 0 };
  const average = data.reduce((sum, r) => sum + r.rating, 0) / data.length;
  return { count: data.length, average: Math.round(average * 10) / 10 };
}

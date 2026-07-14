"use server";

import { revalidateLocalizedPath as revalidatePath } from "@/lib/cache/revalidate";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";
import { ratePolicy } from "@/lib/rate-limit-policy";
import { logSecurityEvent } from "@/lib/security-log";

// ── Types ─────────────────────────────────────────────────────────────────────
export type Review = {
  id: string;
  rating: number;
  content: string | null;
  created_at: string;
  profiles: {
    full_name: string | null;
    avatar_url: string | null;
  } | null;
};

export type SubmitReviewResult =
  | { success: true }
  | { success: false; error: string };

// ── Submit a review ───────────────────────────────────────────────────────────
export async function submitReview(
  bookId: string,
  bookSlug: string,
  formData: FormData
): Promise<SubmitReviewResult> {
  const authClient = await createClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();

  if (!user) return { success: false, error: "You must be signed in to leave a review." };

  const { limit, windowMs } = ratePolicy("review");
  const rl = await rateLimit(`review:${user.id}`, limit, windowMs);
  if (!rl.success) {
    logSecurityEvent({ type: "rate_limited", where: "submitReview", userId: user.id });
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

  // Check if user already reviewed this book
  const { data: existing, error: selectError } = await supabase
    .from("reviews")
    .select("id")
    .eq("book_id", bookId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (selectError) {
    console.error("[Supabase Select Error]:", selectError);
    return { success: false, error: "Could not submit your review. Please try again." };
  }

  if (existing) {
    // Update existing review
    const { error } = await supabase
      .from("reviews")
      .update({ rating, content, created_at: new Date().toISOString() })
      .eq("id", existing.id);

    if (error) {
      console.error("[Supabase Update Error]:", error);
      return { success: false, error: "Could not submit your review. Please try again." };
    }
  } else {
    // Insert new review
    const { error } = await supabase.from("reviews").insert({
      book_id: bookId,
      user_id: user.id,
      rating,
      content,
    });

    if (error) {
      console.error("[Supabase Insert Error]:", error);
      return { success: false, error: "Could not submit your review. Please try again." };
    }
  }

  // Recompute the book's average rating
  const { data: allRatings, error: ratingError } = await supabase
    .from("reviews")
    .select("rating")
    .eq("book_id", bookId);

  if (ratingError) {
    console.error("[Supabase Select Rating Error]:", ratingError);
  }

  if (allRatings && allRatings.length > 0) {
    const avg =
      allRatings.reduce((sum, r) => sum + r.rating, 0) / allRatings.length;
      
    const { error: updateBookError } = await supabase
      .from("books")
      .update({ rating: Math.round(avg * 10) / 10 })
      .eq("id", bookId);
      
    if (updateBookError) {
      console.error("[Supabase Update Book Rating Error]:", updateBookError);
    }
  }

  revalidatePath(`/books/${bookSlug}`);
  return { success: true };
}

// ── Fetch reviews for a book ──────────────────────────────────────────────────
export async function getReviews(bookId: string): Promise<Review[]> {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("reviews")
    .select(
      `id, rating, content, created_at,
       profiles ( full_name, avatar_url )`
    )
    .eq("book_id", bookId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[getReviews]", error.message);
    return [];
  }

    return (data ?? []) as unknown as Review[];
}

// ── Get the current user's review for a book (if any) ────────────────────────
export async function getUserReview(
  bookId: string
): Promise<{ rating: number; content: string | null } | null> {
  const authClient = await createClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();

  if (!user) return null;

  const supabase = createServiceClient();
  const { data } = await supabase
    .from("reviews")
    .select("rating, content")
    .eq("book_id", bookId)
    .eq("user_id", user.id)
    .maybeSingle();

  return data ?? null;
}
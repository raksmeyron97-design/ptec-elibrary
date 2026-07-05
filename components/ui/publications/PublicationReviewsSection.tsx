import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Star } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import {
  getPublicationReviews,
  getUserPublicationReview,
} from "@/app/actions/publication-reviews";
import ReviewList from "@/components/ui/reviews/ReviewList";
import PublicationReviewForm from "@/components/ui/publications/PublicationReviewForm";

/**
 * Ratings & comments block: distribution summary + review list (reusing the
 * books ReviewList) beside the submit form, or a sign-in prompt when logged
 * out. Meant to be streamed inside <Suspense> (needs per-user data).
 */
export default async function PublicationReviewsSection({
  publicationId,
  slug,
}: {
  publicationId: string;
  slug: string;
}) {
  const t = await getTranslations("publicationDetail");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [reviews, userReview] = await Promise.all([
    getPublicationReviews(publicationId),
    user ? getUserPublicationReview(publicationId) : Promise.resolve(null),
  ]);

  const avgRating =
    reviews.length > 0
      ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
      : 0;

  return (
    <div className="flex flex-col-reverse gap-6 lg:grid lg:grid-cols-[1fr_340px] lg:items-start">
      <ReviewList reviews={reviews} totalCount={reviews.length} avgRating={avgRating} />
      {user ? (
        <PublicationReviewForm
          publicationId={publicationId}
          publicationSlug={slug}
          existingRating={userReview?.rating}
          existingContent={userReview?.content}
        />
      ) : (
        <div className="rounded-2xl border border-divider bg-bg-surface p-6 text-center shadow-sm">
          <Star className="mx-auto mb-3 h-8 w-8 fill-amber-400 stroke-amber-400" />
          <h3 className="text-base font-bold text-text-heading">{t("leaveAReview")}</h3>
          <p className="mt-2 text-sm text-text-muted">{t("signInToReview")}</p>
          <Link
            href={`/auth/login?callbackUrl=/publications/${slug}#reviews`}
            className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-brand text-sm font-bold text-brand-contrast transition hover:bg-brand-hover"
          >
            {t("signInToReview")}
          </Link>
        </div>
      )}
    </div>
  );
}

import type { Review } from "@/app/actions/reviews";
import Avatar from "@/components/ui/Avatar";

type ReviewListProps = {
  reviews: Review[];
  totalCount: number;
  avgRating: number;
};

function StarBar({ rating, count, total }: { rating: number; count: number; total: number }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-3 text-right font-semibold text-text-body">{rating}</span>
      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-amber-400 stroke-amber-400" strokeWidth={1}>
        <path d="m12 2 3 6.4 7 .8-5.2 4.8 1.4 6.9L12 17.4 5.8 21l1.4-6.9L2 9.2l7-.8L12 2Z" />
      </svg>
      <div className="h-2 w-28 overflow-hidden rounded-full bg-paper">
        <div
          className="h-full rounded-full bg-amber-400 transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-6 text-text-muted">{count}</span>
    </div>
  );
}


function ReviewCard({ review }: { review: Review }) {
  const profile = review.profiles;
  const displayName = profile?.full_name || "Reader";
  const date = new Date(review.created_at).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  return (
    <article className="border-b border-divider py-5 last:border-0 last:pb-0">
      <div className="flex items-start gap-3">
        <Avatar
          url={profile?.avatar_url ?? null}
          name={profile?.full_name ?? null}
          email={""}
          size={36}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-text-heading">{displayName}</span>
            <span className="text-xs text-text-muted">{date}</span>
          </div>

          {/* Stars */}
          <div className="mt-1 flex items-center gap-0.5">
            {Array.from({ length: 5 }).map((_, i) => (
              <svg
                key={i}
                viewBox="0 0 24 24"
                className={`h-4 w-4 ${
                  i < review.rating
                    ? "fill-amber-400 stroke-amber-400"
                    : "fill-slate-100 stroke-slate-200"
                }`}
                strokeWidth={1}
              >
                <path d="m12 2 3 6.4 7 .8-5.2 4.8 1.4 6.9L12 17.4 5.8 21l1.4-6.9L2 9.2l7-.8L12 2Z" />
              </svg>
            ))}
          </div>

          {review.content && (
            <p className="mt-2 text-sm leading-6 text-text-body">{review.content}</p>
          )}
        </div>
      </div>
    </article>
  );
}

export default function ReviewList({ reviews, totalCount, avgRating }: ReviewListProps) {
  // Tally counts per star level
  const tally = [5, 4, 3, 2, 1].map((star) => ({
    star,
    count: reviews.filter((r) => r.rating === star).length,
  }));

  return (
    <div className="rounded-xl border border-divider bg-bg-surface shadow-sm">
      {/* Header */}
      <div className="flex flex-col gap-6 border-b border-divider p-6 sm:flex-row sm:items-center">
        {/* Big average */}
        <div className="flex shrink-0 flex-col items-center justify-center rounded-xl bg-paper px-8 py-5">
          <span className="text-5xl font-bold text-text-heading">
            {totalCount > 0 ? avgRating.toFixed(1) : "—"}
          </span>
          <div className="mt-1.5 flex gap-0.5">
            {Array.from({ length: 5 }).map((_, i) => (
              <svg
                key={i}
                viewBox="0 0 24 24"
                className={`h-5 w-5 ${
                  i < Math.round(avgRating)
                    ? "fill-amber-400 stroke-amber-400"
                    : "fill-slate-200 stroke-slate-200"
                }`}
                strokeWidth={1}
              >
                <path d="m12 2 3 6.4 7 .8-5.2 4.8 1.4 6.9L12 17.4 5.8 21l1.4-6.9L2 9.2l7-.8L12 2Z" />
              </svg>
            ))}
          </div>
          <span className="mt-1 text-xs text-text-muted">
            {totalCount} {totalCount === 1 ? "review" : "reviews"}
          </span>
        </div>

        {/* Distribution bars */}
        <div className="flex flex-1 flex-col gap-1.5">
          {tally.map(({ star, count }) => (
            <StarBar key={star} rating={star} count={count} total={totalCount} />
          ))}
        </div>
      </div>

      {/* Review list */}
      <div className="px-6 pb-2">
        {reviews.length === 0 ? (
          <p className="py-8 text-center text-sm text-text-muted">
            No reviews yet — be the first to share your thoughts.
          </p>
        ) : (
          reviews.map((review) => <ReviewCard key={review.id} review={review} />)
        )}
      </div>
    </div>
  );
}
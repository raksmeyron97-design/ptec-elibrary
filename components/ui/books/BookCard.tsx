// components/ui/BookCard.tsx
"use client";

import { useRouter } from "next/navigation";
import Image from "next/image";
import type { Book } from "@/lib/books";
import BookCover from "@/components/ui/books/BookCover";
import RatingStars from "@/components/ui/reviews/RatingStars";
import { incrementViewCount } from "@/app/actions/view-count";
import { useTranslations } from "next-intl";

type BookCardProps = {
  book: Book & {
    coverUrl?: string | null;
    reviewCount?: number;
    progressPct?: number;
    downloadCount?: number;
    viewCount?: number;
    dbId?: string | null;
    isNew?: boolean; // optional — show a "New" badge on the cover
  };
};

export default function BookCard({ book }: BookCardProps) {
  const t = useTranslations("bookCard");
  const router = useRouter();

  const progress = book.progressPct ?? 0;
  const downloads = book.downloadCount ?? 0;
  const views = book.viewCount ?? 0;

  // A book is genuinely "rated" only when it actually has reviews.
  // `reviewCount` is the source of truth. If the list page hasn't wired it yet
  // (undefined), fall back to the rating value so the UI doesn't break — but the
  // CORRECT fix is to pass reviewCount from the data layer (see note below).
  const reviews = book.reviewCount ?? 0;
  const hasReviewData = typeof book.reviewCount === "number";
  const hasRating = typeof book.rating === "number" && book.rating > 0;
  const showStars = hasReviewData ? reviews > 0 : hasRating;

  const formatCount = (n: number) =>
    n >= 1_000_000
      ? `${(n / 1_000_000).toFixed(1)}M`
      : n >= 1_000
        ? `${(n / 1_000).toFixed(1)}K`
        : String(n);

  async function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    if (book.dbId) {
      incrementViewCount(book.dbId).catch(() => {});
    }
    router.push(`/books/${book.slug}`);
  }

  return (
    <article className="group relative flex h-full flex-col overflow-hidden rounded-2xl bg-bg-surface border border-divider shadow-[0_1px_3px_rgba(0,0,0,0.06)] transition-all duration-300 ease-out hover:-translate-y-1.5 hover:shadow-[0_12px_28px_-8px_rgba(30,58,138,0.25)] hover:border-brand/30">
      {/* Gold top-rule accent on hover (brand signature) */}
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 z-20 h-[3px] origin-left scale-x-0 bg-accent transition-transform duration-300 group-hover:scale-x-100"
      />

      <a
        href={`/books/${book.slug}`}
        onClick={handleClick}
        className="flex h-full flex-col rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
      >
        {/* ── Cover (full-bleed, hero) ── */}
        <div className="relative aspect-[3/4] w-full overflow-hidden bg-paper">
          {book.coverUrl ? (
            <Image
              src={book.coverUrl}
              alt={`Cover of ${book.title}`}
              fill
              sizes="(max-width:768px) 50vw, 25vw"
              className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
            />
          ) : (
            <div className="h-full w-full transition-transform duration-500 group-hover:scale-[1.04]">
              <BookCover
                title={book.title}
                label={book.category || book.department}
                author={book.author}
                variant="card"
              />
            </div>
          )}

          {/* Bottom scrim for depth + legible overlays */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/55 to-transparent"
          />

          {/* "New" badge — top left (only when flagged) */}
          {book.isNew && (
            <span className="absolute left-2.5 top-2.5 z-[4] rounded-full bg-accent px-2.5 py-1 text-[10px] font-bold text-white shadow">
              {t("new")}
            </span>
          )}

          {/* Format chip — top right (frosted) */}
          <span className="absolute right-2.5 top-2.5 z-[4] rounded-md bg-black/35 px-2 py-[3px] text-[9px] font-bold uppercase tracking-wider text-white/95 backdrop-blur-md">
            {book.format || "PDF"}
          </span>

          {/* Category — frosted pill over cover bottom-left */}
          {(book.category || book.department) && (
            <span className="absolute bottom-2.5 left-2.5 z-[4] rounded-full bg-white/90 px-2.5 py-1 text-[9px] font-bold uppercase tracking-wide text-brand shadow-sm backdrop-blur-sm">
              {book.category || book.department}
            </span>
          )}

          {/* Reading progress bar (sits on cover bottom edge) */}
          {progress > 0 && (
            <div className="absolute inset-x-0 bottom-0 z-[5] h-[3px] bg-black/20 overflow-hidden">
              <div
                className="h-full bg-accent transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}
        </div>

        {/* ── Body ── */}
        <div className="flex flex-1 flex-col px-3.5 pb-3.5 pt-3 sm:px-4 sm:pb-4 min-w-0">
          {/* Title — relaxed leading for Khmer script */}
          <h3 className="text-[13px] font-khmer-serif font-bold leading-[1.6] text-text-heading line-clamp-2 sm:text-[14px]">
            {book.title}
          </h3>

          {/* Author */}
          <p className="mt-1 text-[11px] text-text-muted line-clamp-1 sm:text-[12px] font-medium leading-relaxed">
            {book.author}
          </p>

          {/* ── Footer ── */}
          <div className="mt-auto pt-3">
            {/* Rating: show stars only when the book genuinely has reviews. */}
            {showStars ? (
              <div className="flex items-center gap-1.5">
                <RatingStars rating={book.rating} compact />
                {reviews > 0 && (
                  <span className="text-[10px] text-text-muted">
                    · {formatCount(reviews)}
                  </span>
                )}
              </div>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-accent/10 px-2.5 py-1 text-[10px] font-bold text-accent">
                <svg
                  className="h-3 w-3"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  aria-hidden
                >
                  <path d="M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.8 5.9 20.6l1.4-6.8L2.2 9.1l6.9-.8z" />
                </svg>
                {t("new")}
              </span>
            )}

            {/* Divider */}
            <div className="my-2.5 h-px bg-divider" aria-hidden />

            {/* Meta row */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 text-[10px] font-medium text-text-muted">
                {/* Downloads — hidden when zero */}
                {downloads > 0 && (
                  <span className="inline-flex items-center gap-1">
                    <svg
                      className="h-3 w-3"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden
                    >
                      <path d="M12 3v13m0 0-4-4m4 4 4-4" />
                      <path d="M4 20h16" />
                    </svg>
                    {formatCount(downloads)}
                  </span>
                )}

                {/* Views — hidden when zero */}
                {views > 0 && (
                  <span className="inline-flex items-center gap-1">
                    <svg
                      className="h-3 w-3"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden
                    >
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                    {formatCount(views)}
                  </span>
                )}
              </div>
            </div>

            {/* CTA — full-width, easy to tap on mobile */}
            <span className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-brand/20 bg-brand/5 px-3 py-2.5 text-[12px] font-bold text-brand transition-all duration-200 group-hover:border-brand group-hover:bg-brand group-hover:text-brand-contrast sm:py-2 sm:text-[11px]">
              {progress > 0 ? t("continue") : t("view")}
              <svg
                className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.5}
                strokeLinecap="round"
                aria-hidden
              >
                <path d="m9 18 6-6-6-6" />
              </svg>
            </span>
          </div>
        </div>
      </a>
    </article>
  );
}
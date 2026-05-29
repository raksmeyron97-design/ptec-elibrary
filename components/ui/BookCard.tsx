// components/ui/BookCard.tsx
"use client";

import { useRouter } from "next/navigation";
import Image from "next/image";
import type { Book } from "@/lib/books";
import BookCover from "@/components/ui/BookCover";
import RatingStars from "@/components/ui/RatingStars";
import { Badge } from "@/components/ui/Badge";
import { incrementViewCount } from "@/app/actions/view-count";

type BookCardProps = {
  book: Book & {
    coverUrl?: string | null;
    reviewCount?: number;
    progressPct?: number;
    downloadCount?: number;
    viewCount?: number;
    dbId?: string | null;
  };
};

export default function BookCard({ book }: BookCardProps) {
  const router = useRouter();
  const readable = !!book.pdfUrl;
  const progress = book.progressPct ?? 0;
  const downloads = book.downloadCount ?? 0;
  const views = book.viewCount ?? 0;

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
    <article className="group relative flex h-full flex-col overflow-hidden rounded-xl bg-bg-surface border border-divider shadow-sm transition-all duration-300 ease-out hover:-translate-y-1 hover:shadow-md hover:border-brand/20">
      {/* Gold top-rule accent on hover (brand signature) */}
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 z-20 h-[3px] origin-left scale-x-0 bg-accent transition-transform duration-300 group-hover:scale-x-100"
      />
      <a
        href={`/books/${book.slug}`}
        onClick={handleClick}
        className="flex h-full flex-col"
      >
        {/* ── Cover ── */}
        <div className="relative mx-3 mt-3 overflow-hidden rounded-lg sm:mx-3.5 sm:mt-3.5 border border-divider/50">
          <div className="relative aspect-[3/4] w-full bg-paper">
            {book.coverUrl ? (
              <Image
                src={book.coverUrl}
                alt={`Cover of ${book.title}`}
                fill
                sizes="(max-width:768px) 50vw, 25vw"
                className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
              />
            ) : (
              <BookCover
                title={book.title}
                label={book.category || book.department}
                author={book.author}
                variant="card"
              />
            )}

            {/* Format badge — top right */}
            <span className="absolute right-2 top-2 z-[4] rounded-md bg-bg-surface/90 px-2 py-[3px] text-[9px] font-bold uppercase tracking-wider text-text-muted shadow-sm backdrop-blur-sm border border-divider/50">
              {book.format || "PDF"}
            </span>

            {/* Reading progress bar */}
            {progress > 0 && (
              <div className="absolute inset-x-0 bottom-0 z-[5] h-[3px] bg-black/10 rounded-b-lg overflow-hidden">
                <div
                  className="h-full rounded-full bg-brand transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
            )}
          </div>
        </div>

        {/* ── Body ── */}
        <div className="flex flex-1 flex-col px-3.5 pb-3.5 pt-4 sm:px-4 sm:pb-4">
          {/* Department pill */}
          {book.department && (
            <Badge variant="brand" className="mb-2 self-start !text-[9px] !px-2 !py-0.5 uppercase tracking-wide">
              {book.department}
            </Badge>
          )}

          {/* Title */}
          <h3 className="text-[13px] font-khmer-serif font-bold leading-snug text-text-heading line-clamp-2 sm:text-[14px]">
            {book.title}
          </h3>

          {/* Author */}
          <p className="mt-1 text-[11px] text-text-muted line-clamp-1 sm:text-[12px] font-medium">
            {book.author}
          </p>

          {/* Summary — hidden on mobile */}
          <p className="mt-1.5 hidden text-[11px] leading-[1.6] text-text-body line-clamp-2 sm:block">
            {book.summary}
          </p>

          {/* ── Footer ── */}
          <div className="mt-auto pt-3">
            {/* Stars + rating number */}
            <div className="flex items-center gap-1.5">
              <RatingStars rating={book.rating} compact />
              <span className="text-[11px] font-medium text-text-muted">
                {book.rating?.toFixed(1)}
              </span>
            </div>

            {/* Meta row */}
            <div className="mt-2.5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                {/* Downloads */}
                {downloads > 0 && (
                  <span className="inline-flex items-center gap-1 text-[10px] text-text-muted">
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

                {/* Views */}
                <span className="inline-flex items-center gap-1 text-[10px] text-text-muted">
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
              </div>

              {/* CTA */}
              <span className="inline-flex items-center gap-0.5 rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-bold text-brand transition-colors group-hover:bg-brand group-hover:text-brand-contrast border border-blue-100 group-hover:border-brand">
                {progress > 0 ? "Continue" : "View"}
                <svg
                  className="h-3 w-3"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2.5}
                  strokeLinecap="round"
                >
                  <path d="m9 18 6-6-6-6" />
                </svg>
              </span>
            </div>
          </div>
        </div>
      </a>
    </article>
  );
}
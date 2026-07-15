// components/ui/books/BookCard.tsx
"use client";

import { Link } from "@/i18n/navigation";
import { useState, useEffect } from "react";
import type { Book } from "@/lib/books";
import SmartBookCover from "@/components/ui/books/SmartBookCover";
import RatingStars from "@/components/ui/reviews/RatingStars";
import Icon from "@/components/ui/core/Icon";
import { useTranslations } from "next-intl";

type BookCardProps = {
  book: Book & {
    coverUrl?: string | null;
    reviewCount?: number;
    progressPct?: number;
    downloadCount?: number;
    viewCount?: number;
    dbId?: string | null;
    lastReadAt?: string | null;
    createdAt?: string;
  };
  /** "browse" (default) = standard card; "continue" = in-progress reading card */
  variant?: "browse" | "continue";
  /** Eagerly load the cover (use for above-the-fold cards only). */
  priority?: boolean;
};

const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;

const formatCount = (n: number) =>
  n >= 1_000_000
    ? `${(n / 1_000_000).toFixed(1)}M`
    : n >= 1_000
      ? `${(n / 1_000).toFixed(1)}K`
      : String(n);

export default function BookCard({ book, variant = "browse", priority = false }: BookCardProps) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => setNow(Date.now()), []);

  const t = useTranslations("home");
  const tc = useTranslations("bookCard");

  const isContinue = variant === "continue";
  const progress = book.progressPct ?? 0;
  const reviews = book.reviewCount ?? 0;

  // NEW badge: only within 14 days of creation, only on browse variant
  const isNew = !isContinue && book.createdAt && now
    ? now - new Date(book.createdAt).getTime() < FOURTEEN_DAYS_MS
    : false;

  function relativeTime(iso: string | null | undefined): string {
    if (!iso || !now) return "";
    const days = Math.floor((now - new Date(iso).getTime()) / 86_400_000);
    if (days === 0) return t("today");
    if (days === 1) return t("yesterday");
    if (days < 7) return t("daysAgo", { days });
    return t("weeksAgo", { weeks: Math.floor(days / 7) });
  }



  // View analytics moved to the detail page's BookViewPing (one event per
  // real detail view, anonymous included) — card clicks no longer log.

  return (
    <article className="group relative flex h-full flex-col overflow-hidden rounded-xl bg-bg-surface border border-white/10 shadow-lg transition-all duration-200 ease-out hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-[0_8px_24px_-6px_rgba(79,70,229,0.3)] transform-gpu will-change-transform">

      {/* Brand-colored top-rule accent — reveals on hover */}
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 z-20 h-[3px] origin-left scale-x-0 bg-brand transition-transform duration-250 group-hover:scale-x-100"
      />

      {/* prefetch={false}: a grid of cards would otherwise fire one RSC
          prefetch per card on viewport entry — a request storm on listing
          pages. Navigation still streams the detail loading skeleton. */}
      <Link
        href={`/books/${book.slug}`}
        prefetch={false}
        className="flex h-full flex-col rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
      >
        {/* ── Cover ── */}
        <div className="relative aspect-[3/4] w-full overflow-hidden bg-paper">
          <SmartBookCover
            coverUrl={book.coverUrl}
            title={book.title}
            author={book.author}
            category={book.category || book.department}
            seed={book.slug}
            variant="card"
            sizes="(max-width:640px) 50vw, (max-width:768px) 33vw, (max-width:1024px) 25vw, (max-width:1280px) 20vw, 220px"
            priority={priority}
            imgClassName="transition-transform duration-500 group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
          />

          {/* NEW badge — solid pill, top-left, only on browse + new books */}
          {isNew && (
            <span className="absolute left-2 top-2 z-[4] rounded-[4px] bg-brand px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest text-brand-contrast">
              {tc("new")}
            </span>
          )}

          {/* Category pill — bottom-left, frosted white. Only over real cover
              images: the generated cover already carries its category label. */}
          {book.coverUrl && (book.category || book.department) && (
            <span className="absolute bottom-2 left-2 z-[4] rounded-[4px] bg-white/90 px-2 py-0.5 text-[8px] font-bold uppercase tracking-wider text-blue-700 shadow-sm backdrop-blur-sm">
              {book.category || book.department}
            </span>
          )}
        </div>

        {/* ── Progress bar — continue variant, sits between cover and body ── */}
        {isContinue && (
          <div className="h-1 overflow-hidden bg-divider">
            <div
              className="h-full bg-brand transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}

        {/* ── Body ── */}
        <div className="flex flex-1 flex-col px-3 pb-3 pt-2.5 min-w-0">

          {/* Progress text — continue variant */}
          {isContinue && (
            <p className="mb-1.5 text-[10px] leading-none text-text-muted">
              <span className="font-bold text-brand">{t("readPct", { pct: progress })}</span>
              {relativeTime(book.lastReadAt) && (
                <> · {relativeTime(book.lastReadAt)}</>
              )}
            </p>
          )}

          {/* Title */}
          <h3 className="min-h-[2.6em] text-[13px] font-khmer-serif font-bold leading-[1.5] text-text-heading line-clamp-2 sm:text-[13.5px]">
            {book.title}
          </h3>

          {/* Author */}
          <p className="mt-1 text-[11px] text-text-muted line-clamp-1 font-medium leading-relaxed">
            {book.author}
          </p>

          {/* ── Footer ── */}
          <div className="mt-auto pt-2.5">

            {/* Stats + Rating — browse variant only. Zero-value metrics are
                hidden: "0 views · 0 downloads · No reviews yet" is anti-proof,
                not information. */}
            {!isContinue && ((book.viewCount ?? 0) > 0 || (book.downloadCount ?? 0) > 0 || reviews > 0) && (
              <div className="mb-2.5 flex flex-col gap-1.5">
                {((book.viewCount ?? 0) > 0 || (book.downloadCount ?? 0) > 0) && (
                  <div className="flex items-center gap-2 text-[11px] text-text-muted">
                    {(book.viewCount ?? 0) > 0 && (
                      <span className="flex items-center gap-1">
                        <Icon name="eye" className="h-[13px] w-[13px]" />
                        {formatCount(book.viewCount ?? 0)}
                      </span>
                    )}
                    {(book.viewCount ?? 0) > 0 && (book.downloadCount ?? 0) > 0 && (
                      <span className="text-divider">·</span>
                    )}
                    {(book.downloadCount ?? 0) > 0 && (
                      <span className="flex items-center gap-1">
                        <Icon name="download" className="h-[13px] w-[13px]" />
                        {formatCount(book.downloadCount ?? 0)}
                      </span>
                    )}
                  </div>
                )}

                {reviews > 0 && (
                  <div className="flex items-center gap-1.5">
                    <RatingStars rating={book.rating} compact />
                    <span className="text-[10px] text-text-muted">
                      · {formatCount(reviews)}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Divider */}
            <div className="mb-2.5 h-px bg-divider" aria-hidden />

            {/* CTA button */}
            <span
              className={`flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[11.5px] font-bold transition-all duration-200 ${
                isContinue
                  ? "bg-brand text-brand-contrast"
                  : "border border-brand/20 bg-transparent text-brand group-hover:border-brand group-hover:bg-brand group-hover:text-brand-contrast"
              }`}
            >
              {isContinue ? tc("continue") : tc("view")}
              <svg
                className="h-3 w-3 transition-transform duration-200 group-hover:translate-x-0.5"
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
      </Link>
    </article>
  );
}
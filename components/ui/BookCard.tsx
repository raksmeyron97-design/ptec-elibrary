// components/ui/BookCard.tsx
import Link from "next/link";
import Image from "next/image";
import type { Book } from "@/lib/books";
import BookCover from "@/components/ui/BookCover";
import RatingStars from "@/components/ui/RatingStars";

type BookCardProps = {
  book: Book & { coverUrl?: string | null; reviewCount?: number; progressPct?: number; downloadCount?: number };
};

export default function BookCard({ book }: BookCardProps) {
  const readable  = !!book.pdfUrl;
  const progress  = book.progressPct  ?? 0;
  const downloads = book.downloadCount ?? 0;

  const downloadLabel =
    downloads >= 1_000_000 ? `${(downloads / 1_000_000).toFixed(1)}M`
    : downloads >= 1_000   ? `${(downloads / 1_000).toFixed(1)}K`
    : String(downloads);

  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-[16px] border border-slate-100 bg-white transition-all duration-300 ease-out hover:-translate-y-1 hover:border-slate-200 hover:shadow-[0_16px_40px_-12px_rgba(11,42,48,0.22)]">
      <Link href={`/books/${book.slug}`} className="flex h-full flex-col">

        {/* ── Cover ── */}
        <div className="relative aspect-[3/4] w-full overflow-hidden rounded-t-[16px]">
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

          {/* Top-left: Department + Category — Top-right: PDF badge */}
          <div className="absolute left-2 top-2 z-[4] flex flex-col items-start gap-1">
            <span className="rounded-md bg-black/50 px-2 py-0.5 text-[9px] font-semibold text-white backdrop-blur-sm line-clamp-1 max-w-[110px]">
              {book.department}
            </span>
            {book.category && book.category !== book.department && (
              <span className="rounded-md bg-black/40 px-2 py-0.5 text-[9px] font-semibold text-white/90 backdrop-blur-sm line-clamp-1 max-w-[110px]">
                {book.category}
              </span>
            )}
          </div>
          <span className="absolute right-2 top-2 z-[4] rounded-lg bg-white/95 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-900 shadow-[0_2px_8px_rgba(0,0,0,0.18)]">
            {book.format || "PDF"}
          </span>

          {/* Bottom overlay: Title + Author */}
          <div className="absolute inset-x-0 bottom-0 z-[4] bg-gradient-to-t from-black/80 via-black/50 to-transparent px-3 pb-3 pt-8">
            <h3
              className="text-[13px] font-bold leading-snug text-white line-clamp-2 sm:text-[14px]"
              style={{ fontFamily: "'Hanuman', serif" }}
            >
              {book.title}
            </h3>
            <p className="mt-0.5 flex items-center gap-1 text-[10px] text-white/75 sm:text-[11px]">
              <svg className="h-2.5 w-2.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
              <span className="line-clamp-1">{book.author}</span>
            </p>
          </div>

          {/* reading-progress strip */}
          {progress > 0 && (
            <div className="absolute inset-x-0 bottom-0 z-[5] h-1 bg-black/25">
              <div className="h-full bg-[#19A6B6] shadow-[0_0_8px_#19A6B6]" style={{ width: `${progress}%` }} />
            </div>
          )}
        </div>

        {/* ── Body ── */}
        <div className="flex flex-1 flex-col gap-1.5 p-3 sm:p-[14px]">

          {/* Readable / progress status badge */}
          <div>
            {progress > 0 ? (
              <span className="rounded-md bg-[#E4F4F5] px-2 py-0.5 text-[10px] font-semibold text-[#075863]">
                {progress}% read
              </span>
            ) : (
              <span className={`rounded-md px-2 py-0.5 text-[10px] font-semibold ${readable ? "bg-[#E4F4F5] text-[#075863]" : "bg-amber-50 text-amber-700"}`}>
                {readable ? "Readable" : "PDF needed"}
              </span>
            )}
          </div>

          {/* Summary — hidden on mobile, 2 lines on sm+ */}
          <p className="hidden line-clamp-2 text-[12px] leading-5 text-slate-400 sm:block">
            {book.summary}
          </p>

          {/* Footer: 2-row layout — no overlap on mobile */}
          <div className="mt-auto flex flex-col gap-1 border-t border-slate-100 pt-2">

            {/* Row 1: Stars + review count */}
            <div className="flex items-center gap-1.5">
              <RatingStars rating={book.rating} compact />
              {book.reviewCount ? (
                <span className="text-[10px] text-slate-400">({book.reviewCount})</span>
              ) : null}
            </div>

            {/* Row 2: Downloads (left) + View/Continue (right) */}
            <div className="flex items-center justify-between">
              {downloads > 0 ? (
                <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-slate-400">
                  <svg className="h-2.5 w-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M12 3v13m0 0-4-4m4 4 4-4" /><path d="M4 20h16" />
                  </svg>
                  {downloadLabel}
                </span>
              ) : (
                <span />
              )}
              <span className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-[#0C7C8A]">
                {progress > 0 ? "Continue" : "View"}
                <svg className="h-2.5 w-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
                  <path d="m9 18 6-6-6-6" />
                </svg>
              </span>
            </div>

          </div>
        </div>
      </Link>
    </article>
  );
}
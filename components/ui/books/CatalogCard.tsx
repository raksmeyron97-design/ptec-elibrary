"use client";
// components/ui/books/CatalogCard.tsx

import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import type { CatalogBook, CopyStatusRow } from "@/lib/catalog";
import {
  computeCopyStats,
  statsFromCounters,
  getCatalogAvailability,
  AVAILABILITY_KEY,
  AVAILABILITY_TONE,
  TONE_DOT,
} from "@/lib/catalog";
import SmartBookCover from "@/components/ui/books/SmartBookCover";

// 700-scale in light mode: the 600s fail WCAG AA (4.5:1) at this text size.
const TONE_TEXT: Record<string, string> = {
  positive: "text-emerald-700 dark:text-emerald-400",
  warning:  "text-amber-700 dark:text-amber-400",
  danger:   "text-red-600 dark:text-red-400",
  info:     "text-sky-700 dark:text-sky-400",
  neutral:  "text-text-muted",
};

type Props = {
  book: CatalogBook & { catalog_copies?: CopyStatusRow[] };
};

export default function CatalogCard({ book }: Props) {
  const t = useTranslations("catalogs");
  // Availability is derived from copy rows when the query embedded them;
  // otherwise fall back to the derived counters on the book row.
  const stats = book.catalog_copies
    ? computeCopyStats(book.catalog_copies)
    : statsFromCounters(book);
  const availability = getCatalogAvailability(stats);
  const tone = AVAILABILITY_TONE[availability];
  const dotColor = TONE_DOT[tone];
  const textColor = TONE_TEXT[tone];

  return (
    <Link
      href={`/catalogs/${book.slug}`}
      prefetch={false}
      className="group relative flex h-full flex-col overflow-hidden rounded-xl border border-divider bg-bg-surface shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
    >
      {/* Gold top-rule on hover (brand signature) */}
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 z-20 h-[3px] origin-left scale-x-0 bg-accent transition-transform duration-300 group-hover:scale-x-100"
      />

      {/* Cover — real image or the generated PTEC cover, resolved centrally */}
      <div className="relative aspect-[3/4] w-full overflow-hidden">
        <SmartBookCover
          coverUrl={book.cover_url}
          title={book.title}
          author={book.author}
          category={book.category}
          seed={book.slug}
          variant="card"
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
          unoptimized
          imgClassName="transition-transform duration-300 group-hover:scale-105 motion-reduce:transition-none motion-reduce:group-hover:scale-100"
        />

        {/* Availability badge — compact: dot + short status */}
        <span
          className={`
            absolute right-2 top-2
            inline-flex max-w-[80%] items-center gap-1.5
            rounded-full border px-2 py-1
            text-[10px] font-bold leading-none backdrop-blur-sm
            bg-bg-surface/90
            ${textColor}
            border-current/20
          `}
        >
          <span aria-hidden className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotColor}`} />
          <span className="truncate">{t(`availShort.${AVAILABILITY_KEY[availability]}`)}</span>
        </span>
      </div>

      {/* Info */}
      <div className="flex flex-1 flex-col gap-1 p-3">
        <p className="font-khmer-serif line-clamp-2 text-sm font-bold leading-snug text-text-heading">
          {book.title}
        </p>
        <p className="truncate text-xs text-text-muted">
          {book.author}
          {book.year ? ` · ${book.year}` : ""}
        </p>

        {/* Copies + shelf */}
        <div className="mt-auto flex items-center justify-between pt-2">
          <span className={`text-[11px] font-semibold ${textColor}`}>
            {t("copiesCount", { available: stats.available, total: stats.total })}
          </span>
          {book.shelf_location && (
            <span className="rounded-md bg-paper px-1.5 py-0.5 font-mono text-[10px] text-text-muted">
              {book.shelf_location}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

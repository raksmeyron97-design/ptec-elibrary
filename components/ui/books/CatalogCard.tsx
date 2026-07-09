"use client"
/* eslint-disable @typescript-eslint/no-explicit-any */

 
;
/* eslint-disable @typescript-eslint/no-unused-vars */

// components/ui/CatalogCard.tsx

import Image from "next/image";
import { Link } from "@/i18n/navigation";
import { useTranslations } from 'next-intl';
import type { CatalogBook } from "@/lib/catalog";
import {
  getAvailability,
  AVAILABILITY_LABEL,
  AVAILABILITY_COLOR,
  AVAILABILITY_DOT,
} from "@/lib/catalog";

type Props = {
  book: CatalogBook;
};

export default function CatalogCard({ book }: Props) {
  const t = useTranslations('catalogs');
  const status = getAvailability(book);
  const dotColor  = AVAILABILITY_DOT[status];
  const textColor = AVAILABILITY_COLOR[status];
  const statusKey = status === 'available' ? 'availAvailable' : status === 'limited' ? 'availLimited' : 'availUnavailable';

  return (
    <Link
      href={`/catalogs/${book.slug}`}
      className="group relative flex h-full flex-col overflow-hidden rounded-xl bg-bg-surface border border-divider shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
    >
      {/* Gold top-rule on hover (brand signature) */}
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 z-20 h-[3px] origin-left scale-x-0 bg-accent transition-transform duration-300 group-hover:scale-x-100"
      />

      {/* Cover */}
      <div className="relative aspect-[3/4] w-full overflow-hidden">
        {book.cover_url ? (
          <Image
            src={book.cover_url}
            alt={book.title}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
            className="object-cover transition-transform duration-300 group-hover:scale-105"
            unoptimized={true}
          />
        ) : (
          /* Fallback gradient cover */
          <div className={`absolute inset-0 ${book.cover_color} flex items-end p-3`}>
            <div className="space-y-1">
              <p className="text-[11px] font-bold uppercase tracking-widest text-white/60 leading-none">
                {book.category ?? "Book"}
              </p>
              <p className="font-khmer-serif text-sm font-bold text-white leading-snug line-clamp-3">
                {book.title}
              </p>
              <p className="text-[11px] text-white/70 leading-none">{book.author}</p>
            </div>
          </div>
        )}

        {/* Availability badge — top-left */}
        <span
          className={`
            absolute left-2 top-2
            inline-flex items-center gap-1.5
            rounded-full border px-2 py-0.5
            text-[10px] font-bold backdrop-blur-sm
            bg-bg-surface/90
            ${textColor}
            border-current/20
          `}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${dotColor}`} />
          {t(statusKey as any)}
        </span>
      </div>

      {/* Info */}
      <div className="flex flex-1 flex-col gap-1 p-3">
        <p className="font-khmer-serif line-clamp-2 text-sm font-bold text-text-heading leading-snug">
          {book.title}
        </p>
        <p className="text-xs text-text-muted truncate">{book.author}</p>

        {/* Copies + shelf */}
        <div className="mt-auto pt-2 flex items-center justify-between">
          <span className={`text-[11px] font-semibold ${textColor}`}>
            {t('copiesCount', { available: book.copies_available, total: book.copies_total })}
          </span>
          {book.shelf_location && (
            <span className="text-[10px] font-mono text-text-muted bg-paper px-1.5 py-0.5 rounded-md">
              {book.shelf_location}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
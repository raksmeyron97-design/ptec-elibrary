"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { AlertTriangle, ArrowDown, ArrowUp, GripVertical, ShieldCheck, Sparkles, X } from "lucide-react";

import EbookCover from "@/components/admin/ebooks/EbookCover";
import { featuredRowWarning, positionLabel } from "@/lib/books/featured";
import type { FeaturedBookRow } from "@/app/actions/featured-books";

/**
 * One book on the shelf.
 *
 * Extracted from FeaturedBooksClient so the parent owns the draft order, the
 * save lifecycle and the dialog, and this owns how a row reads and what it
 * offers. It holds no state: every interaction is reported upward, because the
 * order is a single draft and a row that could move itself would be a second
 * place the shelf's order lives.
 *
 * Read-only viewers get the row and none of the machinery — the drag handle,
 * the `draggable` attribute, the arrows and Remove are absent together.
 * Hiding reorder arrows while leaving the row draggable is a control that only
 * looks gone.
 */
export default function FeaturedShelfRow({
  book,
  index,
  total,
  canCurate,
  saving,
  isBusy,
  isDragging,
  onMove,
  onDragStart,
  onDragEnd,
  onDrop,
  onRemove,
}: {
  book: FeaturedBookRow;
  index: number;
  total: number;
  canCurate: boolean;
  saving: boolean;
  isBusy: boolean;
  isDragging: boolean;
  onMove: (id: string, delta: -1 | 1) => void;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onDrop: (id: string) => void;
  onRemove: (book: FeaturedBookRow) => void;
}) {
  const t = useTranslations("adminEbooks.featured");
  const locale = useLocale();
  const warning = featuredRowWarning(book);

  const featuredOn = new Date(book.featuredAt).toLocaleDateString(
    locale === "km" ? "km-KH" : "en-US",
    { year: "numeric", month: "short", day: "numeric" },
  );

  return (
    <li
      draggable={canCurate && !saving}
      onDragStart={() => canCurate && onDragStart(book.id)}
      onDragEnd={onDragEnd}
      onDragOver={(e) => {
        if (canCurate) e.preventDefault();
      }}
      onDrop={(e) => {
        e.preventDefault();
        onDrop(book.id);
      }}
      className={`flex items-start gap-3 rounded-xl border bg-bg-surface p-3 shadow-sm transition-colors ${
        isDragging ? "border-brand bg-surface-brand-soft" : "border-divider"
      } ${isBusy ? "opacity-50" : ""}`}
    >
      {canCurate && (
        <span className="mt-3 hidden shrink-0 cursor-grab text-text-muted/60 sm:block" aria-hidden="true">
          <GripVertical className="h-4 w-4" />
        </span>
      )}

      {/* The position is the product, so it is rendered as text rather than
          implied by row order alone — it is what a librarian reads back to a
          colleague on the phone. */}
      <span className="mt-2 w-7 shrink-0 text-center text-sm font-bold tabular-nums text-text-muted">
        {positionLabel(index)}
      </span>

      <EbookCover coverUrl={book.coverUrl} title={book.title} className="h-14 w-10 shrink-0" />

      <div className="min-w-0 flex-1">
        <Link
          href={`/admin/edit/${book.id}`}
          className="line-clamp-1 text-sm font-semibold text-text-heading transition-colors hover:text-brand"
        >
          {book.title}
        </Link>
        <p className="truncate text-xs text-text-muted">
          {book.author ?? t("noAuthor")}
          {book.category ? ` · ${book.category}` : ""}
        </p>

        {/* Three facts, three badges — never one merged status. */}
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1 rounded-full bg-surface-brand-soft px-2 py-0.5 text-[11px] font-semibold text-brand">
            <Sparkles className="h-3 w-3" aria-hidden="true" /> {t("badge")}
          </span>
          {book.verifiedAt && (
            <span className="inline-flex items-center gap-1 rounded-full bg-success-soft px-2 py-0.5 text-[11px] font-semibold text-success-text">
              <ShieldCheck className="h-3 w-3" aria-hidden="true" /> {t("verified")}
            </span>
          )}
          {warning && (
            <span className="inline-flex items-center gap-1 rounded-full bg-warning-soft px-2 py-0.5 text-[11px] font-semibold text-warning-text">
              <AlertTriangle className="h-3 w-3" aria-hidden="true" /> {t(`warning.${warning}`)}
            </span>
          )}
        </div>

        <p className="mt-1.5 text-[11px] text-text-muted">
          {book.featuredBy
            ? t("provenance", { name: book.featuredBy.name, date: featuredOn })
            : t("provenanceUnknown", { date: featuredOn })}
        </p>
      </div>

      {canCurate && (
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            id={`feature-move-up-${book.id}`}
            onClick={() => onMove(book.id, -1)}
            disabled={index === 0 || saving}
            aria-label={t("moveUpFor", { title: book.title })}
            className="focus-field flex h-8 w-8 items-center justify-center rounded-md border border-divider text-text-muted transition-colors hover:border-brand/40 hover:text-brand disabled:opacity-40"
          >
            <ArrowUp className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => onMove(book.id, 1)}
            disabled={index === total - 1 || saving}
            aria-label={t("moveDownFor", { title: book.title })}
            className="focus-field flex h-8 w-8 items-center justify-center rounded-md border border-divider text-text-muted transition-colors hover:border-brand/40 hover:text-brand disabled:opacity-40"
          >
            <ArrowDown className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => onRemove(book)}
            disabled={saving}
            className="focus-field inline-flex h-8 items-center gap-1.5 rounded-md border border-divider px-2.5 text-xs font-semibold text-text-muted transition-colors hover:border-danger/40 hover:text-danger disabled:opacity-40"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">{t("remove")}</span>
            <span className="sr-only sm:hidden">{t("removeFor", { title: book.title })}</span>
          </button>
        </div>
      )}
    </li>
  );
}

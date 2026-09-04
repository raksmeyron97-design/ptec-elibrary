"use client";

import { memo } from "react";
import { Bookmark, X } from "lucide-react";
import { useTranslations } from "next-intl";

/* Bookmarks, labelled with the nearest outline heading when the document
   has one, and the page number always. */
const ReaderBookmarks = memo(function ReaderBookmarks({
  bookmarks,
  currentPage,
  sectionFor,
  onSelect,
  onRemove,
  onAddCurrent,
  fmt,
}: {
  bookmarks: number[];
  currentPage: number;
  sectionFor: (page: number) => string | null;
  onSelect: (page: number) => void;
  onRemove: (page: number) => void;
  onAddCurrent: () => void;
  fmt: (n: number | string) => string;
}) {
  const t = useTranslations("reader");
  const hasCurrent = bookmarks.includes(currentPage);
  return (
    <div>
      {!hasCurrent && (
        <button type="button" onClick={onAddCurrent} className="reader-row mb-1 items-center">
          <Bookmark className="h-4 w-4 shrink-0" aria-hidden />
          <span className="flex-1 font-semibold">{t("bookmarkAdd")}</span>
          <span className="reader-faint text-[11px] tabular-nums">{t("page")} {fmt(currentPage)}</span>
        </button>
      )}
      {bookmarks.length === 0 ? (
        <p className="reader-muted p-3 text-[13px] leading-6">{t("noBookmarks")}</p>
      ) : (
        <ul className="space-y-0.5">
          {bookmarks.map((p) => {
            const section = sectionFor(p);
            return (
              <li key={p} className="flex items-stretch gap-1">
                <button
                  type="button"
                  onClick={() => onSelect(p)}
                  aria-current={p === currentPage ? "page" : undefined}
                  className="reader-row min-w-0 flex-1 items-center"
                >
                  <Bookmark className="h-4 w-4 shrink-0" fill="currentColor" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{section ?? `${t("page")} ${fmt(p)}`}</span>
                    {section && <span className="reader-faint block text-[11px]">{t("page")} {fmt(p)}</span>}
                  </span>
                  <span className="reader-faint shrink-0 text-[11px] tabular-nums">{fmt(p)}</span>
                </button>
                <button
                  type="button"
                  onClick={() => onRemove(p)}
                  aria-label={`${t("bookmarkRemove")} — ${t("page")} ${fmt(p)}`}
                  className="reader-btn shrink-0"
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
});

export default ReaderBookmarks;

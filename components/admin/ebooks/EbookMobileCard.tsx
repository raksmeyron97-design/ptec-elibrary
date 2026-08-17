"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Eye, Download, Pencil } from "lucide-react";
import { Badge } from "@/components/admin/kit";
import EbookActionsMenu from "@/components/admin/ebooks/EbookActionsMenu";
import EbookQualityBadge from "@/components/admin/ebooks/EbookQualityBadge";
import EbookFileHealthBadge from "@/components/admin/ebooks/EbookFileHealthBadge";
import EbookCover from "@/components/admin/ebooks/EbookCover";
import { EBOOK_STATUS_TONES, EBOOK_STATUS_LABELS, formatFileSize, type EbookListRow } from "@/lib/admin/ebooks-shared";

/**
 * The table's under-`md` form: the same eight columns as a stacked card, with
 * actions always visible (there is no hover to reveal them on a phone).
 */
export default function EbookMobileCard({
  rows,
  selectedIds,
  busyId,
  onToggleSelect,
  onPublish,
  onUnpublish,
  onArchive,
  onRestore,
  onDeleteRequest,
}: {
  rows: EbookListRow[];
  selectedIds: Set<string>;
  busyId: string | null;
  onToggleSelect: (id: string) => void;
  onPublish: (id: string) => void;
  onUnpublish: (id: string) => void;
  onArchive: (id: string) => void;
  onRestore: (id: string) => void;
  onDeleteRequest: (id: string, title: string) => void;
}) {
  const t = useTranslations("adminEbooks.table");
  const tStatus = useTranslations("adminEbooks.status");
  const locale = useLocale();
  const numberLocale = locale === "km" ? "km-KH" : "en-US";

  return (
    <div className="space-y-2.5 md:hidden">
      {rows.map((book) => {
        const isSelected = selectedIds.has(book.id);
        const isBusy = busyId === book.id;
        return (
          <div
            key={book.id}
            className={`rounded-xl border p-3.5 shadow-sm transition-colors duration-150 ${
              isSelected ? "border-surface-brand-line bg-surface-brand-soft" : "border-divider bg-bg-surface"
            } ${isBusy ? "opacity-50" : ""}`}
          >
            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => onToggleSelect(book.id)}
                aria-label={t("selectOne", { title: book.title })}
                className="mt-1 h-4 w-4 shrink-0 rounded-sm border-divider accent-[var(--ptec-brand)]"
              />
              <EbookCover coverUrl={book.coverUrl} title={book.title} className="h-14 w-10" />

              <div className="min-w-0 flex-1">
                <Link
                  href={`/admin/edit/${book.id}`}
                  className="line-clamp-2 text-sm font-semibold leading-6 text-text-heading"
                >
                  {book.title}
                </Link>
                <p className="truncate text-xs leading-5 text-text-muted">
                  {(book.fileFormat ?? "PDF").toUpperCase()}
                  {book.language ? ` · ${book.language}` : ""}
                  {book.fileSizeKb ? ` · ${formatFileSize(book.fileSizeKb)}` : ""}
                </p>
                <p className="truncate text-xs leading-5 text-text-muted">
                  {book.author ?? t("noAuthor")} · {book.department ?? t("noDepartment")} · {book.year ?? t("noYear")}
                </p>

                <div className="mt-2 flex flex-wrap items-center gap-1">
                  <Badge tone={EBOOK_STATUS_TONES[book.status]}>
                    {EBOOK_STATUS_LABELS[book.status] ? tStatus(book.status) : book.status}
                  </Badge>
                  <EbookFileHealthBadge book={book} />
                  <EbookQualityBadge book={book} />
                </div>

                <div className="mt-2.5 flex items-center gap-3 border-t border-divider pt-2.5">
                  <span className="inline-flex items-center gap-1.5 text-xs tabular-nums text-text-muted">
                    <Eye className="h-3 w-3" aria-hidden="true" />
                    {book.viewCount.toLocaleString(numberLocale)}
                    <span className="sr-only">{t("views")}</span>
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-xs tabular-nums text-text-muted">
                    <Download className="h-3 w-3" aria-hidden="true" />
                    {book.downloadCount.toLocaleString(numberLocale)}
                    <span className="sr-only">{t("downloads")}</span>
                  </span>

                  <div className="ml-auto flex items-center gap-0.5">
                    <Link
                      href={`/admin/edit/${book.id}`}
                      aria-label={t("editFor", { title: book.title })}
                      className="flex h-8 w-8 items-center justify-center rounded-md text-text-muted transition-colors duration-150 hover:bg-paper hover:text-brand"
                    >
                      <Pencil className="h-4 w-4" aria-hidden="true" />
                    </Link>
                    <EbookActionsMenu
                      book={book}
                      busy={isBusy}
                      onPublish={() => onPublish(book.id)}
                      onUnpublish={() => onUnpublish(book.id)}
                      onArchive={() => onArchive(book.id)}
                      onRestore={() => onRestore(book.id)}
                      onDeleteRequest={onDeleteRequest}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

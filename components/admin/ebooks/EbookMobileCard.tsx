"use client";

import Link from "next/link";
import { Eye, Download, ExternalLink } from "lucide-react";
import EbookActionsMenu from "@/components/admin/ebooks/EbookActionsMenu";
import EbookQualityBadge from "@/components/admin/ebooks/EbookQualityBadge";
import EbookFileHealthBadge from "@/components/admin/ebooks/EbookFileHealthBadge";
import EbookCover from "@/components/admin/ebooks/EbookCover";
import { EBOOK_STATUS_BADGE_STYLES, EBOOK_STATUS_LABELS, formatFileSize, type EbookListRow } from "@/lib/admin/ebooks-shared";

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
  return (
    <div className="space-y-3 md:hidden">
      {rows.map((book) => {
        const isSelected = selectedIds.has(book.id);
        const isBusy = busyId === book.id;
        return (
          <div
            key={book.id}
            className={`rounded-xl border p-4 shadow-sm transition ${isSelected ? "border-brand/40 bg-brand/5" : "border-divider bg-bg-surface"} ${isBusy ? "opacity-50" : ""}`}
          >
            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => onToggleSelect(book.id)}
                aria-label={`Select ${book.title}`}
                className="mt-1 h-4 w-4 shrink-0 rounded border-divider text-brand focus:ring-focus-ring/30"
              />
              <EbookCover coverUrl={book.coverUrl} title={book.title} className="h-16 w-12 shrink-0" />
              <div className="min-w-0 flex-1">
                <Link href={`/admin/edit/${book.id}`} className="font-semibold leading-[1.6] text-text-heading line-clamp-2">
                  {book.title}
                </Link>
                <p className="mt-0.5 truncate text-xs text-text-muted">{book.author ?? "No author"}</p>
                <p className="mt-1 text-xs text-text-muted">
                  {book.department ?? "No department"} · {book.year ?? "No year"}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${EBOOK_STATUS_BADGE_STYLES[book.status]}`}>
                    {EBOOK_STATUS_LABELS[book.status]}
                  </span>
                  <EbookQualityBadge book={book} />
                </div>
                <div className="mt-2">
                  <EbookFileHealthBadge book={book} />
                </div>
                <p className="mt-1 text-xs text-text-muted">
                  {(book.fileFormat ?? "PDF").toUpperCase()} · {formatFileSize(book.fileSizeKb)}
                </p>
                <dl className="mt-2 flex items-center gap-4 text-xs text-text-muted">
                  <div className="flex items-center gap-1"><Eye className="h-3 w-3" /> {book.viewCount.toLocaleString()}</div>
                  <div className="flex items-center gap-1"><Download className="h-3 w-3" /> {book.downloadCount.toLocaleString()}</div>
                </dl>
                <div className="mt-3 flex items-center gap-2">
                  {book.status === "published" && (
                    <Link
                      href={`/books/${book.slug}`}
                      target="_blank"
                      className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-divider px-3 text-xs font-semibold text-text-body"
                    >
                      <ExternalLink className="h-3.5 w-3.5" /> View
                    </Link>
                  )}
                  <Link
                    href={`/admin/edit/${book.id}`}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-divider px-3 text-xs font-semibold text-text-body"
                  >
                    Edit
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
        );
      })}
    </div>
  );
}

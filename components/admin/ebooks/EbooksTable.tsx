"use client";

import { Fragment } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowDown, ArrowUp, ChevronsUpDown, Eye, Download, ExternalLink } from "lucide-react";
import { useTranslations } from "next-intl";
import EbookActionsMenu from "@/components/admin/ebooks/EbookActionsMenu";
import EbookQualityBadge from "@/components/admin/ebooks/EbookQualityBadge";
import EbookFileHealthBadge from "@/components/admin/ebooks/EbookFileHealthBadge";
import EbookCover from "@/components/admin/ebooks/EbookCover";
import { EBOOK_STATUS_BADGE_STYLES, EBOOK_STATUS_LABELS, formatFileSize, type EbookListRow } from "@/lib/admin/ebooks-shared";
import { withUpdatedParams } from "@/lib/admin/ebooks-url";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

/** Column header wired to the URL-driven sort presets. `asc`/`desc` are keys
 *  from EBOOK_SORT_OPTIONS; when `desc` is omitted the column has one order. */
function SortableTh({
  label,
  asc,
  desc,
  defaultDir = "asc",
  className = "",
}: {
  label: string;
  asc: string;
  desc?: string;
  defaultDir?: "asc" | "desc";
  className?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const current = searchParams.get("sort") ?? "newest";
  const isAsc = current === asc;
  const isDesc = desc !== undefined && current === desc;
  const next = isAsc
    ? (desc ?? asc)
    : isDesc
      ? asc
      : defaultDir === "desc" && desc
        ? desc
        : asc;

  return (
    <th
      scope="col"
      aria-sort={isAsc ? "ascending" : isDesc ? "descending" : undefined}
      className={className}
    >
      <button
        type="button"
        onClick={() => router.push(withUpdatedParams(searchParams, { sort: next }))}
        className="inline-flex items-center gap-1 uppercase tracking-wide transition-colors hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        {label}
        {isAsc ? (
          <ArrowUp className="h-3 w-3" aria-hidden="true" />
        ) : isDesc ? (
          <ArrowDown className="h-3 w-3" aria-hidden="true" />
        ) : (
          <ChevronsUpDown className="h-3 w-3 opacity-40" aria-hidden="true" />
        )}
      </button>
    </th>
  );
}

type RowActions = {
  onPublish: (id: string) => void;
  onUnpublish: (id: string) => void;
  onArchive: (id: string) => void;
  onRestore: (id: string) => void;
  onDeleteRequest: (id: string, title: string) => void;
};

export default function EbooksTable({
  rows,
  selectedIds,
  allSelected,
  busyId,
  onToggleSelect,
  onToggleSelectAll,
  ...actions
}: RowActions & {
  rows: EbookListRow[];
  selectedIds: Set<string>;
  allSelected: boolean;
  busyId: string | null;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
}) {
  const t = useTranslations("adminEbooks.table");
  const tStatus = useTranslations("adminEbooks.status");
  return (
    <div className="hidden rounded-xl border border-divider bg-bg-surface shadow-sm md:block">
      <div className="">
        <table className="w-full text-sm">
          <caption className="sr-only">{t("caption")}</caption>
          <thead>
            <tr className="border-b border-divider bg-paper text-left text-xs font-bold uppercase tracking-wide text-text-muted [&>th:first-child]:rounded-tl-xl [&>th:last-child]:rounded-tr-xl">
              <th scope="col" className="w-10 px-4 py-3">
                <label className="sr-only" htmlFor="select-all-ebooks">{t("selectAll")}</label>
                <input
                  id="select-all-ebooks"
                  type="checkbox"
                  checked={allSelected}
                  onChange={onToggleSelectAll}
                  className="h-4 w-4 rounded border-divider text-brand focus:ring-focus-ring/30"
                />
              </th>
              <th scope="col" className="w-14 px-2 py-3 text-center">{t("cover")}</th>
              <SortableTh label={t("bookInfo")} asc="title-asc" desc="title-desc" className="px-4 py-3" />
              <th scope="col" className="hidden px-4 py-3 lg:table-cell">{t("author")}</th>
              <th scope="col" className="hidden px-4 py-3 lg:table-cell">{t("department")}</th>
              <SortableTh label={t("year")} asc="year-asc" desc="year-desc" defaultDir="desc" className="hidden px-4 py-3 xl:table-cell" />
              <th scope="col" className="hidden px-4 py-3 xl:table-cell">{t("fileHealth")}</th>
              <SortableTh label={t("metadata")} asc="metadata-quality" className="hidden px-4 py-3 xl:table-cell" />
              <SortableTh label={t("statsCol")} asc="most-downloaded" className="hidden px-4 py-3 text-right lg:table-cell" />
              <th scope="col" className="px-4 py-3 text-center">{t("statusCol")}</th>
              <SortableTh label={t("updated")} asc="updated" className="hidden px-4 py-3 xl:table-cell" />
              <th scope="col" className="px-4 py-3 text-right">{t("actionsCol")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-divider">
            {rows.map((book) => {
              const isSelected = selectedIds.has(book.id);
              const isBusy = busyId === book.id;

              return (
                <Fragment key={book.id}>
                  <tr className={`transition-colors hover:bg-paper/80 ${isBusy ? "opacity-50" : ""} ${isSelected ? "bg-brand/5" : ""}`}>
                    <td className="px-4 py-3">
                      <label className="sr-only" htmlFor={`select-ebook-${book.id}`}>{t("selectOne", { title: book.title })}</label>
                      <input
                        id={`select-ebook-${book.id}`}
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => onToggleSelect(book.id)}
                        className="h-4 w-4 rounded border-divider text-brand focus:ring-focus-ring/30"
                      />
                    </td>
                    <td className="px-2 py-3 text-center">
                      <EbookCover coverUrl={book.coverUrl} title={book.title} className="mx-auto h-14 w-10" />
                    </td>
                    <td className="max-w-[280px] px-4 py-3">
                      <Link
                        href={`/admin/edit/${book.id}`}
                        title={book.title}
                        className="font-semibold leading-[1.6] text-text-heading hover:text-brand line-clamp-2"
                      >
                        {book.title}
                      </Link>
                      <p className="mt-0.5 truncate text-xs text-text-muted">
                        {(book.fileFormat ?? "PDF").toUpperCase()}
                        {book.language ? ` · ${book.language}` : ""}
                        {book.fileSizeKb ? ` · ${formatFileSize(book.fileSizeKb)}` : ""}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-text-muted lg:hidden">{book.author ?? t("noAuthor")}</p>
                    </td>
                    <td className="hidden px-4 py-3 text-text-body lg:table-cell max-w-[160px] truncate">
                      {book.author ?? "—"}
                    </td>
                    <td className="hidden px-4 py-3 lg:table-cell">
                      {book.department ? (
                        <span className="rounded-md bg-paper px-2 py-0.5 text-xs font-medium text-text-body">{book.department}</span>
                      ) : (
                        <span className="text-xs text-text-muted">—</span>
                      )}
                    </td>
                    <td className="hidden px-4 py-3 tabular-nums text-text-muted xl:table-cell">{book.year ?? "—"}</td>
                    <td className="hidden px-4 py-3 xl:table-cell">
                      <EbookFileHealthBadge book={book} />
                    </td>
                    <td className="hidden px-4 py-3 xl:table-cell">
                      <EbookQualityBadge book={book} />
                    </td>
                    <td className="hidden px-4 py-3 text-right tabular-nums lg:table-cell">
                      <div className="flex flex-col items-end gap-0.5 text-xs text-text-muted">
                        <span className="inline-flex items-center gap-1"><Eye className="h-3 w-3" /> {book.viewCount.toLocaleString()}</span>
                        <span className="inline-flex items-center gap-1"><Download className="h-3 w-3" /> {book.downloadCount.toLocaleString()}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${EBOOK_STATUS_BADGE_STYLES[book.status]}`}>
                        {EBOOK_STATUS_LABELS[book.status] ? tStatus(book.status) : book.status}
                      </span>
                    </td>
                    <td className="hidden px-4 py-3 text-xs tabular-nums text-text-muted xl:table-cell">
                      {formatDate(book.updatedAt ?? book.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {book.status === "published" && (
                          <Link
                            href={`/books/${book.slug}`}
                            target="_blank"
                            title={t("viewPublic")}
                            aria-label={t("viewPublicFor", { title: book.title })}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-text-muted transition hover:bg-paper hover:text-brand"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </Link>
                        )}
                        <EbookActionsMenu
                          book={book}
                          busy={isBusy}
                          onPublish={() => actions.onPublish(book.id)}
                          onUnpublish={() => actions.onUnpublish(book.id)}
                          onArchive={() => actions.onArchive(book.id)}
                          onRestore={() => actions.onRestore(book.id)}
                          onDeleteRequest={actions.onDeleteRequest}
                        />
                      </div>
                    </td>
                  </tr>
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

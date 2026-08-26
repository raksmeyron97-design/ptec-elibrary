"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowDown, ArrowUp, ChevronsUpDown, Eye, Download, Pencil } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Badge } from "@/components/admin/kit";
import EbookActionsMenu from "@/components/admin/ebooks/EbookActionsMenu";
import EbookQualityBadge from "@/components/admin/ebooks/EbookQualityBadge";
import EbookFileHealthBadge from "@/components/admin/ebooks/EbookFileHealthBadge";
import EbookCover from "@/components/admin/ebooks/EbookCover";
import { EBOOK_STATUS_TONES, EBOOK_STATUS_LABELS, formatFileSize, type EbookListRow } from "@/lib/admin/ebooks-shared";
import { withUpdatedParams } from "@/lib/admin/ebooks-url";

function intlLocale(locale: string): string {
  return locale === "km" ? "km-KH" : "en-US";
}

function formatDate(iso: string | null, locale: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(intlLocale(locale), { year: "numeric", month: "short", day: "numeric" });
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
  const sorted = isAsc || isDesc;

  return (
    <th
      scope="col"
      aria-sort={isAsc ? "ascending" : isDesc ? "descending" : undefined}
      className={className}
    >
      <button
        type="button"
        onClick={() => router.push(withUpdatedParams(searchParams, { sort: next }))}
        className={`inline-flex items-center gap-1 uppercase tracking-wide transition-colors duration-150 hover:text-text-body ${sorted ? "text-text-body" : ""}`}
      >
        {label}
        {isAsc ? (
          <ArrowUp className="h-3 w-3" aria-hidden="true" />
        ) : isDesc ? (
          <ArrowDown className="h-3 w-3" aria-hidden="true" />
        ) : (
          <ChevronsUpDown className="h-3 w-3 opacity-50" aria-hidden="true" />
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
  onSubmitForReview: (id: string) => void;
  onVerify: (id: string) => void;
  onUnverify: (id: string) => void;
  onDeleteRequest: (id: string, title: string) => void;
};

// `text-align` is set per column rather than in the base so the actions
// column's `text-right` never has to out-sort a `text-left` on the same cell.
const thBase = "px-4 py-2.5 align-middle";
const th = `${thBase} text-left`;
const checkbox =
  "h-4 w-4 rounded-sm border-divider text-brand accent-[var(--ptec-brand)]";

/**
 * The e-books table, at eight columns.
 *
 * It carried twelve, and the three that went (cover, file health, metadata
 * quality) did not lose their data — they moved into the Document cell,
 * where a librarian reads them alongside the title they belong to instead of
 * scanning across a 1200px row. Author, format, language and size collapsed
 * into one meta line for the same reason.
 *
 * Below `md` this renders nothing; EbookMobileCard takes over. Between `md`
 * and `xl` the low-value columns drop out progressively rather than
 * squeezing every column thinner.
 */
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
  const locale = useLocale();

  return (
    <div className="hidden overflow-hidden rounded-xl border border-divider bg-bg-surface shadow-sm md:block">
      <table className="w-full text-sm">
        <caption className="sr-only">{t("caption")}</caption>
        <thead>
          <tr className="border-b border-divider bg-paper/70 text-xs font-semibold text-text-muted">
            <th scope="col" className={`${th} w-10`}>
              <label className="sr-only" htmlFor="select-all-ebooks">{t("selectAll")}</label>
              <input
                id="select-all-ebooks"
                type="checkbox"
                checked={allSelected}
                onChange={onToggleSelectAll}
                className={checkbox}
              />
            </th>
            <SortableTh label={t("document")} asc="title-asc" desc="title-desc" className={`${th} min-w-[280px]`} />
            <th scope="col" className={`${th} hidden w-[150px] uppercase tracking-wide lg:table-cell`}>
              {t("department")}
            </th>
            <SortableTh
              label={t("year")}
              asc="year-asc"
              desc="year-desc"
              defaultDir="desc"
              className={`${th} hidden w-[84px] xl:table-cell`}
            />
            <th scope="col" className={`${th} w-[116px] uppercase tracking-wide`}>{t("statusCol")}</th>
            <SortableTh
              label={t("engagement")}
              asc="most-downloaded"
              className={`${th} hidden w-[124px] lg:table-cell`}
            />
            <SortableTh label={t("updated")} asc="updated" className={`${th} hidden w-[124px] xl:table-cell`} />
            <th scope="col" className={`${thBase} w-[88px] text-right uppercase tracking-wide`}>
              <span className="sr-only">{t("actionsCol")}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((book) => {
            const isSelected = selectedIds.has(book.id);
            const isBusy = busyId === book.id;

            return (
              <tr
                key={book.id}
                className={`group border-b border-divider/60 transition-colors duration-150 last:border-b-0 ${
                  isSelected ? "bg-surface-brand-soft" : "hover:bg-paper/60"
                } ${isBusy ? "opacity-50" : ""}`}
              >
                <td className="px-4 py-3 align-top">
                  <label className="sr-only" htmlFor={`select-ebook-${book.id}`}>{t("selectOne", { title: book.title })}</label>
                  <input
                    id={`select-ebook-${book.id}`}
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => onToggleSelect(book.id)}
                    className={`${checkbox} mt-1`}
                  />
                </td>

                {/* Document — cover, title, one meta line, and flags only when
                    something needs attention. */}
                <td className="px-4 py-3 align-top">
                  <div className="flex min-h-[56px] items-start gap-3">
                    <EbookCover coverUrl={book.coverUrl} title={book.title} className="h-14 w-10" />
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/admin/edit/${book.id}`}
                        title={book.title}
                        className="line-clamp-1 text-sm font-semibold leading-6 text-text-heading transition-colors duration-150 hover:text-brand"
                      >
                        {book.title}
                      </Link>
                      <p className="truncate text-xs leading-5 text-text-muted">
                        {(book.fileFormat ?? "PDF").toUpperCase()}
                        {book.language ? ` · ${book.language}` : ""}
                        {book.fileSizeKb ? ` · ${formatFileSize(book.fileSizeKb)}` : ""}
                        {` · ${book.author ?? t("noAuthor")}`}
                      </p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1 empty:mt-0">
                        <EbookFileHealthBadge book={book} />
                        <EbookQualityBadge book={book} />
                      </div>
                    </div>
                  </div>
                </td>

                <td className="hidden px-4 py-3 align-top lg:table-cell">
                  {book.department ? (
                    <Badge title={book.department}>{book.department}</Badge>
                  ) : (
                    <span className="text-xs text-text-muted">—</span>
                  )}
                </td>

                <td className="hidden px-4 py-3 align-top text-xs tabular-nums text-text-muted xl:table-cell">
                  {book.year ?? "—"}
                </td>

                <td className="px-4 py-3 align-top">
                  <Badge tone={EBOOK_STATUS_TONES[book.status]}>
                    {EBOOK_STATUS_LABELS[book.status] ? tStatus(book.status) : book.status}
                  </Badge>
                </td>

                {/* Views + downloads stacked — one column instead of two. */}
                <td className="hidden px-4 py-3 align-top lg:table-cell">
                  <div className="flex flex-col gap-0.5 text-xs tabular-nums text-text-muted">
                    <span className="inline-flex items-center gap-1.5">
                      <Eye className="h-3 w-3 shrink-0" aria-hidden="true" />
                      {book.viewCount.toLocaleString(intlLocale(locale))}
                      <span className="sr-only">{t("views")}</span>
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <Download className="h-3 w-3 shrink-0" aria-hidden="true" />
                      {book.downloadCount.toLocaleString(intlLocale(locale))}
                      <span className="sr-only">{t("downloads")}</span>
                    </span>
                  </div>
                </td>

                <td className="hidden px-4 py-3 align-top text-xs tabular-nums text-text-muted xl:table-cell">
                  {formatDate(book.updatedAt ?? book.createdAt, locale)}
                </td>

                <td className="px-4 py-3 align-top text-right">
                  <div className="row-actions flex items-center justify-end gap-0.5">
                    <Link
                      href={`/admin/edit/${book.id}`}
                      aria-label={t("editFor", { title: book.title })}
                      title={t("edit")}
                      className="flex h-8 w-8 items-center justify-center rounded-md text-text-muted transition-colors duration-150 hover:bg-paper hover:text-brand"
                    >
                      <Pencil className="h-4 w-4" aria-hidden="true" />
                    </Link>
                    <EbookActionsMenu
                      book={book}
                      busy={isBusy}
                      onPublish={() => actions.onPublish(book.id)}
                      onUnpublish={() => actions.onUnpublish(book.id)}
                      onArchive={() => actions.onArchive(book.id)}
                      onRestore={() => actions.onRestore(book.id)}
                      onSubmitForReview={() => actions.onSubmitForReview(book.id)}
                      onVerify={() => actions.onVerify(book.id)}
                      onUnverify={() => actions.onUnverify(book.id)}
                      onDeleteRequest={actions.onDeleteRequest}
                    />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

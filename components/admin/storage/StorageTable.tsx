"use client";

import { useEffect, useRef } from "react";
import { useTranslations, useLocale } from "next-intl";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { Badge } from "@/components/admin/kit";
import type { StorageListItem } from "@/lib/types/storage";
import { formatBytes, formatDateTime, truncateMiddle, fileKind } from "@/lib/admin/storage-shared";
import StorageTypeIcon from "./StorageTypeIcon";
import StorageItemMenu, { type StorageItemIntent } from "./StorageItemMenu";
import type { SortBy, SortOrder } from "./StorageToolbar";

const checkboxCls = "focus-field h-4 w-4 rounded border-divider text-brand";

function Thumb({ item }: { item: StorageListItem }) {
  if (item.type === "folder") return <StorageTypeIcon type="folder" className="h-5 w-5 text-brand" />;
  if (fileKind(item.extension) === "image" && item.url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- admin-only thumbnail for arbitrary external storage URLs, not a Next/Image candidate
      <img src={item.url} alt="" loading="lazy" className="h-8 w-8 rounded-md border border-divider object-cover" />
    );
  }
  return (
    <span className="flex h-8 w-8 items-center justify-center rounded-md border border-divider bg-paper text-text-muted">
      <StorageTypeIcon type="file" extension={item.extension} className="h-4 w-4" />
    </span>
  );
}

/**
 * A column header that sorts.
 *
 * Sorting used to live only in two toolbar selects that were `hidden sm:block`,
 * so the thing a table is most often asked to do was invisible on a phone and
 * disconnected from the columns it reordered. The selects remain — they carry
 * the type filter and are the reachable control at narrow widths — and these
 * drive exactly the same state, so the two can never disagree.
 *
 * `aria-sort` is on the `th`, which is what a screen reader announces; the
 * button inside carries the accessible name and the direction it will apply.
 */
function SortableTh({
  column,
  label,
  sortBy,
  order,
  onSort,
  className = "",
}: {
  column: SortBy;
  label: string;
  sortBy: SortBy;
  order: SortOrder;
  onSort: (sortBy: SortBy, order: SortOrder) => void;
  className?: string;
}) {
  const t = useTranslations("adminStorage.table");
  const active = sortBy === column;
  const next: SortOrder = active && order === "asc" ? "desc" : "asc";
  const Icon = !active ? ChevronsUpDown : order === "asc" ? ArrowUp : ArrowDown;

  return (
    <th
      scope="col"
      className={`px-3 py-3 ${className}`}
      aria-sort={active ? (order === "asc" ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        onClick={() => onSort(column, next)}
        className={`focus-field -mx-1 inline-flex items-center gap-1 rounded px-1 py-0.5 transition hover:text-text-heading ${active ? "text-text-heading" : ""}`}
        aria-label={t(next === "asc" ? "sortAscBy" : "sortDescBy", { column: label })}
      >
        {label}
        <Icon className={`h-3 w-3 ${active ? "" : "opacity-40"}`} aria-hidden="true" />
      </button>
    </th>
  );
}

export default function StorageTable({
  items,
  selected,
  onToggleSelect,
  onToggleSelectAll,
  onOpenFolder,
  onOpenDetails,
  onItemIntent,
  canWrite,
  busyKeys,
  uploaderNames,
  sortBy,
  order,
  onSort,
}: {
  items: StorageListItem[];
  selected: Set<string>;
  onToggleSelect: (storageKey: string) => void;
  onToggleSelectAll: () => void;
  onOpenFolder: (path: string) => void;
  onOpenDetails: (file: Extract<StorageListItem, { type: "file" }>) => void;
  onItemIntent: (file: Extract<StorageListItem, { type: "file" }>, intent: StorageItemIntent) => void;
  canWrite: boolean;
  busyKeys: Set<string>;
  /** Uploader id → display name. An id present with an empty string resolved to
   *  no profile (a deleted account); an id that is absent has not been looked
   *  up yet. Both render as "unknown" rather than as eight hex characters. */
  uploaderNames: Record<string, string>;
  sortBy: SortBy;
  order: SortOrder;
  onSort: (sortBy: SortBy, order: SortOrder) => void;
}) {
  const t = useTranslations("adminStorage.table");
  const tStatus = useTranslations("adminStorage.status");
  const locale = useLocale();
  const selectAllRef = useRef<HTMLInputElement>(null);

  const selectableFiles = items.filter(
    (i): i is Extract<StorageListItem, { type: "file" }> => i.type === "file" && !!i.id,
  );
  const selectedOnPage = selectableFiles.filter((f) => selected.has(f.storageKey)).length;
  const allSelected = selectableFiles.length > 0 && selectedOnPage === selectableFiles.length;
  // "Some are selected" is a third state, and a checkbox that shows only two of
  // them tells a reader that nothing is ticked while rows below are ticked.
  // `indeterminate` is a DOM property with no React prop, so it is written in
  // an effect — assigning it during render reads a ref mid-render.
  const indeterminate = selectedOnPage > 0 && !allSelected;
  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = indeterminate;
  }, [indeterminate]);

  return (
    <div className="hidden overflow-x-auto rounded-2xl border border-divider bg-bg-surface sm:block">
      <table className="w-full min-w-[720px] text-left text-sm">
        <caption className="sr-only">{t("caption")}</caption>
        <thead>
          <tr className="border-b border-divider bg-paper text-[11px] font-bold uppercase tracking-wider text-text-muted">
            <th scope="col" className="w-10 px-3 py-3">
              <input
                ref={selectAllRef}
                type="checkbox"
                className={checkboxCls}
                checked={allSelected}
                onChange={onToggleSelectAll}
                aria-label={indeterminate ? t("selectAllPartial", { count: selectedOnPage }) : t("selectAll")}
                disabled={selectableFiles.length === 0}
              />
            </th>
            <SortableTh column="name" label={t("name")} sortBy={sortBy} order={order} onSort={onSort} />
            <th scope="col" className="px-3 py-3">{t("type")}</th>
            <SortableTh column="size" label={t("size")} sortBy={sortBy} order={order} onSort={onSort} />
            <th scope="col" className="px-3 py-3">{t("uploadedBy")}</th>
            <SortableTh column="modified" label={t("modified")} sortBy={sortBy} order={order} onSort={onSort} className="whitespace-nowrap" />
            <th scope="col" className="px-3 py-3">{t("status")}</th>
            <th scope="col" className="w-12 px-3 py-3 text-right">
              <span className="sr-only">{t("actions")}</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-divider">
          {items.map((item) => {
            const isFile = item.type === "file";
            const key = isFile ? item.storageKey : item.path;
            const busy = isFile && busyKeys.has(item.storageKey);
            const isSelected = isFile && selected.has(item.storageKey);
            const uploader = isFile && item.uploadedBy ? uploaderNames[item.uploadedBy] : undefined;

            return (
              <tr
                key={key}
                className={`transition ${isSelected ? "bg-surface-brand-soft" : "hover:bg-paper/60"} ${busy ? "opacity-50" : ""}`}
              >
                <td className="px-3 py-2.5">
                  {isFile && item.id ? (
                    <input
                      type="checkbox"
                      className={checkboxCls}
                      checked={isSelected}
                      onChange={() => onToggleSelect(item.storageKey)}
                      aria-label={t("selectFile", { name: item.originalName })}
                    />
                  ) : null}
                </td>
                <td className="max-w-[280px] px-3 py-2.5">
                  <button
                    type="button"
                    onClick={() => (isFile ? onOpenDetails(item) : onOpenFolder(item.path))}
                    className="focus-field flex w-full items-center gap-2.5 rounded text-left"
                    title={isFile ? item.originalName : item.name}
                  >
                    <Thumb item={item} />
                    <span className="truncate font-medium text-text-body">
                      {truncateMiddle(isFile ? item.originalName : item.name)}
                    </span>
                  </button>
                </td>
                <td className="px-3 py-2.5 text-text-muted">
                  {isFile ? item.extension.toUpperCase() : t("folder")}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-text-muted">
                  {isFile ? formatBytes(item.size) : "—"}
                </td>
                <td className="max-w-[150px] px-3 py-2.5">
                  {isFile && item.uploadedBy ? (
                    <span className="block truncate text-text-muted" title={uploader || undefined}>
                      {/* Never a truncated UUID: a name once it resolves, and
                          the honest word for an account that no longer exists
                          or has not been looked up yet. */}
                      {uploader || t("unknownUploader")}
                    </span>
                  ) : (
                    <span className="text-text-muted">—</span>
                  )}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-text-muted">
                  {isFile ? formatDateTime(item.updatedAt, locale) : "—"}
                </td>
                <td className="px-3 py-2.5">
                  {isFile ? (
                    <Badge tone={item.indexed === false ? "neutral" : "success"}>
                      {item.indexed === false ? tStatus("unindexed") : tStatus("active")}
                    </Badge>
                  ) : null}
                </td>
                <td className="px-3 py-2.5 text-right">
                  {isFile && item.id ? (
                    <StorageItemMenu
                      file={item}
                      canWrite={canWrite}
                      busy={busy}
                      onIntent={(intent) => onItemIntent(item, intent)}
                    />
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

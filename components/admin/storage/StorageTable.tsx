"use client";

import { useTranslations, useLocale } from "next-intl";
import type { StorageListItem } from "@/lib/types/storage";
import { formatBytes, formatDateTime, truncateMiddle, fileKind } from "@/lib/admin/storage-shared";
import StorageTypeIcon from "./StorageTypeIcon";
import StorageItemMenu, { type StorageItemIntent } from "./StorageItemMenu";

const checkboxCls = "h-4 w-4 rounded border-divider text-brand focus-visible:ring-2 focus-visible:ring-focus-ring/40";

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
}) {
  const t = useTranslations("adminStorage.table");
  const tStatus = useTranslations("adminStorage.status");
  const locale = useLocale();

  const selectableFiles = items.filter((i): i is Extract<StorageListItem, { type: "file" }> => i.type === "file" && !!i.id);
  const allSelected = selectableFiles.length > 0 && selectableFiles.every((f) => selected.has(f.storageKey));

  return (
    <div className="hidden overflow-x-auto rounded-2xl border border-divider bg-bg-surface sm:block">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead>
          <tr className="border-b border-divider text-[11px] font-bold uppercase tracking-wider text-text-muted">
            <th className="w-10 px-3 py-3">
              <input type="checkbox" className={checkboxCls} checked={allSelected} onChange={onToggleSelectAll} aria-label={t("name")} disabled={selectableFiles.length === 0} />
            </th>
            <th className="px-3 py-3">{t("name")}</th>
            <th className="px-3 py-3">{t("type")}</th>
            <th className="px-3 py-3">{t("size")}</th>
            <th className="px-3 py-3">{t("uploadedBy")}</th>
            <th className="px-3 py-3">{t("modified")}</th>
            <th className="px-3 py-3">{t("status")}</th>
            <th className="w-12 px-3 py-3 text-right">{t("actions")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-divider">
          {items.map((item) => {
            const isFile = item.type === "file";
            const key = isFile ? item.storageKey : item.path;
            const busy = isFile && busyKeys.has(item.storageKey);
            return (
              <tr key={key} className="transition hover:bg-paper/60">
                <td className="px-3 py-2.5">
                  {isFile && item.id ? (
                    <input type="checkbox" className={checkboxCls} checked={selected.has(item.storageKey)} onChange={() => onToggleSelect(item.storageKey)} aria-label={item.originalName} />
                  ) : null}
                </td>
                <td className="max-w-[280px] px-3 py-2.5">
                  <button
                    type="button"
                    onClick={() => (isFile ? onOpenDetails(item) : onOpenFolder(item.path))}
                    className="flex items-center gap-2.5 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/40"
                    title={isFile ? item.originalName : item.name}
                  >
                    <Thumb item={item} />
                    <span className="truncate font-medium text-text-body">{truncateMiddle(isFile ? item.originalName : item.name)}</span>
                  </button>
                </td>
                <td className="px-3 py-2.5 text-text-muted">{isFile ? item.extension.toUpperCase() : "—"}</td>
                <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-text-muted">{isFile ? formatBytes(item.size) : "—"}</td>
                <td className="px-3 py-2.5 text-text-muted">{isFile && item.uploadedBy ? item.uploadedBy.slice(0, 8) : "—"}</td>
                <td className="whitespace-nowrap px-3 py-2.5 text-text-muted">{isFile ? formatDateTime(item.updatedAt, locale) : "—"}</td>
                <td className="px-3 py-2.5">
                  {isFile ? (
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${item.indexed === false ? "bg-paper text-text-muted" : "bg-success/10 text-success"}`}>
                      {item.indexed === false ? tStatus("unindexed") : tStatus("active")}
                    </span>
                  ) : null}
                </td>
                <td className="px-3 py-2.5 text-right">
                  {isFile && item.id ? (
                    <StorageItemMenu file={item} canWrite={canWrite} busy={busy} onIntent={(intent) => onItemIntent(item, intent)} />
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

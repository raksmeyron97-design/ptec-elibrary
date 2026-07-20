"use client";

import { useTranslations } from "next-intl";
import type { StorageListItem } from "@/lib/types/storage";
import { formatBytes, truncateMiddle } from "@/lib/admin/storage-shared";
import StorageTypeIcon from "./StorageTypeIcon";
import StorageItemMenu, { type StorageItemIntent } from "./StorageItemMenu";

/** Stacked-card list for narrow viewports — StorageTable's <table> would
 *  otherwise force horizontal scrolling on a phone. Shown only below `sm`. */
export default function StorageMobileList({
  items,
  selected,
  onToggleSelect,
  onOpenFolder,
  onOpenDetails,
  onItemIntent,
  canWrite,
  busyKeys,
}: {
  items: StorageListItem[];
  selected: Set<string>;
  onToggleSelect: (storageKey: string) => void;
  onOpenFolder: (path: string) => void;
  onOpenDetails: (file: Extract<StorageListItem, { type: "file" }>) => void;
  onItemIntent: (file: Extract<StorageListItem, { type: "file" }>, intent: StorageItemIntent) => void;
  canWrite: boolean;
  busyKeys: Set<string>;
}) {
  const t = useTranslations("adminStorage.status");

  return (
    <ul className="space-y-2 sm:hidden">
      {items.map((item) => {
        const isFile = item.type === "file";
        const key = isFile ? item.storageKey : item.path;
        return (
          <li key={key} className="flex items-center gap-3 rounded-xl border border-divider bg-bg-surface p-3">
            {isFile && item.id && (
              <input type="checkbox" checked={selected.has(item.storageKey)} onChange={() => onToggleSelect(item.storageKey)} aria-label={item.originalName} className="h-5 w-5 shrink-0 rounded border-divider text-brand" />
            )}
            <button type="button" onClick={() => (isFile ? onOpenDetails(item) : onOpenFolder(item.path))} className="flex min-w-0 flex-1 items-center gap-3 text-left">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-divider bg-paper text-text-muted">
                <StorageTypeIcon type={isFile ? "file" : "folder"} extension={isFile ? item.extension : undefined} />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[13.5px] font-semibold text-text-body">{truncateMiddle(isFile ? item.originalName : item.name, 28)}</span>
                <span className="block text-[11.5px] text-text-muted">
                  {isFile ? formatBytes(item.size) : t("active")}
                  {isFile && item.indexed === false ? ` · ${t("unindexed")}` : ""}
                </span>
              </span>
            </button>
            {isFile && item.id && <StorageItemMenu file={item} canWrite={canWrite} busy={busyKeys.has(item.storageKey)} onIntent={(intent) => onItemIntent(item, intent)} />}
          </li>
        );
      })}
    </ul>
  );
}

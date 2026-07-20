"use client";

import { useTranslations } from "next-intl";
import type { StorageListItem } from "@/lib/types/storage";
import { formatBytes, truncateMiddle, fileKind } from "@/lib/admin/storage-shared";
import StorageTypeIcon from "./StorageTypeIcon";
import StorageItemMenu, { type StorageItemIntent } from "./StorageItemMenu";

export default function StorageGrid({
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
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
      {items.map((item) => {
        const isFile = item.type === "file";
        const key = isFile ? item.storageKey : item.path;
        const isSelected = isFile && selected.has(item.storageKey);
        return (
          <div key={key} className={`group relative flex flex-col overflow-hidden rounded-xl border bg-bg-surface shadow-sm transition ${isSelected ? "border-brand ring-2 ring-brand/30" : "border-divider"}`}>
            {isFile && item.id && (
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => onToggleSelect(item.storageKey)}
                aria-label={item.originalName}
                className="absolute left-2 top-2 z-10 h-4 w-4 rounded border-divider text-brand focus-visible:ring-2 focus-visible:ring-focus-ring/40"
              />
            )}
            <button
              type="button"
              onClick={() => (isFile ? onOpenDetails(item) : onOpenFolder(item.path))}
              className="flex aspect-square w-full items-center justify-center bg-paper"
            >
              {isFile && fileKind(item.extension) === "image" && item.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.url} alt="" loading="lazy" className="h-full w-full object-cover" />
              ) : (
                <StorageTypeIcon type={isFile ? "file" : "folder"} extension={isFile ? item.extension : undefined} className="h-9 w-9 text-text-muted" />
              )}
            </button>
            <div className="flex items-start justify-between gap-1 p-2">
              <div className="min-w-0">
                <p className="truncate text-[12.5px] font-semibold text-text-body" title={isFile ? item.originalName : item.name}>
                  {truncateMiddle(isFile ? item.originalName : item.name, 22)}
                </p>
                {isFile && <p className="text-[11px] text-text-muted">{formatBytes(item.size)}</p>}
                {isFile && item.indexed === false && <p className="text-[10.5px] text-text-muted">{t("unindexed")}</p>}
              </div>
              {isFile && item.id && <StorageItemMenu file={item} canWrite={canWrite} busy={busyKeys.has(item.storageKey)} onIntent={(intent) => onItemIntent(item, intent)} />}
            </div>
          </div>
        );
      })}
    </div>
  );
}

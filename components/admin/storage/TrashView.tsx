"use client";

import { useLocale, useTranslations } from "next-intl";
import { Trash2, RotateCcw, XCircle } from "lucide-react";
import type { StorageFile } from "@/lib/types/storage";
import { formatBytes, formatDateTime, truncateMiddle } from "@/lib/admin/storage-shared";
import { EmptyState } from "@/components/admin/kit";
import StorageTypeIcon from "./StorageTypeIcon";

export default function TrashView({
  items,
  trashRetentionDays,
  canWrite,
  canPurge,
  busyIds,
  onRestore,
  onPurge,
  hasMore,
  onLoadMore,
  loadingMore,
}: {
  items: StorageFile[];
  trashRetentionDays: number;
  canWrite: boolean;
  canPurge: boolean;
  busyIds: Set<string>;
  onRestore: (id: string) => void;
  onPurge: (file: StorageFile) => void;
  hasMore: boolean;
  onLoadMore: () => void;
  loadingMore: boolean;
}) {
  const t = useTranslations("adminStorage.trashView");
  const tStates = useTranslations("adminStorage.states");
  const locale = useLocale();

  if (items.length === 0) {
    return <EmptyState icon={<Trash2 className="h-6 w-6" />} title={t("title")} description={t("empty")} />;
  }

  return (
    <div className="space-y-3">
      <p className="text-[12.5px] text-text-muted">{t("retentionNotice", { days: trashRetentionDays })}</p>
      <ul className="space-y-2">
        {items.map((file) => {
          const busy = busyIds.has(file.id ?? "");
          return (
            <li key={file.id} className="flex items-center gap-3 rounded-xl border border-divider bg-bg-surface p-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-divider bg-paper text-text-muted">
                <StorageTypeIcon type="file" extension={file.extension} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13.5px] font-semibold text-text-body" title={file.originalName}>{truncateMiddle(file.originalName, 34)}</p>
                <p className="text-[11.5px] text-text-muted">
                  {formatBytes(file.size)} · {formatDateTime(file.deletedAt ?? file.updatedAt, locale)}
                </p>
              </div>
              {canWrite && (
                <button
                  type="button"
                  onClick={() => file.id && onRestore(file.id)}
                  disabled={busy}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-divider px-3 py-1.5 text-[12.5px] font-semibold text-text-body hover:bg-paper disabled:opacity-50"
                >
                  <RotateCcw className="h-3.5 w-3.5" /> {t("restore")}
                </button>
              )}
              {canPurge && (
                <button
                  type="button"
                  onClick={() => onPurge(file)}
                  disabled={busy}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-danger/30 px-3 py-1.5 text-[12.5px] font-semibold text-danger hover:bg-danger/10 disabled:opacity-50"
                >
                  <XCircle className="h-3.5 w-3.5" /> {t("deletePermanently")}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {hasMore && (
        <button type="button" onClick={onLoadMore} disabled={loadingMore} className="w-full rounded-lg border border-divider py-2 text-sm font-semibold text-text-body hover:bg-paper disabled:opacity-50">
          {loadingMore ? "…" : tStates("loadMore")}
        </button>
      )}
    </div>
  );
}

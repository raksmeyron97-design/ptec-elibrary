"use client";

import { useTranslations } from "next-intl";
import { HardDrive, Files, FolderClosed, UploadCloud, Trash2, AlertTriangle } from "lucide-react";
import type { StorageSummary } from "@/lib/types/storage";
import { formatBytes } from "@/lib/admin/storage-shared";

function Card({
  icon,
  label,
  value,
  detail,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  detail?: string;
}) {
  return (
    <div className="rounded-2xl border border-divider bg-bg-surface p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-text-muted">{label}</p>
        <span className="text-brand" aria-hidden="true">{icon}</span>
      </div>
      <p className="mt-3 text-[26px] font-bold tabular-nums text-text-heading">{value}</p>
      {detail && <p className="mt-0.5 text-[11.5px] text-text-muted">{detail}</p>}
    </div>
  );
}

const BAR_COLORS = [
  "bg-brand", "bg-info", "bg-success", "bg-warning", "bg-danger",
  "bg-purple-500", "bg-teal-500", "bg-amber-500",
];

export default function StorageOverview({ summary, unavailable }: { summary: StorageSummary | null; unavailable: boolean }) {
  const t = useTranslations("adminStorage.overview");
  const tCat = useTranslations("adminStorage.categories");

  if (unavailable || !summary) {
    return (
      <div className="rounded-2xl border border-dashed border-divider bg-bg-surface p-6 text-center">
        <AlertTriangle className="mx-auto mb-2 h-6 w-6 text-warning" aria-hidden="true" />
        <p className="text-sm font-semibold text-text-heading">{t("unavailable")}</p>
      </div>
    );
  }

  const totalBytes = summary.diskTotalBytes;
  const usedByIndex = summary.totals.bytes;
  const freeBytes = summary.diskFreeBytes;

  const maxCategoryBytes = Math.max(1, ...summary.categories.map((c) => c.bytes));

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <Card icon={<HardDrive className="h-4 w-4" />} label={t("totalCapacity")} value={totalBytes ? formatBytes(totalBytes) : t("unavailable")} />
        <Card icon={<HardDrive className="h-4 w-4" />} label={t("used")} value={formatBytes(usedByIndex)} detail={freeBytes ? `${formatBytes(freeBytes)} ${t("available").toLowerCase()}` : undefined} />
        <Card icon={<Files className="h-4 w-4" />} label={t("totalFiles")} value={summary.totals.files.toLocaleString()} />
        <Card icon={<FolderClosed className="h-4 w-4" />} label={t("totalFolders")} value={summary.categories.length.toLocaleString()} />
        <Card icon={<UploadCloud className="h-4 w-4" />} label={t("uploadsThisMonth")} value={summary.uploadsThisMonth.toLocaleString()} />
        <Card icon={<Trash2 className="h-4 w-4" />} label={t("trashItems")} value={summary.trashItems.toLocaleString()} />
      </div>

      <div className="rounded-2xl border border-divider bg-bg-surface p-4">
        <h2 className="mb-3 text-sm font-bold text-text-heading">{t("categoriesTitle")}</h2>
        {summary.categories.length === 0 ? (
          <p className="text-sm text-text-muted">{t("noCategoryData")}</p>
        ) : (
          <ul className="space-y-2.5">
            {summary.categories
              .slice()
              .sort((a, b) => b.bytes - a.bytes)
              .map((c, i) => (
                <li key={c.folder} className="flex items-center gap-3">
                  <span className="w-28 shrink-0 truncate text-[13px] font-medium text-text-body">
                    {tCat.has(c.folder) ? tCat(c.folder) : c.folder}
                  </span>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-paper">
                    <span
                      className={`block h-full rounded-full ${BAR_COLORS[i % BAR_COLORS.length]}`}
                      style={{ width: `${Math.max(2, (c.bytes / maxCategoryBytes) * 100)}%` }}
                    />
                  </span>
                  <span className="w-24 shrink-0 text-right text-[12.5px] tabular-nums text-text-muted">
                    {formatBytes(c.bytes)} · {c.files}
                  </span>
                </li>
              ))}
          </ul>
        )}
        <p className="mt-4 border-t border-divider pt-3 text-[11.5px] text-text-muted">{t("indexOnlyNotice")}</p>
      </div>
    </div>
  );
}

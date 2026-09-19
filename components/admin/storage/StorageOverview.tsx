"use client";

import { useTranslations } from "next-intl";
import { HardDrive, Files, FolderClosed, UploadCloud, Trash2, AlertTriangle } from "lucide-react";
import type { StorageSummary } from "@/lib/types/storage";
import { formatBytes, truncateMiddle } from "@/lib/admin/storage-shared";

/**
 * What the disk is doing, above the file manager.
 *
 * Three things changed here and each was a correctness problem, not a taste
 * one:
 *
 *  - **Capacity is a BAR, not a pair of numbers.** "Total 500 GB" and "Used
 *    12 GB" as two tiles in a six-tile grid asks the reader to divide. The one
 *    question a storage page exists to answer is how close to full it is, and
 *    that question gets the widest element on the page.
 *  - **"Storage by category" was a list of 1,235 FOLDERS.** `summary.categories`
 *    is one row per storage folder, and this library gives every book its own
 *    (`books/health/book-3f87kojq`), so the section rendered 1,235 list items —
 *    an unbounded wall whose labels were truncated to `books/health/bo…`, which
 *    is identical for hundreds of them. Verified against production: 2,809
 *    files in 1,235 folders. The question an operator has is "where did 6.3 GB
 *    go?", so the rows are now aggregated by PARENT PATH and the biggest
 *    individual folders get their own short, capped list beneath.
 *
 *    Grouping is by parent, not by first segment, because on this deployment
 *    every folder starts with `books` — a first-segment chart is one bar and
 *    answers nothing. `books/health/book-3f87kojq` groups under `books/health`,
 *    which is the category shelf `storageCategorySegment()` assigns (CLAUDE.md
 *    → File Storage), and `posts/announcement-x` groups under `posts`. One
 *    rule, and it produces the level an operator actually manages.
 *  - **The category bars used `bg-purple-500`, `bg-teal-500`, `bg-amber-500`.**
 *    Raw palette classes carry no theme, and three of the eight were literals
 *    while five were tokens. The bars are one tone at graded weight now: the
 *    LENGTH already encodes the value, so spending eight hues on a ranked list
 *    adds a second, meaningless dimension.
 */

function Tile({
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
        <p className="text-xs font-semibold text-text-muted">{label}</p>
        <span className="text-text-muted" aria-hidden="true">{icon}</span>
      </div>
      <p className="mt-2 text-2xl font-bold tabular-nums text-text-heading">{value}</p>
      {detail && <p className="mt-0.5 text-[11.5px] text-text-muted">{detail}</p>}
    </div>
  );
}

/** Usage tone is a threshold, not a gradient: green until it matters, amber
 *  when someone should plan, red when someone should act today. */
/** How many individual folders the "largest folders" list names. Enough to
 *  find a runaway upload, short enough to read. */
const BIGGEST_FOLDER_LIMIT = 8;

function usageTone(percent: number): { bar: string; text: string } {
  if (percent >= 90) return { bar: "bg-danger", text: "text-danger-text" };
  if (percent >= 75) return { bar: "bg-warning", text: "text-warning-text" };
  return { bar: "bg-brand", text: "text-text-muted" };
}

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
  const freeBytes = summary.diskFreeBytes;
  const indexedBytes = summary.totals.bytes;

  /* Disk usage is TOTAL − FREE, not the index total: the index knows about the
     library's own files and says nothing about the rest of the volume. Using
     the index figure would under-report a nearly full disk, which is the exact
     case this bar exists for. */
  const usedBytes = totalBytes != null && freeBytes != null ? totalBytes - freeBytes : null;
  const percent =
    totalBytes && usedBytes != null && totalBytes > 0
      ? Math.max(0, Math.min(100, Math.round((usedBytes / totalBytes) * 100)))
      : null;
  const tone = usageTone(percent ?? 0);

  /* One row per PARENT path: the last segment of a storage folder is the
     per-resource folder (one per book), so grouping on it would reproduce the
     1,235-row list this replaced. */
  const byGroup = new Map<string, { bytes: number; files: number; folders: number }>();
  for (const c of summary.categories) {
    const parts = c.folder.split("/").filter(Boolean);
    const group = parts.length > 1 ? parts.slice(0, -1).join("/") : (parts[0] ?? c.folder);
    const entry = byGroup.get(group) ?? { bytes: 0, files: 0, folders: 0 };
    entry.bytes += c.bytes;
    entry.files += c.files;
    entry.folders += 1;
    byGroup.set(group, entry);
  }
  const shelves = Array.from(byGroup, ([folder, v]) => ({ folder, ...v })).sort((a, b) => b.bytes - a.bytes);
  const maxShelfBytes = Math.max(1, ...shelves.map((s) => s.bytes));

  const biggest = summary.categories.slice().sort((a, b) => b.bytes - a.bytes).slice(0, BIGGEST_FOLDER_LIMIT);

  return (
    <div className="space-y-4">
      {/* ── Capacity ───────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-divider bg-bg-surface p-4 shadow-sm">
        <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-text-heading">
            <HardDrive className="h-4 w-4 text-text-muted" aria-hidden="true" />
            {t("capacity")}
          </h2>
          {percent === null ? (
            <span className="text-[12.5px] text-text-muted">{t("capacityUnknown")}</span>
          ) : (
            <span className={`text-[12.5px] font-semibold tabular-nums ${tone.text}`}>
              {t("usedOf", { used: formatBytes(usedBytes), total: formatBytes(totalBytes) })} · {percent}%
            </span>
          )}
        </div>

        {percent !== null && (
          <div
            role="progressbar"
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={t("capacity")}
            className="h-2 w-full overflow-hidden rounded-full bg-paper"
          >
            <span className={`block h-full rounded-full transition-all ${tone.bar}`} style={{ width: `${percent}%` }} />
          </div>
        )}

        <p className="mt-2 text-[11.5px] text-text-muted">
          {freeBytes != null
            ? t("freeRemaining", { free: formatBytes(freeBytes) })
            : t("indexOnlyNotice")}
        </p>
      </div>

      {/* ── Counts. Four tiles on a four-column grid: the previous six left an
             orphan row of two at every breakpoint the grid was tuned for. ── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile icon={<Files className="h-4 w-4" />} label={t("totalFiles")} value={summary.totals.files.toLocaleString()} detail={formatBytes(indexedBytes)} />
        <Tile
          icon={<FolderClosed className="h-4 w-4" />}
          label={t("totalFolders")}
          value={summary.categories.length.toLocaleString()}
          detail={t("acrossGroups", { count: shelves.length })}
        />
        <Tile icon={<UploadCloud className="h-4 w-4" />} label={t("uploadsThisMonth")} value={summary.uploadsThisMonth.toLocaleString()} />
        <Tile
          icon={<Trash2 className="h-4 w-4" />}
          label={t("trashItems")}
          value={summary.trashItems.toLocaleString()}
          detail={summary.trashItems > 0 ? t("trashRetention", { days: summary.trashRetentionDays }) : undefined}
        />
      </div>

      {/* ── Where the space went ───────────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-divider bg-bg-surface p-4">
          <h2 className="mb-3 text-sm font-semibold text-text-heading">{t("categoriesTitle")}</h2>
          {shelves.length === 0 ? (
            <p className="text-sm text-text-muted">{t("noCategoryData")}</p>
          ) : (
            <ul className="space-y-2.5">
              {shelves.map((shelf) => {
                const share = Math.max(2, (shelf.bytes / maxShelfBytes) * 100);
                return (
                  <li key={shelf.folder} className="flex items-center gap-3">
                    <span className="w-32 shrink-0 truncate text-[13px] font-medium text-text-body" title={shelf.folder}>
                      {tCat.has(shelf.folder) ? tCat(shelf.folder) : shelf.folder}
                    </span>
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-paper">
                      {/* One hue, graded by share. Length is the measure; a
                          second visual variable would encode nothing. */}
                      <span
                        className="block h-full rounded-full bg-brand"
                        style={{ width: `${share}%`, opacity: 0.45 + (share / 100) * 0.55 }}
                      />
                    </span>
                    <span className="w-28 shrink-0 whitespace-nowrap text-right text-[12.5px] tabular-nums text-text-muted">
                      {t("categoryDetail", { size: formatBytes(shelf.bytes), files: shelf.files })}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="mt-4 border-t border-divider pt-3 text-[11.5px] text-text-muted">{t("indexOnlyNotice")}</p>
        </div>

        <div className="rounded-2xl border border-divider bg-bg-surface p-4">
          <h2 className="text-sm font-semibold text-text-heading">{t("biggestFolders")}</h2>
          <p className="mb-3 mt-0.5 text-[11.5px] text-text-muted">{t("biggestFoldersHint")}</p>
          {biggest.length === 0 ? (
            <p className="text-sm text-text-muted">{t("noCategoryData")}</p>
          ) : (
            <ul className="space-y-2">
              {biggest.map((c) => (
                <li key={c.folder} className="flex items-baseline justify-between gap-3">
                  {/* Truncated in the MIDDLE: these paths share a prefix
                      (`books/health/…`) AND carry their identity in the last
                      segment, so cutting either end alone loses the part that
                      tells two rows apart. */}
                  <span className="min-w-0 flex-1 truncate text-[12.5px] text-text-body" title={c.folder}>
                    {truncateMiddle(c.folder, 42)}
                  </span>
                  <span className="shrink-0 whitespace-nowrap text-[12.5px] tabular-nums text-text-muted">
                    {t("categoryDetail", { size: formatBytes(c.bytes), files: c.files })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

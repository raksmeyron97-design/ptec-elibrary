"use client";

import { useTranslations } from "next-intl";
import {
  Search, RefreshCw, FolderPlus, Upload, List, LayoutGrid, Trash2, ArrowLeft, X, ArrowDownUp,
} from "lucide-react";

export type SortBy = "name" | "size" | "modified";
export type SortOrder = "asc" | "desc";

/** The extensions this library actually stores — a free-text box here would
 *  invite a filter for a type no folder contains. */
export const FILTERABLE_EXTENSIONS = ["pdf", "jpg", "jpeg", "png", "webp", "docx", "xlsx", "csv"] as const;

export interface StorageFilters {
  q: string;
  extension: string;
  status: "active" | "trashed";
  sortBy: SortBy;
  order: SortOrder;
}

const iconBtn =
  "inline-flex h-9 w-9 items-center justify-center rounded-lg border border-divider bg-bg-surface text-text-body transition hover:border-brand hover:bg-brand/5 hover:text-brand disabled:cursor-not-allowed disabled:opacity-40";

export default function StorageToolbar({
  filters,
  onFiltersChange,
  viewMode,
  onViewModeChange,
  canWrite,
  onUpload,
  onNewFolder,
  onRefresh,
  onOpenTrash,
  inTrash,
  onExitTrash,
  refreshing,
  trashCount,
}: {
  filters: StorageFilters;
  onFiltersChange: (next: Partial<StorageFilters>) => void;
  viewMode: "list" | "grid";
  onViewModeChange: (mode: "list" | "grid") => void;
  canWrite: boolean;
  onUpload: () => void;
  onNewFolder: () => void;
  onRefresh: () => void;
  onOpenTrash: () => void;
  inTrash: boolean;
  onExitTrash: () => void;
  refreshing: boolean;
  /** Shown on the Trash button. An icon with nothing on it cannot say whether
   *  there is anything in there, which is the only reason to press it. */
  trashCount: number;
}) {
  const t = useTranslations("adminStorage.toolbar");
  const tExt = useTranslations("adminStorage.extensions");

  /* The order labels are read from the SORT they apply to. They used to be
     "Oldest first" / "Newest first" unconditionally, so sorting by name
     offered to put names in chronological order. */
  const orderLabels: Record<SortBy, [string, string]> = {
    name: [t("orderNameAsc"), t("orderNameDesc")],
    size: [t("orderSizeAsc"), t("orderSizeDesc")],
    modified: [t("sortOldestFirst"), t("sortNewestFirst")],
  };

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-divider bg-bg-surface p-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
      <div className="flex flex-1 items-center gap-2">
        {inTrash ? (
          <button type="button" onClick={onExitTrash} className="inline-flex items-center gap-1.5 rounded-lg border border-divider px-3 py-2 text-sm font-semibold text-text-body hover:bg-paper">
            <ArrowLeft className="h-4 w-4" /> {t("backToStorage")}
          </button>
        ) : (
          <div className="relative flex-1 min-w-0 max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" aria-hidden="true" />
            <input
              type="search"
              value={filters.q}
              onChange={(e) => onFiltersChange({ q: e.target.value })}
              placeholder={t("searchPlaceholder")}
              aria-label={t("searchPlaceholder")}
              className="focus-field w-full rounded-lg border border-divider bg-bg-page py-2 pl-9 pr-8 text-sm text-text-body placeholder:text-text-muted"
            />
            {filters.q && (
              <button type="button" onClick={() => onFiltersChange({ q: "" })} aria-label={t("clearSearch")} className="focus-field absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-text-muted hover:text-text-heading">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}

      </div>

      <div className="flex flex-wrap items-center gap-2">
        {!inTrash && (
          <div className="flex overflow-hidden rounded-lg border border-divider">
            <button type="button" aria-label={t("viewList")} aria-pressed={viewMode === "list"} onClick={() => onViewModeChange("list")} className={`flex h-9 w-9 items-center justify-center ${viewMode === "list" ? "bg-brand/10 text-brand" : "bg-bg-surface text-text-muted hover:bg-paper"}`}>
              <List className="h-4 w-4" />
            </button>
            <button type="button" aria-label={t("viewGrid")} aria-pressed={viewMode === "grid"} onClick={() => onViewModeChange("grid")} className={`flex h-9 w-9 items-center justify-center border-l border-divider ${viewMode === "grid" ? "bg-brand/10 text-brand" : "bg-bg-surface text-text-muted hover:bg-paper"}`}>
              <LayoutGrid className="h-4 w-4" />
            </button>
          </div>
        )}

        <button type="button" onClick={onRefresh} disabled={refreshing} aria-label={t("refresh")} className={iconBtn}>
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
        </button>

        {!inTrash && (
          <button
            type="button"
            onClick={onOpenTrash}
            aria-label={trashCount > 0 ? t("trashWithCount", { count: trashCount }) : t("trashEmpty")}
            className={`${iconBtn} relative w-auto gap-1.5 px-2.5`}
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            {trashCount > 0 && (
              <span className="rounded-full bg-paper px-1.5 text-[11px] font-bold tabular-nums text-text-body">
                {trashCount > 99 ? "99+" : trashCount}
              </span>
            )}
          </button>
        )}

        {!inTrash && canWrite && (
          <>
            <button type="button" onClick={onNewFolder} className="inline-flex items-center gap-1.5 rounded-lg border border-divider bg-bg-surface px-3 py-2 text-sm font-semibold text-text-body hover:bg-paper">
              <FolderPlus className="h-4 w-4" /> <span className="hidden sm:inline">{t("newFolder")}</span>
            </button>
            <button type="button" onClick={onUpload} className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3.5 py-2 text-sm font-bold text-white transition hover:bg-brand-hover">
              <Upload className="h-4 w-4" /> {t("upload")}
            </button>
          </>
        )}
      </div>

      {!inTrash && (
        <div className="flex w-full flex-wrap items-center gap-2 border-t border-divider pt-3 sm:border-0 sm:pt-0">
          <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-text-muted">
            <ArrowDownUp className="h-3.5 w-3.5" aria-hidden="true" />
            {t("sortBy")}
          </span>
          <select
            value={filters.sortBy}
            onChange={(e) => onFiltersChange({ sortBy: e.target.value as SortBy })}
            aria-label={t("sortBy")}
            className="focus-field rounded-lg border border-divider bg-bg-page px-2.5 py-1.5 text-[13px] text-text-body"
          >
            <option value="name">{t("sortName")}</option>
            <option value="size">{t("sortSize")}</option>
            <option value="modified">{t("sortModified")}</option>
          </select>
          <select
            value={filters.order}
            onChange={(e) => onFiltersChange({ order: e.target.value as SortOrder })}
            aria-label={t("sortOrder")}
            className="focus-field rounded-lg border border-divider bg-bg-page px-2.5 py-1.5 text-[13px] text-text-body"
          >
            <option value="asc">{orderLabels[filters.sortBy][0]}</option>
            <option value="desc">{orderLabels[filters.sortBy][1]}</option>
          </select>

          {/* `filters.extension` has always been applied in StorageClient and
              has never had a control — a filter nobody could reach. */}
          <span className="ml-1 text-[12px] font-semibold text-text-muted">{t("fileType")}</span>
          <select
            value={filters.extension}
            onChange={(e) => onFiltersChange({ extension: e.target.value })}
            aria-label={t("fileType")}
            aria-describedby={filters.extension ? "storage-filter-scope" : undefined}
            className="focus-field rounded-lg border border-divider bg-bg-page px-2.5 py-1.5 text-[13px] text-text-body"
          >
            <option value="">{t("allTypes")}</option>
            {FILTERABLE_EXTENSIONS.map((ext) => (
              <option key={ext} value={ext}>{tExt.has(ext) ? tExt(ext) : ext.toUpperCase()}</option>
            ))}
          </select>

          {filters.extension && (
            <>
              <button
                type="button"
                onClick={() => onFiltersChange({ extension: "" })}
                className="focus-field rounded-lg px-2 py-1 text-[12px] font-semibold text-brand hover:underline"
              >
                {t("clearType")}
              </button>
              {/* Says what the filter actually does. It narrows the page that
                  has been loaded, not the whole folder — claiming otherwise
                  would make an empty result look like an empty folder. */}
              <span id="storage-filter-scope" className="basis-full text-[11.5px] text-text-muted">
                {t("filterScopeHint")}
              </span>
            </>
          )}
        </div>
      )}
    </div>
  );
}

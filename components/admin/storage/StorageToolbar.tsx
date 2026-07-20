"use client";

import { useTranslations } from "next-intl";
import {
  Search, RefreshCw, FolderPlus, Upload, List, LayoutGrid, Trash2, ArrowLeft, X,
} from "lucide-react";

export type SortBy = "name" | "size" | "modified";
export type SortOrder = "asc" | "desc";

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
}) {
  const t = useTranslations("adminStorage.toolbar");

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-divider bg-bg-surface p-3 sm:flex-row sm:items-center sm:justify-between">
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
              className="w-full rounded-lg border border-divider bg-bg-page py-2 pl-9 pr-8 text-sm text-text-body placeholder:text-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/40"
            />
            {filters.q && (
              <button type="button" onClick={() => onFiltersChange({ q: "" })} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-text-muted hover:text-text-heading">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}

        {!inTrash && (
          <select
            value={filters.sortBy}
            onChange={(e) => onFiltersChange({ sortBy: e.target.value as SortBy })}
            aria-label={t("sortBy")}
            className="hidden rounded-lg border border-divider bg-bg-page px-2.5 py-2 text-[13px] text-text-body sm:block"
          >
            <option value="name">{t("sortName")}</option>
            <option value="size">{t("sortSize")}</option>
            <option value="modified">{t("sortModified")}</option>
          </select>
        )}
        {!inTrash && (
          <select
            value={filters.order}
            onChange={(e) => onFiltersChange({ order: e.target.value as SortOrder })}
            aria-label="Sort order"
            className="hidden rounded-lg border border-divider bg-bg-page px-2.5 py-2 text-[13px] text-text-body sm:block"
          >
            <option value="asc">{t("sortOldestFirst")}</option>
            <option value="desc">{t("sortNewestFirst")}</option>
          </select>
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
          <button type="button" onClick={onOpenTrash} aria-label={t("trash")} className={iconBtn}>
            <Trash2 className="h-4 w-4" />
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
    </div>
  );
}

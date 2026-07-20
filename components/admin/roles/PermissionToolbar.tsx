"use client";

import { useTranslations } from "next-intl";
import { Search, X, ListFilter, GitCompareArrows, ChevronsDownUp, ChevronsUpDown, RotateCcw } from "lucide-react";
import type { AppRole } from "@/lib/types/roles";
import { PERMISSION_GROUPS } from "@/lib/admin/roles-shared";

const selectClass =
  "h-10 rounded-lg border border-divider bg-bg-surface pl-3 pr-8 text-sm font-medium text-text-body shadow-sm outline-none transition focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/25";

export default function PermissionToolbar({
  query,
  onQuery,
  category,
  onCategory,
  roleFilter,
  onRoleFilter,
  allRoles,
  diffOnly,
  onDiffOnly,
  allExpanded,
  onToggleExpand,
  onReset,
  hasActiveFilters,
}: {
  query: string;
  onQuery: (v: string) => void;
  category: string;
  onCategory: (v: string) => void;
  roleFilter: AppRole | "all";
  onRoleFilter: (v: AppRole | "all") => void;
  allRoles: AppRole[];
  diffOnly: boolean;
  onDiffOnly: (v: boolean) => void;
  allExpanded: boolean;
  onToggleExpand: () => void;
  onReset: () => void;
  hasActiveFilters: boolean;
}) {
  const t = useTranslations("adminRoles.toolbar");
  const tGroups = useTranslations("adminRoles.groups");
  const tRoles = useTranslations("adminUsers.roles");
  return (
    <div className="rounded-xl border border-divider bg-bg-surface p-2.5 shadow-sm">
      <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center">
        {/* Search */}
        <div className="flex flex-1 items-center gap-2 rounded-lg border border-divider bg-paper px-3">
          <Search className="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
          <label htmlFor="perm-search" className="sr-only">{t("searchLabel")}</label>
          <input
            id="perm-search"
            type="text"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder={t("searchPlaceholder")}
            className="h-10 flex-1 bg-transparent text-sm text-text-heading placeholder-text-muted outline-none"
          />
          {query && (
            <button type="button" onClick={() => onQuery("")} aria-label={t("clearSearch")} className="text-text-muted hover:text-text-body">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex items-center">
            <ListFilter className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-text-muted" aria-hidden="true" />
            <label htmlFor="perm-category" className="sr-only">{t("category")}</label>
            <select
              id="perm-category"
              value={category}
              onChange={(e) => onCategory(e.target.value)}
              className={`${selectClass} pl-8`}
            >
              <option value="all">{t("allCategories")}</option>
              {PERMISSION_GROUPS.map((g) => (
                <option key={g.id} value={g.id}>{tGroups(g.id)}</option>
              ))}
            </select>
          </div>

          <div className="relative flex items-center">
            <label htmlFor="perm-role" className="sr-only">{t("role")}</label>
            <select
              id="perm-role"
              value={roleFilter}
              onChange={(e) => onRoleFilter(e.target.value as AppRole | "all")}
              className={selectClass}
            >
              <option value="all">{t("allRoles")}</option>
              {allRoles.map((r) => (
                <option key={r} value={r}>{tRoles(r)}</option>
              ))}
            </select>
          </div>

          {/* Diff-only toggle */}
          <button
            type="button"
            onClick={() => onDiffOnly(!diffOnly)}
            aria-pressed={diffOnly}
            className={`inline-flex h-10 items-center gap-1.5 rounded-lg border px-3 text-sm font-semibold shadow-sm transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
              diffOnly
                ? "border-brand bg-brand/10 text-brand"
                : "border-divider bg-bg-surface text-text-body hover:bg-paper"
            }`}
          >
            <GitCompareArrows className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">{t("differences")}</span>
          </button>

          {/* Expand / collapse all */}
          <button
            type="button"
            onClick={onToggleExpand}
            className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-divider bg-bg-surface px-3 text-sm font-semibold text-text-body shadow-sm transition hover:bg-paper focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            {allExpanded ? <ChevronsDownUp className="h-4 w-4" aria-hidden="true" /> : <ChevronsUpDown className="h-4 w-4" aria-hidden="true" />}
            <span className="hidden sm:inline">{allExpanded ? t("collapse") : t("expand")}</span>
          </button>

          {/* Reset */}
          <button
            type="button"
            onClick={onReset}
            disabled={!hasActiveFilters}
            className="inline-flex h-10 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold text-text-muted transition hover:text-text-body disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">{t("reset")}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

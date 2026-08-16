"use client";

import { useTranslations } from "next-intl";
import {
  Search,
  X,
  ChevronDown,
  GitCompare,
  ChevronsDownUp,
  ChevronsUpDown,
  RotateCcw,
} from "lucide-react";
import type { AppRole } from "@/lib/types/roles";
import { PERMISSION_GROUPS } from "@/lib/admin/roles-shared";

/** One control height across the bar so search, selects and toggles line up. */
const CONTROL = "h-9 rounded-lg border border-divider bg-bg-surface text-sm";
const SELECT = `${CONTROL} appearance-none pl-3 pr-8 text-text-body`;
const TOGGLE_BASE = `${CONTROL} inline-flex items-center gap-1.5 px-3 font-medium transition`;

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
    <div className="flex flex-wrap items-center gap-3">
      {/* Search — the bar's only full-width control */}
      <div className="focus-shell flex h-9 w-full max-w-md items-center gap-2 rounded-lg border border-divider bg-bg-surface px-3">
        <Search className="h-3.5 w-3.5 shrink-0 text-text-muted" aria-hidden="true" />
        <label htmlFor="perm-search" className="sr-only">
          {t("searchLabel")}
        </label>
        <input
          id="perm-search"
          type="text"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder={t("searchPlaceholder")}
          className="h-full flex-1 bg-transparent text-sm text-text-heading placeholder-text-muted outline-none"
        />
        {query && (
          <button
            type="button"
            onClick={() => onQuery("")}
            aria-label={t("clearSearch")}
            className="rounded text-text-muted transition hover:text-text-body"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex items-center">
          <label htmlFor="perm-category" className="sr-only">
            {t("category")}
          </label>
          <select
            id="perm-category"
            value={category}
            onChange={(e) => onCategory(e.target.value)}
            className={SELECT}
          >
            <option value="all">{t("allCategories")}</option>
            {PERMISSION_GROUPS.map((g) => (
              <option key={g.id} value={g.id}>
                {tGroups(g.id)}
              </option>
            ))}
          </select>
          <ChevronDown
            className="pointer-events-none absolute right-2.5 h-3.5 w-3.5 text-text-muted"
            aria-hidden="true"
          />
        </div>

        <div className="relative flex items-center">
          <label htmlFor="perm-role" className="sr-only">
            {t("role")}
          </label>
          <select
            id="perm-role"
            value={roleFilter}
            onChange={(e) => onRoleFilter(e.target.value as AppRole | "all")}
            className={SELECT}
          >
            <option value="all">{t("allRoles")}</option>
            {allRoles.map((r) => (
              <option key={r} value={r}>
                {tRoles(r)}
              </option>
            ))}
          </select>
          <ChevronDown
            className="pointer-events-none absolute right-2.5 h-3.5 w-3.5 text-text-muted"
            aria-hidden="true"
          />
        </div>

        <button
          type="button"
          onClick={() => onDiffOnly(!diffOnly)}
          aria-pressed={diffOnly}
          className={`${TOGGLE_BASE} ${
            diffOnly
              ? "border-slate-900 bg-slate-900 text-white"
              : "text-text-body hover:bg-paper"
          }`}
        >
          <GitCompare className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="hidden sm:inline">{t("differences")}</span>
        </button>

        <button
          type="button"
          onClick={onToggleExpand}
          aria-pressed={!allExpanded}
          className={`${TOGGLE_BASE} ${
            allExpanded
              ? "text-text-body hover:bg-paper"
              : "border-slate-900 bg-slate-900 text-white"
          }`}
        >
          {allExpanded ? (
            <ChevronsDownUp className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <ChevronsUpDown className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          <span className="hidden sm:inline">{allExpanded ? t("collapse") : t("expand")}</span>
        </button>

        <button
          type="button"
          onClick={onReset}
          disabled={!hasActiveFilters}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-text-muted transition hover:text-text-heading disabled:cursor-not-allowed disabled:opacity-40"
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="hidden sm:inline">{t("reset")}</span>
        </button>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  ChevronDown,
  ChevronsDownUp,
  ChevronsUpDown,
  GitCompare,
  RotateCcw,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { PERMISSION_GROUPS } from "@/lib/admin/roles-shared";

/**
 * Filters over the feature catalogue.
 *
 * The role selector that used to live here is gone: the rail owns which role is
 * on screen, and having two controls write the same state (plus a third "clear
 * focus" link) meant the answer to "why am I only seeing Librarian?" was in a
 * different place each time.
 *
 * Below `sm` everything except search collapses behind one Filters button, with
 * a count of what is active — five controls wrapped onto three lines of a phone
 * screen pushed the permissions themselves off it. The controls are one DOM
 * instance either way, toggled by class, so nothing here renders a second copy
 * of a labelled input.
 *
 * `Differences` only appears in the compare view, because a row can only differ
 * across roles when more than one role is drawn.
 */
const CONTROL = "h-9 rounded-lg border border-divider bg-bg-surface text-sm";
const SELECT = `focus-field ${CONTROL} appearance-none pl-3 pr-8 text-text-body`;
const TOGGLE = `focus-field ${CONTROL} inline-flex items-center gap-1.5 px-3 font-medium transition`;

export default function PermissionToolbar({
  query,
  onQuery,
  category,
  onCategory,
  showDiffToggle,
  diffOnly,
  onDiffOnly,
  allExpanded,
  onToggleExpand,
  onReset,
  hasActiveFilters,
  activeFilterCount,
  matchCount,
  totalCount,
  differingCount,
}: {
  query: string;
  onQuery: (v: string) => void;
  category: string;
  onCategory: (v: string) => void;
  showDiffToggle: boolean;
  diffOnly: boolean;
  onDiffOnly: (v: boolean) => void;
  allExpanded: boolean;
  onToggleExpand: () => void;
  onReset: () => void;
  hasActiveFilters: boolean;
  /** Drives the badge on the mobile Filters button. */
  activeFilterCount: number;
  /** Features currently on screen, and the size of the whole catalogue. */
  matchCount: number;
  totalCount: number;
  /** Of the visible features, how many differ across roles (compare view). */
  differingCount: number;
}) {
  const t = useTranslations("adminRoles.toolbar");
  const tGroups = useTranslations("adminRoles.groups");
  const [mobileOpen, setMobileOpen] = useState(false);

  const filtered = matchCount !== totalCount;

  return (
    <div className="space-y-2.5">
      {/* One row from `sm` up; on a phone the filter block drops below the
          search field instead of squeezing beside it. */}
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="focus-shell flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg border border-divider bg-bg-surface px-3 sm:w-64 sm:max-w-xs sm:flex-none">
          <Search
            className="h-3.5 w-3.5 shrink-0 text-text-muted"
            aria-hidden="true"
          />
          <label htmlFor="perm-search" className="sr-only">
            {t("searchLabel")}
          </label>
          <input
            id="perm-search"
            type="search"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder={t("searchPlaceholder")}
            className="h-full min-w-0 flex-1 bg-transparent text-sm text-text-heading placeholder-text-muted outline-none [&::-webkit-search-cancel-button]:hidden"
          />
          {query && (
            <button
              type="button"
              onClick={() => onQuery("")}
              aria-label={t("clearSearch")}
              className="focus-field rounded text-text-muted transition hover:text-text-body"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={() => setMobileOpen((v) => !v)}
          aria-expanded={mobileOpen}
          aria-controls="perm-filters"
          className={`${TOGGLE} shrink-0 sm:hidden ${
            mobileOpen
              ? "border-admin-accent bg-admin-accent-soft text-admin-accent-text"
              : "text-text-body"
          }`}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
          {t("filters")}
          {activeFilterCount > 0 && (
            <span className="rounded-full bg-admin-accent px-1.5 text-[11px] font-bold tabular-nums text-white">
              {activeFilterCount}
            </span>
          )}
        </button>

        <div
          id="perm-filters"
          className={`${mobileOpen ? "flex" : "hidden"} w-full flex-wrap items-center gap-2.5 sm:flex sm:w-auto`}
        >
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

          {showDiffToggle && (
            <button
              type="button"
              onClick={() => onDiffOnly(!diffOnly)}
              aria-pressed={diffOnly}
              className={`${TOGGLE} ${
                diffOnly
                  ? "border-admin-accent bg-admin-accent-soft text-admin-accent-text"
                  : "text-text-body hover:bg-paper"
              }`}
            >
              <GitCompare className="h-3.5 w-3.5" aria-hidden="true" />
              {t("differences")}
            </button>
          )}

          <button
            type="button"
            onClick={onToggleExpand}
            aria-pressed={!allExpanded}
            className={`${TOGGLE} ${
              allExpanded
                ? "text-text-body hover:bg-paper"
                : "border-admin-accent bg-admin-accent-soft text-admin-accent-text"
            }`}
          >
            {allExpanded ? (
              <ChevronsDownUp className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <ChevronsUpDown className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            {allExpanded ? t("collapse") : t("expand")}
          </button>

          <button
            type="button"
            onClick={onReset}
            disabled={!hasActiveFilters}
            className="focus-field inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-text-muted transition hover:text-text-heading disabled:cursor-not-allowed disabled:opacity-40"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            {t("reset")}
          </button>
        </div>
      </div>

      {/* One honest line about what is on screen. It is `role="status"` so a
          screen reader hears the result of a search that changes nothing
          visible above the fold. */}
      {(filtered || (showDiffToggle && diffOnly)) && (
        <p className="px-0.5 text-xs text-text-muted" role="status">
          {filtered && t("showing", { shown: matchCount, total: totalCount })}
          {filtered && showDiffToggle && diffOnly && (
            <span aria-hidden="true"> · </span>
          )}
          {showDiffToggle &&
            diffOnly &&
            t("differingCount", { count: differingCount })}
        </p>
      )}
    </div>
  );
}

"use client";

import { useTranslations } from "next-intl";
import { ArrowLeft, ChevronRight, Lock, Pencil, SearchX } from "lucide-react";
import type { AppRole } from "@/lib/types/roles";
import {
  isLockedRole,
  levelAt,
  rowDiffersAcrossRoles,
  visibleGroups,
  type PermMatrix,
} from "@/lib/admin/roles-shared";
import { GROUP_ICON } from "./icons";
import { PermPill } from "./PermControl";
import { useResourceText } from "./useResourceText";

/**
 * Every role, side by side — the reading view.
 *
 * It is deliberately read-only. Editing lives in the role-scoped pane, which
 * means this table never has to be two things at once: it can stay dense enough
 * to answer "who can do what?" at a glance without also being safe enough to
 * hold 52 live controls. A role's column header is the way in: clicking it
 * opens that role's pane.
 *
 * `highlightDiffs` marks the rows where roles disagree rather than dimming the
 * rows where they agree. Dimming to 40% opacity was the previous behaviour and
 * it made two thirds of the table unreadable in service of emphasising the
 * rest — emphasis should add a signal, not subtract legibility.
 */
export default function ComparePane({
  allRoles,
  roleCounts,
  draft,
  onPickRole,
  onBack,
  backLabel,
  query,
  onClearSearch,
  category,
  highlightDiffs,
  openGroups,
  onToggleGroup,
}: {
  allRoles: AppRole[];
  roleCounts: Record<AppRole, number>;
  draft: PermMatrix;
  onPickRole: (role: AppRole) => void;
  /** Returns to the role that was open before compare was entered. */
  onBack: () => void;
  backLabel: string;
  query: string;
  onClearSearch: () => void;
  category: string;
  highlightDiffs: boolean;
  openGroups: Record<string, boolean>;
  onToggleGroup: (id: string) => void;
}) {
  const t = useTranslations("adminRoles.matrix");
  const tCompare = useTranslations("adminRoles.compare");
  const tGroups = useTranslations("adminRoles.groups");
  const tGroupDesc = useTranslations("adminRoles.groupDescriptions");
  const tOverview = useTranslations("adminRoles.overview");
  const tInitials = useTranslations("adminRoles.initials");
  const tRoles = useTranslations("adminUsers.roles");
  const res = useResourceText();

  const groups = visibleGroups(category, query, res.search);
  const totalMatches = groups.reduce((n, g) => n + g.resources.length, 0);

  if (totalMatches === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-divider bg-bg-surface px-6 py-16 text-center shadow-sm">
        <SearchX className="h-10 w-10 text-text-muted opacity-40" aria-hidden="true" />
        <p className="mt-3 text-sm font-medium text-text-heading">{t("noMatchesTitle")}</p>
        <p className="mt-1 text-xs text-text-muted">{t("noMatchesBody")}</p>
        {query && (
          <button
            type="button"
            onClick={onClearSearch}
            className="focus-field mt-4 rounded text-xs font-semibold text-admin-accent-text hover:underline"
          >
            {t("clearSearch")}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-divider bg-bg-surface shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-divider px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-text-heading">{tCompare("title")}</h2>
          <p className="mt-0.5 text-xs text-text-muted">{tCompare("subtitle")}</p>
        </div>
        {/* Compare is a detour from the role you were editing, so it owns an
            explicit way back rather than making you re-find that role. */}
        <button
          type="button"
          onClick={onBack}
          className="focus-field inline-flex h-9 shrink-0 items-center gap-2 rounded-lg border border-divider bg-bg-surface px-3.5 text-sm font-semibold text-text-body transition hover:bg-paper"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {tCompare("backTo", { role: backLabel })}
        </button>
      </div>

      {/* ── md+ : the grid ──────────────────────────────────────────────── */}
      <div className="hidden md:block">
        <div className="overflow-auto" style={{ maxHeight: "min(70vh, 760px)" }}>
          <table className="w-full border-separate border-spacing-0 text-sm">
            <caption className="sr-only">{t("caption")}</caption>

            <thead>
              <tr>
                <th
                  scope="col"
                  className="sticky left-0 top-0 z-30 border-b border-divider bg-paper px-4 py-2 text-left"
                  style={{ minWidth: 280 }}
                >
                  <span className="sr-only">{t("feature")}</span>
                </th>
                {allRoles.map((role) => {
                  const locked = isLockedRole(role);
                  return (
                    <th
                      key={role}
                      scope="col"
                      className="sticky top-0 z-20 border-b border-divider bg-paper px-2 py-2 text-center align-bottom"
                      style={{ minWidth: 128 }}
                    >
                      <button
                        type="button"
                        onClick={() => onPickRole(role)}
                        title={
                          locked ? tCompare("openLocked", { role: tRoles(role) }) : tCompare("openRole", { role: tRoles(role) })
                        }
                        className="focus-field group/col mx-auto flex w-full flex-col items-center gap-0.5 rounded-lg px-2 py-1 transition hover:bg-bg-surface"
                      >
                        <span className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-text-body">
                          {locked && <Lock className="h-3 w-3" aria-hidden="true" />}
                          {tRoles(role)}
                        </span>
                        <span className="text-[10px] font-normal normal-case tabular-nums text-text-muted">
                          {tOverview("userCount", { count: roleCounts[role] ?? 0 })}
                        </span>
                        <span
                          className={`inline-flex items-center gap-1 text-[10px] font-semibold normal-case text-admin-accent-text ${
                            locked ? "invisible" : "opacity-0 transition-opacity group-hover/col:opacity-100"
                          }`}
                        >
                          <Pencil className="h-2.5 w-2.5" aria-hidden="true" />
                          {tCompare("edit")}
                        </span>
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>

            {groups.map((group) => {
              const GroupIcon = GROUP_ICON[group.iconKey];
              const open = openGroups[group.id] !== false;
              return (
                <tbody key={group.id}>
                  <tr>
                    <th
                      colSpan={allRoles.length + 1}
                      scope="colgroup"
                      className="sticky left-0 z-10 border-y border-divider bg-paper/70 p-0 text-left"
                    >
                      <button
                        type="button"
                        onClick={() => onToggleGroup(group.id)}
                        aria-expanded={open}
                        className="focus-field flex w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-paper"
                      >
                        <ChevronRight
                          className={`h-4 w-4 shrink-0 text-text-muted transition-transform duration-200 ${open ? "rotate-90" : ""}`}
                          aria-hidden="true"
                        />
                        <GroupIcon className="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
                        <span className="text-xs font-semibold uppercase tracking-wider text-text-body">
                          {tGroups(group.id)}
                        </span>
                        <span className="hidden text-xs font-normal normal-case text-text-muted lg:inline">
                          — {tGroupDesc(group.id)}
                        </span>
                        <span className="ml-auto rounded-md border border-divider bg-bg-surface px-2 py-0.5 text-xs tabular-nums text-text-muted">
                          {group.resources.length}
                        </span>
                      </button>
                    </th>
                  </tr>

                  {open &&
                    group.resources.map((resource) => {
                      const differs = rowDiffersAcrossRoles(draft, allRoles, resource.key);
                      const marked = highlightDiffs && differs;
                      const description = res.description(resource.key);
                      return (
                        <tr key={resource.key} className="group/row h-[52px]">
                          <th
                            scope="row"
                            className={`sticky left-0 z-10 border-b border-divider/60 px-4 py-2 text-left align-middle font-normal transition-colors group-hover/row:bg-paper/40 ${
                              marked ? "border-l-2 border-l-warning bg-warning-soft" : "bg-bg-surface"
                            }`}
                          >
                            <div className="text-sm font-medium text-text-heading">
                              {res.label(resource.key)}
                            </div>
                            {description && (
                              <div className="mt-0.5 hidden line-clamp-1 text-xs leading-snug text-text-muted lg:block">
                                {description}
                              </div>
                            )}
                          </th>

                          {allRoles.map((role) => {
                            const locked = isLockedRole(role);
                            return (
                              <td
                                key={role}
                                className={`border-b border-divider/60 px-2 py-2 text-center align-middle transition-colors group-hover/row:bg-paper/40 ${
                                  marked ? "bg-warning-soft/60" : ""
                                }`}
                              >
                                <div className="flex justify-center">
                                  <PermPill
                                    level={locked ? "write" : levelAt(draft, role, resource.key)}
                                    locked={locked}
                                  />
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                </tbody>
              );
            })}
          </table>
        </div>
      </div>

      {/* ── < md : one card per feature, every role as an initial column ─── */}
      <div className="divide-y divide-divider md:hidden">
        {groups.map((group) => {
          const GroupIcon = GROUP_ICON[group.iconKey];
          const open = openGroups[group.id] !== false;
          return (
            <section key={group.id} aria-label={tGroups(group.id)}>
              <button
                type="button"
                onClick={() => onToggleGroup(group.id)}
                aria-expanded={open}
                className="focus-field flex w-full items-center gap-3 bg-paper/70 px-4 py-2.5 text-left transition hover:bg-paper"
              >
                <ChevronRight
                  className={`h-4 w-4 shrink-0 text-text-muted transition-transform duration-200 ${open ? "rotate-90" : ""}`}
                  aria-hidden="true"
                />
                <GroupIcon className="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
                <span className="text-xs font-semibold uppercase tracking-wider text-text-body">
                  {tGroups(group.id)}
                </span>
                <span className="ml-auto rounded-md border border-divider bg-bg-surface px-2 py-0.5 text-xs tabular-nums text-text-muted">
                  {group.resources.length}
                </span>
              </button>

              {open && (
                <ul className="divide-y divide-divider/60">
                  {group.resources.map((resource) => {
                    const differs = rowDiffersAcrossRoles(draft, allRoles, resource.key);
                    const marked = highlightDiffs && differs;
                    const description = res.description(resource.key);
                    return (
                      <li
                        key={resource.key}
                        className={`px-4 py-3 ${marked ? "border-l-2 border-l-warning bg-warning-soft" : ""}`}
                      >
                        <div className="text-sm font-medium text-text-heading">
                          {res.label(resource.key)}
                        </div>
                        {description && (
                          <div className="mt-0.5 line-clamp-1 text-xs leading-snug text-text-muted">
                            {description}
                          </div>
                        )}
                        <div className="mt-2.5 grid grid-cols-5 gap-1.5">
                          {allRoles.map((role) => (
                            <div key={role} className="min-w-0">
                              <button
                                type="button"
                                onClick={() => onPickRole(role)}
                                title={tRoles(role)}
                                className="focus-field mb-1 block w-full truncate rounded text-center text-[10px] font-semibold uppercase tracking-wider text-text-muted"
                              >
                                {tInitials(role)}
                              </button>
                              <PermPill
                                compact
                                level={
                                  isLockedRole(role) ? "write" : levelAt(draft, role, resource.key)
                                }
                                locked={isLockedRole(role)}
                              />
                            </div>
                          ))}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

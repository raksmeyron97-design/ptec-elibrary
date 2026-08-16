"use client";

import { useTranslations } from "next-intl";
import { ChevronRight, Lock, SearchX } from "lucide-react";
import type { AppRole, PermLevel } from "@/lib/types/roles";
import {
  visibleGroups,
  levelAt,
  rowDiffersAcrossRoles,
  isLockedRole,
  type PermMatrix,
} from "@/lib/admin/roles-shared";
import { GROUP_ICON } from "./icons";
import { PermPill, PermSegmented } from "./PermControl";
import { useResourceText } from "./useResourceText";

export default function PermissionMatrix({
  allRoles,
  roleCounts,
  draft,
  baseline,
  editMode,
  onChange,
  query,
  onClearSearch,
  category,
  roleFilter,
  diffOnly,
  openGroups,
  onToggleGroup,
}: {
  allRoles: AppRole[];
  roleCounts: Record<AppRole, number>;
  draft: PermMatrix;
  baseline: PermMatrix;
  editMode: boolean;
  onChange: (role: AppRole, resource: string, level: PermLevel) => void;
  query: string;
  onClearSearch: () => void;
  category: string;
  roleFilter: AppRole | "all";
  diffOnly: boolean;
  openGroups: Record<string, boolean>;
  onToggleGroup: (id: string) => void;
}) {
  const t = useTranslations("adminRoles.matrix");
  const tGroups = useTranslations("adminRoles.groups");
  const tGroupDesc = useTranslations("adminRoles.groupDescriptions");
  const tOverview = useTranslations("adminRoles.overview");
  const tRoles = useTranslations("adminUsers.roles");
  const res = useResourceText();

  const visibleRoles = roleFilter === "all" ? allRoles : [roleFilter];
  const groups = visibleGroups(category, query, res.search);
  const totalMatches = groups.reduce((n, g) => n + g.resources.length, 0);

  if (totalMatches === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-divider bg-bg-surface px-6 py-16 text-center">
        <SearchX className="h-10 w-10 text-slate-300" aria-hidden="true" />
        <p className="mt-3 text-sm font-medium text-text-heading">{t("noMatchesTitle")}</p>
        <p className="mt-1 text-xs text-text-muted">{t("noMatchesBody")}</p>
        {query && (
          <button
            type="button"
            onClick={onClearSearch}
            className="mt-4 rounded text-xs font-semibold text-brand hover:underline"
          >
            {t("clearSearch")}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-divider bg-bg-surface shadow-sm">
      <div className="overflow-auto" style={{ maxHeight: "min(70vh, 760px)" }}>
        <table className="w-full border-separate border-spacing-0 text-sm">
          <caption className="sr-only">{t("caption")}</caption>

          <thead>
            <tr>
              <th
                scope="col"
                className="sticky left-0 top-0 z-30 border-b border-divider bg-paper px-4 py-2.5 text-left"
                style={{ minWidth: 280 }}
              >
                {/* The column is self-evident on screen; the name is kept for
                    screen readers, which announce it per cell. */}
                <span className="sr-only">{t("feature")}</span>
              </th>
              {visibleRoles.map((role) => (
                <th
                  key={role}
                  scope="col"
                  className="sticky top-0 z-20 border-b border-divider bg-paper px-3 py-2.5 text-center align-bottom"
                  style={{ minWidth: roleFilter === "all" ? 118 : 200 }}
                >
                  <span className="flex flex-col items-center gap-0.5">
                    <span className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-text-muted">
                      {isLockedRole(role) && <Lock className="h-3 w-3" aria-hidden="true" />}
                      {tRoles(role)}
                    </span>
                    <span className="text-[10px] font-normal normal-case tabular-nums text-slate-400">
                      {tOverview("userCount", { count: roleCounts[role] ?? 0 })}
                    </span>
                  </span>
                </th>
              ))}
            </tr>
          </thead>

          {groups.map((group) => {
            const GroupIcon = GROUP_ICON[group.iconKey];
            const open = openGroups[group.id] !== false; // default open
            const colSpan = visibleRoles.length + 1;
            return (
              <tbody key={group.id}>
                {/* Category header */}
                <tr>
                  <th
                    colSpan={colSpan}
                    scope="colgroup"
                    className="sticky left-0 z-10 border-y border-divider bg-slate-50/80 p-0 text-left"
                  >
                    <button
                      type="button"
                      onClick={() => onToggleGroup(group.id)}
                      aria-expanded={open}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-slate-100"
                    >
                      <ChevronRight
                        className={`h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 ${open ? "rotate-90" : ""}`}
                        aria-hidden="true"
                      />
                      <GroupIcon className="h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
                      <span className="text-xs font-semibold uppercase tracking-wider text-text-body">
                        {tGroups(group.id)}
                      </span>
                      <span className="hidden text-xs font-normal normal-case text-slate-400 sm:inline">
                        — {tGroupDesc(group.id)}
                      </span>
                      <span className="ml-auto rounded-md border border-divider bg-bg-surface px-2 py-0.5 text-xs tabular-nums text-text-muted">
                        {group.resources.length}
                      </span>
                    </button>
                  </th>
                </tr>

                {open &&
                  group.resources.map((res_) => {
                    const differs = rowDiffersAcrossRoles(draft, allRoles, res_.key);
                    // Differences mode is emphasis, not a filter: uniform rows
                    // recede, mixed rows get a marker, nothing disappears.
                    const dimmed = diffOnly && !differs;
                    const marked = diffOnly && differs;
                    const description = res.description(res_.key);
                    return (
                      <tr
                        key={res_.key}
                        className={`group/row h-[52px] transition-opacity ${dimmed ? "opacity-40" : ""}`}
                      >
                        <th
                          scope="row"
                          className={`sticky left-0 z-10 border-b border-divider/60 bg-bg-surface px-4 py-2 text-left align-middle font-normal transition-colors group-hover/row:bg-slate-50/40 ${
                            marked ? "border-l-2 border-l-amber-400" : ""
                          }`}
                        >
                          <div className="text-sm font-medium text-text-heading">
                            {res.label(res_.key)}
                          </div>
                          {description && (
                            <div className="mt-0.5 hidden line-clamp-1 text-xs leading-snug text-slate-400 lg:block">
                              {description}
                            </div>
                          )}
                        </th>

                        {visibleRoles.map((role) => {
                          const level = levelAt(draft, role, res_.key);
                          const locked = isLockedRole(role);
                          const dirty = level !== levelAt(baseline, role, res_.key);
                          return (
                            <td
                              key={role}
                              className="border-b border-divider/60 px-3 py-2 text-center align-middle transition-colors group-hover/row:bg-slate-50/40"
                            >
                              <div className="flex justify-center">
                                {editMode && !locked ? (
                                  <PermSegmented
                                    value={level}
                                    dirty={dirty}
                                    onChange={(l) => onChange(role, res_.key, l)}
                                    ariaLabel={t("permFor", {
                                      feature: res.label(res_.key),
                                      role: tRoles(role),
                                    })}
                                  />
                                ) : (
                                  <PermPill level={locked ? "write" : level} locked={locked} />
                                )}
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
  );
}

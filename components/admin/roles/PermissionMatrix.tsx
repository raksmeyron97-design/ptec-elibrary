"use client";

import { useTranslations } from "next-intl";
import { ChevronRight, Lock, Inbox } from "lucide-react";
import type { AppRole, PermLevel } from "@/lib/types/roles";
import { ROLE_META } from "@/lib/types/roles";
import {
  PERMISSION_GROUPS,
  levelAt,
  rowDiffersAcrossRoles,
  isLockedRole,
  type PermMatrix,
  type Resource,
} from "@/lib/admin/roles-shared";
import { GROUP_ICON } from "./icons";
import { PermPill, PermSegmented } from "./PermControl";

export default function PermissionMatrix({
  allRoles,
  draft,
  baseline,
  editMode,
  onChange,
  query,
  category,
  roleFilter,
  diffOnly,
  openGroups,
  onToggleGroup,
}: {
  allRoles: AppRole[];
  draft: PermMatrix;
  baseline: PermMatrix;
  editMode: boolean;
  onChange: (role: AppRole, resource: string, level: PermLevel) => void;
  query: string;
  category: string;
  roleFilter: AppRole | "all";
  diffOnly: boolean;
  openGroups: Record<string, boolean>;
  onToggleGroup: (id: string) => void;
}) {
  const t = useTranslations("adminRoles.matrix");
  const tGroups = useTranslations("adminRoles.groups");
  const tGroupDesc = useTranslations("adminRoles.groupDescriptions");
  const tRes = useTranslations("adminRoles.resources");
  const tResDesc = useTranslations("adminRoles.resourceDescriptions");
  const tRoles = useTranslations("adminUsers.roles");
  const visibleRoles = roleFilter === "all" ? allRoles : [roleFilter];
  const q = query.trim().toLowerCase();

  function resourceMatches(r: Resource): boolean {
    if (q && !`${r.label} ${r.description} ${r.key} ${tRes(r.key)} ${tResDesc(r.key)}`.toLowerCase().includes(q)) return false;
    if (diffOnly && !rowDiffersAcrossRoles(draft, allRoles, r.key)) return false;
    return true;
  }

  const groups = PERMISSION_GROUPS
    .filter((g) => category === "all" || g.id === category)
    .map((g) => ({ ...g, resources: g.resources.filter(resourceMatches) }))
    .filter((g) => g.resources.length > 0);

  const totalMatches = groups.reduce((n, g) => n + g.resources.length, 0);

  const headBg = "bg-slate-50";

  return (
    <div className="overflow-hidden rounded-xl border border-divider bg-bg-surface shadow-sm">
      <div className="overflow-auto" style={{ maxHeight: "min(70vh, 760px)" }}>
        {totalMatches === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center">
            <Inbox className="h-8 w-8 text-slate-300" aria-hidden="true" />
            <p className="text-sm font-semibold text-text-heading">{t("noMatchesTitle")}</p>
            <p className="text-xs text-text-muted">{t("noMatchesBody")}</p>
          </div>
        ) : (
          <table className="w-full min-w-[680px] border-separate border-spacing-0 text-sm">
            <caption className="sr-only">{t("caption")}</caption>
            <thead>
              <tr>
                <th
                  scope="col"
                  className={`sticky left-0 top-0 z-30 border-b border-divider ${headBg} px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-text-muted`}
                  style={{ minWidth: 220 }}
                >
                  {t("feature")}
                </th>
                {visibleRoles.map((role) => {
                  const meta = ROLE_META[role];
                  return (
                    <th
                      key={role}
                      scope="col"
                      className={`sticky top-0 z-20 border-b border-divider ${headBg} px-3 py-3 text-center`}
                      style={{ minWidth: roleFilter === "all" ? 128 : 200 }}
                    >
                      <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold ${meta.bgColor} ${meta.color} ${meta.borderColor}`}>
                        {isLockedRole(role) && <Lock className="h-3 w-3" aria-hidden="true" />}
                        {tRoles(role)}
                      </span>
                    </th>
                  );
                })}
              </tr>
            </thead>

            {groups.map((group) => {
              const GroupIcon = GROUP_ICON[group.iconKey];
              const open = openGroups[group.id] !== false; // default open
              const colSpan = visibleRoles.length + 1;
              return (
                <tbody key={group.id}>
                  {/* Group header row */}
                  <tr>
                    <th
                      colSpan={colSpan}
                      scope="colgroup"
                      className="sticky left-0 z-10 border-b border-divider bg-paper p-0 text-left"
                    >
                      <button
                        type="button"
                        onClick={() => onToggleGroup(group.id)}
                        aria-expanded={open}
                        className="flex w-full items-center gap-2 px-4 py-2.5 text-left transition hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand"
                      >
                        <ChevronRight className={`h-4 w-4 shrink-0 text-text-muted transition-transform ${open ? "rotate-90" : ""}`} aria-hidden="true" />
                        <GroupIcon className="h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
                        <span className="text-xs font-bold uppercase tracking-wide text-text-heading">{tGroups(group.id)}</span>
                        <span className="text-[11px] font-medium normal-case text-text-muted">— {tGroupDesc(group.id)}</span>
                        <span className="ml-auto rounded-full bg-white px-2 py-0.5 text-[10px] font-bold tabular-nums text-text-muted ring-1 ring-inset ring-divider">
                          {group.resources.length}
                        </span>
                      </button>
                    </th>
                  </tr>

                  {/* Resource rows */}
                  {open &&
                    group.resources.map((res) => (
                      <tr key={res.key} className="group/row">
                        <th
                          scope="row"
                          className="sticky left-0 z-10 border-b border-divider bg-bg-surface px-4 py-3 text-left align-middle transition-colors group-hover/row:bg-slate-50"
                        >
                          <div className="font-semibold text-text-heading">{tRes(res.key)}</div>
                          <div className="mt-0.5 text-[11px] font-normal leading-snug text-text-muted">{tResDesc(res.key)}</div>
                        </th>
                        {visibleRoles.map((role) => {
                          const level = levelAt(draft, role, res.key);
                          const locked = isLockedRole(role);
                          const dirty = level !== levelAt(baseline, role, res.key);
                          return (
                            <td
                              key={role}
                              className="border-b border-divider px-3 py-3 text-center align-middle transition-colors group-hover/row:bg-slate-50/60"
                            >
                              <div className="flex justify-center">
                                {editMode && !locked ? (
                                  <PermSegmented
                                    value={level}
                                    dirty={dirty}
                                    onChange={(l) => onChange(role, res.key, l)}
                                    ariaLabel={t("permFor", { feature: tRes(res.key), role: tRoles(role) })}
                                  />
                                ) : (
                                  <PermPill level={locked ? "write" : level} locked={locked} />
                                )}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                </tbody>
              );
            })}
          </table>
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-divider bg-paper px-4 py-3 text-[11px] text-text-muted">
        <span className="font-bold uppercase tracking-wide">{t("legend")}</span>
        <span className="inline-flex items-center gap-1.5"><PermPill level="write" /> {t("legendWrite")}</span>
        <span className="inline-flex items-center gap-1.5"><PermPill level="read" /> {t("legendRead")}</span>
        <span className="inline-flex items-center gap-1.5"><PermPill level="none" /> {t("legendNone")}</span>
        <span className="ml-auto inline-flex items-center gap-1.5"><Lock className="h-3 w-3" aria-hidden="true" /> {t("legendLocked")}</span>
      </div>
    </div>
  );
}

"use client";

import { useTranslations } from "next-intl";
import { ChevronRight, Lock, SearchX } from "lucide-react";
import type { AppRole, PermLevel } from "@/lib/types/roles";
import { ROLE_META } from "@/lib/types/roles";
import {
  visibleGroups,
  levelAt,
  rowDiffersAcrossRoles,
  isLockedRole,
  type PermMatrix,
} from "@/lib/admin/roles-shared";
import { GROUP_ICON, ROLE_ICON } from "./icons";
import { PermPill, PermSegmented } from "./PermControl";
import { useResourceText } from "./useResourceText";

/**
 * The under-768px matrix.
 *
 * View mode is a card per feature carrying all five roles as mini badges under
 * their initials — the whole permission landscape, which is what an admin is
 * usually on this page to read. Edit mode keeps the one-role-at-a-time picker,
 * because five segmented controls do not fit on a phone.
 */
export default function PermissionAccordion({
  allRoles,
  role,
  onRole,
  draft,
  baseline,
  editMode,
  onChange,
  query,
  onClearSearch,
  category,
  diffOnly,
  openGroups,
  onToggleGroup,
}: {
  allRoles: AppRole[];
  role: AppRole;
  onRole: (r: AppRole) => void;
  draft: PermMatrix;
  baseline: PermMatrix;
  editMode: boolean;
  onChange: (role: AppRole, resource: string, level: PermLevel) => void;
  query: string;
  onClearSearch: () => void;
  category: string;
  diffOnly: boolean;
  openGroups: Record<string, boolean>;
  onToggleGroup: (id: string) => void;
}) {
  const t = useTranslations("adminRoles.matrix");
  const tGroups = useTranslations("adminRoles.groups");
  const tRoles = useTranslations("adminUsers.roles");
  const tInitials = useTranslations("adminRoles.initials");
  const res = useResourceText();

  const meta = ROLE_META[role];
  const locked = isLockedRole(role);
  const groups = visibleGroups(category, query, res.search);

  return (
    <div className="space-y-3">
      {/* Role picker — edit mode only; view mode shows every role per feature. */}
      {editMode && (
        <>
          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-muted">
              {t("viewingRole")}
            </div>
            <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
              {allRoles.map((r) => {
                const m = ROLE_META[r];
                const Icon = ROLE_ICON[r];
                const active = r === role;
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => onRole(r)}
                    aria-pressed={active}
                    className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-2 text-xs font-semibold transition ${
                      active
                        ? `${m.bgColor} ${m.color} ${m.borderColor} ring-2 ring-brand/30`
                        : "border-divider bg-bg-surface text-text-body"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                    {tRoles(r)}
                  </button>
                );
              })}
            </div>
          </div>

          <div
            className={`flex items-center gap-2 rounded-xl border px-3.5 py-2.5 ${meta.bgColor} ${meta.borderColor}`}
          >
            <span className={`text-sm font-semibold ${meta.color}`}>{tRoles(role)}</span>
            {locked && (
              <span className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-slate-500">
                <Lock className="h-3 w-3" aria-hidden="true" /> {t("alwaysFull")}
              </span>
            )}
          </div>
        </>
      )}

      {groups.length === 0 ? (
        <div className="flex flex-col items-center rounded-xl border border-divider bg-bg-surface px-6 py-14 text-center">
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
      ) : (
        groups.map((group) => {
          const GroupIcon = GROUP_ICON[group.iconKey];
          const open = openGroups[group.id] !== false;
          return (
            <div
              key={group.id}
              className="overflow-hidden rounded-xl border border-divider bg-bg-surface shadow-sm"
            >
              <button
                type="button"
                onClick={() => onToggleGroup(group.id)}
                aria-expanded={open}
                className="flex w-full items-center gap-3 bg-slate-50/80 px-4 py-3 text-left transition hover:bg-slate-100"
              >
                <ChevronRight
                  className={`h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 ${open ? "rotate-90" : ""}`}
                  aria-hidden="true"
                />
                <GroupIcon className="h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
                <span className="text-xs font-semibold uppercase tracking-wider text-text-body">
                  {tGroups(group.id)}
                </span>
                <span className="ml-auto rounded-md border border-divider bg-bg-surface px-2 py-0.5 text-xs tabular-nums text-text-muted">
                  {group.resources.length}
                </span>
              </button>

              {open && (
                <ul className="divide-y divide-divider/60">
                  {group.resources.map((res_) => {
                    const differs = rowDiffersAcrossRoles(draft, allRoles, res_.key);
                    const dimmed = diffOnly && !differs;
                    const marked = diffOnly && differs;
                    const description = res.description(res_.key);
                    const level = levelAt(draft, role, res_.key);
                    const dirty = level !== levelAt(baseline, role, res_.key);

                    return (
                      <li
                        key={res_.key}
                        className={`px-4 py-3 transition-opacity ${dimmed ? "opacity-40" : ""} ${
                          marked ? "border-l-2 border-l-amber-400" : ""
                        }`}
                      >
                        {editMode ? (
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-sm font-medium text-text-heading">
                                {res.label(res_.key)}
                              </div>
                              {description && (
                                <div className="mt-0.5 line-clamp-1 text-xs leading-snug text-slate-400">
                                  {description}
                                </div>
                              )}
                            </div>
                            <div className="shrink-0">
                              {locked ? (
                                <PermPill level="write" locked />
                              ) : (
                                <PermSegmented
                                  value={level}
                                  dirty={dirty}
                                  onChange={(l) => onChange(role, res_.key, l)}
                                  ariaLabel={t("permFor", {
                                    feature: res.label(res_.key),
                                    role: tRoles(role),
                                  })}
                                  showLabels={false}
                                />
                              )}
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="text-sm font-medium text-text-heading">
                              {res.label(res_.key)}
                            </div>
                            {description && (
                              <div className="mt-0.5 line-clamp-1 text-xs leading-snug text-slate-400">
                                {description}
                              </div>
                            )}
                            <div className="mt-2.5 grid grid-cols-5 gap-1.5">
                              {allRoles.map((r) => (
                                <div key={r} className="min-w-0">
                                  <div
                                    className="mb-1 truncate text-center text-[10px] font-semibold uppercase tracking-wider text-slate-400"
                                    title={tRoles(r)}
                                  >
                                    {tInitials(r)}
                                  </div>
                                  <PermPill
                                    compact
                                    level={isLockedRole(r) ? "write" : levelAt(draft, r, res_.key)}
                                    locked={isLockedRole(r)}
                                  />
                                </div>
                              ))}
                            </div>
                          </>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}

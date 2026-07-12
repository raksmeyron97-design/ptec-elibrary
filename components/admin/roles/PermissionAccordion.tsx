"use client";

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
import { GROUP_ICON, ROLE_ICON } from "./icons";
import { PermPill, PermSegmented } from "./PermControl";

export default function PermissionAccordion({
  allRoles,
  role,
  onRole,
  draft,
  baseline,
  editMode,
  onChange,
  query,
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
  category: string;
  diffOnly: boolean;
  openGroups: Record<string, boolean>;
  onToggleGroup: (id: string) => void;
}) {
  const meta = ROLE_META[role];
  const locked = isLockedRole(role);
  const q = query.trim().toLowerCase();

  function resourceMatches(r: Resource): boolean {
    if (q && !`${r.label} ${r.description} ${r.key}`.toLowerCase().includes(q)) return false;
    if (diffOnly && !rowDiffersAcrossRoles(draft, allRoles, r.key)) return false;
    return true;
  }

  const groups = PERMISSION_GROUPS
    .filter((g) => category === "all" || g.id === category)
    .map((g) => ({ ...g, resources: g.resources.filter(resourceMatches) }))
    .filter((g) => g.resources.length > 0);

  return (
    <div className="space-y-3">
      {/* Role selector */}
      <div>
        <div className="mb-2 text-xs font-bold uppercase tracking-wide text-text-muted">Viewing role</div>
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
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-2 text-xs font-bold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
                  active
                    ? `${m.bgColor} ${m.color} ${m.borderColor} ring-2 ring-brand/30`
                    : "border-divider bg-bg-surface text-text-body"
                }`}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                {m.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected role banner */}
      <div className={`flex items-center gap-2 rounded-xl border px-3.5 py-2.5 ${meta.bgColor} ${meta.borderColor}`}>
        <span className={`text-sm font-bold ${meta.color}`}>{meta.label}</span>
        {locked && (
          <span className="ml-auto inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500">
            <Lock className="h-3 w-3" aria-hidden="true" /> Always full access
          </span>
        )}
      </div>

      {groups.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-divider bg-bg-surface px-6 py-12 text-center">
          <Inbox className="h-7 w-7 text-slate-300" aria-hidden="true" />
          <p className="text-sm font-semibold text-text-heading">No features match your filters</p>
        </div>
      ) : (
        groups.map((group) => {
          const GroupIcon = GROUP_ICON[group.iconKey];
          const open = openGroups[group.id] !== false;
          return (
            <div key={group.id} className="overflow-hidden rounded-xl border border-divider bg-bg-surface shadow-sm">
              <button
                type="button"
                onClick={() => onToggleGroup(group.id)}
                aria-expanded={open}
                className="flex w-full items-center gap-2 bg-paper px-4 py-3 text-left transition hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand"
              >
                <GroupIcon className="h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
                <span className="text-xs font-bold uppercase tracking-wide text-text-heading">{group.label}</span>
                <span className="ml-auto rounded-full bg-white px-2 py-0.5 text-[10px] font-bold tabular-nums text-text-muted ring-1 ring-inset ring-divider">
                  {group.resources.length}
                </span>
                <ChevronRight className={`h-4 w-4 shrink-0 text-text-muted transition-transform ${open ? "rotate-90" : ""}`} aria-hidden="true" />
              </button>
              {open && (
                <ul className="divide-y divide-divider">
                  {group.resources.map((res) => {
                    const level = levelAt(draft, role, res.key);
                    const dirty = level !== levelAt(baseline, role, res.key);
                    return (
                      <li key={res.key} className="flex items-center justify-between gap-3 px-4 py-3">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-text-heading">{res.label}</div>
                          <div className="mt-0.5 text-[11px] leading-snug text-text-muted">{res.description}</div>
                        </div>
                        <div className="shrink-0">
                          {editMode && !locked ? (
                            <PermSegmented
                              value={level}
                              dirty={dirty}
                              onChange={(l) => onChange(role, res.key, l)}
                              ariaLabel={`${res.label} permission for ${meta.label}`}
                              showLabels={false}
                            />
                          ) : (
                            <PermPill level={locked ? "write" : level} locked={locked} />
                          )}
                        </div>
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

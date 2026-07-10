"use client";

import { useState, useTransition } from "react";
import type { AppRole } from "@/lib/types/roles";
import { ROLE_META, ALL_ROLES } from "@/lib/types/roles";
import type { PermLevel } from "@/lib/types/roles";
import { updateRolePermission } from "./actions";

type PermissionArea = { label: string; key: string };

const PERMISSION_AREAS: PermissionArea[] = [
  { label: "Books",         key: "books"         },
  { label: "Catalog",       key: "catalog"        },
  { label: "Research",      key: "research"       },
  { label: "Posts",         key: "posts"          },
  { label: "Announcements", key: "announcements"  },
  { label: "Learning Paths", key: "learning_paths" },
  { label: "Users",         key: "users"          },
  { label: "Roles",         key: "roles"          },
];

const LEVEL_CYCLE: PermLevel[] = ["none", "read", "write"];

function nextLevel(current: PermLevel): PermLevel {
  const idx = LEVEL_CYCLE.indexOf(current);
  return LEVEL_CYCLE[(idx + 1) % LEVEL_CYCLE.length];
}

function PermBadge({ level, interactive, loading, onClick, contextLabel }: {
  level: PermLevel;
  interactive?: boolean;
  loading?: boolean;
  onClick?: () => void;
  /** e.g. "Books permission for librarian" — read to screen readers along with the level */
  contextLabel?: string;
}) {
  const base = "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold transition-all";

  const styles: Record<PermLevel, string> = {
    write: "bg-emerald-50 text-emerald-700 border border-emerald-200",
    read:  "bg-blue-50 text-blue-600 border border-blue-200",
    none:  "bg-paper text-text-muted border border-divider",
  };

  const labels: Record<PermLevel, string> = {
    write: "✓ Write",
    read:  "◎ Read",
    none:  "— None",
  };

  if (!interactive) {
    return (
      <span className={`${base} ${styles[level]}`}>
        {labels[level]}
      </span>
    );
  }

  const next = nextLevel(level);

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      title={`Click to change to "${next}"`}
      aria-label={contextLabel ? `${contextLabel}: ${level}. Activate to change to ${next}` : undefined}
      className={`
        ${base} ${styles[level]} cursor-pointer
        hover:scale-105 hover:shadow-sm active:scale-95
        disabled:opacity-50 disabled:cursor-wait
        focus:outline-none focus:ring-2 focus:ring-brand/40 focus:ring-offset-1
      `}
    >
      {loading ? "…" : labels[level]}
    </button>
  );
}

export default function RolesClient({
  roleCounts,
  totalUsers,
  allRoles,
  initialPermissions,
}: {
  roleCounts: Record<AppRole, number>;
  totalUsers: number;
  allRoles: AppRole[];
  initialPermissions: Record<AppRole, Record<string, PermLevel>>;
}) {
  const [editMode, setEditMode] = useState(false);
  const [permissions, setPermissions] = useState(initialPermissions);
  const [isPending, startTransition] = useTransition();
  const [savingCell, setSavingCell] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: "ok" | "err"; msg: string } | null>(null);

  function showToast(type: "ok" | "err", msg: string) {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 2500);
  }

  function handleCycle(role: AppRole, resource: string) {
    if (role === "super_admin") return;
    const current = permissions[role]?.[resource] ?? "none";
    const next = nextLevel(current);
    const key = `${role}:${resource}`;

    // Optimistic update
    setPermissions(prev => ({
      ...prev,
      [role]: { ...prev[role], [resource]: next },
    }));
    setSavingCell(key);

    startTransition(async () => {
      try {
        await updateRolePermission(role, resource, next);
        showToast("ok", `Saved: ${ROLE_META[role].label} → ${resource} = ${next}`);
      } catch (err) {
        // Revert on error
        setPermissions(prev => ({
          ...prev,
          [role]: { ...prev[role], [resource]: current },
        }));
        showToast("err", err instanceof Error ? err.message : "Failed to save");
      } finally {
        setSavingCell(null);
      }
    });
  }

  return (
    <div className="space-y-8">
      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium shadow-lg transition-all ${
          toast.type === "ok"
            ? "bg-emerald-600 text-white"
            : "bg-red-600 text-white"
        }`}>
          {toast.type === "ok" ? "✓" : "✕"} {toast.msg}
        </div>
      )}

      {/* Role cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {allRoles.map((role) => {
          const meta = ROLE_META[role];
          const count = roleCounts[role] ?? 0;
          const pct = totalUsers > 0 ? Math.round((count / totalUsers) * 100) : 0;
          return (
            <div key={role} className={`rounded-xl border p-4 shadow-sm ${meta.bgColor} ${meta.borderColor}`}>
              <div className="flex items-start justify-between gap-2">
                <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${meta.bgColor} ${meta.color} ${meta.borderColor}`}>
                  {meta.label}
                </span>
                <span className={`text-2xl font-bold tabular-nums ${meta.color}`}>{count}</span>
              </div>
              <p className="mt-2 text-xs text-text-muted leading-snug">{meta.description}</p>
              <div className="mt-3">
                <div className="flex items-center justify-between text-[10px] text-text-muted mb-1">
                  <span>Users</span><span>{pct}%</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-white/60 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${meta.color.replace("text-", "bg-")}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Permission matrix */}
      <div className="rounded-xl border border-divider bg-bg-surface shadow-sm overflow-hidden">
        <div className="border-b border-divider px-6 py-4 flex items-center justify-between gap-4">
          <div>
            <h2 className="font-semibold text-text-heading">Permission Matrix</h2>
            <p className="text-xs text-text-muted mt-0.5">
              {editMode
                ? "Click any cell to cycle: None → Read → Write. Changes save instantly."
                : "What each role can do across the system."}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setEditMode(e => !e)}
            className={`shrink-0 rounded-lg px-4 py-2 text-sm font-semibold transition-all ${
              editMode
                ? "bg-brand text-white shadow-sm hover:bg-brand/90"
                : "border border-divider bg-paper text-text-body hover:bg-bg-surface hover:border-brand hover:text-brand"
            }`}
          >
            {editMode ? "✓ Done Editing" : "Edit Permissions"}
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">Role permissions matrix</caption>
            <thead>
              <tr className="border-b border-divider bg-paper text-left text-xs font-bold uppercase tracking-wide text-text-muted">
                <th scope="col" className="px-6 py-3 w-36">Role</th>
                {PERMISSION_AREAS.map((area) => (
                  <th key={area.key} scope="col" className="px-4 py-3 text-center">{area.label}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {allRoles.map((role) => {
                const meta = ROLE_META[role];
                const isSuperAdmin = role === "super_admin";

                return (
                  <tr key={role} className={`transition-colors ${isSuperAdmin ? "bg-purple-50/40" : "hover:bg-paper/60"}`}>
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-1.5">
                        <span className={`inline-block rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${meta.bgColor} ${meta.color} ${meta.borderColor}`}>
                          {meta.label}
                        </span>
                        {isSuperAdmin && (
                          <span title="super_admin always has full access" className="text-purple-400 text-xs">🔒</span>
                        )}
                      </div>
                    </td>
                    {PERMISSION_AREAS.map((area) => {
                      const level = permissions[role]?.[area.key] ?? "none";
                      const key = `${role}:${area.key}`;
                      const isLoading = savingCell === key;

                      return (
                        <td key={area.key} className="px-4 py-3 text-center">
                          <PermBadge
                            level={level}
                            interactive={editMode && !isSuperAdmin}
                            loading={isLoading || (isPending && savingCell === key)}
                            onClick={() => handleCycle(role, area.key)}
                            contextLabel={`${area.label} permission for ${ROLE_META[role].label}`}
                          />
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 rounded-xl border border-divider bg-paper px-6 py-4 text-xs text-text-muted">
        <span className="font-semibold text-text-body">Legend:</span>
        <span className="inline-flex items-center gap-1.5">
          <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">✓ Write</span>
          Full create, edit, and delete access
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="rounded-md border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-600">◎ Read</span>
          View-only access
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="rounded-md border border-divider bg-paper px-2 py-0.5 text-[11px] font-semibold text-text-muted">— None</span>
          No access
        </span>
        {editMode && (
          <span className="ml-auto text-[11px] text-purple-600 font-medium">
            🔒 super_admin row is locked — always full access
          </span>
        )}
      </div>
    </div>
  );
}

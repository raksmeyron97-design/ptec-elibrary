"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setUserRole } from "@/app/(admin)/admin/(protected)/users/actions";
import Pagination from "@/components/ui/core/Pagination";
import Avatar from "@/components/ui/Avatar";
import type { AppRole } from "@/lib/types/roles";
import { ALL_ROLES, ROLE_META, ADMIN_ROLES } from "@/lib/types/roles";

const ROLE_FILTER_COLORS: Record<AppRole, { active: string; activeBg: string }> = {
  reader:      { active: "#475569", activeBg: "#F1F5F9" },
  staff:       { active: "#1D4ED8", activeBg: "#EFF6FF" },
  librarian:   { active: "#047857", activeBg: "#ECFDF5" },
  admin:       { active: "#B45309", activeBg: "#FFFBEB" },
  super_admin: { active: "#7C3AED", activeBg: "#F5F3FF" },
};

type UserRow = {
  id: string;
  fullName: string | null;
  email: string;
  role: AppRole;
  createdAt: string;
  avatarUrl: string | null;
  isSuperAdmin: boolean;
};

export default function UsersClient({
  users,
  currentUserId,
  callerRole,
  callerIsSuperAdmin,
  totalItems,
  totalPages,
  currentPage,
  searchParams,
  activeRole,
}: {
  users: UserRow[];
  currentUserId: string;
  callerRole: AppRole;
  callerIsSuperAdmin: boolean;
  totalItems: number;
  totalPages: number;
  currentPage: number;
  searchParams: Record<string, string | undefined>;
  activeRole: AppRole | "all";
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [query, setQuery] = useState(searchParams?.q || "");
  const [changingId, setChangingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const callerCanAssignAdmin =
    callerIsSuperAdmin || callerRole === "super_admin";

  function buildUrl(overrides: Record<string, string>) {
    const p = new URLSearchParams();
    if (query)                           p.set("q",    query);
    if (activeRole && activeRole !== "all") p.set("role", activeRole);
    Object.entries(overrides).forEach(([k, v]) => {
      if (v) p.set(k, v); else p.delete(k);
    });
    return `/admin/users?${p.toString()}`;
  }

  useEffect(() => {
    if (query === (searchParams?.q || "")) return;
    const handler = setTimeout(() => {
      const p = new URLSearchParams();
      if (query) p.set("q", query);
      if (activeRole && activeRole !== "all") p.set("role", activeRole);
      router.push(`/admin/users?${p.toString()}`);
    }, 300);
    return () => clearTimeout(handler);
  }, [query, router, searchParams?.q, activeRole]);

  async function handleRoleChange(u: UserRow, newRole: AppRole) {
    if (newRole === u.role) return;
    setChangingId(u.id);
    setError(null);
    try {
      await setUserRole(u.id, newRole);
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update role");
    } finally {
      setChangingId(null);
    }
  }

  /** Returns true if the caller is allowed to assign `targetRole` */
  function canAssign(targetRole: AppRole): boolean {
    if (ADMIN_ROLES.includes(targetRole)) return callerCanAssignAdmin;
    return true;
  }

  return (
    <div className="space-y-4">

      {/* Role filter tabs */}
      <div className="flex flex-wrap gap-2">
        {(["all", ...ALL_ROLES] as const).map((r) => {
          const isActive = r === activeRole;
          const colors = r !== "all" ? ROLE_FILTER_COLORS[r as AppRole] : null;
          return (
            <button
              key={r}
              type="button"
              onClick={() => startTransition(() => router.push(buildUrl({ role: r === "all" ? "" : r, page: "" })))}
              className="rounded-full border px-3.5 py-1 text-[12px] font-semibold transition-all duration-150"
              style={
                isActive && colors
                  ? { background: colors.activeBg, borderColor: colors.active + "55", color: colors.active }
                  : isActive
                  ? { background: "#1E3A8A", borderColor: "#1E3A8A", color: "#fff" }
                  : { background: "transparent", borderColor: "var(--ptec-divider)", color: "var(--ptec-text-muted)" }
              }
            >
              {r === "all" ? "All users" : ROLE_META[r as AppRole].label}
            </button>
          );
        })}
      </div>

      {/* Search */}
      <div className="flex items-center gap-3 rounded-xl border border-divider bg-bg-surface px-4 py-3 shadow-sm">
        <svg className="h-4 w-4 shrink-0 text-text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
        </svg>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or email…"
          className="flex-1 bg-transparent text-sm text-text-heading placeholder-text-muted outline-none"
        />
        {query && (
          <button type="button" onClick={() => setQuery("")} className="text-text-muted hover:text-text-body">✕</button>
        )}
        <span className="text-xs text-text-muted">{totalItems} result{totalItems !== 1 ? "s" : ""}</span>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-divider bg-bg-surface shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-divider bg-paper text-left text-xs font-bold uppercase tracking-wide text-text-muted">
                <th className="px-4 py-3">#</th>
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3 hidden md:table-cell">Email</th>
                <th className="px-4 py-3 hidden lg:table-cell">Joined</th>
                <th className="px-4 py-3 text-center">Role</th>
                <th className="px-4 py-3 text-right">Assign Role</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {users.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-text-muted">
                    No users found{query ? ` for "${query}"` : ""}.
                  </td>
                </tr>
              ) : (
                users.map((u, idx) => {
                  const isMe = u.id === currentUserId;
                  const isChanging = changingId === u.id;
                  const meta = ROLE_META[u.role];
                  const targetIsSuperAdmin =
                    u.isSuperAdmin || u.role === "super_admin";
                  const canEditTarget =
                    !isMe && (!targetIsSuperAdmin || callerCanAssignAdmin);

                  return (
                    <tr key={u.id} className={`transition-colors hover:bg-paper/80 ${isChanging ? "opacity-50" : ""}`}>
                      {/* # */}
                      <td className="px-4 py-3 text-xs text-text-muted tabular-nums">{idx + 1}</td>

                      {/* User */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <Avatar url={u.avatarUrl} name={u.fullName} email={u.email} />
                          <div>
                            <p className="font-semibold text-text-heading leading-tight">
                              {u.fullName ?? <span className="text-text-muted italic">No name</span>}
                              {isMe && (
                                <span className="ml-2 rounded-full bg-cyan-50 px-2 py-0.5 text-[10px] font-bold text-cyan-700">You</span>
                              )}
                              {u.isSuperAdmin && (
                                <span className="ml-1 rounded-full bg-purple-50 px-2 py-0.5 text-[10px] font-bold text-purple-700">SA</span>
                              )}
                            </p>
                            <p className="text-xs text-text-muted md:hidden">{u.email}</p>
                          </div>
                        </div>
                      </td>

                      {/* Email */}
                      <td className="px-4 py-3 hidden md:table-cell text-text-muted text-xs">{u.email}</td>

                      {/* Joined */}
                      <td className="px-4 py-3 hidden lg:table-cell text-text-muted text-xs tabular-nums">
                        {new Date(u.createdAt).toLocaleDateString("en-GB", {
                          day: "2-digit", month: "short", year: "numeric",
                        })}
                      </td>

                      {/* Role badge */}
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-block rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${meta.bgColor} ${meta.color} ${meta.borderColor}`}>
                          {meta.label}
                        </span>
                      </td>

                      {/* Role dropdown */}
                      <td className="px-4 py-3 text-right">
                        {isMe ? (
                          <span className="text-xs text-text-muted italic">—</span>
                        ) : !canEditTarget ? (
                          <span className="text-xs text-text-muted italic" title="Only a super admin can edit this user">Protected</span>
                        ) : (
                          <select
                            value={u.role}
                            disabled={isChanging || !!changingId}
                            onChange={(e) => handleRoleChange(u, e.target.value as AppRole)}
                            className="rounded border border-divider bg-bg-surface px-2 py-1 text-xs text-text-body shadow-sm outline-none transition hover:border-text-muted focus:border-brand disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {ALL_ROLES.map((r) => {
                              const assignable = canAssign(r);
                              return (
                                <option key={r} value={r} disabled={!assignable}>
                                  {ROLE_META[r].label}{!assignable ? " (super admin only)" : ""}
                                </option>
                              );
                            })}
                          </select>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={totalItems}
        pageSize={20}
        searchParams={searchParams}
        basePath="/admin/users"
      />
    </div>
  );
}

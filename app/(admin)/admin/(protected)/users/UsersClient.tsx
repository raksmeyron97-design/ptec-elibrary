"use client";

// app/admin/users/UsersClient.tsx
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toggleUserRole } from "@/app/(admin)/admin/(protected)/users/actions";
import Pagination from "@/components/ui/core/Pagination";
import Avatar from "@/components/ui/Avatar";

type UserRow = {
  id: string;
  fullName: string | null;
  email: string;
  role: "reader" | "admin";
  createdAt: string;
  avatarUrl: string | null;
};

// ── Main component ────────────────────────────────────────────────────────────
export default function UsersClient({
  users,
  currentUserId,
  isSuperAdmin,
  totalItems,
  totalPages,
  currentPage,
  searchParams,
}: {
  users: UserRow[];
  currentUserId: string;
  isSuperAdmin: boolean;
  totalItems: number;
  totalPages: number;
  currentPage: number;
  searchParams: Record<string, string | undefined>;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [query, setQuery] = useState(searchParams?.q || "");
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (query === (searchParams?.q || "")) return;
    const handler = setTimeout(() => {
      const p = new URLSearchParams();
      if (query) p.set("q", query);
      router.push(`/admin/users?${p.toString()}`);
    }, 300);
    return () => clearTimeout(handler);
  }, [query, router, searchParams?.q]);

  const filtered = users;

  // ── Execute role change ────────────────────────────────────────────────────
  async function executeToggle(u: UserRow) {
    setTogglingId(u.id);
    setError(null);
    try {
      await toggleUserRole(u.id, u.role);
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update role");
    } finally {
      setTogglingId(null);
    }
  }

  // ── Click handler ─────────────────────────────────────────────────────────
  function handleToggleClick(u: UserRow) {
    if (u.id === currentUserId) return;

    const isPromotion = u.role === "reader";
    // Only super admins may promote. The button is disabled for others, but we
    // guard here too so nothing slips through.
    if (isPromotion && !isSuperAdmin) return;

    executeToggle(u);
  }

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="flex items-center gap-3 rounded-xl border border-divider bg-bg-surface px-4 py-3 shadow-sm">
        <svg className="h-4 w-4 shrink-0 text-text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
        </svg>
        <input
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); }}
          placeholder="Search by name or email…"
          className="flex-1 bg-transparent text-sm text-text-heading placeholder-text-muted outline-none"
        />
        {query && (
          <button onClick={() => setQuery("")} className="text-text-muted hover:text-text-body">✕</button>
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
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-text-muted">
                    No users found{query ? ` for "${query}"` : ""}.
                  </td>
                </tr>
              ) : (
                filtered.map((u, idx) => {
                  const isMe          = u.id === currentUserId;
                  const isToggling    = togglingId === u.id;
                  const isPromotion   = u.role === "reader";
                  // Regular admins cannot promote — only super admins can.
                  const promoteBlocked = isPromotion && !isSuperAdmin;

                  return (
                    <tr key={u.id} className={`transition-colors hover:bg-paper/80 ${isToggling ? "opacity-50" : ""}`}>
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
                        <span className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                          u.role === "admin"
                            ? "bg-amber-50 text-amber-700"
                            : "bg-paper text-text-muted"
                        }`}>
                          {u.role}
                        </span>
                      </td>

                      {/* Action */}
                      <td className="px-4 py-3 text-right">
                        {isMe ? (
                          <span className="text-xs text-text-muted italic">—</span>
                        ) : (
                          <button
                            onClick={() => handleToggleClick(u)}
                            disabled={isToggling || !!togglingId || promoteBlocked}
                            title={promoteBlocked ? "Only a super admin can promote users to admin" : undefined}
                            className={`rounded px-3 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                              u.role === "admin"
                                ? "border border-divider bg-paper text-text-body hover:bg-red-50 hover:text-red-600 hover:border-red-200"
                                : "border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
                            }`}
                          >
                            {isToggling
                              ? "…"
                              : u.role === "admin"
                              ? "Demote to Reader"
                              : "Promote to Admin"}
                          </button>
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
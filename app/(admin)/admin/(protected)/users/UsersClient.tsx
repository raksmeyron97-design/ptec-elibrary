"use client";

// app/admin/users/UsersClient.tsx
import { useState, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toggleUserRole } from "@/app/(admin)/admin/(protected)/users/actions";

type UserRow = {
  id: string;
  fullName: string | null;
  email: string;
  role: "reader" | "admin";
  createdAt: string;
  avatarUrl: string | null;
};

function getInitials(name: string | null, email: string) {
  if (name) return name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
  return email.slice(0, 2).toUpperCase();
}

export default function UsersClient({
  users,
  currentUserId,
}: {
  users: UserRow[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [query, setQuery]         = useState("");
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [error, setError]         = useState<string | null>(null);

  // ── Filter ────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.email.toLowerCase().includes(q) ||
        (u.fullName ?? "").toLowerCase().includes(q) ||
        u.role.includes(q)
    );
  }, [users, query]);

  // ── Toggle role ───────────────────────────────────────────────
  async function handleToggle(u: UserRow) {
    if (u.id === currentUserId) return; // can't demote yourself
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

  return (
    <div className="space-y-4">

      {/* Search */}
      <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <svg className="h-4 w-4 shrink-0 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
        </svg>
        <input
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); }}
          placeholder="Search by name or email…"
          className="flex-1 bg-transparent text-sm text-slate-800 placeholder-slate-400 outline-none"
        />
        {query && (
          <button onClick={() => setQuery("")} className="text-slate-400 hover:text-slate-600">✕</button>
        )}
        <span className="text-xs text-slate-400">{filtered.length} result{filtered.length !== 1 ? "s" : ""}</span>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
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
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-400">
                    No users found{query ? ` for "${query}"` : ""}.
                  </td>
                </tr>
              ) : (
                filtered.map((u, idx) => {
                  const isMe       = u.id === currentUserId;
                  const isToggling = togglingId === u.id;

                  return (
                    <tr key={u.id} className={`transition-colors hover:bg-slate-50/80 ${isToggling ? "opacity-50" : ""}`}>
                      {/* # */}
                      <td className="px-4 py-3 text-xs text-slate-400 tabular-nums">{idx + 1}</td>

                      {/* User */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {/* Avatar */}
                          <div className="h-8 w-8 shrink-0 rounded-full overflow-hidden flex items-center justify-center bg-[#007c91] text-xs font-bold text-white">
                            {u.avatarUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={u.avatarUrl} alt="" className="h-full w-full object-cover" />
                            ) : (
                              getInitials(u.fullName, u.email)
                            )}
                          </div>
                          <div>
                            <p className="font-semibold text-slate-800 leading-tight">
                              {u.fullName ?? <span className="text-slate-400 italic">No name</span>}
                              {isMe && (
                                <span className="ml-2 rounded-full bg-cyan-50 px-2 py-0.5 text-[10px] font-bold text-cyan-700">You</span>
                              )}
                            </p>
                            {/* Email on mobile */}
                            <p className="text-xs text-slate-400 md:hidden">{u.email}</p>
                          </div>
                        </div>
                      </td>

                      {/* Email */}
                      <td className="px-4 py-3 hidden md:table-cell text-slate-500 text-xs">{u.email}</td>

                      {/* Joined */}
                      <td className="px-4 py-3 hidden lg:table-cell text-slate-400 text-xs tabular-nums">
                        {new Date(u.createdAt).toLocaleDateString("en-GB", {
                          day: "2-digit", month: "short", year: "numeric",
                        })}
                      </td>

                      {/* Role badge */}
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                          u.role === "admin"
                            ? "bg-amber-50 text-amber-700"
                            : "bg-slate-100 text-slate-500"
                        }`}>
                          {u.role}
                        </span>
                      </td>

                      {/* Action */}
                      <td className="px-4 py-3 text-right">
                        {isMe ? (
                          <span className="text-xs text-slate-300 italic">—</span>
                        ) : (
                          <button
                            onClick={() => handleToggle(u)}
                            disabled={isToggling || !!togglingId}
                            className={`rounded px-3 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                              u.role === "admin"
                                ? "border border-slate-200 bg-slate-50 text-slate-600 hover:bg-red-50 hover:text-red-600 hover:border-red-200"
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
    </div>
  );
}
"use client"
 
;
/* eslint-disable @typescript-eslint/no-unused-vars */


// app/admin/users/UsersClient.tsx
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toggleUserRole } from "@/app/(admin)/admin/(protected)/users/actions";
import Pagination from "@/components/ui/core/Pagination";

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

// ── Password confirm modal ────────────────────────────────────────────────────
function PromoteConfirmModal({
  target,
  onConfirm,
  onCancel,
  loading,
  error,
}: {
  target: UserRow;
  onConfirm: (password: string) => void;
  onCancel: () => void;
  loading: boolean;
  error: string | null;
}) {
  const [password, setPassword] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password) onConfirm(password);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl border border-divider bg-bg-surface p-6 shadow-2xl mx-4">
        {/* Header */}
        <div className="mb-4">
          <h2 className="text-base font-bold text-text-heading">Confirm Promotion</h2>
          <p className="mt-1 text-sm text-text-muted">
            You are about to promote{" "}
            <span className="font-semibold text-text-body">
              {target.fullName || target.email}
            </span>{" "}
            to <span className="font-semibold text-amber-600">Admin</span>.
          </p>
          <p className="mt-1 text-sm text-text-muted">
            Enter your password to confirm.
          </p>
        </div>

        {error && (
          <p className="mb-3 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-text-muted mb-1.5">
              Your Password
            </label>
            <input
              ref={inputRef}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              required
              autoComplete="current-password"
              className="h-10 w-full rounded-lg border border-divider bg-bg-surface px-3 text-sm text-text-body placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-brand/30"
            />
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onCancel}
              disabled={loading}
              className="flex-1 rounded-xl border border-divider bg-paper py-2.5 text-sm font-semibold text-text-body hover:bg-bg-muted disabled:opacity-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!password || loading}
              className="flex-1 rounded-xl bg-amber-600 py-2.5 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50 transition-colors"
            >
              {loading ? "Verifying…" : "Promote"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

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

  // Modal state
  const [pendingTarget, setPendingTarget] = useState<UserRow | null>(null);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

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

  // ── Execute role change (with optional password) ──────────────────────────
  async function executeToggle(u: UserRow, password?: string) {
    setTogglingId(u.id);
    setError(null);
    try {
      await toggleUserRole(u.id, u.role, password);
      startTransition(() => router.refresh());
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to update role";
      if (password !== undefined) {
        // Error came from modal flow — show in modal
        setModalError(msg);
        setTogglingId(null);
        return;
      }
      setError(msg);
    } finally {
      if (password === undefined || !modalError) {
        setTogglingId(null);
      }
    }
  }

  // ── Click handler ─────────────────────────────────────────────────────────
  function handleToggleClick(u: UserRow) {
    if (u.id === currentUserId) return;
    const isPromotion = u.role === "reader";

    if (isPromotion && !isSuperAdmin) {
      // Open password modal
      setModalError(null);
      setPendingTarget(u);
      return;
    }

    // Super admin or demotion — no password needed
    executeToggle(u);
  }

  async function handleModalConfirm(password: string) {
    if (!pendingTarget) return;
    setModalLoading(true);
    setModalError(null);
    try {
      await toggleUserRole(pendingTarget.id, pendingTarget.role, password);
      setPendingTarget(null);
      startTransition(() => router.refresh());
    } catch (err) {
      setModalError(err instanceof Error ? err.message : "Failed");
    } finally {
      setModalLoading(false);
    }
  }

  function handleModalCancel() {
    setPendingTarget(null);
    setModalError(null);
    setTogglingId(null);
  }

  return (
    <>
      {/* Password confirm modal */}
      {pendingTarget && (
        <PromoteConfirmModal
          target={pendingTarget}
          onConfirm={handleModalConfirm}
          onCancel={handleModalCancel}
          loading={modalLoading}
          error={modalError}
        />
      )}

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
                    const isMe       = u.id === currentUserId;
                    const isToggling = togglingId === u.id;

                    return (
                      <tr key={u.id} className={`transition-colors hover:bg-paper/80 ${isToggling ? "opacity-50" : ""}`}>
                        {/* # */}
                        <td className="px-4 py-3 text-xs text-text-muted tabular-nums">{idx + 1}</td>

                        {/* User */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="h-8 w-8 shrink-0 rounded-full overflow-hidden flex items-center justify-center bg-brand text-xs font-bold text-white">
                              {u.avatarUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={u.avatarUrl} alt="" className="h-full w-full object-cover" />
                              ) : (
                                getInitials(u.fullName, u.email)
                              )}
                            </div>
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
                              disabled={isToggling || !!togglingId}
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
    </>
  );
}

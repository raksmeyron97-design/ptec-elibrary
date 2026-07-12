"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Pagination from "@/components/ui/core/Pagination";
import UserToolbar from "@/components/admin/users/UserToolbar";
import UserFilters from "@/components/admin/users/UserFilters";
import UsersTable from "@/components/admin/users/UsersTable";
import UserMobileCard from "@/components/admin/users/UserMobileCard";
import BulkUserActionBar from "@/components/admin/users/BulkUserActionBar";
import UserDetailDrawer from "@/components/admin/users/UserDetailDrawer";
import AddUserDialog from "@/components/admin/users/AddUserDialog";
import { ConfirmDialog, RoleDialog } from "@/components/admin/users/dialogs";
import { UsersEmptyState, UsersNoResultsState } from "@/components/admin/users/states";
import type { UserActionIntent } from "@/components/admin/users/UserActionsMenu";
import { formatDate, userLabel, type UserRow } from "@/lib/admin/users-shared";
import { ROLE_META, type AppRole } from "@/lib/types/roles";
import {
  assignRole, bulkAssignRole, setUserStatus, sendPasswordReset, deleteUser, type ActionResult,
} from "@/app/(admin)/admin/(protected)/users/actions";

// ── CSV export (client-side, current page / selection) ───────────────────────
function toCsv(v: string | number | null | undefined) {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function exportCsv(rows: UserRow[]) {
  const header = ["Name", "Email", "Phone", "Role", "Status", "Joined", "Last login"];
  const lines = rows.map((u) =>
    [
      u.fullName ?? "", u.email, u.phone ?? "", ROLE_META[u.role].label, u.status,
      formatDate(u.createdAt), u.lastLoginAt ? formatDate(u.lastLoginAt) : "Never",
    ].map(toCsv).join(","),
  );
  const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `users-export-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

type Pending =
  | { kind: "suspend" | "reset" | "delete"; user: UserRow }
  | { kind: "bulk-suspend" | "bulk-delete"; ids: string[] };

export default function UsersClient({
  rows,
  total,
  totalPages,
  currentPage,
  pageSize,
  searchParams,
  filterValue,
  currentUserId,
  callerCanAssignAdmin,
  hasAnyAtAll,
}: {
  rows: UserRow[];
  total: number;
  totalPages: number;
  currentPage: number;
  pageSize: number;
  searchParams: Record<string, string | undefined>;
  filterValue: { role: string; status: string; joined: string; sort: string };
  currentUserId: string;
  callerCanAssignAdmin: boolean;
  hasAnyAtAll: boolean;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [drawerUser, setDrawerUser] = useState<UserRow | null>(null);
  const [roleUser, setRoleUser] = useState<UserRow | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [addMode, setAddMode] = useState<"invite" | "import" | null>(null);

  const canManage = (u: UserRow) => {
    if (u.id === currentUserId) return false;
    const targetSuper = u.isSuperAdmin || u.role === "super_admin";
    return !targetSuper || callerCanAssignAdmin;
  };

  function refresh() {
    startTransition(() => router.refresh());
  }

  async function run(id: string, fn: () => Promise<ActionResult>, successMsg?: string) {
    setBusyId(id); setError(null); setNotice(null);
    try {
      const r = await fn();
      if (!r.success) setError(r.error ?? "Action failed");
      else { if (successMsg) setNotice(successMsg); refresh(); }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusyId(null);
    }
  }

  async function runBulk(fn: () => Promise<ActionResult>, successMsg?: string) {
    setBulkBusy(true); setError(null); setNotice(null);
    try {
      const r = await fn();
      if (!r.success) setError(r.error ?? "Bulk action failed");
      else if (successMsg) setNotice(successMsg);
      if (r.error && r.success) setNotice(r.error);
      setSelectedIds(new Set());
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bulk action failed");
    } finally {
      setBulkBusy(false);
    }
  }

  function handleIntent(user: UserRow, intent: UserActionIntent) {
    switch (intent) {
      case "view": setDrawerUser(user); break;
      case "assignRole": setRoleUser(user); break;
      case "activate": run(user.id, () => setUserStatus(user.id, "activate"), "User reactivated."); break;
      case "resetPassword": setPending({ kind: "reset", user }); break;
      case "suspend": setPending({ kind: "suspend", user }); break;
      case "delete": setPending({ kind: "delete", user }); break;
    }
  }

  const toggleSelect = (id: string) =>
    setSelectedIds((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleSelectAll = () =>
    setSelectedIds((prev) => (prev.size === rows.length ? new Set() : new Set(rows.map((r) => r.id))));

  const selectedRows = rows.filter((r) => selectedIds.has(r.id));
  const hasActiveFilters = Boolean(
    searchParams.q || (filterValue.role && filterValue.role !== "all") || (filterValue.status && filterValue.status !== "all") ||
    (filterValue.joined && filterValue.joined !== "all"),
  );

  async function confirmPending() {
    if (!pending) return;
    if (pending.kind === "reset") { setPending(null); await run(pending.user.id, () => sendPasswordReset(pending.user.id), "Password reset email sent."); return; }
    if (pending.kind === "suspend") { setPending(null); await run(pending.user.id, () => setUserStatus(pending.user.id, "suspend"), "User suspended."); return; }
    if (pending.kind === "delete") { setPending(null); if (drawerUser?.id === pending.user.id) setDrawerUser(null); await run(pending.user.id, () => deleteUser(pending.user.id), "User deleted."); return; }
    if (pending.kind === "bulk-suspend") {
      const ids = pending.ids; setPending(null);
      await runBulk(async () => {
        let failed = 0;
        for (const id of ids) { const r = await setUserStatus(id, "suspend"); if (!r.success) failed++; }
        return failed ? { success: failed < ids.length, error: `${failed} failed` } : { success: true };
      }, "Users suspended.");
      return;
    }
    if (pending.kind === "bulk-delete") {
      const ids = pending.ids; setPending(null);
      await runBulk(async () => {
        let failed = 0;
        for (const id of ids) { const r = await deleteUser(id); if (!r.success) failed++; }
        return failed ? { success: failed < ids.length, error: `${failed} failed` } : { success: true };
      }, "Users deleted.");
      return;
    }
  }

  return (
    <div className="space-y-4">
      <UserToolbar
        totalItems={total}
        onAddUser={() => setAddMode("invite")}
        onImport={() => setAddMode("import")}
        onExport={() => exportCsv(selectedRows.length ? selectedRows : rows)}
      />
      <UserFilters value={filterValue} hasActiveFilters={hasActiveFilters} />

      {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {notice && <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</div>}

      <BulkUserActionBar
        count={selectedIds.size}
        busy={bulkBusy}
        canAssignAdmin={callerCanAssignAdmin}
        onAssignRole={(role: AppRole) => runBulk(() => bulkAssignRole(Array.from(selectedIds), role), "Roles updated.")}
        onSuspend={() => setPending({ kind: "bulk-suspend", ids: Array.from(selectedIds) })}
        onDelete={() => setPending({ kind: "bulk-delete", ids: Array.from(selectedIds) })}
        onExport={() => exportCsv(selectedRows)}
        onClear={() => setSelectedIds(new Set())}
      />

      {rows.length === 0 ? (
        hasAnyAtAll ? <UsersNoResultsState /> : <UsersEmptyState />
      ) : (
        <>
          <UsersTable
            rows={rows}
            selectedIds={selectedIds}
            allSelected={selectedIds.size > 0 && selectedIds.size === rows.length}
            busyId={busyId}
            currentUserId={currentUserId}
            callerCanAssignAdmin={callerCanAssignAdmin}
            onToggleSelect={toggleSelect}
            onToggleSelectAll={toggleSelectAll}
            onOpen={setDrawerUser}
            onIntent={handleIntent}
          />
          <UserMobileCard
            rows={rows}
            selectedIds={selectedIds}
            busyId={busyId}
            currentUserId={currentUserId}
            callerCanAssignAdmin={callerCanAssignAdmin}
            onToggleSelect={toggleSelect}
            onOpen={setDrawerUser}
            onIntent={handleIntent}
          />
        </>
      )}

      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={total}
        pageSize={pageSize}
        searchParams={searchParams}
        basePath="/admin/users"
      />

      {/* Drawer */}
      {drawerUser && (
        <UserDetailDrawer
          key={drawerUser.id}
          user={drawerUser}
          canManage={canManage(drawerUser)}
          onClose={() => setDrawerUser(null)}
          onIntent={(intent) => handleIntent(drawerUser, intent)}
        />
      )}

      {/* Dialogs */}
      {roleUser && (
        <RoleDialog
          user={roleUser}
          canAssignAdmin={callerCanAssignAdmin}
          busy={busyId === roleUser.id}
          onCancel={() => setRoleUser(null)}
          onConfirm={async (role) => { const u = roleUser; setRoleUser(null); await run(u.id, () => assignRole(u.id, role), "Role updated."); }}
        />
      )}

      {pending && (
        <ConfirmDialog
          busy={bulkBusy || busyId !== null}
          danger={pending.kind === "delete" || pending.kind === "bulk-delete"}
          title={
            pending.kind === "reset" ? "Send password reset?"
            : pending.kind === "suspend" ? "Suspend this user?"
            : pending.kind === "delete" ? "Delete this user?"
            : pending.kind === "bulk-suspend" ? `Suspend ${"ids" in pending ? pending.ids.length : 0} users?`
            : `Delete ${"ids" in pending ? pending.ids.length : 0} users?`
          }
          body={
            pending.kind === "reset" ? <>A recovery email will be sent to <b>{pending.user.email}</b>. They can set a new password from the link.</>
            : pending.kind === "suspend" ? <>They will be signed out and blocked from logging in until reactivated.</>
            : pending.kind === "delete" ? <>This permanently deletes <b>{userLabel(pending.user)}</b> and their account data. This cannot be undone.</>
            : pending.kind === "bulk-suspend" ? <>They will be signed out and blocked until reactivated.</>
            : <>This permanently deletes the selected accounts. This cannot be undone.</>
          }
          confirmLabel={
            pending.kind === "reset" ? "Send email"
            : pending.kind === "suspend" || pending.kind === "bulk-suspend" ? "Suspend"
            : "Delete"
          }
          onCancel={() => setPending(null)}
          onConfirm={confirmPending}
        />
      )}

      {addMode && (
        <AddUserDialog mode={addMode} canAssignAdmin={callerCanAssignAdmin} onClose={() => setAddMode(null)} />
      )}
    </div>
  );
}

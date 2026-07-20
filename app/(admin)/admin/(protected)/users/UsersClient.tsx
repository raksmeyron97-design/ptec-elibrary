"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useToast } from "@/components/admin/kit";
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
import ExportMenu from "@/components/admin/ExportMenu";
import { userLabel, type UserRow } from "@/lib/admin/users-shared";
import { type AppRole } from "@/lib/types/roles";
import {
  assignRole, bulkAssignRole, setUserStatus, sendPasswordReset, deleteUser, type ActionResult,
} from "@/app/(admin)/admin/(protected)/users/actions";

// Exports run server-side (/api/admin/users/export) so they cover the whole
// filtered result — not just the visible page — with Excel-safe encoding.
function buildExportHref(
  q: string | undefined,
  filterValue: { role: string; status: string; joined: string; sort: string },
  selectedIds?: string[],
): string {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (filterValue.role && filterValue.role !== "all") params.set("role", filterValue.role);
  if (filterValue.status && filterValue.status !== "all") params.set("status", filterValue.status);
  if (filterValue.joined && filterValue.joined !== "all") params.set("joined", filterValue.joined);
  if (filterValue.sort) params.set("sort", filterValue.sort);
  if (selectedIds?.length) params.set("ids", selectedIds.join(","));
  const qs = params.toString();
  return `/api/admin/users/export${qs ? `?${qs}` : ""}`;
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
  const t = useTranslations("adminUsers");
  const toast = useToast();
  const [, startTransition] = useTransition();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);

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
    setBusyId(id);
    try {
      const r = await fn();
      if (!r.success) toast.error(r.error ?? t("toasts.failed"));
      else { if (successMsg) toast.success(successMsg); refresh(); }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("toasts.failed"));
    } finally {
      setBusyId(null);
    }
  }

  async function runBulk(fn: () => Promise<ActionResult>, successMsg?: string) {
    setBulkBusy(true);
    try {
      const r = await fn();
      if (!r.success) toast.error(r.error ?? t("toasts.bulkFailed"));
      else if (successMsg) toast.success(successMsg);
      if (r.error && r.success) toast.warning(r.error);
      setSelectedIds(new Set());
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("toasts.bulkFailed"));
    } finally {
      setBulkBusy(false);
    }
  }

  function handleIntent(user: UserRow, intent: UserActionIntent) {
    switch (intent) {
      case "view": setDrawerUser(user); break;
      case "assignRole": setRoleUser(user); break;
      case "activate": run(user.id, () => setUserStatus(user.id, "activate"), t("toasts.reactivated")); break;
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
    if (pending.kind === "reset") { setPending(null); await run(pending.user.id, () => sendPasswordReset(pending.user.id), t("toasts.resetSent")); return; }
    if (pending.kind === "suspend") { setPending(null); await run(pending.user.id, () => setUserStatus(pending.user.id, "suspend"), t("toasts.suspended")); return; }
    if (pending.kind === "delete") { setPending(null); if (drawerUser?.id === pending.user.id) setDrawerUser(null); await run(pending.user.id, () => deleteUser(pending.user.id), t("toasts.deleted")); return; }
    if (pending.kind === "bulk-suspend") {
      const ids = pending.ids; setPending(null);
      await runBulk(async () => {
        let failed = 0;
        for (const id of ids) { const r = await setUserStatus(id, "suspend"); if (!r.success) failed++; }
        return failed ? { success: failed < ids.length, error: t("toasts.someFailed", { count: failed }) } : { success: true };
      }, t("toasts.bulkSuspended"));
      return;
    }
    if (pending.kind === "bulk-delete") {
      const ids = pending.ids; setPending(null);
      await runBulk(async () => {
        let failed = 0;
        for (const id of ids) { const r = await deleteUser(id); if (!r.success) failed++; }
        return failed ? { success: failed < ids.length, error: t("toasts.someFailed", { count: failed }) } : { success: true };
      }, t("toasts.bulkDeleted"));
      return;
    }
  }

  return (
    <div className="space-y-4">
      <UserToolbar
        totalItems={total}
        onAddUser={() => setAddMode("invite")}
        onImport={() => setAddMode("import")}
        exportMenu={
          <ExportMenu
            href={buildExportHref(
              searchParams.q,
              filterValue,
              selectedRows.length ? selectedRows.map((r) => r.id) : undefined,
            )}
            recordCount={selectedRows.length || total}
            buttonClassName="inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-divider bg-bg-surface px-4 text-sm font-semibold text-text-body shadow-sm transition hover:bg-paper disabled:cursor-wait disabled:opacity-60"
          />
        }
      />
      <UserFilters value={filterValue} hasActiveFilters={hasActiveFilters} />

      <BulkUserActionBar
        count={selectedIds.size}
        busy={bulkBusy}
        canAssignAdmin={callerCanAssignAdmin}
        onAssignRole={(role: AppRole) => runBulk(() => bulkAssignRole(Array.from(selectedIds), role), t("toasts.rolesUpdated"))}
        onSuspend={() => setPending({ kind: "bulk-suspend", ids: Array.from(selectedIds) })}
        onDelete={() => setPending({ kind: "bulk-delete", ids: Array.from(selectedIds) })}
        exportMenu={
          <ExportMenu
            href={buildExportHref(searchParams.q, filterValue, selectedRows.map((r) => r.id))}
            recordCount={selectedRows.length}
            buttonClassName="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg px-3 text-[13px] font-semibold text-text-body transition hover:bg-paper disabled:cursor-wait disabled:opacity-50"
          />
        }
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
          onConfirm={async (role) => { const u = roleUser; setRoleUser(null); await run(u.id, () => assignRole(u.id, role), t("toasts.roleUpdated")); }}
        />
      )}

      {pending && (
        <ConfirmDialog
          busy={bulkBusy || busyId !== null}
          danger={pending.kind === "delete" || pending.kind === "bulk-delete"}
          title={
            pending.kind === "reset" ? t("confirm.resetTitle")
            : pending.kind === "suspend" ? t("confirm.suspendTitle")
            : pending.kind === "delete" ? t("confirm.deleteTitle")
            : pending.kind === "bulk-suspend" ? t("confirm.bulkSuspendTitle", { count: "ids" in pending ? pending.ids.length : 0 })
            : t("confirm.bulkDeleteTitle", { count: "ids" in pending ? pending.ids.length : 0 })
          }
          body={
            pending.kind === "reset" ? t("confirm.resetBody", { email: pending.user.email ?? "" })
            : pending.kind === "suspend" ? t("confirm.suspendBody")
            : pending.kind === "delete" ? t("confirm.deleteBody", { name: userLabel(pending.user) })
            : pending.kind === "bulk-suspend" ? t("confirm.bulkSuspendBody")
            : t("confirm.bulkDeleteBody")
          }
          confirmLabel={
            pending.kind === "reset" ? t("confirm.sendEmail")
            : pending.kind === "suspend" || pending.kind === "bulk-suspend" ? t("confirm.suspend")
            : t("confirm.delete")
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

import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/admin/kit";
import UsersClient from "./_components/UsersClient";
import UserStats from "@/components/admin/users/UserStats";
import { getUsers, getUsersSummary } from "@/lib/admin/users";
import { requireRouteAccess } from "@/lib/admin/route-guard";
import { isSuperAdminViewer } from "@/lib/admin/access-policy";
import {
  USER_SORT_OPTIONS, JOINED_RANGE_OPTIONS,
  type UserSort, type JoinedRange,
} from "@/lib/admin/users-shared";

const PAGE_SIZE = 20;

type SP = { [key: string]: string | string[] | undefined };

function str(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v ?? "").trim();
}

export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<SP> }) {
  /* READ opens the directory — the page reads every email, phone and role
     through the service-role client, and the (protected) layout only checks
     ADMIN_PANEL_ROLES, which admits staff and librarian (both `users: none`).
     Inviting, editing, deactivating and deleting are `users: write`.

     The guard hands back the caller's identity, so the two things the client
     needs to know — who they are, and whether they may assign the admin role —
     come from the auth round-trip the guard already made. This used to be a
     second `getUser()` plus a second `profiles` read in a parallel IIFE, which
     is the redundant lookup docs/ADMIN-AUTHORIZATION.md warns about. */
  const { userId, viewer, can } = await requireRouteAccess("users.manage");
  const callerIsSuperAdmin = isSuperAdminViewer(viewer);
  const canManageUsers = can("users.update");
  const canInviteUsers = can("users.invite");

  const params = await searchParams;

  const page = Math.max(1, parseInt(str(params.page) || "1", 10) || 1);
  const q = str(params.q);
  const role = str(params.role);
  const status = str(params.status);
  const joinedRaw = str(params.joined);
  const sortRaw = str(params.sort);
  const joined = (JOINED_RANGE_OPTIONS as readonly string[]).includes(joinedRaw) ? (joinedRaw as JoinedRange) : "all";
  const sort = (USER_SORT_OPTIONS as readonly string[]).includes(sortRaw) ? (sortRaw as UserSort) : "newest";

  const [t, summary, result] = await Promise.all([
    getTranslations("adminUsers"),
    getUsersSummary(),
    getUsers({ q, role, status, joined, sort, page, pageSize: PAGE_SIZE }),
  ]);

  const totalPages = Math.max(1, Math.ceil(result.total / PAGE_SIZE));

  return (
    <div className="w-full space-y-6">
      <PageHeader title={t("title")} description={t("description")} className="mb-0" />

      <UserStats summary={summary} />

      <UsersClient
        rows={result.rows}
        total={result.total}
        totalPages={totalPages}
        currentPage={page}
        pageSize={PAGE_SIZE}
        searchParams={params as Record<string, string | undefined>}
        filterValue={{ role: role || "all", status: status || "all", joined, sort }}
        currentUserId={userId}
        callerCanAssignAdmin={callerIsSuperAdmin}
        canManageUsers={canManageUsers}
        canInviteUsers={canInviteUsers}
        hasAnyAtAll={result.hasAnyAtAll}
      />
    </div>
  );
}

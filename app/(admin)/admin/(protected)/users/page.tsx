import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/admin/kit";
import UsersClient from "./UsersClient";
import UserStats from "@/components/admin/users/UserStats";
import { getUsers, getUsersSummary } from "@/lib/admin/users";
import type { AppRole } from "@/lib/types/roles";
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
  const params = await searchParams;

  const page = Math.max(1, parseInt(str(params.page) || "1", 10) || 1);
  const q = str(params.q);
  const role = str(params.role);
  const status = str(params.status);
  const joinedRaw = str(params.joined);
  const sortRaw = str(params.sort);
  const joined = (JOINED_RANGE_OPTIONS as readonly string[]).includes(joinedRaw) ? (joinedRaw as JoinedRange) : "all";
  const sort = (USER_SORT_OPTIONS as readonly string[]).includes(sortRaw) ? (sortRaw as UserSort) : "newest";

  const [t, summary, result, callerIdentity] = await Promise.all([
    getTranslations("adminUsers"),
    getUsersSummary(),
    getUsers({ q, role, status, joined, sort, page, pageSize: PAGE_SIZE }),
    (async () => {
      const authClient = await createClient();
      const { data: { user } } = await authClient.auth.getUser();
      const svc = createServiceClient();
      const { data: profile } = await svc
        .from("profiles")
        .select("role, is_super_admin")
        .eq("id", user?.id ?? "")
        .single();
      return {
        id: user?.id ?? "",
        role: (profile?.role ?? "admin") as AppRole,
        isSuperAdmin: Boolean(profile?.is_super_admin) || profile?.role === "super_admin",
      };
    })(),
  ]);

  const totalPages = Math.max(1, Math.ceil(result.total / PAGE_SIZE));

  return (
    <div className="mx-auto max-w-[1280px] space-y-6">
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
        currentUserId={callerIdentity.id}
        callerCanAssignAdmin={callerIdentity.isSuperAdmin}
        hasAnyAtAll={result.hasAnyAtAll}
      />
    </div>
  );
}

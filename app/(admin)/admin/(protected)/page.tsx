import { Suspense } from "react";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { ADMIN_ROLES, type AppRole } from "@/lib/types/roles";
import { getPermissionsForRole, hasPermission } from "@/lib/permissions";
import {
  parseDashboardFilters,
  serializeDashboardFilters,
  type DashboardView,
} from "@/lib/admin/dashboard-shared";
import { getDepartmentOptions } from "@/lib/admin/intelligence";
import DashboardHeaderCompact, {
  type QuickActionKey,
} from "@/components/admin/dashboard/DashboardHeaderCompact";
import DashboardToolbar from "@/components/admin/dashboard/DashboardToolbar";
import DashboardTabs from "@/components/admin/dashboard/DashboardTabs";
import SectionBoundary from "@/components/admin/dashboard/SectionBoundary";
import { OverviewSkeleton, TableSkeleton, CardsSkeleton } from "@/components/admin/dashboard/Skeletons";
import OverviewView from "@/components/admin/dashboard/views/OverviewView";
import ContentView from "@/components/admin/dashboard/views/ContentView";
import SearchView from "@/components/admin/dashboard/views/SearchView";
import AudienceView from "@/components/admin/dashboard/views/AudienceView";
import SystemView from "@/components/admin/dashboard/views/SystemView";

export const dynamic = "force-dynamic";

const PUBLIC_SITE_URL = process.env.NEXT_PUBLIC_ROOT_DOMAIN
  ? `https://${process.env.NEXT_PUBLIC_ROOT_DOMAIN}`
  : "https://library.ptec.edu.kh";

/**
 * Admin Intelligence Dashboard.
 *
 * Authentication + MFA live in the (protected) layout; this page resolves
 * the admin's role/permissions to (a) hide quick actions they cannot
 * perform and (b) hard-gate the System view to ADMIN_ROLES — the gate here
 * is server-side, and the CSV export API re-checks it independently.
 *
 * All state (view, range, comparison, content-type/department/language
 * filters, table preset/page) lives in URL search params, so any dashboard
 * state is bookmarkable and shareable between authorized administrators.
 */
async function getAdminIdentity(): Promise<{
  name: string | null;
  role: AppRole;
  perms: Record<string, "none" | "read" | "write">;
}> {
  const authClient = await createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { name: null, role: "reader", perms: {} };
  const supabase = createServiceClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role")
    .eq("id", user.id)
    .maybeSingle();
  const role = ((profile?.role as AppRole | null) ?? "reader") as AppRole;
  const perms = await getPermissionsForRole(role, supabase);
  return {
    name: (profile?.full_name as string | null) ?? user.email?.split("@")[0] ?? null,
    role,
    perms,
  };
}

export default async function AdminDashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const filters = parseDashboardFilters(sp);

  const [{ name, role, perms }, departments] = await Promise.all([
    getAdminIdentity(),
    getDepartmentOptions(),
  ]);

  // System view is restricted server-side; others follow the layout's gate.
  const canSystem = ADMIN_ROLES.includes(role);
  const view: DashboardView = filters.view === "system" && !canSystem ? "overview" : filters.view;
  const activeFilters = { ...filters, view };

  const quickActions: QuickActionKey[] = [];
  if (hasPermission(perms, "books", "write")) quickActions.push("addBook");
  if (hasPermission(perms, "research", "write")) quickActions.push("addThesis");
  if (hasPermission(perms, "publications", "write")) quickActions.push("addPublication");
  if (hasPermission(perms, "posts", "write")) quickActions.push("createPost");
  if (hasPermission(perms, "users", "write")) quickActions.push("manageUsers");
  if (hasPermission(perms, "books", "write")) quickActions.push("reviewRequests");

  const filterQs = serializeDashboardFilters(activeFilters);
  const exportHref = `/api/admin/dashboard/export${filterQs ? `?${filterQs}` : ""}`;

  const presetParam = typeof sp.preset === "string" ? sp.preset : undefined;
  const pageParam = typeof sp.page === "string" ? sp.page : undefined;
  const qParam = typeof sp.q === "string" ? sp.q : undefined;
  const queryViewParam = typeof sp.qview === "string" ? sp.qview : undefined;

  // Suspense keys: re-show the skeleton whenever the data-affecting params change.
  const suspenseKey = `${filterQs}|${presetParam ?? ""}|${pageParam ?? ""}|${qParam ?? ""}|${queryViewParam ?? ""}`;

  return (
    <div className="dash-shell dash-sans -mx-7 -my-6 min-h-full px-7 py-6">
      <div className="mx-auto max-w-[1200px] space-y-4 overflow-x-clip">
      <DashboardHeaderCompact
        name={name}
        role={role}
        actions={quickActions}
        publicSiteUrl={PUBLIC_SITE_URL}
      />

      <DashboardToolbar filters={activeFilters} departments={departments} exportHref={exportHref} />

      <DashboardTabs filters={activeFilters} active={view} showSystem={canSystem} />

      <SectionBoundary>
        {view === "overview" && (
          <Suspense key={suspenseKey} fallback={<OverviewSkeleton />}>
            <OverviewView filters={activeFilters} />
          </Suspense>
        )}
        {view === "content" && (
          <Suspense key={suspenseKey} fallback={<TableSkeleton />}>
            <ContentView filters={activeFilters} presetParam={presetParam} pageParam={pageParam} qParam={qParam} />
          </Suspense>
        )}
        {view === "search" && (
          <Suspense key={suspenseKey} fallback={<CardsSkeleton />}>
            <SearchView filters={activeFilters} queryViewParam={queryViewParam} />
          </Suspense>
        )}
        {view === "audience" && (
          <Suspense key={suspenseKey} fallback={<CardsSkeleton />}>
            <AudienceView filters={activeFilters} />
          </Suspense>
        )}
        {view === "system" && canSystem && (
          <Suspense key={suspenseKey} fallback={<CardsSkeleton />}>
            <SystemView filters={activeFilters} />
          </Suspense>
        )}
      </SectionBoundary>
      </div>
    </div>
  );
}

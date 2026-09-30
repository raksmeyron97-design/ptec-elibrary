import { Suspense } from "react";
import { ADMIN_ROLES, type AppRole } from "@/lib/types/roles";
import { hasPermission } from "@/lib/permissions";
import { getAdminIdentity } from "@/lib/auth/admin-identity";
import {
  parseDashboardFilters,
  parseMetric,
  serializeDashboardFilters,
  type DashboardFilters,
  type DashboardView,
} from "@/lib/admin/dashboard-shared";
import { getDepartmentOptions } from "@/lib/admin/intelligence";
import { getActionCenterOnce, getHealthPulseOnce } from "@/lib/admin/overview-cache";
import { canAccessRoute, type AdminViewer } from "@/lib/admin/access-policy";
import { COLLECTION_TILE_HREF } from "@/lib/admin/collection-pulse";
import { EBOOKS_BASE_PATH, EBOOKS_UPLOAD_PATH } from "@/lib/admin/ebooks-url";
import { resolveEngagementChartVersion } from "@/lib/admin/analytics-flags";
import DashboardHeader, { type QuickActionKey } from "@/components/admin/dashboard/DashboardHeader";
import HeaderStatus from "@/components/admin/dashboard/HeaderStatus";
import DashboardControlBar from "@/components/admin/dashboard/DashboardControlBar";
import SectionBoundary from "@/components/admin/dashboard/SectionBoundary";
import { OverviewSkeleton, TableSkeleton, CardsSkeleton } from "@/components/admin/dashboard/Skeletons";
import OverviewView, { type OverviewAccess } from "@/components/admin/dashboard/views/OverviewView";
import ContentView from "@/components/admin/dashboard/views/ContentView";
import SearchView from "@/components/admin/dashboard/views/SearchView";
import AudienceView from "@/components/admin/dashboard/views/AudienceView";
import SystemView from "@/components/admin/dashboard/views/SystemView";
import { requireRouteAccess } from "@/lib/admin/route-guard";

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
/**
 * Live status for the header line. Streamed in its own Suspense boundary so a
 * slow health probe never delays the page shell, and its failure degrades to
 * "status unavailable" rather than taking the dashboard down.
 */
async function DashboardStatus({ filters }: { filters: DashboardFilters }) {
  // Both reads are request-memoised and shared with the Overview body, which
  // asks the same questions — the chips cost no extra queries on that view.
  const [health, actions] = await Promise.all([
    getHealthPulseOnce(filters).catch(() => null),
    filters.view === "overview" ? getActionCenterOnce(filters).catch(() => null) : Promise.resolve(null),
  ]);
  if (!health) return null;
  const qs = serializeDashboardFilters({ ...filters, view: "system" });
  return (
    <HeaderStatus
      level={health.level}
      failing={health.failing}
      generatedAt={health.generatedAt}
      href={qs ? `/admin?${qs}` : "/admin"}
      attention={
        actions
          ? {
              count: actions.items.length,
              critical: actions.items.some((i) => i.severity === "critical"),
              href: "#attention",
            }
          : null
      }
    />
  );
}

/**
 * What the Overview may show and link to, asked of the route registry — the
 * same question `requireRouteAccess` asks at each destination — so no tile,
 * row or panel points at a 403, and a panel the viewer may not open is not
 * even read.
 */
function overviewAccess(viewer: AdminViewer): OverviewAccess {
  const can = (policyId: string) => canAccessRoute(viewer, policyId);
  const tile = (policyId: string, href: string) => (can(policyId) ? href : undefined);
  return {
    requests: can("books.requests"),
    scheduled: {
      book: can("books.manage"),
      research_report: can("theses.manage"),
      post: can("posts.manage"),
    },
    editable: {
      book: can("books.edit"),
      research_report: can("theses.edit"),
      publication: can("publications.edit"),
      post: can("posts.edit"),
    },
    tileHrefs: {
      books: tile("books.manage", COLLECTION_TILE_HREF.books),
      theses: tile("theses.manage", COLLECTION_TILE_HREF.theses),
      publications: tile("journals.manage", COLLECTION_TILE_HREF.publications),
      printTitles: tile("catalog.manage", COLLECTION_TILE_HREF.printTitles),
      printCopies: tile("catalog.manage", COLLECTION_TILE_HREF.printCopies),
      learningPaths: tile("paths.manage", COLLECTION_TILE_HREF.learningPaths),
    },
    addBookHref: can("books.upload") ? EBOOKS_UPLOAD_PATH : null,
    allBooksHref: can("books.manage") ? EBOOKS_BASE_PATH : null,
    requestsHref: "/admin/book-requests",
  };
}

async function getPageIdentity(): Promise<{
  name: string | null;
  role: AppRole;
  perms: Record<string, "none" | "read" | "write">;
}> {
  // Shared (React-cached) with the (protected) layout — no repeated
  // auth/profile/permissions round-trips for the same request.
  const identity = await getAdminIdentity();
  if (!identity.user) return { name: null, role: "reader", perms: {} };
  return {
    name: identity.fullName ?? identity.user.email?.split("@")[0] ?? null,
    role: identity.role,
    perms: identity.perms,
  };
}

export default async function AdminDashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { viewer } = await requireRouteAccess("dashboard");

  const sp = await searchParams;
  const filters = parseDashboardFilters(sp);
  const engagementChartVersion = resolveEngagementChartVersion();

  const [{ name, role, perms }, departments] = await Promise.all([
    getPageIdentity(),
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

  // The selected metric only picks which series the chart draws, so it is
  // deliberately absent from the Suspense key — switching KPI must not re-run
  // a single analytics query (the client updates the URL shallowly).
  const metric = parseMetric(sp.metric);

  // Suspense keys: re-show the skeleton whenever the data-affecting params change.
  const suspenseKey = `${filterQs}|${presetParam ?? ""}|${pageParam ?? ""}|${qParam ?? ""}|${queryViewParam ?? ""}`;

  return (
    <div className="dash-shell -mx-7 -my-6 min-h-full px-7 pb-8 pt-6">
      <div className="w-full space-y-5 overflow-x-clip">
        <DashboardHeader
          view={view}
          name={name}
          actions={quickActions}
          publicSiteUrl={PUBLIC_SITE_URL}
          status={
            <Suspense fallback={<span className="sr-only">…</span>}>
              <DashboardStatus filters={activeFilters} />
            </Suspense>
          }
        />

        <DashboardControlBar
          filters={activeFilters}
          active={view}
          showSystem={canSystem}
          departments={departments}
          exportHref={exportHref}
        />

      <SectionBoundary>
        {view === "overview" && (
          <Suspense key={suspenseKey} fallback={<OverviewSkeleton />}>
            <OverviewView
              filters={activeFilters}
              metric={metric}
              canSeeAudit={canSystem}
              chartVersion={engagementChartVersion}
              access={overviewAccess(viewer)}
            />
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

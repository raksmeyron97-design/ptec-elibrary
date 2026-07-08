import { Suspense } from "react";
import { BookOpen, Download, Eye, Users, Library, UserPlus } from "lucide-react";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import {
  getDashboardData,
  parseDashboardSpec,
  type DashboardRangeSpec,
  type TrendPoint,
} from "@/lib/admin/dashboard";
import DashboardHeader from "@/components/admin/dashboard/DashboardHeader";
import DateRangeFilter from "@/components/admin/dashboard/DateRangeFilter";
import StatCard from "@/components/admin/dashboard/StatCard";
import NeedsAttention from "@/components/admin/dashboard/NeedsAttention";
import ChartCard from "@/components/admin/dashboard/ChartCard";
import ViewsChart from "@/components/admin/dashboard/ViewsChart";
import DownloadsChart from "@/components/admin/dashboard/DownloadsChart";
import UserGrowthChart from "@/components/admin/dashboard/UserGrowthChart";
import TopBooksList from "@/components/admin/dashboard/TopBooksList";
import DepartmentPerformanceChart from "@/components/admin/dashboard/DepartmentPerformanceChart";
import RecentActivityFeed from "@/components/admin/dashboard/RecentActivityFeed";
import DashboardSkeleton from "@/components/admin/dashboard/DashboardSkeleton";

export const dynamic = "force-dynamic";

const PUBLIC_SITE_URL = process.env.NEXT_PUBLIC_ROOT_DOMAIN
  ? `https://${process.env.NEXT_PUBLIC_ROOT_DOMAIN}`
  : "https://library.ptec.edu.kh";

/** Signed-in admin's display name (layout guarantees an authenticated user). */
async function getAdminName(): Promise<string | null> {
  const authClient = await createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return null;
  const { data: profile } = await createServiceClient()
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .maybeSingle();
  return (profile?.full_name as string | null) ?? user.email?.split("@")[0] ?? null;
}

function peakOf(points: TrendPoint[]): TrendPoint | null {
  let best: TrendPoint | null = null;
  for (const p of points) {
    if (p.value > 0 && (!best || p.value > best.value)) best = p;
  }
  return best;
}

function srTrendSummary(label: string, total: number, points: TrendPoint[], rangeLabel: string): string {
  const peak = peakOf(points);
  const base = `${total.toLocaleString("en-US")} ${label} in the ${rangeLabel}.`;
  return peak ? `${base} Highest activity on ${peak.date} with ${peak.value} ${label}.` : base;
}

async function DashboardContent({ spec }: { spec: DashboardRangeSpec }) {
  const [data, adminName] = await Promise.all([getDashboardData(spec), getAdminName()]);
  const { summary, trends, comparison, rangeLabel } = data;
  const nf = (n: number) => n.toLocaleString("en-US");

  const hasViews = trends.views.some((p) => p.value > 0);
  const hasDownloads = trends.downloads.some((p) => p.value > 0);
  const hasSignups = trends.users.some((p) => p.added > 0);

  return (
    <div className="space-y-5">
      <DashboardHeader
        name={adminName}
        booksPublished={summary.booksPublished}
        users={summary.users}
        attentionCount={summary.attentionCount}
        publicSiteUrl={PUBLIC_SITE_URL}
      />

      {/* ── Range toolbar ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-bold text-text-heading">
          Library overview
          <span className="ml-2 font-normal text-text-muted">· {rangeLabel}</span>
        </h2>
        <DateRangeFilter current={spec} />
      </div>

      {/* ── KPI cards ── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <StatCard
          title="Digital books"
          value={nf(summary.booksTotal)}
          description={`${nf(summary.booksPublished)} published · ${nf(summary.bookDrafts)} drafts`}
          icon={BookOpen}
          href="/admin/manage"
          tone="blue"
        />
        <StatCard
          title="Views"
          value={nf(summary.totalViews)}
          description={`${nf(summary.periodViews)} in this period`}
          trend={comparison.views}
          icon={Eye}
          tone="green"
        />
        <StatCard
          title="Downloads"
          value={nf(summary.totalDownloads)}
          description={`${nf(summary.periodDownloads)} in this period`}
          trend={comparison.downloads}
          icon={Download}
          tone="orange"
        />
        <StatCard
          title="Users"
          value={nf(summary.users)}
          description={`+${nf(summary.newUsers)} in this period`}
          trend={comparison.users}
          icon={Users}
          href="/admin/users"
          tone="purple"
        />
        <StatCard
          title="Catalog copies"
          value={`${nf(summary.catalogAvailable)} / ${nf(summary.catalogTotal)}`}
          description={summary.catalogTotal === 0 ? "No physical copies tracked yet" : "available / total"}
          icon={Library}
          href="/admin/catalogs"
          tone="cyan"
        />
      </div>

      {/* ── Needs attention (kept high so pending work is visible) ── */}
      <NeedsAttention items={data.attention} lowStock={data.lowStock} />

      {/* ── Analytics: views + downloads ── */}
      <div className="grid gap-5 lg:grid-cols-2">
        <ChartCard
          icon={Eye}
          title="Views"
          subtitle={`Books, theses, posts & publications · ${rangeLabel}`}
          value={nf(summary.periodViews)}
          valueLabel="in this period"
          accent="#059669"
          empty={!hasViews}
          emptyText="No views yet for this period."
          srSummary={srTrendSummary("views", summary.periodViews, trends.views, rangeLabel)}
        >
          <ViewsChart data={trends.views} granularity={data.granularity} />
        </ChartCard>

        <ChartCard
          icon={Download}
          title="Downloads"
          subtitle={`Book & thesis downloads · ${rangeLabel}`}
          value={nf(summary.periodDownloads)}
          valueLabel="in this period"
          accent="#D97706"
          empty={!hasDownloads}
          emptyText="No downloads yet for this period."
          srSummary={srTrendSummary("downloads", summary.periodDownloads, trends.downloads, rangeLabel)}
        >
          <DownloadsChart data={trends.downloads} granularity={data.granularity} />
        </ChartCard>
      </div>

      {/* ── User growth + top content ── */}
      <div className="grid gap-5 lg:grid-cols-2">
        <ChartCard
          icon={UserPlus}
          title="User growth"
          subtitle={`Cumulative registered users · ${rangeLabel}`}
          value={`+${nf(summary.newUsers)}`}
          valueLabel="new in this period"
          accent="#7C3AED"
          empty={!hasSignups && summary.users === 0}
          emptyText="No new users in this period."
          srSummary={`${nf(summary.users)} registered users in total, ${nf(summary.newUsers)} new in the ${rangeLabel}.`}
        >
          <UserGrowthChart data={trends.users} granularity={data.granularity} />
        </ChartCard>

        <TopBooksList
          topViewed={data.topViewed}
          topDownloaded={data.topDownloaded}
          rangeLabel={rangeLabel}
        />
      </div>

      {/* ── Department performance ── */}
      <ChartCard
        icon={BookOpen}
        title="By department"
        subtitle={`Views & downloads per department · ${rangeLabel}`}
        value={data.departments.length > 0 ? String(data.departments.length) : undefined}
        valueLabel="active departments"
        accent="#1E3A8A"
        empty={data.departments.length === 0}
        emptyText="No department activity yet for this period."
        srSummary={data.departments
          .slice(0, 5)
          .map((d) => `${d.department}: ${d.views} views, ${d.downloads} downloads`)
          .join(". ")}
      >
        <DepartmentPerformanceChart data={data.departments} />
      </ChartCard>

      {/* ── Recent activity ── */}
      <RecentActivityFeed items={data.recentActivity} />
    </div>
  );
}

export default async function AdminDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; from?: string; to?: string }>;
}) {
  const sp = await searchParams;
  const spec = parseDashboardSpec(sp);
  const suspenseKey = `${spec.range}-${spec.from ?? ""}-${spec.to ?? ""}`;

  return (
    <div className="mx-auto max-w-[1200px]">
      {/* keyed Suspense re-triggers the skeleton while a new period streams in */}
      <Suspense key={suspenseKey} fallback={<DashboardSkeleton />}>
        <DashboardContent spec={spec} />
      </Suspense>
    </div>
  );
}

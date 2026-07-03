/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServiceClient } from "@/lib/supabase/server";
import Link from "next/link";
import {
  BookOpen, Download, Eye, Users, Library, FileText,
  AlertTriangle, UserPlus, type LucideIcon,
  Upload, GraduationCap, ArrowRight, Megaphone,
  BookPlus, Bell, Activity,
} from "lucide-react";
import DownloadsChart from "@/components/admin/DownloadsChart";
import UserGrowthChart from "@/components/admin/UserGrowthChart";
import ViewsChart from "@/components/admin/ViewsChart";
import DepartmentChart from "@/components/admin/DepartmentChart";

export const dynamic = "force-dynamic";

const APP_TZ = "Asia/Phnom_Penh";

function getGreeting(): string {
  const hour = new Date().toLocaleString("en-US", {
    timeZone: APP_TZ,
    hour: "numeric",
    hour12: false,
  });
  const h = parseInt(hour, 10);
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

const todayLabel = new Intl.DateTimeFormat("en-US", {
  timeZone: APP_TZ,
  weekday: "long",
  month: "long",
  day: "numeric",
  year: "numeric",
}).format(new Date());

const dayKey = (d: Date) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);

const ONE_DAY = 86_400_000;

function buildDailyBuckets(rows: any[], dateField: string, days = 30) {
  const buckets = new Map<string, number>();
  const keys: string[] = [];
  const now = Date.now();
  for (let i = days - 1; i >= 0; i--) {
    const key = dayKey(new Date(now - i * ONE_DAY));
    buckets.set(key, 0);
    keys.push(key);
  }
  for (const r of rows) {
    if (!r?.[dateField]) continue;
    const key = dayKey(new Date(r[dateField]));
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) || 0) + 1);
  }
  return keys.map((k) => ({ date: k, count: buckets.get(k) || 0 }));
}

function buildUserGrowth(rows: { created_at: string }[], baseline: number, days = 90) {
  const newPerDay = new Map<string, number>();
  const keys: string[] = [];
  const now = Date.now();
  for (let i = days - 1; i >= 0; i--) {
    const key = dayKey(new Date(now - i * ONE_DAY));
    newPerDay.set(key, 0);
    keys.push(key);
  }
  for (const r of rows) {
    if (!r?.created_at) continue;
    const key = dayKey(new Date(r.created_at));
    if (newPerDay.has(key)) newPerDay.set(key, (newPerDay.get(key) || 0) + 1);
  }
  let running = baseline;
  return keys.map((k) => {
    const added = newPerDay.get(k) || 0;
    running += added;
    return { date: k, count: running, added };
  });
}

// ── Shared section card wrapper ──────────────────────────────────
function SectionCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-2xl bg-bg-surface shadow-sm transition-shadow duration-200 hover:shadow-md ${className}`}
      style={{ border: "1px solid var(--ptec-divider)" }}
    >
      {children}
    </div>
  );
}

// ── Metric stat cards ────────────────────────────────────────────
type MetricTheme = "books" | "dl" | "views" | "users" | "catalog";

const METRIC_STYLE: Record<MetricTheme, {
  cardBg: string; cardBorder: string; numColor: string; badgeClass: string;
}> = {
  books:   { cardBg: "var(--ptec-metric-books-bg)",  cardBorder: "var(--ptec-metric-books-border)",  numColor: "var(--ptec-metric-books-num)",  badgeClass: "metric-badge-books"   },
  dl:      { cardBg: "var(--ptec-metric-dl-bg)",     cardBorder: "var(--ptec-metric-dl-border)",     numColor: "var(--ptec-metric-dl-num)",     badgeClass: "metric-badge-dl"      },
  views:   { cardBg: "var(--ptec-metric-views-bg)",  cardBorder: "var(--ptec-metric-views-border)",  numColor: "var(--ptec-metric-views-num)",  badgeClass: "metric-badge-views"   },
  users:   { cardBg: "var(--ptec-metric-users-bg)",  cardBorder: "var(--ptec-metric-users-border)",  numColor: "var(--ptec-metric-users-num)",  badgeClass: "metric-badge-users"   },
  catalog: { cardBg: "var(--ptec-metric-cat-bg)",    cardBorder: "var(--ptec-metric-cat-border)",    numColor: "var(--ptec-metric-cat-num)",    badgeClass: "metric-badge-catalog" },
};

function StatCard({
  icon: Icon, label, value, sub, metric,
}: {
  icon: LucideIcon; label: string; value: string; sub?: string; metric: MetricTheme;
}) {
  const s = METRIC_STYLE[metric];
  return (
    <div
      className="relative overflow-hidden rounded-2xl p-5 shadow-sm transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 cursor-default"
      style={{ background: s.cardBg, border: `1px solid ${s.cardBorder}` }}
    >
      {/* Subtle decorative corner glow */}
      <div
        className="pointer-events-none absolute -top-6 -right-6 w-20 h-20 rounded-full opacity-30"
        style={{ background: `radial-gradient(circle, ${s.numColor} 0%, transparent 70%)` }}
      />
      <div className="relative flex items-start justify-between gap-2">
        <span className="text-[11px] font-bold uppercase tracking-widest leading-tight" style={{ color: s.numColor + "99" }}>
          {label}
        </span>
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl shadow-md ${s.badgeClass}`}>
          <Icon className="h-[18px] w-[18px] text-white" />
        </span>
      </div>
      <div className="relative mt-3 text-2xl font-bold leading-none tabular-nums" style={{ color: s.numColor }}>
        {value}
      </div>
      {sub && (
        <div className="relative mt-2 text-[11px]" style={{ color: s.numColor + "88" }}>
          {sub}
        </div>
      )}
      {/* Bottom accent bar */}
      <div
        className="absolute bottom-0 left-0 right-0 h-[3px] rounded-b-2xl"
        style={{
          background: `linear-gradient(90deg, ${s.numColor}44 0%, ${s.numColor} 50%, ${s.numColor}44 100%)`,
        }}
      />
    </div>
  );
}

// ── Top-list card ────────────────────────────────────────────────
type TopItem = { id: string; title: string; href: string; meta?: string; value: string };

function TopListCard({
  title, subtitle, items, accentColor,
}: {
  title: string; subtitle: string; items: TopItem[]; accentColor?: string;
}) {
  return (
    <SectionCard className="p-6">
      <h2 className="text-base font-bold text-text-heading">{title}</h2>
      <p className="mt-0.5 text-xs text-text-muted">{subtitle}</p>
      {items.length > 0 ? (
        <ol className="mt-5 space-y-1">
          {items.map((it, i) => (
            <li
              key={it.id}
              className="group flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all duration-150 hover:bg-bg-app"
            >
              {/* rank badge */}
              <span
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold shadow-sm"
                style={
                  i === 0
                    ? { background: "linear-gradient(135deg,#EDCB55,#DDB022)", color: "#fff" }
                    : i === 1
                    ? { background: "#E2E8F0", color: "#475569" }
                    : i === 2
                    ? { background: "#FEE2E2", color: "#B45309" }
                    : { background: "rgba(30,58,138,0.08)", color: "var(--ptec-brand)" }
                }
              >
                {i + 1}
              </span>

              <div className="min-w-0 flex-1">
                <Link
                  href={it.href}
                  className="block truncate text-sm font-medium text-text-body transition-colors hover:text-brand"
                >
                  {it.title}
                </Link>
                {it.meta && <p className="truncate text-xs text-text-muted">{it.meta}</p>}
              </div>

              <span
                className="shrink-0 tabular-nums text-sm font-bold"
                style={{ color: accentColor ?? "var(--ptec-text-heading)" }}
              >
                {it.value}
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-4 text-sm text-text-muted">No data yet.</p>
      )}
    </SectionCard>
  );
}

// ── Chart section header ─────────────────────────────────────────
function ChartHeader({
  icon: Icon,
  title,
  subtitle,
  periodValue,
  periodLabel,
  accentColor,
}: {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  periodValue: string;
  periodLabel: string;
  accentColor: string;
}) {
  return (
    <div className="mb-5 flex items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <span
          className="flex h-9 w-9 items-center justify-center rounded-xl shadow-sm"
          style={{ background: accentColor + "22" }}
        >
          <Icon className="h-4 w-4" style={{ color: accentColor }} />
        </span>
        <div>
          <h2 className="text-sm font-bold text-text-heading">{title}</h2>
          <p className="text-xs text-text-muted">{subtitle}</p>
        </div>
      </div>
      <div className="text-right">
        <div className="text-2xl font-bold" style={{ color: accentColor }}>{periodValue}</div>
        <div className="text-xs text-text-muted">{periodLabel}</div>
      </div>
    </div>
  );
}

export default async function AdminDashboardPage() {
  const supabase = createServiceClient();

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  // eslint-disable-next-line react-hooks/purity
  const nowMs = Date.now();
  const fetchFromDownloads = new Date(nowMs - 31 * ONE_DAY).toISOString();
  const fetchFromUsers     = new Date(nowMs - 91 * ONE_DAY).toISOString();

  const [
    totalBooksRes, publishedBooksRes, bookStatsRes,
    totalUsersRes, newUsersRes, catalogRes, logsRes,
    topDownloadedRes, topViewedRes, lowStockRes, draftPostsRes,
    userBaselineRes, userWindowRes,
    postStatsRes, reportStatsRes,
    viewLogsRes,
    deptBooksRes,
    pendingRequestsRes, contentSubsRes, recentDlRes,
  ] = await Promise.all([
    supabase.from("books").select("*", { count: "exact", head: true }),
    supabase.from("books").select("*", { count: "exact", head: true }).eq("is_published", true),
    supabase.from("books").select("download_count, view_count"),
    supabase.from("profiles").select("*", { count: "exact", head: true }),
    supabase.from("profiles").select("*", { count: "exact", head: true }).gte("created_at", startOfMonth.toISOString()),
    supabase.from("catalog_books").select("copies_total, copies_available").eq("is_active", true),
    supabase.from("download_logs").select("downloaded_at").gte("downloaded_at", fetchFromDownloads),
    supabase.from("books").select("id, title, slug, download_count, authors(name)").order("download_count", { ascending: false }).limit(5),
    supabase.from("books").select("id, title, slug, view_count, authors(name)").order("view_count", { ascending: false }).limit(5),
    supabase.from("catalog_books").select("id, title, slug, author, copies_available, copies_total").eq("is_active", true).lte("copies_available", 1).order("copies_available", { ascending: true }).limit(8),
    supabase.from("posts").select("*", { count: "exact", head: true }).eq("is_published", false),
    supabase.from("profiles").select("*", { count: "exact", head: true }).lt("created_at", fetchFromUsers),
    supabase.from("profiles").select("created_at").gte("created_at", fetchFromUsers),
    supabase.from("posts").select("views"),
    supabase.from("research_reports").select("view_count"),
    supabase.from("view_logs").select("viewed_at").gte("viewed_at", fetchFromDownloads),
    supabase.from("books").select("department, download_count, view_count").eq("is_published", true),
    supabase.from("book_requests").select("*", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("content_subscriptions").select("*", { count: "exact", head: true }),
    supabase
      .from("download_logs")
      .select("id, downloaded_at, user:profiles(full_name, email, avatar_url), book:books(title, slug)")
      .order("downloaded_at", { ascending: false })
      .limit(8),
  ]);

  const totalBooks     = totalBooksRes.count ?? 0;
  const publishedBooks = publishedBooksRes.count ?? 0;
  const draftBooks     = Math.max(0, totalBooks - publishedBooks);

  const bookStats      = bookStatsRes.data ?? [];
  const totalDownloads = bookStats.reduce((s, b: any) => s + (b.download_count || 0), 0);
  const booksViews     = bookStats.reduce((s, b: any) => s + (b.view_count || 0), 0);

  const postsViews   = (postStatsRes.data   ?? []).reduce((s, p: any) => s + (p.views       || 0), 0);
  const reportsViews = (reportStatsRes.data ?? []).reduce((s, r: any) => s + (r.view_count  || 0), 0);
  const totalViews   = booksViews + postsViews + reportsViews;

  const totalUsers = totalUsersRes.count ?? 0;
  const newUsers   = newUsersRes.count   ?? 0;

  const catalog        = catalogRes.data ?? [];
  const totalCopies     = catalog.reduce((s, c: any) => s + (c.copies_total     || 0), 0);
  const availableCopies = catalog.reduce((s, c: any) => s + (c.copies_available || 0), 0);

  const dailyDownloads  = buildDailyBuckets(logsRes.data ?? [], "downloaded_at");
  const periodDownloads = dailyDownloads.reduce((s, d) => s + d.count, 0);

  const dailyViews  = buildDailyBuckets(viewLogsRes.data ?? [], "viewed_at");
  const periodViews = dailyViews.reduce((s, d) => s + d.count, 0);

  const nf = (n: number) => n.toLocaleString("en-US");

  const topDownloaded: TopItem[] = (topDownloadedRes.data ?? [])
    .filter((b: any) => (b.download_count || 0) > 0)
    .map((b: any) => ({
      id: b.id, title: b.title, href: `/admin/edit/${b.id}`,
      meta: (b.authors as any)?.name, value: nf(b.download_count || 0),
    }));

  const topViewed: TopItem[] = (topViewedRes.data ?? [])
    .filter((b: any) => (b.view_count || 0) > 0)
    .map((b: any) => ({
      id: b.id, title: b.title, href: `/admin/edit/${b.id}`,
      meta: (b.authors as any)?.name, value: nf(b.view_count || 0),
    }));

  const lowStock  = lowStockRes.data ?? [];
  const draftPosts = draftPostsRes.count ?? 0;

  const userBaseline = userBaselineRes.count ?? 0;
  const growth       = buildUserGrowth(userWindowRes.data ?? [], userBaseline);
  const newUsers90   = (userWindowRes.data ?? []).length;

  // Department breakdown
  const deptMap = new Map<string, { downloads: number; views: number }>();
  for (const b of deptBooksRes.data ?? []) {
    const dept = (b as any).department ?? "General";
    const prev = deptMap.get(dept) ?? { downloads: 0, views: 0 };
    deptMap.set(dept, {
      downloads: prev.downloads + ((b as any).download_count || 0),
      views:     prev.views     + ((b as any).view_count     || 0),
    });
  }
  const deptData = Array.from(deptMap.entries())
    .map(([dept, v]) => ({ dept, ...v }))
    .filter((d) => d.downloads > 0 || d.views > 0)
    .sort((a, b) => b.downloads - a.downloads);

  const pendingRequests  = pendingRequestsRes.count ?? 0;
  const contentSubsCount = contentSubsRes.count    ?? 0;

  type RecentDl = { id: string; name: string; email: string; avatarUrl: string | null; bookTitle: string; time: string };
  const recentActivity: RecentDl[] = (recentDlRes.data ?? []).map((l: any) => ({
    id:        l.id,
    name:      l.user?.full_name || "Unknown",
    email:     l.user?.email     || "",
    avatarUrl: l.user?.avatar_url ?? null,
    bookTitle: l.book?.title     || "Unknown Book",
    time:      l.downloaded_at,
  }));

  const greeting = getGreeting();

  return (
    <div className="mx-auto max-w-[1100px] space-y-6">

      {/* ── Welcome banner ── */}
      <div
        className="relative overflow-hidden rounded-2xl px-7 py-6"
        style={{
          background: "linear-gradient(135deg, #1E3A8A 0%, #162d70 55%, #0F2160 100%)",
        }}
      >
        {/* decorative orbs */}
        <div
          className="pointer-events-none absolute -top-10 -right-10 w-48 h-48 rounded-full opacity-15"
          style={{ background: "radial-gradient(circle, #DDB022 0%, transparent 70%)" }}
        />
        <div
          className="pointer-events-none absolute bottom-0 left-1/3 w-64 h-32 rounded-full opacity-10"
          style={{ background: "radial-gradient(circle, #4f46e5 0%, transparent 70%)" }}
        />

        <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: "#DDB022" }}>
              {todayLabel}
            </p>
            <h2 className="text-xl font-bold text-white leading-snug">
              {greeting}, Admin
            </h2>
            <p className="mt-1 text-sm" style={{ color: "rgba(255,255,255,0.55)" }}>
              {publishedBooks} books published &bull; {nf(totalUsers)} registered users
            </p>
          </div>

          {/* Quick actions */}
          <div className="flex flex-wrap gap-2 shrink-0">
            {[
              { label: "Upload Book",  href: "/admin/upload" },
              { label: "New Post",     href: "/admin/posts"  },
              { label: "Manage Users", href: "/admin/users"  },
            ].map(a => (
              <Link
                key={a.label}
                href={a.href}
                className="admin-banner-btn flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold text-white transition-all duration-200 cursor-pointer"
              >
                {a.label}
                <ArrowRight className="w-3 h-3 opacity-70" />
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* ── Quick-access shortcuts ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Upload Book",       href: "/admin/upload",           icon: Upload,          color: "#DDB022", bg: "#FFFBEB", border: "#FDE68A" },
          { label: "Manage Books",      href: "/admin/manage",           icon: BookOpen,        color: "#4f46e5", bg: "#EEF2FF", border: "#C7D2FE" },
          { label: "Theses",            href: "/admin/theses",           icon: GraduationCap,   color: "#0e7490", bg: "#ECFEFF", border: "#A5F3FC" },
          { label: "Announcements",     href: "/admin/announcements",    icon: Megaphone,       color: "#0f9d6b", bg: "#ECFDF5", border: "#A7F3D0" },
        ].map(({ label, href, icon: Icon, color, bg, border }) => (
          <Link
            key={label}
            href={href}
            className="group flex items-center gap-3 rounded-xl px-4 py-3.5 transition-all duration-200 cursor-pointer hover:shadow-md hover:-translate-y-0.5"
            style={{ background: bg, border: `1px solid ${border}` }}
          >
            <span
              className="flex w-8 h-8 shrink-0 items-center justify-center rounded-lg transition-transform duration-200 group-hover:scale-110"
              style={{ background: color + "22" }}
            >
              <Icon className="w-4 h-4" style={{ color }} />
            </span>
            <span className="text-xs font-semibold leading-tight" style={{ color }}>
              {label}
            </span>
          </Link>
        ))}
      </div>

      {/* ── KPI cards ── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <StatCard
          icon={BookOpen}  label="Digital books"   value={nf(totalBooks)}
          sub={`${publishedBooks} published · ${draftBooks} drafts`}
          metric="books"
        />
        <StatCard
          icon={Download}  label="Downloads"        value={nf(totalDownloads)}
          sub="all time"
          metric="dl"
        />
        <StatCard
          icon={Eye}       label="Views"            value={nf(totalViews)}
          sub="all time"
          metric="views"
        />
        <StatCard
          icon={Users}     label="Users"            value={nf(totalUsers)}
          sub={`+${nf(newUsers)} this month`}
          metric="users"
        />
        <StatCard
          icon={Library}   label="Catalog copies"   value={`${nf(availableCopies)} / ${nf(totalCopies)}`}
          sub="available / total"
          metric="catalog"
        />
      </div>

      {/* ── Views chart ── */}
      <SectionCard className="p-6">
        <ChartHeader
          icon={Eye} title="Views" subtitle="Last 30 days"
          periodValue={nf(periodViews)} periodLabel="in this period"
          accentColor="#059669"
        />
        <ViewsChart data={dailyViews} />
      </SectionCard>

      {/* ── Downloads chart ── */}
      <SectionCard className="p-6">
        <ChartHeader
          icon={Download} title="Downloads" subtitle="Last 30 days"
          periodValue={nf(periodDownloads)} periodLabel="in this period"
          accentColor="#D97706"
        />
        <DownloadsChart data={dailyDownloads} />
      </SectionCard>

      {/* ── User growth chart ── */}
      <SectionCard className="p-6">
        <ChartHeader
          icon={UserPlus} title="User growth" subtitle="Cumulative · last 90 days"
          periodValue={`+${nf(newUsers90)}`} periodLabel="new in this period"
          accentColor="#7C3AED"
        />
        <UserGrowthChart data={growth} />
      </SectionCard>

      {/* ── Top lists ── */}
      <div className="grid gap-6 lg:grid-cols-2">
        <TopListCard
          title="Top downloaded" subtitle="Most downloaded books (all time)"
          items={topDownloaded} accentColor="var(--ptec-metric-dl-num)"
        />
        <TopListCard
          title="Top viewed" subtitle="Most viewed books (all time)"
          items={topViewed} accentColor="var(--ptec-metric-views-num)"
        />
      </div>

      {/* ── Department breakdown ── */}
      {deptData.length > 0 && (
        <SectionCard className="p-6">
          <ChartHeader
            icon={BookOpen} title="By Department" subtitle="Downloads & views per department (all time)"
            periodValue={String(deptData.length)} periodLabel="departments"
            accentColor="#1E3A8A"
          />
          <DepartmentChart data={deptData} />
        </SectionCard>
      )}

      {/* ── Recent Activity ── */}
      {recentActivity.length > 0 && (
        <SectionCard className="p-6">
          <div className="mb-5 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg"
                style={{ background: "#EEF2FF", border: "1px solid #C7D2FE" }}>
                <Activity className="h-4 w-4 text-indigo-600" />
              </span>
              <div>
                <h2 className="text-base font-bold text-text-heading">Recent Activity</h2>
                <p className="text-xs text-text-muted">Latest book downloads</p>
              </div>
            </div>
            <Link
              href="/admin/logs"
              className="text-xs font-semibold text-brand hover:underline"
            >
              View all logs →
            </Link>
          </div>
          <ul className="divide-y divide-slate-100">
            {recentActivity.map((item) => {
              const diff = (Date.now() - new Date(item.time).getTime()) / 1000;
              const rel = diff < 60 ? "just now"
                : diff < 3600 ? `${Math.floor(diff / 60)}m ago`
                : diff < 86400 ? `${Math.floor(diff / 3600)}h ago`
                : `${Math.floor(diff / 86400)}d ago`;
              const initials = item.name
                .trim()
                .split(/\s+/)
                .slice(0, 2)
                .map((w: string) => w[0] ?? "")
                .join("")
                .toUpperCase() || "?";
              return (
                <li key={item.id} className="flex items-center gap-3 py-2.5">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-xs font-bold text-indigo-600">
                    {initials}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-text-body">{item.name}</p>
                    <p className="truncate text-xs text-text-muted">Downloaded &ldquo;{item.bookTitle}&rdquo;</p>
                  </div>
                  <span className="shrink-0 text-xs text-text-muted tabular-nums">{rel}</span>
                </li>
              );
            })}
          </ul>
        </SectionCard>
      )}

      {/* ── Needs attention ── */}
      <SectionCard className="p-6">
        {/* Header */}
        <div className="mb-5 flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg"
            style={{ background: "#FFFBEB", border: "1px solid #FDE68A" }}>
            <AlertTriangle className="h-4 w-4 text-amber-500" />
          </span>
          <h2 className="text-base font-bold text-text-heading">Needs attention</h2>
        </div>

        {/* Draft / action chips */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Link
            href="/admin/manage"
            className="group flex items-center justify-between rounded-xl border border-divider bg-paper px-4 py-3 transition-all duration-150 hover:border-amber-200 hover:bg-amber-50"
          >
            <span className="flex items-center gap-2.5 text-sm text-text-body">
              <BookOpen className="h-4 w-4 text-text-muted group-hover:text-amber-500 transition-colors" />
              Book drafts
            </span>
            <span className="rounded-lg px-2.5 py-0.5 text-sm font-bold"
              style={{ background: "rgba(30,58,138,0.08)", color: "var(--ptec-brand)" }}>
              {nf(draftBooks)}
            </span>
          </Link>

          <Link
            href="/admin/posts"
            className="group flex items-center justify-between rounded-xl border border-divider bg-paper px-4 py-3 transition-all duration-150 hover:border-amber-200 hover:bg-amber-50"
          >
            <span className="flex items-center gap-2.5 text-sm text-text-body">
              <FileText className="h-4 w-4 text-text-muted group-hover:text-amber-500 transition-colors" />
              Post drafts
            </span>
            <span className="rounded-lg px-2.5 py-0.5 text-sm font-bold"
              style={{ background: "rgba(30,58,138,0.08)", color: "var(--ptec-brand)" }}>
              {nf(draftPosts)}
            </span>
          </Link>

          <Link
            href="/admin/book-requests"
            className="group flex items-center justify-between rounded-xl border border-divider bg-paper px-4 py-3 transition-all duration-150 hover:border-amber-200 hover:bg-amber-50"
          >
            <span className="flex items-center gap-2.5 text-sm text-text-body">
              <BookPlus className="h-4 w-4 text-text-muted group-hover:text-amber-500 transition-colors" />
              Pending requests
            </span>
            <span
              className="rounded-lg px-2.5 py-0.5 text-sm font-bold"
              style={
                pendingRequests > 0
                  ? { background: "#FEF3C7", color: "#B45309" }
                  : { background: "rgba(30,58,138,0.08)", color: "var(--ptec-brand)" }
              }
            >
              {nf(pendingRequests)}
            </span>
          </Link>

          <Link
            href="/admin/users"
            className="group flex items-center justify-between rounded-xl border border-divider bg-paper px-4 py-3 transition-all duration-150 hover:border-amber-200 hover:bg-amber-50"
          >
            <span className="flex items-center gap-2.5 text-sm text-text-body">
              <Bell className="h-4 w-4 text-text-muted group-hover:text-amber-500 transition-colors" />
              Subscriptions
            </span>
            <span className="rounded-lg px-2.5 py-0.5 text-sm font-bold"
              style={{ background: "rgba(30,58,138,0.08)", color: "var(--ptec-brand)" }}>
              {nf(contentSubsCount)}
            </span>
          </Link>
        </div>

        {/* Low stock list */}
        <div className="mt-6">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-text-muted">
            Catalog low on copies ({lowStock.length})
          </p>
          {lowStock.length > 0 ? (
            <ul className="divide-y divide-slate-100">
              {lowStock.map((c: any) => (
                <li key={c.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-text-body">{c.title}</p>
                    <p className="truncate text-xs text-text-muted">{c.author}</p>
                  </div>
                  <span
                    className="shrink-0 rounded-lg px-2.5 py-0.5 text-xs font-bold"
                    style={
                      (c.copies_available ?? 0) === 0
                        ? { background: "#FEE2E2", color: "#B91C1C" }
                        : { background: "#FFFBEB", color: "#B45309" }
                    }
                  >
                    {c.copies_available} / {c.copies_total} left
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-text-muted">All catalog items have enough copies. ✓</p>
          )}
        </div>
      </SectionCard>
    </div>
  );
}

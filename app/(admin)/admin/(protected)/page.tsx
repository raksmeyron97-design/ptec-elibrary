import { createServiceClient } from "@/lib/supabase/server";
import Link from "next/link";
import {
  BookOpen, Download, Eye, Users, Library, FileText,
  AlertTriangle, UserPlus, type LucideIcon,
} from "lucide-react";
import DownloadsChart from "@/components/admin/DownloadsChart";
import UserGrowthChart from "@/components/admin/UserGrowthChart";
import ViewsChart from "@/components/admin/ViewsChart";

// កុំ​ឲ្យ Next.js cache ទំព័រ​នេះ — query DB ឡើងវិញ​រាល់​ពេល​ផ្ទុក
export const dynamic = "force-dynamic";

// ── App timezone (ថេរ) ──────────────────────────────────────────
// បែងចែក​ថ្ងៃ​តាម​ម៉ោង​កម្ពុជា ដើម្បី​កុំ​ឲ្យ​អាស្រ័យ​លើ timezone របស់ server
const APP_TZ = "Asia/Phnom_Penh";

// បម្លែង Date → "YYYY-MM-DD" តាម APP_TZ (en-CA ផ្តល់​ទម្រង់ YYYY-MM-DD)
const dayKey = (d: Date) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);

const ONE_DAY = 86_400_000;

// ── helper: metrics តាមថ្ងៃ ──
function buildDailyBuckets(rows: any[], dateField: string, days = 30) {
  const buckets = new Map<string, number>();
  const keys: string[] = [];
  const now = Date.now();
  // បង្កើត key ថ្ងៃ​ចុងក្រោយ N ថ្ងៃ​តាម APP_TZ (កម្ពុជា​គ្មាន DST ⇒ ដក​ 24h សុវត្ថិភាព)
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

// ── helper: cumulative user growth ──
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

function StatCard({
  icon: Icon, label, value, sub, accent,
}: {
  icon: LucideIcon; label: string; value: string; sub?: string; accent: string;
}) {
  return (
    <div className="rounded-xl border border-divider bg-bg-surface p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">{label}</span>
        <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${accent}`}>
          <Icon className="h-5 w-5" />
        </span>
      </div>
      <div className="mt-3 text-2xl font-bold text-text-heading">{value}</div>
      {sub && <div className="mt-1 text-xs text-text-muted">{sub}</div>}
    </div>
  );
}

type TopItem = { id: string; title: string; href: string; meta?: string; value: string };

function TopListCard({
  title, subtitle, items,
}: {
  title: string; subtitle: string; items: TopItem[];
}) {
  return (
    <div className="rounded-xl border border-divider bg-bg-surface p-6 shadow-sm">
      <h2 className="text-sm font-bold text-text-heading">{title}</h2>
      <p className="text-xs text-text-muted">{subtitle}</p>
      {items.length > 0 ? (
        <ol className="mt-4 space-y-3">
          {items.map((it, i) => (
            <li key={it.id} className="flex items-center gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-brand/10 text-xs font-bold text-brand">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <Link
                  href={it.href}
                  className="block truncate text-sm font-medium text-text-body transition hover:text-accent"
                >
                  {it.title}
                </Link>
                {it.meta && <p className="truncate text-xs text-text-muted">{it.meta}</p>}
              </div>
              <span className="shrink-0 text-sm font-bold text-text-heading">{it.value}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-4 text-sm text-text-muted">No data yet.</p>
      )}
    </div>
  );
}

export default async function AdminDashboardPage() {
  const supabase = createServiceClient();

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  // ទាញ​ទិន្នន័យ​ឲ្យ​ទូលាយ​បន្តិច (ដក 1 ថ្ងៃ​បន្ថែម) ដើម្បី​កុំ​ឲ្យ​បាត់ row នៅ​ស៊ុម​ថ្ងៃ
  const fetchFromDownloads = new Date(Date.now() - 31 * ONE_DAY).toISOString();
  const fetchFromUsers = new Date(Date.now() - 91 * ONE_DAY).toISOString();

  const [
    totalBooksRes, publishedBooksRes, bookStatsRes,
    totalUsersRes, newUsersRes, catalogRes, logsRes,
    topDownloadedRes, topViewedRes, lowStockRes, draftPostsRes,
    userBaselineRes, userWindowRes,
    postStatsRes, reportStatsRes,
    viewLogsRes,
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
    // ── Phase 3 ──
    supabase.from("profiles").select("*", { count: "exact", head: true }).lt("created_at", fetchFromUsers),
    supabase.from("profiles").select("created_at").gte("created_at", fetchFromUsers),
    supabase.from("posts").select("views"),
    supabase.from("research_reports").select("view_count"),
    supabase.from("view_logs").select("viewed_at").gte("viewed_at", fetchFromDownloads),
  ]);

  const totalBooks = totalBooksRes.count ?? 0;
  const publishedBooks = publishedBooksRes.count ?? 0;
  const draftBooks = Math.max(0, totalBooks - publishedBooks);

  const bookStats = bookStatsRes.data ?? [];
  const totalDownloads = bookStats.reduce((s, b: any) => s + (b.download_count || 0), 0);
  const booksViews = bookStats.reduce((s, b: any) => s + (b.view_count || 0), 0);
  
  const postsViews = (postStatsRes.data ?? []).reduce((s, p: any) => s + (p.views || 0), 0);
  const reportsViews = (reportStatsRes.data ?? []).reduce((s, r: any) => s + (r.view_count || 0), 0);

  const totalViews = booksViews + postsViews + reportsViews;

  const viewsData = [
    { name: "Digital Books", count: booksViews, color: "#10b981" },
    { name: "Research", count: reportsViews, color: "#3b82f6" },
    { name: "Posts", count: postsViews, color: "#8b5cf6" },
  ];

  const totalUsers = totalUsersRes.count ?? 0;
  const newUsers = newUsersRes.count ?? 0;

  const catalog = catalogRes.data ?? [];
  const totalCopies = catalog.reduce((s, c: any) => s + (c.copies_total || 0), 0);
  const availableCopies = catalog.reduce((s, c: any) => s + (c.copies_available || 0), 0);

  const dailyDownloads = buildDailyBuckets(logsRes.data ?? [], "downloaded_at");
  const periodDownloads = dailyDownloads.reduce((s, d) => s + d.count, 0);

  const dailyViews = buildDailyBuckets(viewLogsRes.data ?? [], "viewed_at");
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

  const lowStock = lowStockRes.data ?? [];
  const draftPosts = draftPostsRes.count ?? 0;

  // ── Phase 3 ──
  const userBaseline = userBaselineRes.count ?? 0;
  const growth = buildUserGrowth(userWindowRes.data ?? [], userBaseline);
  const newUsers90 = (userWindowRes.data ?? []).length;

  return (
    <div className="mx-auto max-w-[1100px] space-y-6">
      {/* ── KPI cards ── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <StatCard icon={BookOpen} label="Digital books" value={nf(totalBooks)}
          sub={`${publishedBooks} published · ${draftBooks} drafts`} accent="bg-brand/10 text-brand" />
        <StatCard icon={Download} label="Downloads" value={nf(totalDownloads)}
          sub="all time" accent="bg-amber-100 text-amber-600" />
        <StatCard icon={Eye} label="Views" value={nf(totalViews)}
          sub="all time" accent="bg-emerald-100 text-emerald-600" />
        <StatCard icon={Users} label="Users" value={nf(totalUsers)}
          sub={`+${nf(newUsers)} this month`} accent="bg-violet-100 text-violet-600" />
        <StatCard icon={Library} label="Catalog copies" value={`${nf(availableCopies)} / ${nf(totalCopies)}`}
          sub="available / total" accent="bg-sky-100 text-sky-600" />
      </div>

      {/* ── Views chart ── */}
      <div className="rounded-xl border border-divider bg-bg-surface p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-bold text-text-heading">
              <Eye className="h-4 w-4 text-emerald-500" /> Views
            </h2>
            <p className="text-xs text-text-muted">Last 30 days</p>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-emerald-600">{nf(periodViews)}</div>
            <div className="text-xs text-text-muted">in this period</div>
          </div>
        </div>
        <ViewsChart data={dailyViews} />
      </div>

      {/* ── Downloads chart ── */}
      <div className="rounded-xl border border-divider bg-bg-surface p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-text-heading">Downloads</h2>
            <p className="text-xs text-text-muted">Last 30 days</p>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-brand">{nf(periodDownloads)}</div>
            <div className="text-xs text-text-muted">in this period</div>
          </div>
        </div>
        <DownloadsChart data={dailyDownloads} />
      </div>

      {/* ── User growth chart (Phase 3) ── */}
      <div className="rounded-xl border border-divider bg-bg-surface p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-bold text-text-heading">
              <UserPlus className="h-4 w-4 text-violet-500" /> User growth
            </h2>
            <p className="text-xs text-text-muted">Cumulative · last 90 days</p>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-violet-600">+{nf(newUsers90)}</div>
            <div className="text-xs text-text-muted">new in this period</div>
          </div>
        </div>
        <UserGrowthChart data={growth} />
      </div>


      {/* ── Top lists ── */}
      <div className="grid gap-6 lg:grid-cols-2">
        <TopListCard title="Top downloaded" subtitle="Most downloaded books (all time)" items={topDownloaded} />
        <TopListCard title="Top viewed" subtitle="Most viewed books (all time)" items={topViewed} />
      </div>

      {/* ── Alerts ── */}
      <div className="rounded-xl border border-divider bg-bg-surface p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          <h2 className="text-sm font-bold text-text-heading">Needs attention</h2>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Link href="/admin/manage"
            className="flex items-center justify-between rounded-lg border border-divider bg-paper px-4 py-3 transition hover:border-accent/50 hover:bg-amber-50">
            <span className="flex items-center gap-2 text-sm text-text-body">
              <BookOpen className="h-4 w-4 text-text-muted" /> Unpublished book drafts
            </span>
            <span className="rounded-md bg-brand/10 px-2 py-0.5 text-sm font-bold text-brand">{nf(draftBooks)}</span>
          </Link>
          <Link href="/admin/posts"
            className="flex items-center justify-between rounded-lg border border-divider bg-paper px-4 py-3 transition hover:border-accent/50 hover:bg-amber-50">
            <span className="flex items-center gap-2 text-sm text-text-body">
              <FileText className="h-4 w-4 text-text-muted" /> Unpublished post drafts
            </span>
            <span className="rounded-md bg-brand/10 px-2 py-0.5 text-sm font-bold text-brand">{nf(draftPosts)}</span>
          </Link>
        </div>

        <div className="mt-5">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
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
                  <span className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-bold ${
                    (c.copies_available ?? 0) === 0
                      ? "bg-red-100 text-red-600"
                      : "bg-amber-100 text-amber-600"
                  }`}>
                    {c.copies_available} / {c.copies_total} left
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-text-muted">All catalog items have enough copies. ✓</p>
          )}
        </div>
      </div>
    </div>
  );
}
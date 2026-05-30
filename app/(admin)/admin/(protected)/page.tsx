import { createServiceClient } from "@/lib/supabase/server";
import Link from "next/link";
import {
  BookOpen, Download, Eye, Users, Library, FileText,
  AlertTriangle, UserPlus, type LucideIcon,
} from "lucide-react";
import DownloadsChart from "@/components/admin/DownloadsChart";
import UserGrowthChart from "@/components/admin/UserGrowthChart";

// ── helper: downloads តាមថ្ងៃ ──
function buildDailyBuckets(rows: { downloaded_at: string }[], days = 30) {
  const buckets = new Map<string, number>();
  const keys: string[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    buckets.set(key, 0);
    keys.push(key);
  }
  for (const r of rows) {
    if (!r?.downloaded_at) continue;
    const key = new Date(r.downloaded_at).toISOString().slice(0, 10);
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) || 0) + 1);
  }
  return keys.map((k) => ({ date: k, count: buckets.get(k) || 0 }));
}

// ── helper: cumulative user growth ──
function buildUserGrowth(rows: { created_at: string }[], baseline: number, days = 90) {
  const newPerDay = new Map<string, number>();
  const keys: string[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    newPerDay.set(key, 0);
    keys.push(key);
  }
  for (const r of rows) {
    if (!r?.created_at) continue;
    const key = new Date(r.created_at).toISOString().slice(0, 10);
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
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</span>
        <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${accent}`}>
          <Icon className="h-5 w-5" />
        </span>
      </div>
      <div className="mt-3 text-2xl font-bold text-slate-800">{value}</div>
      {sub && <div className="mt-1 text-xs text-slate-400">{sub}</div>}
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
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-sm font-bold text-slate-800">{title}</h2>
      <p className="text-xs text-slate-400">{subtitle}</p>
      {items.length > 0 ? (
        <ol className="mt-4 space-y-3">
          {items.map((it, i) => (
            <li key={it.id} className="flex items-center gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[#1E3A8A]/10 text-xs font-bold text-[#1E3A8A]">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <Link
                  href={it.href}
                  className="block truncate text-sm font-medium text-slate-700 transition hover:text-[#DDB022]"
                >
                  {it.title}
                </Link>
                {it.meta && <p className="truncate text-xs text-slate-400">{it.meta}</p>}
              </div>
              <span className="shrink-0 text-sm font-bold text-slate-800">{it.value}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-4 text-sm text-slate-400">No data yet.</p>
      )}
    </div>
  );
}

export default async function AdminDashboardPage() {
  const supabase = createServiceClient();

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setHours(0, 0, 0, 0);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29);

  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setHours(0, 0, 0, 0);
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 89);

  const [
    totalBooksRes, publishedBooksRes, bookStatsRes,
    totalUsersRes, newUsersRes, catalogRes, logsRes,
    topDownloadedRes, topViewedRes, lowStockRes, draftPostsRes,
    userBaselineRes, userWindowRes,
  ] = await Promise.all([
    supabase.from("books").select("*", { count: "exact", head: true }),
    supabase.from("books").select("*", { count: "exact", head: true }).eq("is_published", true),
    supabase.from("books").select("download_count, view_count"),
    supabase.from("profiles").select("*", { count: "exact", head: true }),
    supabase.from("profiles").select("*", { count: "exact", head: true }).gte("created_at", startOfMonth.toISOString()),
    supabase.from("catalog_books").select("copies_total, copies_available").eq("is_active", true),
    supabase.from("user_download_history").select("downloaded_at").gte("downloaded_at", thirtyDaysAgo.toISOString()),
    supabase.from("books").select("id, title, slug, download_count, authors(name)").order("download_count", { ascending: false }).limit(5),
    supabase.from("books").select("id, title, slug, view_count, authors(name)").order("view_count", { ascending: false }).limit(5),
    supabase.from("catalog_books").select("id, title, slug, author, copies_available, copies_total").eq("is_active", true).lte("copies_available", 1).order("copies_available", { ascending: true }).limit(8),
    supabase.from("posts").select("*", { count: "exact", head: true }).eq("is_published", false),
    // ── Phase 3 ──
    supabase.from("profiles").select("*", { count: "exact", head: true }).lt("created_at", ninetyDaysAgo.toISOString()),
    supabase.from("profiles").select("created_at").gte("created_at", ninetyDaysAgo.toISOString()),
  ]);

  const totalBooks = totalBooksRes.count ?? 0;
  const publishedBooks = publishedBooksRes.count ?? 0;
  const draftBooks = Math.max(0, totalBooks - publishedBooks);

  const bookStats = bookStatsRes.data ?? [];
  const totalDownloads = bookStats.reduce((s, b: any) => s + (b.download_count || 0), 0);
  const totalViews = bookStats.reduce((s, b: any) => s + (b.view_count || 0), 0);

  const totalUsers = totalUsersRes.count ?? 0;
  const newUsers = newUsersRes.count ?? 0;

  const catalog = catalogRes.data ?? [];
  const totalCopies = catalog.reduce((s, c: any) => s + (c.copies_total || 0), 0);
  const availableCopies = catalog.reduce((s, c: any) => s + (c.copies_available || 0), 0);

  const daily = buildDailyBuckets(logsRes.data ?? []);
  const periodDownloads = daily.reduce((s, d) => s + d.count, 0);

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
          sub={`${publishedBooks} published · ${draftBooks} drafts`} accent="bg-[#1E3A8A]/10 text-[#1E3A8A]" />
        <StatCard icon={Download} label="Downloads" value={nf(totalDownloads)}
          sub="all time" accent="bg-amber-100 text-amber-600" />
        <StatCard icon={Eye} label="Views" value={nf(totalViews)}
          sub="all time" accent="bg-emerald-100 text-emerald-600" />
        <StatCard icon={Users} label="Users" value={nf(totalUsers)}
          sub={`+${nf(newUsers)} this month`} accent="bg-violet-100 text-violet-600" />
        <StatCard icon={Library} label="Catalog copies" value={`${nf(availableCopies)} / ${nf(totalCopies)}`}
          sub="available / total" accent="bg-sky-100 text-sky-600" />
      </div>

      {/* ── Downloads chart ── */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-slate-800">Downloads</h2>
            <p className="text-xs text-slate-400">Last 30 days</p>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-[#1E3A8A]">{nf(periodDownloads)}</div>
            <div className="text-xs text-slate-400">in this period</div>
          </div>
        </div>
        <DownloadsChart data={daily} />
      </div>

      {/* ── User growth chart (Phase 3) ── */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-bold text-slate-800">
              <UserPlus className="h-4 w-4 text-violet-500" /> User growth
            </h2>
            <p className="text-xs text-slate-400">Cumulative · last 90 days</p>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-violet-600">+{nf(newUsers90)}</div>
            <div className="text-xs text-slate-400">new in this period</div>
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
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          <h2 className="text-sm font-bold text-slate-800">Needs attention</h2>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Link href="/admin/manage"
            className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 px-4 py-3 transition hover:border-[#DDB022]/50 hover:bg-amber-50">
            <span className="flex items-center gap-2 text-sm text-slate-600">
              <BookOpen className="h-4 w-4 text-slate-400" /> Unpublished book drafts
            </span>
            <span className="rounded-md bg-[#1E3A8A]/10 px-2 py-0.5 text-sm font-bold text-[#1E3A8A]">{nf(draftBooks)}</span>
          </Link>
          <Link href="/admin/posts"
            className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 px-4 py-3 transition hover:border-[#DDB022]/50 hover:bg-amber-50">
            <span className="flex items-center gap-2 text-sm text-slate-600">
              <FileText className="h-4 w-4 text-slate-400" /> Unpublished post drafts
            </span>
            <span className="rounded-md bg-[#1E3A8A]/10 px-2 py-0.5 text-sm font-bold text-[#1E3A8A]">{nf(draftPosts)}</span>
          </Link>
        </div>

        <div className="mt-5">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Catalog low on copies ({lowStock.length})
          </p>
          {lowStock.length > 0 ? (
            <ul className="divide-y divide-slate-100">
              {lowStock.map((c: any) => (
                <li key={c.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-700">{c.title}</p>
                    <p className="truncate text-xs text-slate-400">{c.author}</p>
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
            <p className="text-sm text-slate-400">All catalog items have enough copies. ✓</p>
          )}
        </div>
      </div>
    </div>
  );
}
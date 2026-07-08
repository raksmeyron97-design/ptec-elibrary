import "server-only";

import { createServiceClient } from "@/lib/supabase/server";

/**
 * Aggregated data layer for the admin dashboard.
 *
 * One call — getDashboardData(spec) — produces everything the dashboard
 * renders: summary counts, daily/hourly trend series, previous-period
 * comparisons, period top lists, department activity, attention items and
 * the recent-activity feed. Used by both the server-rendered dashboard page
 * and GET /api/admin/dashboard.
 *
 * Data source: the daily aggregate tables from migration 0072
 * (daily_content_views / daily_content_downloads / daily_user_signups) when
 * they exist, with a transparent fallback to raw log scans until that
 * migration is applied. "Today" always reads raw logs (hourly buckets need
 * timestamps; one day of logs is small).
 */

export type DashboardRange = "today" | "7d" | "30d" | "90d" | "custom";
export const DASHBOARD_RANGES: DashboardRange[] = ["today", "7d", "30d", "90d", "custom"];

export type DashboardRangeSpec = {
  range: DashboardRange;
  /** Inclusive bounds ("YYYY-MM-DD"), only for range === "custom". */
  from?: string;
  to?: string;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_CUSTOM_DAYS = 365;

/**
 * Validate raw query/search params into a safe range spec. Anything invalid
 * (bad dates, from > to, span too long, future start) falls back to 30d.
 */
export function parseDashboardSpec(params: {
  range?: string | null;
  from?: string | null;
  to?: string | null;
}): DashboardRangeSpec {
  const range = params.range ?? "30d";
  if (range !== "custom") {
    return DASHBOARD_RANGES.includes(range as DashboardRange) && range !== "custom"
      ? { range: range as DashboardRange }
      : { range: "30d" };
  }

  const { from, to } = params;
  if (!from || !to || !DATE_RE.test(from) || !DATE_RE.test(to)) return { range: "30d" };
  const fromMs = Date.parse(`${from}T00:00:00Z`);
  const toMs = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(fromMs) || Number.isNaN(toMs) || fromMs > toMs) return { range: "30d" };
  if ((toMs - fromMs) / ONE_DAY >= MAX_CUSTOM_DAYS) return { range: "30d" };
  if (from > dayKey(new Date())) return { range: "30d" };
  return { range: "custom", from, to };
}

const RANGE_LABEL: Record<Exclude<DashboardRange, "custom">, string> = {
  today: "today",
  "7d": "last 7 days",
  "30d": "last 30 days",
  "90d": "last 90 days",
};

type Granularity = "hour" | "day";

export type TrendPoint = { date: string; value: number };
export type GrowthPoint = { date: string; value: number; added: number };

export type TrendInfo = {
  direction: "up" | "down" | "neutral";
  /** Short badge text, e.g. "+18%", "-2", "New". */
  value: string;
  /** Context line, e.g. "vs previous 30 days", "no previous data". */
  label: string;
};

export type TopBookItem = {
  id: string;
  title: string;
  author?: string;
  department?: string;
  count: number;
  publicUrl?: string;
  editUrl: string;
};

export type DepartmentStat = {
  department: string;
  views: number;
  downloads: number;
  bookCount: number;
};

export type AttentionStatus = "success" | "warning" | "danger" | "neutral";

export type AttentionItem = {
  key: "book_drafts" | "post_drafts" | "pending_requests" | "subscriptions" | "low_stock";
  title: string;
  count: number;
  status: AttentionStatus;
  description: string;
  href: string;
};

export type LowStockItem = {
  id: string;
  title: string;
  author: string | null;
  copiesAvailable: number;
  copiesTotal: number;
};

export type ActivityItem = {
  id: string;
  type:
    | "book_uploaded"
    | "book_edited"
    | "post_created"
    | "user_registered"
    | "book_downloaded"
    | "admin_action";
  title: string;
  description?: string;
  createdAt: string;
  actor?: string;
  href?: string;
};

export type DashboardData = {
  range: DashboardRange;
  /** Human label for the selected period, e.g. "last 30 days" or "Jun 1 – Jul 8". */
  rangeLabel: string;
  granularity: Granularity;
  /** True when the 0072 daily aggregate tables served this request. */
  fromAggregates: boolean;
  summary: {
    booksTotal: number;
    booksPublished: number;
    bookDrafts: number;
    totalViews: number;
    periodViews: number;
    totalDownloads: number;
    periodDownloads: number;
    users: number;
    newUsers: number;
    catalogAvailable: number;
    catalogTotal: number;
    attentionCount: number;
  };
  trends: {
    views: TrendPoint[];
    downloads: TrendPoint[];
    users: GrowthPoint[];
  };
  comparison: {
    views: TrendInfo;
    downloads: TrendInfo;
    users: TrendInfo;
  };
  topViewed: TopBookItem[];
  topDownloaded: TopBookItem[];
  departments: DepartmentStat[];
  attention: AttentionItem[];
  lowStock: LowStockItem[];
  recentActivity: ActivityItem[];
};

// ── Time helpers (all bucketing in library-local time) ─────────────────────

const APP_TZ = "Asia/Phnom_Penh";
const TZ_OFFSET = "+07:00"; // Cambodia has no DST
const ONE_DAY = 86_400_000;
const ONE_HOUR = 3_600_000;

const dayFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: APP_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const hourFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: APP_TZ,
  hour: "2-digit",
  hour12: false,
});

function dayKey(d: Date): string {
  return dayFmt.format(d);
}

/** e.g. "2026-07-08T14:00" — sortable and parseable for label formatting. */
function hourKey(d: Date): string {
  return `${dayFmt.format(d)}T${hourFmt.format(d)}:00`;
}

function startOfDayLocal(ymd: string): Date {
  return new Date(`${ymd}T00:00:00${TZ_OFFSET}`);
}

type Window = {
  /** Start of the current period. */
  start: Date;
  /** End of the current period (now, or end of a past custom range). */
  end: Date;
  /** Start of the previous period (for comparisons). */
  prevStart: Date;
  granularity: Granularity;
  bucketKeys: string[];
  keyOf: (d: Date) => string;
  /** Human label, e.g. "last 30 days" or "Jun 1 – Jul 8". */
  label: string;
  /** Comparison label, e.g. "vs previous 30 days". */
  vsLabel: string;
};

function formatDayLabel(ymd: string): string {
  return startOfDayLocal(ymd).toLocaleDateString("en-US", {
    timeZone: APP_TZ,
    month: "short",
    day: "numeric",
  });
}

function buildWindow(spec: DashboardRangeSpec, now: Date): Window {
  if (spec.range === "today") {
    const start = startOfDayLocal(dayKey(now));
    const prevStart = new Date(start.getTime() - ONE_DAY);
    const keys: string[] = [];
    for (let t = start.getTime(); t <= now.getTime(); t += ONE_HOUR) {
      keys.push(hourKey(new Date(t)));
    }
    return {
      start, end: now, prevStart,
      granularity: "hour", bucketKeys: keys, keyOf: hourKey,
      label: "today", vsLabel: "vs yesterday",
    };
  }

  if (spec.range === "custom" && spec.from && spec.to) {
    const start = startOfDayLocal(spec.from);
    const lastKey = spec.to < dayKey(now) ? spec.to : dayKey(now);
    const end = spec.to < dayKey(now)
      ? new Date(startOfDayLocal(spec.to).getTime() + ONE_DAY - 1)
      : now;
    const keys: string[] = [];
    for (let t = start.getTime(); dayKey(new Date(t)) <= lastKey; t += ONE_DAY) {
      keys.push(dayKey(new Date(t)));
    }
    const spanDays = Math.max(1, keys.length);
    return {
      start, end,
      prevStart: new Date(start.getTime() - spanDays * ONE_DAY),
      granularity: "day", bucketKeys: keys, keyOf: dayKey,
      label: `${formatDayLabel(spec.from)} – ${formatDayLabel(lastKey)}`,
      vsLabel: `vs previous ${spanDays} day${spanDays === 1 ? "" : "s"}`,
    };
  }

  const days = spec.range === "7d" ? 7 : spec.range === "90d" ? 90 : 30;
  const start = new Date(now.getTime() - (days - 1) * ONE_DAY);
  const prevStart = new Date(now.getTime() - (2 * days - 1) * ONE_DAY);
  const keys: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    keys.push(dayKey(new Date(now.getTime() - i * ONE_DAY)));
  }
  const label = RANGE_LABEL[spec.range as Exclude<DashboardRange, "custom">] ?? RANGE_LABEL["30d"];
  return {
    start, end: now, prevStart,
    granularity: "day", bucketKeys: keys, keyOf: dayKey,
    label, vsLabel: `vs previous ${days} days`,
  };
}

/** Percent (or absolute for tiny bases) change vs the previous period. */
function compareTrend(current: number, previous: number, vsLabel: string): TrendInfo {
  if (previous === 0 && current === 0) {
    return { direction: "neutral", value: "—", label: "no previous data" };
  }
  if (previous === 0) {
    return { direction: "up", value: "New", label: `new activity ${vsLabel}` };
  }
  const diff = current - previous;
  if (diff === 0) {
    return { direction: "neutral", value: "±0", label: vsLabel };
  }
  // Percentages mislead on tiny bases (e.g. 1 → 3 is "+200%"); show absolutes there.
  const value =
    previous < 10
      ? `${diff > 0 ? "+" : ""}${diff}`
      : `${diff > 0 ? "+" : ""}${Math.round((diff / previous) * 100)}%`;
  return { direction: diff > 0 ? "up" : "down", value, label: vsLabel };
}

function attentionStatus(count: number): AttentionStatus {
  if (count === 0) return "success";
  if (count <= 5) return "warning";
  return "danger";
}

// ── Supabase row shapes (subset of columns we select) ───────────────────────

type AuthorRel = { name: string | null } | { name: string | null }[] | null;

function authorName(rel: AuthorRel): string | undefined {
  if (!rel) return undefined;
  const one = Array.isArray(rel) ? rel[0] : rel;
  return one?.name ?? undefined;
}

type BookRow = {
  id: string;
  title: string;
  slug: string | null;
  department: string | null;
  is_published: boolean | null;
  view_count: number | null;
  download_count: number | null;
  authors: AuthorRel;
};

type BookFileRel = { book_id: string | null } | { book_id: string | null }[] | null;

function bookIdOfFile(rel: BookFileRel): string | null {
  if (!rel) return null;
  const one = Array.isArray(rel) ? rel[0] : rel;
  return one?.book_id ?? null;
}

/**
 * A normalized activity event: raw log rows become count-1 events; aggregate
 * rows carry their daily count. Everything downstream (trends, comparisons,
 * top lists, departments) consumes this shape.
 */
type ActivityEvent = {
  bucketKey: string;
  contentType: string;
  contentId: string | null;
  count: number;
  /** Falls inside the selected period (vs. the previous comparison period). */
  current: boolean;
};

type SignupEvent = { bucketKey: string; count: number; current: boolean };

/**
 * PostgREST caps responses at 1000 rows; page through so long windows are
 * not silently truncated.
 */
async function fetchAllRows<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const PAGE = 1000;
  const MAX_PAGES = 20;
  const rows: T[] = [];
  for (let i = 0; i < MAX_PAGES; i++) {
    const { data, error } = await page(i * PAGE, (i + 1) * PAGE - 1);
    if (error) throw new Error(`Dashboard query failed: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

// ── Activity fetching: daily aggregates first, raw logs as fallback ─────────

type ActivityData = {
  viewEvents: ActivityEvent[];
  downloadEvents: ActivityEvent[];
  signups: SignupEvent[];
  fromAggregates: boolean;
};

type ServiceClient = ReturnType<typeof createServiceClient>;

async function fetchActivityFromAggregates(
  supabase: ServiceClient,
  win: Window,
): Promise<ActivityData | null> {
  const prevStartKey = dayKey(win.prevStart);
  const endKey = dayKey(win.end);
  const currentStartKey = win.bucketKeys[0];

  const [viewsRes, dlsRes, signupsRes] = await Promise.all([
    supabase
      .from("daily_content_views")
      .select("content_type, content_id, date, views_count")
      .gte("date", prevStartKey)
      .lte("date", endKey),
    supabase
      .from("daily_content_downloads")
      .select("content_type, content_id, date, downloads_count")
      .gte("date", prevStartKey)
      .lte("date", endKey),
    supabase
      .from("daily_user_signups")
      .select("date, users_count")
      .gte("date", prevStartKey)
      .lte("date", endKey),
  ]);

  // Tables missing (migration 0072 not applied yet) or any other failure →
  // signal the caller to use the raw-log path.
  if (viewsRes.error || dlsRes.error || signupsRes.error) return null;

  const inCurrent = (date: string) => date >= currentStartKey && date <= endKey;

  type ViewAggRow = { content_type: string; content_id: string; date: string; views_count: number };
  type DlAggRow = { content_type: string; content_id: string; date: string; downloads_count: number };
  type SignupAggRow = { date: string; users_count: number };

  return {
    viewEvents: ((viewsRes.data ?? []) as ViewAggRow[]).map((r) => ({
      bucketKey: r.date,
      contentType: r.content_type,
      contentId: r.content_id,
      count: r.views_count,
      current: inCurrent(r.date),
    })),
    downloadEvents: ((dlsRes.data ?? []) as DlAggRow[]).map((r) => ({
      bucketKey: r.date,
      contentType: r.content_type,
      contentId: r.content_id,
      count: r.downloads_count,
      current: inCurrent(r.date),
    })),
    signups: ((signupsRes.data ?? []) as SignupAggRow[]).map((r) => ({
      bucketKey: r.date,
      count: r.users_count,
      current: inCurrent(r.date),
    })),
    fromAggregates: true,
  };
}

async function fetchActivityFromLogs(
  supabase: ServiceClient,
  win: Window,
): Promise<ActivityData> {
  const prevStartIso = win.prevStart.toISOString();
  const endIso = win.end.toISOString();
  const startMs = win.start.getTime();
  const endMs = win.end.getTime();
  const inCurrent = (ts: string) => {
    const ms = new Date(ts).getTime();
    return ms >= startMs && ms <= endMs;
  };

  const [viewLogs, downloadLogs, profileRowsRes] = await Promise.all([
    fetchAllRows<{ content_type: string; content_id: string; viewed_at: string }>((from, to) =>
      supabase
        .from("view_logs")
        .select("content_type, content_id, viewed_at")
        .gte("viewed_at", prevStartIso)
        .lte("viewed_at", endIso)
        .order("viewed_at", { ascending: true })
        .range(from, to),
    ),
    // Note: hosted download_logs references book_files, not books directly.
    fetchAllRows<{ downloaded_at: string; book_files: BookFileRel }>((from, to) =>
      supabase
        .from("download_logs")
        .select("downloaded_at, book_files(book_id)")
        .gte("downloaded_at", prevStartIso)
        .lte("downloaded_at", endIso)
        .order("downloaded_at", { ascending: true })
        .range(from, to),
    ),
    supabase
      .from("profiles")
      .select("id, created_at")
      .gte("created_at", prevStartIso)
      .lte("created_at", endIso),
  ]);

  if (profileRowsRes.error) {
    throw new Error(`Dashboard query failed: ${profileRowsRes.error.message}`);
  }

  return {
    viewEvents: viewLogs.map((l) => ({
      bucketKey: win.keyOf(new Date(l.viewed_at)),
      contentType: l.content_type,
      contentId: l.content_id,
      count: 1,
      current: inCurrent(l.viewed_at),
    })),
    downloadEvents: downloadLogs.map((l) => ({
      bucketKey: win.keyOf(new Date(l.downloaded_at)),
      contentType: "book",
      contentId: bookIdOfFile(l.book_files),
      count: 1,
      current: inCurrent(l.downloaded_at),
    })),
    signups: ((profileRowsRes.data ?? []) as { created_at: string }[]).map((p) => ({
      bucketKey: win.keyOf(new Date(p.created_at)),
      count: 1,
      current: inCurrent(p.created_at),
    })),
    fromAggregates: false,
  };
}

async function fetchActivity(supabase: ServiceClient, win: Window): Promise<ActivityData> {
  // Hourly buckets need real timestamps — aggregates are daily.
  if (win.granularity === "hour") return fetchActivityFromLogs(supabase, win);
  const fromAggregates = await fetchActivityFromAggregates(supabase, win);
  return fromAggregates ?? fetchActivityFromLogs(supabase, win);
}

// ── Small aggregation helpers ────────────────────────────────────────────────

function sumCurrent(events: { count: number; current: boolean }[]): number {
  return events.reduce((s, e) => s + (e.current ? e.count : 0), 0);
}

function sumPrevious(events: { count: number; current: boolean }[]): number {
  return events.reduce((s, e) => s + (e.current ? 0 : e.count), 0);
}

function trendSeries(events: { bucketKey: string; count: number; current: boolean }[], win: Window): TrendPoint[] {
  const buckets = new Map<string, number>(win.bucketKeys.map((k) => [k, 0]));
  for (const e of events) {
    if (e.current && buckets.has(e.bucketKey)) {
      buckets.set(e.bucketKey, (buckets.get(e.bucketKey) ?? 0) + e.count);
    }
  }
  return win.bucketKeys.map((k) => ({ date: k, value: buckets.get(k) ?? 0 }));
}

function topFromEvents(
  events: ActivityEvent[],
  bookById: Map<string, BookRow>,
  limit: number,
): TopBookItem[] {
  const counts = new Map<string, number>();
  for (const e of events) {
    if (!e.current || e.contentType !== "book" || !e.contentId) continue;
    counts.set(e.contentId, (counts.get(e.contentId) ?? 0) + e.count);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .flatMap(([bookId, count]) => {
      const book = bookById.get(bookId);
      if (!book || count <= 0) return [];
      return [{
        id: book.id,
        title: book.title,
        author: authorName(book.authors),
        department: book.department ?? undefined,
        count,
        publicUrl: book.slug ? `/books/${book.slug}` : undefined,
        editUrl: `/admin/edit/${book.id}`,
      }];
    });
}

const AUDIT_VERB_PAST: Record<string, string> = {
  create: "created", add: "added", update: "updated", edit: "edited",
  delete: "deleted", remove: "removed", publish: "published",
  unpublish: "unpublished", approve: "approved", reject: "rejected",
  upload: "uploaded", broadcast: "sent", activate: "activated",
  deactivate: "deactivated", save: "saved",
};

function humanizeAuditAction(action: string, targetTable: string): { type: ActivityItem["type"]; title: string } {
  const a = action.toLowerCase();
  if (targetTable === "books" && (a.includes("upload") || a.includes("create"))) {
    return { type: "book_uploaded", title: "uploaded a book" };
  }
  if (targetTable === "books" && (a.includes("edit") || a.includes("update") || a.includes("save"))) {
    return { type: "book_edited", title: "edited a book" };
  }
  if (targetTable === "posts" && a.includes("create")) {
    return { type: "post_created", title: "created a post" };
  }
  // Namespaced actions ("publication.update") read as "updated publication".
  const dot = a.lastIndexOf(".");
  if (dot > 0) {
    const entity = a.slice(0, dot).replace(/[_-]+/g, " ");
    const verb = a.slice(dot + 1);
    const past = AUDIT_VERB_PAST[verb];
    if (past) return { type: "admin_action", title: `${past} ${entity}` };
  }
  const verb = a.replace(/[._-]+/g, " ");
  const noun = targetTable.replace(/_/g, " ");
  // Skip the table name when the action already mentions it ("team member update").
  const title = verb.includes(noun.replace(/s$/, "")) ? verb : `${verb} · ${noun}`;
  return { type: "admin_action", title };
}

// ── Main entry point ─────────────────────────────────────────────────────────

export async function getDashboardData(spec: DashboardRangeSpec): Promise<DashboardData> {
  const supabase = createServiceClient();
  const now = new Date();
  const win = buildWindow(spec, now);

  const [
    activity,
    booksRes,
    postsRes,
    reportsRes,
    publicationsRes,
    usersTotalRes,
    catalogRes,
    pendingRequestsRes,
    subscriptionsRes,
    auditRes,
    recentDlRes,
    recentUsersRes,
  ] = await Promise.all([
    fetchActivity(supabase, win),
    supabase
      .from("books")
      .select("id, title, slug, department, is_published, view_count, download_count, authors(name)"),
    supabase.from("posts").select("views, is_published"),
    supabase.from("research_reports").select("view_count, download_count"),
    supabase.from("publications").select("view_count"),
    supabase.from("profiles").select("*", { count: "exact", head: true }),
    supabase
      .from("catalog_books")
      .select("id, title, author, copies_total, copies_available")
      .eq("is_active", true),
    supabase.from("book_requests").select("*", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("content_subscriptions").select("*", { count: "exact", head: true }),
    supabase
      .from("admin_audit_log")
      .select("id, action, target_table, target_id, created_at, admin:profiles(full_name)")
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("download_logs")
      .select("id, downloaded_at, book_files(book_id), user:profiles(full_name)")
      .order("downloaded_at", { ascending: false })
      .limit(6),
    supabase
      .from("profiles")
      .select("id, full_name, created_at")
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  const firstError =
    booksRes.error ?? postsRes.error ?? reportsRes.error ?? publicationsRes.error ??
    usersTotalRes.error ?? catalogRes.error ?? pendingRequestsRes.error ?? subscriptionsRes.error;
  if (firstError) throw new Error(`Dashboard query failed: ${firstError.message}`);

  const books = (booksRes.data ?? []) as BookRow[];
  const bookById = new Map(books.map((b) => [b.id, b]));

  // ── Summary counts ──
  const booksTotal = books.length;
  const booksPublished = books.filter((b) => b.is_published).length;
  const bookDrafts = booksTotal - booksPublished;

  const booksViews = books.reduce((s, b) => s + (b.view_count ?? 0), 0);
  const booksDownloads = books.reduce((s, b) => s + (b.download_count ?? 0), 0);
  const postsViews = (postsRes.data ?? []).reduce(
    (s: number, p: { views: number | null }) => s + (p.views ?? 0), 0);
  const reportRows = (reportsRes.data ?? []) as { view_count: number | null; download_count: number | null }[];
  const reportsViews = reportRows.reduce((s, r) => s + (r.view_count ?? 0), 0);
  const reportsDownloads = reportRows.reduce((s, r) => s + (r.download_count ?? 0), 0);
  const publicationViews = (publicationsRes.data ?? []).reduce(
    (s: number, p: { view_count: number | null }) => s + (p.view_count ?? 0), 0);

  const totalViews = booksViews + postsViews + reportsViews + publicationViews;
  const totalDownloads = booksDownloads + reportsDownloads;

  const users = usersTotalRes.count ?? 0;
  const catalog = (catalogRes.data ?? []) as {
    id: string; title: string; author: string | null;
    copies_total: number | null; copies_available: number | null;
  }[];
  const catalogTotal = catalog.reduce((s, c) => s + (c.copies_total ?? 0), 0);
  const catalogAvailable = catalog.reduce((s, c) => s + (c.copies_available ?? 0), 0);

  // ── Period metrics from normalized activity events ──
  const { viewEvents, downloadEvents, signups } = activity;

  const periodViews = sumCurrent(viewEvents);
  const periodDownloads = sumCurrent(downloadEvents);
  const newUsers = sumCurrent(signups);

  const viewsTrend = trendSeries(viewEvents, win);
  const downloadsTrend = trendSeries(downloadEvents, win);

  const usersBaseline = users - newUsers;
  const perBucket = trendSeries(signups, win);
  let running = usersBaseline;
  const usersTrend: GrowthPoint[] = perBucket.map((p) => {
    running += p.value;
    return { date: p.date, value: running, added: p.value };
  });

  const topViewed = topFromEvents(viewEvents, bookById, 5);
  const topDownloaded = topFromEvents(downloadEvents, bookById, 5);

  // ── Department activity (period, books only — departments live on books) ──
  const deptMap = new Map<string, DepartmentStat>();
  const bumpDept = (e: ActivityEvent, field: "views" | "downloads") => {
    if (!e.current || e.contentType !== "book" || !e.contentId) return;
    const book = bookById.get(e.contentId);
    if (!book) return;
    const dept = book.department ?? "General";
    const stat = deptMap.get(dept) ?? { department: dept, views: 0, downloads: 0, bookCount: 0 };
    stat[field] += e.count;
    deptMap.set(dept, stat);
  };
  for (const e of viewEvents) bumpDept(e, "views");
  for (const e of downloadEvents) bumpDept(e, "downloads");
  for (const b of books) {
    if (!b.is_published) continue;
    const stat = deptMap.get(b.department ?? "General");
    if (stat) stat.bookCount += 1;
  }
  const departments = [...deptMap.values()].sort(
    (a, b) => b.downloads + b.views - (a.downloads + a.views),
  );

  // ── Needs attention ──
  const pendingRequests = pendingRequestsRes.count ?? 0;
  const subscriptions = subscriptionsRes.count ?? 0;
  const lowStock: LowStockItem[] = catalog
    .filter((c) => (c.copies_available ?? 0) <= 1 && (c.copies_total ?? 0) > 0)
    .sort((a, b) => (a.copies_available ?? 0) - (b.copies_available ?? 0))
    .slice(0, 8)
    .map((c) => ({
      id: c.id,
      title: c.title,
      author: c.author,
      copiesAvailable: c.copies_available ?? 0,
      copiesTotal: c.copies_total ?? 0,
    }));

  const postDrafts = (postsRes.data ?? []).filter(
    (p: { is_published: boolean | null }) => p.is_published === false,
  ).length;

  const attention: AttentionItem[] = [
    {
      key: "book_drafts",
      title: "Book drafts",
      count: bookDrafts,
      status: attentionStatus(bookDrafts),
      description: bookDrafts === 0 ? "No draft books" : `${bookDrafts} unpublished book${bookDrafts === 1 ? "" : "s"}`,
      href: "/admin/review",
    },
    {
      key: "post_drafts",
      title: "Post drafts",
      count: postDrafts,
      status: attentionStatus(postDrafts),
      description: postDrafts === 0 ? "No draft posts" : `${postDrafts} unpublished post${postDrafts === 1 ? "" : "s"}`,
      href: "/admin/posts",
    },
    {
      key: "pending_requests",
      title: "Pending requests",
      count: pendingRequests,
      status: attentionStatus(pendingRequests),
      description: pendingRequests === 0 ? "All requests handled" : `${pendingRequests} waiting for review`,
      href: "/admin/book-requests",
    },
    {
      key: "subscriptions",
      title: "Subscriptions",
      count: subscriptions,
      status: "neutral",
      description: subscriptions === 0 ? "No active subscriptions" : "Review active subscriptions",
      href: "/admin/users",
    },
    {
      key: "low_stock",
      title: "Catalog copies",
      count: lowStock.length,
      status: lowStock.some((c) => c.copiesAvailable === 0)
        ? "danger"
        : lowStock.length > 0
          ? "warning"
          : "success",
      description: lowStock.length === 0
        ? "All catalog items have enough copies"
        : `${lowStock.length} title${lowStock.length === 1 ? "" : "s"} low on copies`,
      href: "/admin/catalogs",
    },
  ];

  const attentionCount = attention.filter((a) => a.status === "warning" || a.status === "danger").length;

  // ── Recent activity feed (audit log + signups + downloads, merged) ──
  const activityFeed: ActivityItem[] = [];

  type AuditRow = {
    id: string; action: string; target_table: string; target_id: string | null;
    created_at: string; admin: { full_name: string | null } | { full_name: string | null }[] | null;
  };
  for (const row of ((auditRes.data ?? []) as AuditRow[])) {
    const { type, title } = humanizeAuditAction(row.action, row.target_table);
    const admin = Array.isArray(row.admin) ? row.admin[0] : row.admin;
    const book = row.target_table === "books" && row.target_id ? bookById.get(row.target_id) : undefined;
    activityFeed.push({
      id: `audit-${row.id}`,
      type,
      title,
      description: book?.title,
      createdAt: row.created_at,
      actor: admin?.full_name ?? "Admin",
      href: book ? `/admin/edit/${book.id}` : "/admin/logs",
    });
  }

  type RecentDlRow = {
    id: string; downloaded_at: string; book_files: BookFileRel;
    user: { full_name: string | null } | { full_name: string | null }[] | null;
  };
  for (const row of ((recentDlRes.data ?? []) as unknown as RecentDlRow[])) {
    const user = Array.isArray(row.user) ? row.user[0] : row.user;
    const bookId = bookIdOfFile(row.book_files);
    const book = bookId ? bookById.get(bookId) : undefined;
    activityFeed.push({
      id: `dl-${row.id}`,
      type: "book_downloaded",
      title: "downloaded a book",
      description: book?.title ?? "Unknown book",
      createdAt: row.downloaded_at,
      actor: user?.full_name ?? "A reader",
      href: book?.slug ? `/books/${book.slug}` : undefined,
    });
  }

  type RecentUserRow = { id: string; full_name: string | null; created_at: string };
  for (const row of ((recentUsersRes.data ?? []) as RecentUserRow[])) {
    activityFeed.push({
      id: `user-${row.id}`,
      type: "user_registered",
      title: "joined the library",
      description: undefined,
      createdAt: row.created_at,
      actor: row.full_name ?? "New user",
      href: "/admin/users",
    });
  }

  activityFeed.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return {
    range: spec.range,
    rangeLabel: win.label,
    granularity: win.granularity,
    fromAggregates: activity.fromAggregates,
    summary: {
      booksTotal,
      booksPublished,
      bookDrafts,
      totalViews,
      periodViews,
      totalDownloads,
      periodDownloads,
      users,
      newUsers,
      catalogAvailable,
      catalogTotal,
      attentionCount,
    },
    trends: {
      views: viewsTrend,
      downloads: downloadsTrend,
      users: usersTrend,
    },
    comparison: {
      views: compareTrend(periodViews, sumPrevious(viewEvents), win.vsLabel),
      downloads: compareTrend(periodDownloads, sumPrevious(downloadEvents), win.vsLabel),
      users: compareTrend(newUsers, sumPrevious(signups), win.vsLabel),
    },
    topViewed,
    topDownloaded,
    departments,
    attention,
    lowStock,
    recentActivity: activityFeed.slice(0, 10),
  };
}

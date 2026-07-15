import "server-only";

import { createServiceClient } from "@/lib/supabase/server";
import {
  buildWindow,
  dayKey,
  fetchAllRows,
  trendSeries,
  type Window,
  type TrendPoint,
} from "./dashboard";
import {
  compareTrend,
  discoveryRates,
  excludeInternal,
  isLikelyTestQuery,
  pct,
  perResource,
  serializeDashboardFilters,
  uniqueVisitors,
  type ContentTypeFilter,
  type DashboardFilters,
  type DiscoveryRates,
  type DiscoveryVolumes,
  type TrendInfo,
} from "./dashboard-shared";
import { generateInsights, type Insight } from "./insights";

/**
 * Per-view data loaders for the Admin Intelligence Dashboard.
 *
 * Reads raw event logs (view_logs / reader_open_logs / download_logs /
 * search_queries / search_result_clicks / app_events) for the selected
 * window + the previous comparison window, joined in memory against a small
 * content catalog (~130 records today). At current volume (hundreds of
 * events) this is cheaper and more flexible than aggregate tables — the
 * 0072 daily aggregates remain the scaling path for the legacy summary API.
 *
 * All loaders are server-only and run with the service client; route-level
 * authorization is the caller's job (page layout / requireStaff /
 * requireAdmin for the system view).
 */

// ── Content catalog (joins events → titles, departments, languages) ────────

export type ContentType = "book" | "research_report" | "publication" | "post";

export type ContentMeta = {
  id: string;
  type: ContentType;
  title: string;
  slug: string | null;
  department: string | null;
  /** Normalised "en" | "km" | null. */
  language: "en" | "km" | null;
  published: boolean;
  status: string | null;
  coverUrl: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  publishedAt: string | null;
  lifetimeViews: number;
  lifetimeDownloads: number;
  /** 0–100 share of the completeness checklist that is filled. */
  completeness: number;
  missing: string[];
};

function normLang(raw: string | null | undefined): "en" | "km" | null {
  if (!raw) return null;
  const v = raw.trim().toLowerCase();
  if (v === "km" || v === "khmer" || v === "kh") return "km";
  if (v === "en" || v === "english") return "en";
  return null;
}

/**
 * Metadata completeness: share of filled checklist fields. The checklist per
 * type is fixed and visible in the UI tooltip: books → cover, description,
 * author, language, department, ISBN; theses → cover, abstract, author,
 * department, keywords, year; publications → cover, abstract, DOI, keywords;
 * posts → cover, excerpt, category.
 */
function completenessOf(fields: Record<string, boolean>): { score: number; missing: string[] } {
  const keys = Object.keys(fields);
  const missing = keys.filter((k) => !fields[k]);
  const score = keys.length === 0 ? 100 : Math.round(((keys.length - missing.length) / keys.length) * 100);
  return { score, missing };
}

type ServiceClient = ReturnType<typeof createServiceClient>;

const INTERNAL_ROLES = ["staff", "librarian", "admin", "super_admin"];

/** Profile ids of admin-panel staff — their events are excluded from
 *  engagement analytics at read time (see excludeInternal). */
async function getInternalUserIds(supabase: ServiceClient): Promise<Set<string>> {
  const { data } = await supabase.from("profiles").select("id, role").in("role", INTERNAL_ROLES);
  return new Set(((data ?? []) as { id: string }[]).map((r) => r.id));
}

export async function loadContentCatalog(supabase: ServiceClient): Promise<ContentMeta[]> {
  const [booksRes, thesesRes, pubsRes, postsRes, deptsRes] = await Promise.all([
    supabase
      .from("books")
      .select(
        "id, title, slug, department, language, cover_url, description, isbn, is_published, status, view_count, download_count, created_at, updated_at, published_at, authors(name)",
      ),
    supabase
      .from("research_reports")
      .select(
        "id, title, abstract, department_id, author_names, cover_url, keywords, academic_year, is_published, view_count, download_count, created_at, published_at",
      ),
    supabase
      .from("publications")
      .select(
        "id, title, slug, abstract, doi, keywords, language, cover_url, is_published, view_count, download_count, created_at, updated_at, published_at",
      ),
    supabase
      .from("posts")
      .select("id, title, slug, category, excerpt, cover_url, cover_urls, is_published, views, created_at, updated_at"),
    supabase.from("departments").select("id, name"),
  ]);

  const firstError = booksRes.error ?? thesesRes.error ?? pubsRes.error ?? postsRes.error;
  if (firstError) throw new Error(`Content catalog query failed: ${firstError.message}`);

  const deptName = new Map<string, string>(
    ((deptsRes.data ?? []) as { id: string; name: string | null }[]).map((d) => [d.id, d.name ?? ""]),
  );

  const catalog: ContentMeta[] = [];

  type AuthorRel = { name: string | null } | { name: string | null }[] | null;
  const authorOf = (rel: AuthorRel): string | null => {
    const one = Array.isArray(rel) ? rel[0] : rel;
    return one?.name ?? null;
  };

  /* eslint-disable @typescript-eslint/no-explicit-any */
  for (const b of (booksRes.data ?? []) as any[]) {
    const { score, missing } = completenessOf({
      cover: !!b.cover_url,
      description: !!(b.description ?? "").trim(),
      author: !!authorOf(b.authors),
      language: !!b.language,
      department: !!(b.department ?? "").trim(),
      isbn: !!(b.isbn ?? "").trim(),
    });
    catalog.push({
      id: b.id,
      type: "book",
      title: b.title,
      slug: b.slug,
      department: b.department?.trim() || null,
      language: normLang(b.language),
      published: !!b.is_published,
      status: b.status ?? null,
      coverUrl: b.cover_url ?? null,
      createdAt: b.created_at ?? null,
      updatedAt: b.updated_at ?? null,
      publishedAt: null, // books.published_at is the bibliographic date, not site-publish
      lifetimeViews: b.view_count ?? 0,
      lifetimeDownloads: b.download_count ?? 0,
      completeness: score,
      missing,
    });
  }

  for (const t of (thesesRes.data ?? []) as any[]) {
    const { score, missing } = completenessOf({
      cover: !!t.cover_url,
      abstract: !!(t.abstract ?? "").trim(),
      author: !!(t.author_names ?? "").trim(),
      department: !!t.department_id,
      keywords: Array.isArray(t.keywords) && t.keywords.length > 0,
      year: !!(t.academic_year ?? "").trim(),
    });
    catalog.push({
      id: t.id,
      type: "research_report",
      title: t.title,
      slug: null,
      department: t.department_id ? deptName.get(t.department_id) || null : null,
      language: null, // theses carry no language column
      published: !!t.is_published,
      status: null,
      coverUrl: t.cover_url ?? null,
      createdAt: t.created_at ?? null,
      updatedAt: null,
      publishedAt: t.published_at ?? null,
      lifetimeViews: t.view_count ?? 0,
      lifetimeDownloads: t.download_count ?? 0,
      completeness: score,
      missing,
    });
  }

  for (const p of (pubsRes.data ?? []) as any[]) {
    const { score, missing } = completenessOf({
      cover: !!p.cover_url,
      abstract: !!(p.abstract ?? "").trim(),
      doi: !!(p.doi ?? "").trim(),
      keywords: Array.isArray(p.keywords) && p.keywords.length > 0,
    });
    catalog.push({
      id: p.id,
      type: "publication",
      title: p.title,
      slug: p.slug,
      department: null,
      language: normLang(p.language),
      published: !!p.is_published,
      status: null,
      coverUrl: p.cover_url ?? null,
      createdAt: p.created_at ?? null,
      updatedAt: p.updated_at ?? null,
      publishedAt: p.published_at ?? null,
      lifetimeViews: p.view_count ?? 0,
      lifetimeDownloads: p.download_count ?? 0,
      completeness: score,
      missing,
    });
  }

  for (const p of (postsRes.data ?? []) as any[]) {
    const { score, missing } = completenessOf({
      cover: !!(p.cover_url || (Array.isArray(p.cover_urls) && p.cover_urls.length > 0)),
      excerpt: !!(p.excerpt ?? "").trim(),
      category: !!(p.category ?? "").trim(),
    });
    catalog.push({
      id: p.id,
      type: "post",
      title: p.title,
      slug: p.slug,
      department: null,
      language: null,
      published: !!p.is_published,
      status: null,
      coverUrl: p.cover_url ?? (Array.isArray(p.cover_urls) ? p.cover_urls[0] ?? null : null),
      createdAt: p.created_at ?? null,
      updatedAt: p.updated_at ?? null,
      publishedAt: null,
      lifetimeViews: p.views ?? 0,
      lifetimeDownloads: 0,
      completeness: score,
      missing,
    });
  }
  /* eslint-enable @typescript-eslint/no-explicit-any */

  return catalog;
}

// ── Raw event rows for a window (current + previous period) ────────────────

export type EventRow = {
  ts: string;
  bucketKey: string;
  current: boolean;
  contentType: string | null;
  contentId: string | null;
  userId: string | null;
  sessionHash: string | null;
  locale: string | null;
};

function rowIsCurrent(win: Window, ts: string): boolean {
  const ms = new Date(ts).getTime();
  return ms >= win.start.getTime() && ms <= win.end.getTime();
}

/** Pre-0090 databases lack the new analytics columns — retry the select
 *  without them so the dashboard works before the migration is applied
 *  (same deploy-code-first convention as 0062's trust fields). */
async function fetchWithColumnFallback<T>(
  rich: () => Promise<T[]>,
  legacy: () => Promise<T[]>,
): Promise<T[]> {
  try {
    return await rich();
  } catch (err) {
    if (err instanceof Error && /column .* does not exist|session_hash|42703/.test(err.message)) {
      return legacy();
    }
    throw err;
  }
}

async function fetchViewRows(supabase: ServiceClient, win: Window): Promise<EventRow[]> {
  type Row = {
    content_type: string;
    content_id: string;
    user_id: string | null;
    session_hash?: string | null;
    locale?: string | null;
    viewed_at: string;
  };
  const query = (columns: string) => () =>
    fetchAllRows<Row>(
      (from, to) =>
        supabase
          .from("view_logs")
          .select(columns)
          .gte("viewed_at", win.prevStart.toISOString())
          .lte("viewed_at", win.end.toISOString())
          .order("viewed_at", { ascending: true })
          .range(from, to) as unknown as PromiseLike<{ data: Row[] | null; error: { message: string } | null }>,
    );
  const rows = await fetchWithColumnFallback(
    query("content_type, content_id, user_id, session_hash, locale, viewed_at"),
    query("content_type, content_id, user_id, viewed_at"),
  );
  return rows.map((r) => ({
    ts: r.viewed_at,
    bucketKey: win.keyOf(new Date(r.viewed_at)),
    current: rowIsCurrent(win, r.viewed_at),
    contentType: r.content_type,
    contentId: r.content_id,
    userId: r.user_id,
    sessionHash: r.session_hash ?? null,
    locale: r.locale ?? null,
  }));
}

async function fetchReaderOpenRows(supabase: ServiceClient, win: Window): Promise<EventRow[] | null> {
  const res = await supabase
    .from("reader_open_logs")
    .select("content_type, content_id, user_id, session_hash, locale, opened_at")
    .gte("opened_at", win.prevStart.toISOString())
    .lte("opened_at", win.end.toISOString())
    .order("opened_at", { ascending: true })
    .limit(5000);
  // Pre-0090: table missing → callers show the "collecting" state.
  if (res.error) return null;
  return (res.data ?? []).map((r) => ({
    ts: r.opened_at,
    bucketKey: win.keyOf(new Date(r.opened_at)),
    current: rowIsCurrent(win, r.opened_at),
    contentType: r.content_type,
    contentId: r.content_id,
    userId: r.user_id,
    sessionHash: r.session_hash ?? null,
    locale: r.locale ?? null,
  }));
}

type BookFileRel = { book_id: string | null } | { book_id: string | null }[] | null;

async function fetchDownloadRows(supabase: ServiceClient, win: Window): Promise<EventRow[]> {
  type Row = {
    downloaded_at: string;
    user_id: string | null;
    session_hash?: string | null;
    content_type: string | null;
    content_id: string | null;
    book_files: BookFileRel;
  };
  const query = (columns: string) => () =>
    fetchAllRows<Row>(
      (from, to) =>
        supabase
          .from("download_logs")
          .select(columns)
          .gte("downloaded_at", win.prevStart.toISOString())
          .lte("downloaded_at", win.end.toISOString())
          .order("downloaded_at", { ascending: true })
          .range(from, to) as unknown as PromiseLike<{ data: Row[] | null; error: { message: string } | null }>,
    );
  const rows = await fetchWithColumnFallback(
    query("downloaded_at, user_id, session_hash, content_type, content_id, book_files(book_id)"),
    query("downloaded_at, user_id, content_type, content_id, book_files(book_id)"),
  );
  return rows.map((r) => {
    const rel = Array.isArray(r.book_files) ? r.book_files[0] : r.book_files;
    return {
      ts: r.downloaded_at,
      bucketKey: win.keyOf(new Date(r.downloaded_at)),
      current: rowIsCurrent(win, r.downloaded_at),
      contentType: r.content_type ?? "book",
      contentId: r.content_id ?? rel?.book_id ?? null,
      userId: r.user_id,
      sessionHash: r.session_hash ?? null,
      locale: null,
    };
  });
}

// ── Filter predicate over events, via the content catalog ──────────────────

function makeEventFilter(
  filters: DashboardFilters,
  byId: Map<string, ContentMeta>,
): (e: EventRow) => boolean {
  const wantType: ContentTypeFilter = filters.type;
  const wantDept = filters.dept;
  const wantLang = filters.lang;
  const noContentFilters = wantType === "all" && !wantDept && wantLang === "all";
  if (noContentFilters) return () => true;
  return (e) => {
    if (wantType !== "all" && e.contentType !== wantType) return false;
    if (!wantDept && wantLang === "all") return true;
    const meta = e.contentId ? byId.get(`${e.contentType}:${e.contentId}`) : undefined;
    if (wantDept && meta?.department !== wantDept) return false;
    if (wantLang !== "all" && meta?.language !== wantLang) return false;
    return true;
  };
}

function metaMatchesFilters(meta: ContentMeta, filters: DashboardFilters): boolean {
  if (filters.type !== "all" && meta.type !== filters.type) return false;
  if (filters.dept && meta.department !== filters.dept) return false;
  if (filters.lang !== "all" && meta.language !== filters.lang) return false;
  return true;
}

// ── Overview ────────────────────────────────────────────────────────────────

export type KpiDatum = {
  value: number;
  trend: TrendInfo | null;
  spark: TrendPoint[];
  /** Rows without any visitor identifier were excluded from this metric. */
  untracked?: number;
  /** Metric depends on instrumentation newer than the selected period. */
  collecting?: boolean;
};

export type OverviewData = {
  rangeLabel: string;
  vsLabel: string;
  granularity: "hour" | "day";
  generatedAt: string;
  kpis: {
    uniqueVisitors: KpiDatum;
    detailViews: KpiDatum;
    readerOpens: KpiDatum;
    downloads: KpiDatum;
    /** engaged (opened reader or downloaded) ÷ visitors with a detail view. */
    conversion: {
      valuePct: number | null;
      prevPct: number | null;
      engaged: number;
      viewers: number;
      insufficient: boolean;
    };
  };
  engagement: {
    series: {
      views: TrendPoint[];
      visitors: TrendPoint[];
      readerOpens: TrendPoint[] | null;
      downloads: TrendPoint[];
    };
    /** Previous-period series aligned bucket-by-bucket with `series`. */
    prevSeries: {
      views: TrendPoint[];
      visitors: TrendPoint[];
      readerOpens: TrendPoint[] | null;
      downloads: TrendPoint[];
    };
    previous: { views: number; visitors: number; readerOpens: number | null; downloads: number };
    /** Content published during the period, for chart annotations. */
    annotations: { date: string; count: number }[];
  };
  /** Independent event volumes + honest pairwise rates (NOT a funnel). */
  discovery: {
    volumes: DiscoveryVolumes;
    prevVolumes: DiscoveryVolumes;
    rates: DiscoveryRates;
    prevRates: DiscoveryRates;
  };
  insights: Insight[];
};

function distinctVisitorSeries(rows: EventRow[], win: Window): TrendPoint[] {
  const perBucket = new Map<string, Set<string>>(win.bucketKeys.map((k) => [k, new Set()]));
  for (const r of rows) {
    if (!r.current) continue;
    const id = r.userId ? `u:${r.userId}` : r.sessionHash ? `s:${r.sessionHash}` : null;
    if (!id) continue;
    perBucket.get(r.bucketKey)?.add(id);
  }
  return win.bucketKeys.map((k) => ({ date: k, value: perBucket.get(k)?.size ?? 0 }));
}

function asCountEvents(rows: EventRow[]): { bucketKey: string; count: number; current: boolean }[] {
  return rows.map((r) => ({ bucketKey: r.bucketKey, count: 1, current: r.current }));
}

/**
 * Bucket previous-period rows into a series aligned index-by-index with the
 * current window (bucket i of prev = bucket i shifted back one span), so the
 * chart can overlay "previous period" as a comparable dashed line.
 */
function prevTrendSeries(rows: EventRow[], win: Window): TrendPoint[] {
  const span = win.bucketKeys.length;
  const spanMs = win.granularity === "hour" ? 3_600_000 : 86_400_000;
  const index = new Map<string, number>();
  for (let i = 0; i < span; i++) index.set(win.bucketKeys[i], i);
  const values = new Array<number>(span).fill(0);
  for (const r of rows) {
    if (r.current) continue;
    const shifted = win.keyOf(new Date(new Date(r.ts).getTime() + span * spanMs));
    const i = index.get(shifted);
    if (i !== undefined) values[i] += 1;
  }
  return win.bucketKeys.map((k, i) => ({ date: k, value: values[i] }));
}

function prevVisitorSeries(rows: EventRow[], win: Window): TrendPoint[] {
  const span = win.bucketKeys.length;
  const spanMs = win.granularity === "hour" ? 3_600_000 : 86_400_000;
  const index = new Map<string, number>();
  for (let i = 0; i < span; i++) index.set(win.bucketKeys[i], i);
  const perBucket: Set<string>[] = Array.from({ length: span }, () => new Set());
  for (const r of rows) {
    if (r.current) continue;
    const id = r.userId ? `u:${r.userId}` : r.sessionHash ? `s:${r.sessionHash}` : null;
    if (!id) continue;
    const shifted = win.keyOf(new Date(new Date(r.ts).getTime() + span * spanMs));
    const i = index.get(shifted);
    if (i !== undefined) perBucket[i].add(id);
  }
  return win.bucketKeys.map((k, i) => ({ date: k, value: perBucket[i].size }));
}

export async function getOverviewData(filters: DashboardFilters): Promise<OverviewData> {
  const supabase = createServiceClient();
  const now = new Date();
  const win = buildWindow({ range: filters.range, from: filters.from, to: filters.to }, now);

  const [catalog, internalIds, viewRowsAll, readerRowsAll, downloadRowsAll, searchesRes, clicksRes, savesRes, storageErrRes] =
    await Promise.all([
      loadContentCatalog(supabase),
      getInternalUserIds(supabase),
      fetchViewRows(supabase, win),
      fetchReaderOpenRows(supabase, win),
      fetchDownloadRows(supabase, win),
      supabase
        .from("search_queries")
        .select("searched_at, result_count, query_language, normalized_term")
        .gte("searched_at", win.prevStart.toISOString())
        .lte("searched_at", win.end.toISOString())
        .limit(10000),
      supabase
        .from("search_result_clicks")
        .select("clicked_at")
        .gte("clicked_at", win.prevStart.toISOString())
        .lte("clicked_at", win.end.toISOString())
        .limit(10000),
      supabase
        .from("saved_books")
        .select("created_at, user_id")
        .gte("created_at", win.prevStart.toISOString())
        .lte("created_at", win.end.toISOString()),
      supabase
        .from("app_events")
        .select("created_at, status")
        .eq("kind", "storage_operation")
        .in("status", ["error", "timeout"])
        .gte("created_at", win.prevStart.toISOString())
        .lte("created_at", win.end.toISOString()),
    ]);

  const byId = new Map(catalog.map((c) => [`${c.type}:${c.id}`, c]));
  const passes = makeEventFilter(filters, byId);

  // Engagement analytics exclude internal staff activity (verified: staff
  // browsing dominated raw logs). Raw tables keep everything.
  const viewRows = excludeInternal(viewRowsAll.filter(passes), internalIds);
  const readerRows = readerRowsAll ? excludeInternal(readerRowsAll.filter(passes), internalIds) : null;
  const downloadRows = excludeInternal(downloadRowsAll.filter(passes), internalIds);

  const cur = (rows: EventRow[]) => rows.filter((r) => r.current);
  const prev = (rows: EventRow[]) => rows.filter((r) => !r.current);

  // ── KPIs ──
  const curViews = cur(viewRows);
  const prevViews = prev(viewRows);

  const visitorsNow = uniqueVisitors(curViews.map((r) => ({ userId: r.userId, sessionHash: r.sessionHash })));
  const visitorsPrev = uniqueVisitors(prevViews.map((r) => ({ userId: r.userId, sessionHash: r.sessionHash })));

  const readerNow = readerRows ? cur(readerRows).length : 0;
  const readerPrev = readerRows ? prev(readerRows).length : 0;
  const readerCollecting = readerRows === null || readerRows.length === 0;

  const dlNow = cur(downloadRows).length;
  const dlPrev = prev(downloadRows).length;

  // Engagement conversion: identified visitors who opened a reader or
  // downloaded ÷ identified visitors who viewed a detail page.
  const viewerIds = new Set<string>();
  for (const r of curViews) {
    const id = r.userId ? `u:${r.userId}` : r.sessionHash ? `s:${r.sessionHash}` : null;
    if (id) viewerIds.add(id);
  }
  const engagedIds = new Set<string>();
  for (const r of [...(readerRows ? cur(readerRows) : []), ...cur(downloadRows)]) {
    const id = r.userId ? `u:${r.userId}` : r.sessionHash ? `s:${r.sessionHash}` : null;
    if (id) engagedIds.add(id);
  }
  const prevViewerIds = new Set<string>();
  for (const r of prevViews) {
    const id = r.userId ? `u:${r.userId}` : r.sessionHash ? `s:${r.sessionHash}` : null;
    if (id) prevViewerIds.add(id);
  }
  const prevEngagedIds = new Set<string>();
  for (const r of [...(readerRows ? prev(readerRows) : []), ...prev(downloadRows)]) {
    const id = r.userId ? `u:${r.userId}` : r.sessionHash ? `s:${r.sessionHash}` : null;
    if (id) prevEngagedIds.add(id);
  }

  // ── Funnel ──
  type SearchRow = { searched_at: string; result_count: number | null; query_language: string | null; normalized_term: string };
  const searchRows = ((searchesRes.data ?? []) as SearchRow[]).map((r) => ({
    ts: r.searched_at,
    current: rowIsCurrent(win, r.searched_at),
    resultCount: r.result_count,
    lang: r.query_language,
    term: r.normalized_term,
  }));
  const clickRows = ((clicksRes.data ?? []) as { clicked_at: string }[]).map((r) => ({
    current: rowIsCurrent(win, r.clicked_at),
  }));
  const saveRows = excludeInternal(
    ((savesRes.data ?? []) as { created_at: string; user_id: string | null }[]).map((r) => ({
      current: rowIsCurrent(win, r.created_at),
      userId: r.user_id,
    })),
    internalIds,
  );

  const volumes: DiscoveryVolumes = {
    searches: searchRows.filter((r) => r.current).length,
    resultClicks: clickRows.filter((r) => r.current).length,
    detailViews: curViews.length,
    readerOpens: readerCollecting ? null : readerNow,
    downloadsOrSaves: dlNow + saveRows.filter((r) => r.current).length,
  };
  const prevVolumes: DiscoveryVolumes = {
    searches: searchRows.filter((r) => !r.current).length,
    resultClicks: clickRows.filter((r) => !r.current).length,
    detailViews: prevViews.length,
    readerOpens: readerCollecting ? null : readerPrev,
    downloadsOrSaves: dlPrev + saveRows.filter((r) => !r.current).length,
  };
  const discovery = {
    volumes,
    prevVolumes,
    rates: discoveryRates(volumes),
    prevRates: discoveryRates(prevVolumes),
  };

  // ── Publish annotations (content published inside the window) ──
  const annotations = new Map<string, number>();
  for (const c of catalog) {
    const publishedTs = c.publishedAt ?? (c.published ? c.createdAt : null);
    if (!publishedTs || !metaMatchesFilters(c, filters)) continue;
    const ms = new Date(publishedTs).getTime();
    if (ms >= win.start.getTime() && ms <= win.end.getTime()) {
      const key = win.keyOf(new Date(publishedTs));
      annotations.set(key, (annotations.get(key) ?? 0) + 1);
    }
  }

  // ── Insights ──
  const zeroTermCounts = new Map<string, number>();
  for (const s of searchRows) {
    if (s.current && s.resultCount === 0) {
      zeroTermCounts.set(s.term, (zeroTermCounts.get(s.term) ?? 0) + 1);
    }
  }
  const repeatedZeroResultTerms = [...zeroTermCounts.values()].filter((n) => n >= 3).length;

  const periodViewsByContent = new Map<string, number>();
  for (const r of curViews) {
    if (r.contentId) {
      const key = `${r.contentType}:${r.contentId}`;
      periodViewsByContent.set(key, (periodViewsByContent.get(key) ?? 0) + 1);
    }
  }
  let newContentWithoutViews = 0;
  for (const c of catalog) {
    if (!c.published || !metaMatchesFilters(c, filters)) continue;
    const publishedTs = c.publishedAt ?? c.createdAt;
    if (!publishedTs) continue;
    const ms = new Date(publishedTs).getTime();
    if (ms >= win.start.getTime() && ms <= win.end.getTime()) {
      if ((periodViewsByContent.get(`${c.type}:${c.id}`) ?? 0) === 0) newContentWithoutViews++;
    }
  }

  const deptViews = new Map<string, number>();
  const deptResources = new Map<string, number>();
  for (const c of catalog) {
    if (!c.published || !c.department) continue;
    deptResources.set(c.department, (deptResources.get(c.department) ?? 0) + 1);
  }
  for (const r of curViews) {
    const meta = r.contentId ? byId.get(`${r.contentType}:${r.contentId}`) : undefined;
    if (meta?.department) deptViews.set(meta.department, (deptViews.get(meta.department) ?? 0) + 1);
  }

  const searchesNow = searchRows.filter((r) => r.current);
  const searchesPrev = searchRows.filter((r) => !r.current);
  const kmShare = (rows: typeof searchesNow): number | null =>
    rows.length >= 10 ? Math.round((rows.filter((r) => r.lang === "km").length / rows.length) * 100) : null;

  type StorageErrRow = { created_at: string };
  const storageErrRows = ((storageErrRes.data ?? []) as StorageErrRow[]).map((r) =>
    rowIsCurrent(win, r.created_at),
  );

  const insights = generateInsights({
    views: { current: curViews.length, previous: prevViews.length },
    readerOpens: { current: readerNow, previous: readerPrev },
    repeatedZeroResultTerms,
    newContentWithoutViews,
    departments: [...deptResources.entries()].map(([name, resources]) => ({
      name,
      resources,
      viewsPerResource: perResource(deptViews.get(name) ?? 0, resources),
    })),
    storageErrors: {
      current: storageErrRows.filter(Boolean).length,
      previous: storageErrRows.filter((c) => !c).length,
    },
    khmerSearchShare: {
      current: kmShare(searchesNow),
      previous: kmShare(searchesPrev),
      total: searchesNow.length,
    },
    periodQuery: serializeDashboardFilters({ ...filters, view: "overview" }),
  });

  const kpi = (rows: EventRow[], current: number, previous: number): KpiDatum => ({
    value: current,
    trend: filters.compare ? compareTrend(current, previous, win.vsLabel) : null,
    spark: trendSeries(asCountEvents(rows), win),
  });

  return {
    rangeLabel: win.label,
    vsLabel: win.vsLabel,
    granularity: win.granularity,
    generatedAt: now.toISOString(),
    kpis: {
      uniqueVisitors: {
        value: visitorsNow.visitors,
        trend: filters.compare ? compareTrend(visitorsNow.visitors, visitorsPrev.visitors, win.vsLabel) : null,
        spark: distinctVisitorSeries(viewRows, win),
        untracked: visitorsNow.untracked,
        collecting: visitorsNow.visitors === 0 && visitorsNow.untracked > 0,
      },
      detailViews: kpi(viewRows, curViews.length, prevViews.length),
      readerOpens: {
        ...kpi(readerRows ?? [], readerNow, readerPrev),
        collecting: readerCollecting,
      },
      downloads: kpi(downloadRows, dlNow, dlPrev),
      conversion: {
        valuePct: pct(engagedIds.size, viewerIds.size),
        // A previous-period rate off fewer than 5 viewers ("100% previously")
        // is noise, not a comparison — same floor as `insufficient` below.
        prevPct: prevViewerIds.size < 5 ? null : pct(prevEngagedIds.size, prevViewerIds.size),
        engaged: engagedIds.size,
        viewers: viewerIds.size,
        insufficient: viewerIds.size < 5,
      },
    },
    engagement: {
      series: {
        views: trendSeries(asCountEvents(viewRows), win),
        visitors: distinctVisitorSeries(viewRows, win),
        readerOpens: readerRows ? trendSeries(asCountEvents(readerRows), win) : null,
        downloads: trendSeries(asCountEvents(downloadRows), win),
      },
      prevSeries: {
        views: prevTrendSeries(viewRows, win),
        visitors: prevVisitorSeries(viewRows, win),
        readerOpens: readerRows ? prevTrendSeries(readerRows, win) : null,
        downloads: prevTrendSeries(downloadRows, win),
      },
      previous: {
        views: prevViews.length,
        visitors: visitorsPrev.visitors,
        readerOpens: readerRows ? readerPrev : null,
        downloads: dlPrev,
      },
      annotations: [...annotations.entries()]
        .map(([date, count]) => ({ date, count }))
        .sort((a, b) => (a.date < b.date ? -1 : 1)),
    },
    discovery,
    insights,
  };
}

// ── Action Center ───────────────────────────────────────────────────────────

export type ActionSeverity = "critical" | "warning" | "pending" | "info";

export type ActionItem = {
  key:
    | "brokenFiles"
    | "storageErrors"
    | "r2Fallback"
    | "aiFailures"
    | "missingMetadata"
    | "contentDrafts"
    | "staleDrafts"
    | "pendingRequests"
    | "contactInbox"
    | "needsReview"
    | "zeroResultQueries"
    | "lowStock"
    | "catalogEmpty";
  severity: ActionSeverity;
  count: number;
  oldestAt: string | null;
  href: string;
};

export type ActionCenterData = {
  items: ActionItem[];
  passedKeys: string[];
  generatedAt: string;
};

/**
 * Where a "broken file" alert should send the admin: straight to the affected
 * record's edit page when exactly one file is broken, otherwise the
 * data-quality dashboard for bulk triage. file_health.record_type is
 * 'book' | 'research' (0065).
 */
function brokenFileFixHref(
  count: number,
  rows: { record_type: string; record_id: string }[],
): string {
  if (count === 1 && rows[0]) {
    if (rows[0].record_type === "book") return `/admin/edit/${rows[0].record_id}`;
    if (rows[0].record_type === "research") return `/admin/theses/edit/${rows[0].record_id}`;
  }
  return "/admin/data-quality";
}

export async function getActionCenter(filters: DashboardFilters): Promise<ActionCenterData> {
  const supabase = createServiceClient();
  const now = new Date();
  const win = buildWindow({ range: filters.range, from: filters.from, to: filters.to }, now);
  const staleCutoff = new Date(now.getTime() - 30 * 86_400_000).toISOString();

  const [
    brokenRes,
    storageRes,
    aiRes,
    booksRes,
    postsDraftRes,
    thesesDraftRes,
    requestsRes,
    contactRes,
    needsReviewRes,
    zeroRes,
    catalogRes,
  ] = await Promise.all([
    supabase.from("file_health").select("record_type, record_id", { count: "exact" }).eq("status", "broken").limit(2),
    supabase
      .from("app_events")
      .select("created_at, status")
      .eq("kind", "storage_operation")
      .gte("created_at", win.start.toISOString()),
    supabase
      .from("app_events")
      .select("status", { count: "exact" })
      .eq("kind", "ai_request")
      .gte("created_at", win.start.toISOString()),
    supabase.from("books").select("is_published, status, created_at, cover_url, description, language, department, author_id"),
    supabase.from("posts").select("created_at").eq("is_published", false),
    supabase.from("research_reports").select("created_at").eq("is_published", false),
    supabase
      .from("book_requests")
      .select("created_at")
      .eq("status", "pending")
      .order("created_at", { ascending: true }),
    supabase.from("contact_messages").select("created_at").eq("status", "new").order("created_at", { ascending: true }),
    supabase.from("books").select("created_at", { count: "exact" }).in("status", ["needs_review", "in_review", "pending_review"]),
    supabase
      .from("search_queries")
      .select("normalized_term, searched_at")
      .eq("result_count", 0)
      .gte("searched_at", win.start.toISOString())
      .limit(2000),
    supabase.from("catalog_books").select("copies_total, copies_available").eq("is_active", true),
  ]);

  const items: ActionItem[] = [];
  const passedKeys: string[] = [];

  const push = (item: ActionItem) => {
    if (item.count > 0) items.push(item);
    else passedKeys.push(item.key);
  };

  push({
    key: "brokenFiles",
    severity: "critical",
    count: brokenRes.count ?? 0,
    oldestAt: null,
    href: brokenFileFixHref(
      brokenRes.count ?? 0,
      (brokenRes.data ?? []) as { record_type: string; record_id: string }[],
    ),
  });

  type StorageRow = { created_at: string; status: string };
  const storageRows = (storageRes.data ?? []) as StorageRow[];
  const storageErrors = storageRows.filter((r) => r.status === "error" || r.status === "timeout");
  push({
    key: "storageErrors",
    severity: "critical",
    count: storageErrors.length,
    oldestAt: storageErrors[0]?.created_at ?? null,
    href: "/admin?view=system",
  });
  const fallbacks = storageRows.filter((r) => r.status === "fallback");
  push({
    key: "r2Fallback",
    severity: "info",
    count: fallbacks.length,
    oldestAt: null,
    href: "/admin?view=system",
  });

  type AiRow = { status: string };
  const aiRows = (aiRes.data ?? []) as AiRow[];
  const aiFailures = aiRows.filter((r) => r.status === "error" || r.status === "timeout").length;
  // Only alarm when failures are both frequent and a meaningful share.
  push({
    key: "aiFailures",
    severity: "warning",
    count: aiRows.length >= 5 && aiFailures / aiRows.length >= 0.2 ? aiFailures : 0,
    oldestAt: null,
    href: "/admin?view=system",
  });

  type BookHealthRow = {
    is_published: boolean | null;
    status: string | null;
    created_at: string | null;
    cover_url: string | null;
    description: string | null;
    language: string | null;
    department: string | null;
    author_id: string | null;
  };
  const books = (booksRes.data ?? []) as BookHealthRow[];
  const missingMeta = books.filter(
    (b) =>
      b.is_published &&
      (!b.cover_url || !(b.description ?? "").trim() || !b.language || !(b.department ?? "").trim() || !b.author_id),
  ).length;
  push({
    key: "missingMetadata",
    severity: "warning",
    count: missingMeta,
    oldestAt: null,
    href: "/admin/data-quality",
  });

  const bookDrafts = books.filter((b) => !b.is_published);
  const postDrafts = (postsDraftRes.data ?? []) as { created_at: string | null }[];
  const thesisDrafts = (thesesDraftRes.data ?? []) as { created_at: string | null }[];
  const draftDates = [...bookDrafts.map((d) => d.created_at), ...postDrafts.map((d) => d.created_at), ...thesisDrafts.map((d) => d.created_at)]
    .filter((d): d is string => !!d)
    .sort();
  push({
    key: "contentDrafts",
    severity: "pending",
    count: bookDrafts.length + postDrafts.length + thesisDrafts.length,
    oldestAt: draftDates[0] ?? null,
    href: "/admin/review",
  });
  push({
    key: "staleDrafts",
    severity: "warning",
    count: draftDates.filter((d) => d < staleCutoff).length,
    oldestAt: draftDates[0] ?? null,
    href: "/admin/review",
  });

  const requests = (requestsRes.data ?? []) as { created_at: string }[];
  push({
    key: "pendingRequests",
    severity: "pending",
    count: requests.length,
    oldestAt: requests[0]?.created_at ?? null,
    href: "/admin/book-requests",
  });

  const contacts = (contactRes.data ?? []) as { created_at: string }[];
  push({
    key: "contactInbox",
    severity: "pending",
    count: contacts.length,
    oldestAt: contacts[0]?.created_at ?? null,
    href: "/admin/inbox",
  });

  push({
    key: "needsReview",
    severity: "pending",
    count: needsReviewRes.count ?? 0,
    oldestAt: null,
    href: "/admin/review",
  });

  const zeroTerms = new Map<string, number>();
  for (const r of (zeroRes.data ?? []) as { normalized_term: string }[]) {
    zeroTerms.set(r.normalized_term, (zeroTerms.get(r.normalized_term) ?? 0) + 1);
  }
  push({
    key: "zeroResultQueries",
    severity: "warning",
    count: [...zeroTerms.values()].filter((n) => n >= 3).length,
    oldestAt: null,
    href: "/admin/search-insights",
  });

  const catalog = (catalogRes.data ?? []) as { copies_total: number | null; copies_available: number | null }[];
  const lowStock = catalog.filter((c) => (c.copies_total ?? 0) > 0 && (c.copies_available ?? 0) <= 1).length;
  // An empty physical catalogue is onboarding, not a failure — it lives in
  // Collection Health, never in this queue.
  if (catalog.length > 0) {
    push({ key: "lowStock", severity: "warning", count: lowStock, oldestAt: null, href: "/admin/catalogs" });
  }

  const order: Record<ActionSeverity, number> = { critical: 0, warning: 1, pending: 2, info: 3 };
  items.sort((a, b) => order[a.severity] - order[b.severity] || b.count - a.count);

  return { items, passedKeys, generatedAt: now.toISOString() };
}

// ── Content intelligence ────────────────────────────────────────────────────

export const CONTENT_PRESETS = [
  "top",
  "needsAttention",
  "recent",
  "rising",
  "underperforming",
  "neverViewed",
  "highViewsLowOpens",
  "openedNotDownloaded",
  "incompleteMetadata",
] as const;
/** Presets shown as chips; the rest live in the "more views" menu. */
export const PRIMARY_CONTENT_PRESETS: ContentPreset[] = ["top", "needsAttention", "recent"];
export type ContentPreset = (typeof CONTENT_PRESETS)[number];

export type ContentPerfRow = {
  id: string;
  type: ContentType;
  title: string;
  slug: string | null;
  department: string | null;
  language: "en" | "km" | null;
  published: boolean;
  coverUrl: string | null;
  views: number;
  uniqueViewers: number;
  readerOpens: number;
  downloads: number;
  /** (reader opens + downloads) ÷ views, percent. Null when views = 0. */
  conversionPct: number | null;
  /** Views delta vs previous period. */
  delta: number;
  lifetimeViews: number;
  completeness: number;
  missing: string[];
  updatedAt: string | null;
  editHref: string;
  publicHref: string | null;
};

export type DepartmentRow = {
  name: string;
  resources: number;
  views: number;
  readerOpens: number;
  downloads: number;
  viewsPerResource: number | null;
  opensPerResource: number | null;
  downloadsPerResource: number | null;
  conversionPct: number | null;
  neverViewedPct: number | null;
  completeMetaPct: number | null;
};

export type CollectionHealthData = {
  totals: { books: number; theses: number; publications: number; posts: number; catalog: number };
  published: number;
  drafts: number;
  missingCover: number;
  missingDescription: number;
  missingAuthor: number;
  missingDepartment: number;
  missingLanguage: number;
  missingIdentifier: number;
  missingKeywords: number;
  brokenFiles: number;
  neverViewed: number;
  oldDrafts: number;
  avgCompleteness: number | null;
};

export type ContentIntelligenceData = {
  rangeLabel: string;
  rows: ContentPerfRow[];
  total: number;
  page: number;
  pageSize: number;
  preset: ContentPreset;
  departments: DepartmentRow[];
  health: CollectionHealthData;
  generatedAt: string;
};

const EDIT_HREF: Record<ContentType, (id: string) => string> = {
  book: (id) => `/admin/edit/${id}`,
  research_report: (id) => `/admin/theses/edit/${id}`,
  publication: (id) => `/admin/publications/edit/${id}`,
  post: (id) => `/admin/posts?edit=${id}`,
};

const PUBLIC_HREF: Record<ContentType, (meta: ContentMeta) => string | null> = {
  book: (m) => (m.slug ? `/books/${m.slug}` : null),
  research_report: (m) => `/theses/${m.slug ?? m.id}`,
  publication: (m) => (m.slug ? `/publications/${m.slug}` : null),
  post: (m) => (m.slug ? `/posts/${m.slug}` : null),
};

export async function getContentIntelligence(
  filters: DashboardFilters,
  table: { page: number; preset: ContentPreset; pageSize?: number; q?: string },
): Promise<ContentIntelligenceData> {
  const supabase = createServiceClient();
  const now = new Date();
  const win = buildWindow({ range: filters.range, from: filters.from, to: filters.to }, now);

  const [catalog, internalIds, viewRowsAll, readerRowsAll, downloadRowsAll, brokenRes] = await Promise.all([
    loadContentCatalog(supabase),
    getInternalUserIds(supabase),
    fetchViewRows(supabase, win),
    fetchReaderOpenRows(supabase, win),
    fetchDownloadRows(supabase, win),
    supabase.from("file_health").select("record_type, record_id").eq("status", "broken"),
  ]);

  const byId = new Map(catalog.map((c) => [`${c.type}:${c.id}`, c]));
  const passes = makeEventFilter(filters, byId);

  // Per-content aggregates.
  type Agg = { views: number; prevViews: number; viewers: Set<string>; opens: number; downloads: number };
  const aggs = new Map<string, Agg>();
  const aggOf = (key: string): Agg => {
    let a = aggs.get(key);
    if (!a) {
      a = { views: 0, prevViews: 0, viewers: new Set(), opens: 0, downloads: 0 };
      aggs.set(key, a);
    }
    return a;
  };
  for (const r of excludeInternal(viewRowsAll.filter(passes), internalIds)) {
    if (!r.contentId) continue;
    const a = aggOf(`${r.contentType}:${r.contentId}`);
    if (r.current) {
      a.views++;
      const id = r.userId ? `u:${r.userId}` : r.sessionHash ? `s:${r.sessionHash}` : null;
      if (id) a.viewers.add(id);
    } else {
      a.prevViews++;
    }
  }
  for (const r of excludeInternal((readerRowsAll ?? []).filter(passes), internalIds)) {
    if (r.contentId && r.current) aggOf(`${r.contentType}:${r.contentId}`).opens++;
  }
  for (const r of excludeInternal(downloadRowsAll.filter(passes), internalIds)) {
    if (r.contentId && r.current) aggOf(`${r.contentType}:${r.contentId}`).downloads++;
  }

  const brokenSet = new Set(
    ((brokenRes.data ?? []) as { record_type: string; record_id: string }[]).map(
      (r) => `${r.record_type === "research" ? "research_report" : r.record_type}:${r.record_id}`,
    ),
  );

  const allRows: ContentPerfRow[] = catalog
    .filter((c) => metaMatchesFilters(c, filters))
    .map((c) => {
      const a = aggs.get(`${c.type}:${c.id}`);
      const views = a?.views ?? 0;
      const opens = a?.opens ?? 0;
      const downloads = a?.downloads ?? 0;
      return {
        id: c.id,
        type: c.type,
        title: c.title,
        slug: c.slug,
        department: c.department,
        language: c.language,
        published: c.published,
        coverUrl: c.coverUrl,
        views,
        uniqueViewers: a?.viewers.size ?? 0,
        readerOpens: opens,
        downloads,
        conversionPct: pct(opens + downloads, views),
        delta: views - (a?.prevViews ?? 0),
        lifetimeViews: c.lifetimeViews,
        completeness: c.completeness,
        missing: c.missing,
        updatedAt: c.updatedAt ?? c.createdAt,
        editHref: EDIT_HREF[c.type](c.id),
        publicHref: PUBLIC_HREF[c.type](c),
      };
    });

  const preset = table.preset;
  // Optional title search (validated: trimmed, capped) applied before presets.
  const q = (table.q ?? "").trim().slice(0, 80).toLowerCase();
  let filtered = q
    ? allRows.filter((r) => r.title.toLowerCase().includes(q))
    : allRows;
  switch (preset) {
    case "needsAttention":
      filtered = filtered
        .filter((r) => r.published && (r.completeness < 100 || r.lifetimeViews === 0 || r.delta < 0))
        .sort((a, b) => a.completeness - b.completeness || a.views - b.views);
      break;
    case "top":
      filtered = [...filtered].sort((a, b) => b.views - a.views || b.downloads - a.downloads);
      break;
    case "rising":
      filtered = filtered.filter((r) => r.delta > 0).sort((a, b) => b.delta - a.delta);
      break;
    case "underperforming":
      filtered = filtered
        .filter((r) => r.published && r.delta < 0)
        .sort((a, b) => a.delta - b.delta);
      break;
    case "recent":
      filtered = [...filtered].sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
      break;
    case "neverViewed":
      filtered = filtered
        .filter((r) => r.published && r.lifetimeViews === 0 && r.views === 0)
        .sort((a, b) => (a.updatedAt ?? "").localeCompare(b.updatedAt ?? ""));
      break;
    case "highViewsLowOpens":
      filtered = filtered
        .filter((r) => r.views >= 10 && (r.conversionPct ?? 0) < 10)
        .sort((a, b) => b.views - a.views);
      break;
    case "openedNotDownloaded":
      filtered = filtered
        .filter((r) => r.readerOpens >= 5 && r.downloads / Math.max(1, r.readerOpens) < 0.1)
        .sort((a, b) => b.readerOpens - a.readerOpens);
      break;
    case "incompleteMetadata":
      filtered = filtered.filter((r) => r.completeness < 100).sort((a, b) => a.completeness - b.completeness);
      break;
  }

  const pageSize = Math.min(Math.max(table.pageSize ?? 12, 1), 10000);
  const total = filtered.length;
  const page = Math.max(1, Math.min(table.page, Math.max(1, Math.ceil(total / pageSize))));
  const rows = filtered.slice((page - 1) * pageSize, page * pageSize);

  // ── Departments (normalised) ──
  const deptMap = new Map<string, { resources: number; views: number; opens: number; downloads: number; neverViewed: number; complete: number }>();
  for (const c of catalog) {
    if (!c.published || !c.department) continue;
    if (filters.type !== "all" && c.type !== filters.type) continue;
    if (filters.lang !== "all" && c.language !== filters.lang) continue;
    const d = deptMap.get(c.department) ?? { resources: 0, views: 0, opens: 0, downloads: 0, neverViewed: 0, complete: 0 };
    d.resources++;
    const a = aggs.get(`${c.type}:${c.id}`);
    d.views += a?.views ?? 0;
    d.opens += a?.opens ?? 0;
    d.downloads += a?.downloads ?? 0;
    if (c.lifetimeViews === 0 && (a?.views ?? 0) === 0) d.neverViewed++;
    if (c.completeness === 100) d.complete++;
    deptMap.set(c.department, d);
  }
  const departments: DepartmentRow[] = [...deptMap.entries()]
    .map(([name, d]) => ({
      name,
      resources: d.resources,
      views: d.views,
      readerOpens: d.opens,
      downloads: d.downloads,
      viewsPerResource: perResource(d.views, d.resources),
      opensPerResource: perResource(d.opens, d.resources),
      downloadsPerResource: perResource(d.downloads, d.resources),
      conversionPct: pct(d.opens + d.downloads, d.views),
      neverViewedPct: pct(d.neverViewed, d.resources),
      completeMetaPct: pct(d.complete, d.resources),
    }))
    .sort((a, b) => b.views + b.downloads - (a.views + a.downloads));

  // ── Collection health (lifetime, unfiltered by period) ──
  const catalogBooksRes = await supabase
    .from("catalog_books")
    .select("id", { count: "exact", head: true })
    .eq("is_active", true);

  const published = catalog.filter((c) => c.published);
  const staleCutoff = new Date(now.getTime() - 30 * 86_400_000).toISOString();
  const health: CollectionHealthData = {
    totals: {
      books: catalog.filter((c) => c.type === "book").length,
      theses: catalog.filter((c) => c.type === "research_report").length,
      publications: catalog.filter((c) => c.type === "publication").length,
      posts: catalog.filter((c) => c.type === "post").length,
      catalog: catalogBooksRes.count ?? 0,
    },
    published: published.length,
    drafts: catalog.length - published.length,
    missingCover: published.filter((c) => c.missing.includes("cover")).length,
    missingDescription: published.filter((c) => c.missing.includes("description") || c.missing.includes("abstract") || c.missing.includes("excerpt")).length,
    missingAuthor: published.filter((c) => c.missing.includes("author")).length,
    missingDepartment: published.filter((c) => c.missing.includes("department")).length,
    missingLanguage: published.filter((c) => c.missing.includes("language")).length,
    missingIdentifier: published.filter((c) => c.missing.includes("isbn") || c.missing.includes("doi")).length,
    missingKeywords: published.filter((c) => c.missing.includes("keywords")).length,
    brokenFiles: brokenSet.size,
    neverViewed: published.filter((c) => c.lifetimeViews === 0).length,
    oldDrafts: catalog.filter((c) => !c.published && (c.createdAt ?? "") < staleCutoff).length,
    avgCompleteness:
      published.length > 0
        ? Math.round(published.reduce((s, c) => s + c.completeness, 0) / published.length)
        : null,
  };

  return {
    rangeLabel: win.label,
    rows,
    total,
    page,
    pageSize,
    preset,
    departments,
    health,
    generatedAt: now.toISOString(),
  };
}

// ── Search & AI ─────────────────────────────────────────────────────────────

export type QueryTableRow = {
  term: string;
  /** Majority query language, "km" | "en" | null. */
  lang: string | null;
  searches: number;
  prevSearches: number;
  avgResults: number | null;
  clicks: number;
  ctrPct: number | null;
  zero: boolean;
  noClick: boolean;
  trending: boolean;
  /** Deterministic test/automation heuristic — labelled, never hidden. */
  suspectedTest: boolean;
};

export type SearchAiData = {
  rangeLabel: string;
  search: {
    total: number;
    previousTotal: number;
    sessions: number | null;
    zeroRate: number | null;
    ctr: number | null;
    avgResults: number | null;
    kmSharePct: number | null;
    /** Searches per bucket (current period) + zero-result overlay. */
    trend: { date: string; searches: number; zeroResults: number }[];
    queryTable: QueryTableRow[];
  };
  ai: {
    total: number;
    okRate: number | null;
    failures: number;
    quotaHits: number;
    avgLatencyMs: number | null;
    byRoute: { route: string; count: number; okRate: number | null }[];
    collecting: boolean;
    /** Daily AI quota consumption from ai_usage (lifetime instrument). */
    usageDays: { date: string; count: number }[];
  };
  opportunities: { kind: "zeroResult" | "lowCoverage"; term: string; count: number; results: number | null }[];
  generatedAt: string;
};

export async function getSearchAiData(filters: DashboardFilters): Promise<SearchAiData> {
  const supabase = createServiceClient();
  const now = new Date();
  const win = buildWindow({ range: filters.range, from: filters.from, to: filters.to }, now);

  const [searchesRes, clicksRes, aiEventsRes, aiUsageRes, termActionsRes] = await Promise.all([
    supabase
      .from("search_queries")
      .select("normalized_term, searched_at, result_count, query_language, session_hash")
      .gte("searched_at", win.prevStart.toISOString())
      .lte("searched_at", win.end.toISOString())
      .limit(10000),
    supabase
      .from("search_result_clicks")
      .select("normalized_term, clicked_at")
      .gte("clicked_at", win.prevStart.toISOString())
      .lte("clicked_at", win.end.toISOString())
      .limit(10000),
    supabase
      .from("app_events")
      .select("status, route, latency_ms, created_at")
      .eq("kind", "ai_request")
      .gte("created_at", win.start.toISOString())
      .lte("created_at", win.end.toISOString()),
    supabase
      .from("ai_usage")
      .select("used_on, count")
      .gte("used_on", dayKey(win.start))
      .lte("used_on", dayKey(win.end))
      .limit(2000),
    // Terms a librarian already handled (dismissed/curated/…, migration
    // 0087). Errors (e.g. table not migrated yet) degrade to "none handled".
    supabase.from("search_term_actions").select("normalized_term").limit(2000),
  ]);
  const handledTerms = new Set(
    ((termActionsRes.data ?? []) as { normalized_term: string }[]).map((r) => r.normalized_term),
  );

  type SearchRow = {
    normalized_term: string;
    searched_at: string;
    result_count: number | null;
    query_language: string | null;
    session_hash: string | null;
  };
  const searches = ((searchesRes.data ?? []) as SearchRow[]).map((r) => ({
    ...r,
    current: rowIsCurrent(win, r.searched_at),
  }));
  const cur = searches.filter((s) => s.current);
  const prevRows = searches.filter((s) => !s.current);

  const withResultCount = cur.filter((s) => s.result_count !== null);
  const zeroCount = withResultCount.filter((s) => s.result_count === 0).length;

  const sessions = new Set(cur.map((s) => s.session_hash).filter(Boolean) as string[]);

  type ClickRow = { normalized_term: string; clicked_at: string };
  const clicks = ((clicksRes.data ?? []) as ClickRow[]).filter((c) => rowIsCurrent(win, c.clicked_at));
  const clicksByTerm = new Map<string, number>();
  for (const c of clicks) {
    clicksByTerm.set(c.normalized_term, (clicksByTerm.get(c.normalized_term) ?? 0) + 1);
  }

  type TermAgg = {
    count: number;
    zero: boolean;
    kmVotes: number;
    langVotes: number;
    resultSum: number;
    resultN: number;
  };
  const termCounts = new Map<string, TermAgg>();
  for (const s of cur) {
    const t = termCounts.get(s.normalized_term) ?? {
      count: 0, zero: true, kmVotes: 0, langVotes: 0, resultSum: 0, resultN: 0,
    };
    t.count++;
    if ((s.result_count ?? 1) > 0) t.zero = false;
    if (s.query_language) {
      t.langVotes++;
      if (s.query_language === "km") t.kmVotes++;
    }
    if (s.result_count !== null) {
      t.resultSum += s.result_count;
      t.resultN++;
    }
    termCounts.set(s.normalized_term, t);
  }
  const prevTermCounts = new Map<string, number>();
  for (const s of prevRows) {
    prevTermCounts.set(s.normalized_term, (prevTermCounts.get(s.normalized_term) ?? 0) + 1);
  }

  // One consolidated query table (replaces four separate term lists).
  const queryTable: QueryTableRow[] = [...termCounts.entries()]
    .map(([term, t]) => {
      const termClicks = clicksByTerm.get(term) ?? 0;
      const prevCount = prevTermCounts.get(term) ?? 0;
      return {
        term,
        lang: t.langVotes > 0 ? (t.kmVotes * 2 >= t.langVotes ? "km" : "en") : null,
        searches: t.count,
        prevSearches: prevCount,
        avgResults: t.resultN > 0 ? Math.round((t.resultSum / t.resultN) * 10) / 10 : null,
        clicks: termClicks,
        ctrPct: pct(termClicks, t.count),
        zero: t.zero,
        noClick: !t.zero && t.count >= 2 && termClicks === 0,
        trending: t.count >= 2 && t.count > prevCount,
        suspectedTest: isLikelyTestQuery(term),
      };
    })
    .sort((a, b) => b.searches - a.searches);

  const zeroQueries = queryTable.filter((r) => r.zero && !r.suspectedTest);

  const trendBuckets = new Map<string, { searches: number; zeroResults: number }>(
    win.bucketKeys.map((k) => [k, { searches: 0, zeroResults: 0 }]),
  );
  for (const s of cur) {
    const b = trendBuckets.get(win.keyOf(new Date(s.searched_at)));
    if (!b) continue;
    b.searches++;
    if (s.result_count === 0) b.zeroResults++;
  }
  const searchTrend = win.bucketKeys.map((k) => ({
    date: k,
    searches: trendBuckets.get(k)?.searches ?? 0,
    zeroResults: trendBuckets.get(k)?.zeroResults ?? 0,
  }));

  const kmCount = cur.filter((s) => s.query_language === "km").length;

  type AiRow = { status: string; route: string | null; latency_ms: number | null; created_at: string };
  const aiRows = (aiEventsRes.data ?? []) as AiRow[];
  const aiOk = aiRows.filter((r) => r.status === "ok").length;
  const aiFailures = aiRows.filter((r) => r.status === "error" || r.status === "timeout").length;
  const aiQuota = aiRows.filter((r) => r.status === "quota").length;
  const latencies = aiRows.map((r) => r.latency_ms).filter((v): v is number => v !== null);
  const byRouteMap = new Map<string, { count: number; ok: number }>();
  for (const r of aiRows) {
    const key = r.route ?? "unknown";
    const v = byRouteMap.get(key) ?? { count: 0, ok: 0 };
    v.count++;
    if (r.status === "ok") v.ok++;
    byRouteMap.set(key, v);
  }

  // Opportunities exclude suspected test/automation queries — those are
  // labelled in the query table but are not real collection demand — and
  // terms a librarian already handled (dismissed, acquired, curated, …).
  const opportunities: SearchAiData["opportunities"] = [];
  for (const row of zeroQueries) {
    if (row.searches >= 3 && !handledTerms.has(row.term)) {
      opportunities.push({ kind: "zeroResult", term: row.term, count: row.searches, results: 0 });
    }
  }
  for (const row of queryTable) {
    if (row.zero || row.suspectedTest || row.searches < 3 || handledTerms.has(row.term)) continue;
    if (row.avgResults !== null && row.avgResults <= 2) {
      opportunities.push({
        kind: "lowCoverage",
        term: row.term,
        count: row.searches,
        results: Math.round(row.avgResults),
      });
    }
  }
  opportunities.sort((a, b) => b.count - a.count);

  return {
    rangeLabel: win.label,
    search: {
      total: cur.length,
      previousTotal: prevRows.length,
      sessions: sessions.size > 0 ? sessions.size : null,
      zeroRate: pct(zeroCount, withResultCount.length),
      ctr: pct(clicks.length, cur.length),
      avgResults:
        withResultCount.length > 0
          ? Math.round(
              (withResultCount.reduce((s, r) => s + (r.result_count ?? 0), 0) / withResultCount.length) * 10,
            ) / 10
          : null,
      kmSharePct: pct(kmCount, cur.length),
      trend: searchTrend,
      queryTable: queryTable.slice(0, 60),
    },
    ai: {
      total: aiRows.length,
      okRate: pct(aiOk, aiRows.length),
      failures: aiFailures,
      quotaHits: aiQuota,
      avgLatencyMs:
        latencies.length > 0 ? Math.round(latencies.reduce((s, v) => s + v, 0) / latencies.length) : null,
      byRoute: [...byRouteMap.entries()]
        .map(([route, v]) => ({ route, count: v.count, okRate: pct(v.ok, v.count) }))
        .sort((a, b) => b.count - a.count),
      collecting: aiRows.length === 0,
      usageDays: ((aiUsageRes.data ?? []) as { used_on: string; count: number }[])
        .reduce((acc, r) => {
          const existing = acc.find((a) => a.date === r.used_on);
          if (existing) existing.count += r.count;
          else acc.push({ date: r.used_on, count: r.count });
          return acc;
        }, [] as { date: string; count: number }[])
        .sort((a, b) => (a.date < b.date ? -1 : 1)),
    },
    opportunities: opportunities.slice(0, 10),
    generatedAt: now.toISOString(),
  };
}

// ── Audience ────────────────────────────────────────────────────────────────

export type AudienceData = {
  rangeLabel: string;
  vsLabel: string;
  registrations: { series: TrendPoint[]; total: number; trend: TrendInfo | null };
  totalUsers: number;
  activeUsers: { current: number; previous: number };
  returningUsers: number;
  signedInViews: number;
  anonymousViews: number;
  /** Views by UI locale (en/km) — collecting until 0090 data accumulates. */
  localeSplit: { en: number; km: number; unknown: number };
  visitorCoverage: { identified: number; untracked: number };
  generatedAt: string;
};

export async function getAudienceData(filters: DashboardFilters): Promise<AudienceData> {
  const supabase = createServiceClient();
  const now = new Date();
  const win = buildWindow({ range: filters.range, from: filters.from, to: filters.to }, now);

  const [catalog, internalIds, viewRowsAll, readerRowsAll, downloadRowsAll, profilesRes, usersTotalRes] = await Promise.all([
    loadContentCatalog(supabase),
    getInternalUserIds(supabase),
    fetchViewRows(supabase, win),
    fetchReaderOpenRows(supabase, win),
    fetchDownloadRows(supabase, win),
    supabase
      .from("profiles")
      .select("id, created_at")
      .gte("created_at", win.prevStart.toISOString())
      .lte("created_at", win.end.toISOString()),
    supabase.from("profiles").select("*", { count: "exact", head: true }),
  ]);

  const byId = new Map(catalog.map((c) => [`${c.type}:${c.id}`, c]));
  const passes = makeEventFilter(filters, byId);
  // Audience activity metrics describe the public — staff events excluded.
  const viewRows = excludeInternal(viewRowsAll.filter(passes), internalIds);
  const activityRows = [
    ...viewRows,
    ...excludeInternal((readerRowsAll ?? []).filter(passes), internalIds),
    ...excludeInternal(downloadRowsAll.filter(passes), internalIds),
  ];

  type ProfileRow = { id: string; created_at: string };
  const signups = ((profilesRes.data ?? []) as ProfileRow[]).map((p) => ({
    bucketKey: win.keyOf(new Date(p.created_at)),
    count: 1,
    current: rowIsCurrent(win, p.created_at),
  }));
  const signupsNow = signups.filter((s) => s.current).length;
  const signupsPrev = signups.filter((s) => !s.current).length;

  // Active + returning signed-in users.
  const userDays = new Map<string, Set<string>>();
  const prevActive = new Set<string>();
  for (const r of activityRows) {
    if (!r.userId) continue;
    if (r.current) {
      const days = userDays.get(r.userId) ?? new Set<string>();
      days.add(dayKey(new Date(r.ts)));
      userDays.set(r.userId, days);
    } else {
      prevActive.add(r.userId);
    }
  }
  const returningUsers = [...userDays.values()].filter((days) => days.size >= 2).length;

  const curViews = viewRows.filter((r) => r.current);
  const signedInViews = curViews.filter((r) => r.userId).length;
  const anonymousViews = curViews.length - signedInViews;

  const localeSplit = { en: 0, km: 0, unknown: 0 };
  for (const r of curViews) {
    if (r.locale === "en") localeSplit.en++;
    else if (r.locale === "km") localeSplit.km++;
    else localeSplit.unknown++;
  }

  const coverage = uniqueVisitors(curViews.map((r) => ({ userId: r.userId, sessionHash: r.sessionHash })));

  return {
    rangeLabel: win.label,
    vsLabel: win.vsLabel,
    registrations: {
      series: trendSeries(signups, win),
      total: signupsNow,
      trend: filters.compare ? compareTrend(signupsNow, signupsPrev, win.vsLabel) : null,
    },
    totalUsers: usersTotalRes.count ?? 0,
    activeUsers: { current: userDays.size, previous: prevActive.size },
    returningUsers,
    signedInViews,
    anonymousViews,
    localeSplit,
    visitorCoverage: { identified: coverage.visitors, untracked: coverage.untracked },
    generatedAt: now.toISOString(),
  };
}

// ── System & operations (ADMIN_ROLES only — enforced by the caller) ────────

export type SystemData = {
  rangeLabel: string;
  appEvents: {
    kind: string;
    total: number;
    ok: number;
    errors: number;
    fallbacks: number;
    avgLatencyMs: number | null;
  }[];
  storage: {
    zimaOk: number;
    zimaErrors: number;
    r2Fallbacks: number;
    fallbackSharePct: number | null;
    collecting: boolean;
  };
  ai: { total: number; okRate: number | null; avgLatencyMs: number | null; quotaHits: number };
  opsEvents: { kind: string; status: string; createdAt: string; detail: Record<string, unknown> }[];
  backupAgeHours: number | null;
  brokenFiles: number;
  /** Edit page of the single broken record, or the data-quality dashboard. */
  brokenFilesHref: string;
  lastFileHealthCheckAt: string | null;
  recentAdminActions: { action: string; table: string; actor: string; createdAt: string }[];
  generatedAt: string;
};

export async function getSystemData(filters: DashboardFilters): Promise<SystemData> {
  const supabase = createServiceClient();
  const now = new Date();
  const win = buildWindow({ range: filters.range, from: filters.from, to: filters.to }, now);

  const [eventsRes, opsRes, brokenRes, healthLatestRes, auditRes] = await Promise.all([
    supabase
      .from("app_events")
      .select("kind, status, latency_ms")
      .gte("created_at", win.start.toISOString())
      .lte("created_at", win.end.toISOString())
      .limit(10000),
    supabase.from("ops_events").select("kind, status, detail, created_at").order("created_at", { ascending: false }).limit(10),
    supabase.from("file_health").select("record_type, record_id", { count: "exact" }).eq("status", "broken").limit(2),
    supabase.from("file_health").select("checked_at").order("checked_at", { ascending: false }).limit(1),
    supabase
      .from("admin_audit_log")
      .select("action, target_table, created_at, admin:profiles(full_name)")
      .order("created_at", { ascending: false })
      .limit(8),
  ]);

  type EventRow2 = { kind: string; status: string; latency_ms: number | null };
  const events = (eventsRes.data ?? []) as EventRow2[];

  const kinds = new Map<string, { total: number; ok: number; errors: number; fallbacks: number; latencies: number[] }>();
  for (const e of events) {
    const v = kinds.get(e.kind) ?? { total: 0, ok: 0, errors: 0, fallbacks: 0, latencies: [] };
    v.total++;
    if (e.status === "ok") v.ok++;
    if (e.status === "error" || e.status === "timeout") v.errors++;
    if (e.status === "fallback") v.fallbacks++;
    if (e.latency_ms !== null) v.latencies.push(e.latency_ms);
    kinds.set(e.kind, v);
  }
  const avg = (nums: number[]) => (nums.length > 0 ? Math.round(nums.reduce((s, v) => s + v, 0) / nums.length) : null);

  const storage = kinds.get("storage_operation");
  const ai = kinds.get("ai_request");

  type OpsRow = { kind: string; status: string; detail: Record<string, unknown>; created_at: string };
  const ops = (opsRes.data ?? []) as OpsRow[];
  const lastBackup = ops.find((o) => o.kind === "backup_db" && o.status === "ok");
  const backupAgeHours = lastBackup
    ? Math.round((now.getTime() - new Date(lastBackup.created_at).getTime()) / 3_600_000)
    : null;

  type AuditRow = {
    action: string;
    target_table: string;
    created_at: string;
    admin: { full_name: string | null } | { full_name: string | null }[] | null;
  };

  return {
    rangeLabel: win.label,
    appEvents: [...kinds.entries()].map(([kind, v]) => ({
      kind,
      total: v.total,
      ok: v.ok,
      errors: v.errors,
      fallbacks: v.fallbacks,
      avgLatencyMs: avg(v.latencies),
    })),
    storage: {
      zimaOk: storage?.ok ?? 0,
      zimaErrors: storage?.errors ?? 0,
      r2Fallbacks: storage?.fallbacks ?? 0,
      fallbackSharePct: storage ? pct(storage.fallbacks, storage.total) : null,
      collecting: !storage,
    },
    ai: {
      total: ai?.total ?? 0,
      okRate: ai ? pct(ai.ok, ai.total) : null,
      avgLatencyMs: ai ? avg(ai.latencies) : null,
      quotaHits: events.filter((e) => e.kind === "ai_request" && e.status === "quota").length,
    },
    opsEvents: ops.map((o) => ({ kind: o.kind, status: o.status, createdAt: o.created_at, detail: o.detail ?? {} })),
    backupAgeHours,
    brokenFiles: brokenRes.count ?? 0,
    brokenFilesHref: brokenFileFixHref(
      brokenRes.count ?? 0,
      (brokenRes.data ?? []) as { record_type: string; record_id: string }[],
    ),
    lastFileHealthCheckAt:
      ((healthLatestRes.data ?? []) as { checked_at: string }[])[0]?.checked_at ?? null,
    recentAdminActions: ((auditRes.data ?? []) as AuditRow[]).map((r) => {
      const admin = Array.isArray(r.admin) ? r.admin[0] : r.admin;
      return {
        action: r.action,
        table: r.target_table,
        actor: admin?.full_name ?? "Admin",
        createdAt: r.created_at,
      };
    }),
    generatedAt: now.toISOString(),
  };
}

// ── Department list for the toolbar filter ──────────────────────────────────

export async function getDepartmentOptions(): Promise<string[]> {
  const supabase = createServiceClient();
  const [booksRes, deptsRes] = await Promise.all([
    supabase.from("books").select("department").not("department", "is", null),
    supabase.from("departments").select("name"),
  ]);
  const names = new Set<string>();
  for (const r of (booksRes.data ?? []) as { department: string | null }[]) {
    const d = r.department?.trim();
    if (d) names.add(d);
  }
  for (const r of (deptsRes.data ?? []) as { name: string | null }[]) {
    const d = r.name?.trim();
    if (d) names.add(d);
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}

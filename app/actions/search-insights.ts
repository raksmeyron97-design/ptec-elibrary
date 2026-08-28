"use server";

// Collection-development signal: what are people searching for that the
// library genuinely doesn't have? (migration 0064_search_result_count.sql)
//
// The action side (migration 0087_search_governance.sql) lets librarians
// respond to zero-result terms: mark reviewed/spam, add synonyms or curated
// results (the only path by which analytics may influence search behavior),
// and raise acquisition requests into the existing book_requests workflow.

import { requireLibrarian } from "@/lib/auth/requireAdmin";
import { logAdminAction } from "@/app/actions/audit";
import {
  groupEquivalentTerms,
  normalizeSearchTerm,
  suggestCorrections,
} from "@/lib/search/analytics";
import { buildCsv } from "@/lib/admin/activity-log-shared";
import {
  computeKpis,
  languageOf,
  paginate,
  rangeBounds,
  resolveRangeWindow,
  EMPTY_SUMMARY,
  MAX_ZERO_RESULT_GROUPS,
  type PaginatedResult,
  type SearchInsightsFilters,
  type SearchKpis,
  type SearchSummaryCounts,
} from "@/lib/admin/search-insights-shared";
import { revalidateLocalizedPath as revalidatePath } from "@/lib/cache/revalidate";

export interface SearchAnalyticsTerm {
  term: string;
  count: number;
  lastSearchedAt?: string;
}

export interface SearchTrendPoint {
  /** Bucket start, YYYY-MM-DD. */
  date: string;
  searches: number;
  noResults: number;
  clicks: number;
}

export interface SearchInsightsOverview {
  kpis: SearchKpis;
  /** Same shape over the immediately preceding window, or null when off. */
  previousKpis: SearchKpis | null;
  trend: SearchTrendPoint[];
  bucketDays: number;
  topTerms: SearchAnalyticsTerm[];
  zeroResultTerms: SearchAnalyticsTerm[];
  clickedResults: Array<SearchAnalyticsTerm & { url: string; type: string }>;
  languageUsage: { km: number; en: number; other: number };
  /** Window actually used, so the UI can state the period it is describing. */
  window: { since: string; until: string; days: number };
  generatedAt: string;
  /** False when migration 0121 has not been applied — the page says so. */
  aggregatesAvailable: boolean;
}

type SearchRow = {
  term: string;
  normalized_term?: string | null;
  searched_at: string;
  result_count?: number | null;
  query_language?: string | null;
  resource_type?: string | null;
};

type Supabase = Awaited<ReturnType<typeof requireLibrarian>>["supabase"];

/** PostgREST codes meaning "this function/table/column is not deployed yet". */
const MISSING_CODES = new Set(["42883", "42P01", "42703", "PGRST202", "PGRST204"]);

function isMissing(error: { code?: string } | null): boolean {
  return Boolean(error?.code && MISSING_CODES.has(error.code));
}

/**
 * Fallback scan, used only when migration 0121 is not applied yet.
 *
 * This is the OLD behaviour, kept deliberately so an un-migrated environment
 * still renders a dashboard instead of an error — but it is capped, and the
 * cap is now reported to the UI rather than being silently presented as a
 * total. Everything above this line prefers the SQL aggregates.
 */
const FALLBACK_SCAN_LIMIT = 5000;

async function fallbackRows(supabase: Supabase, since: string, until: string): Promise<SearchRow[]> {
  const columns = [
    "term, normalized_term, searched_at, result_count, query_language, resource_type",
    "term, normalized_term, searched_at, result_count",
    "term, normalized_term, searched_at",
  ];
  for (const select of columns) {
    const { data, error } = await supabase
      .from("search_queries")
      .select(select)
      .gte("searched_at", since)
      .lt("searched_at", until)
      .order("searched_at", { ascending: false })
      .limit(FALLBACK_SCAN_LIMIT);
    if (!error) return (data ?? []) as unknown as SearchRow[];
    if (error.code !== "42703") break;
  }
  return [];
}

async function summaryFor(
  supabase: Supabase,
  since: string,
  until: string,
): Promise<{ counts: SearchSummaryCounts; viaAggregate: boolean }> {
  const { data, error } = await supabase
    .rpc("search_analytics_summary", { p_since: since, p_until: until })
    .maybeSingle<{
      total_searches: number;
      zero_result_searches: number;
      unknown_result_searches: number;
      clicks: number;
      km_searches: number;
      en_searches: number;
      other_searches: number;
    }>();

  if (!error && data) {
    return {
      viaAggregate: true,
      counts: {
        totalSearches: Number(data.total_searches ?? 0),
        zeroResultSearches: Number(data.zero_result_searches ?? 0),
        unknownResultSearches: Number(data.unknown_result_searches ?? 0),
        clicks: Number(data.clicks ?? 0),
        km: Number(data.km_searches ?? 0),
        en: Number(data.en_searches ?? 0),
        other: Number(data.other_searches ?? 0),
      },
    };
  }
  if (error && !isMissing(error)) console.error("[search_analytics_summary]", error.message);

  const rows = await fallbackRows(supabase, since, until);
  const counts = { ...EMPTY_SUMMARY, totalSearches: rows.length };
  for (const row of rows) {
    if (row.result_count === 0) counts.zeroResultSearches += 1;
    else if (row.result_count === null || row.result_count === undefined) counts.unknownResultSearches += 1;
    counts[languageOf(row.query_language, row.term)] += 1;
  }
  const { count } = await supabase
    .from("search_result_clicks")
    .select("id", { count: "exact", head: true })
    .gte("clicked_at", since)
    .lt("clicked_at", until);
  counts.clicks = count ?? 0;
  return { counts, viaAggregate: false };
}

async function trendFor(
  supabase: Supabase,
  since: string,
  until: string,
  bucketDays: number,
): Promise<SearchTrendPoint[]> {
  const { data, error } = await supabase.rpc("search_analytics_trend", {
    p_since: since,
    p_until: until,
    p_bucket_days: bucketDays,
  });
  if (!error && Array.isArray(data)) {
    return (data as Array<{ bucket: string; searches: number; zero_results: number; clicks: number }>).map((row) => ({
      date: row.bucket,
      searches: Number(row.searches ?? 0),
      noResults: Number(row.zero_results ?? 0),
      clicks: Number(row.clicks ?? 0),
    }));
  }
  if (error && !isMissing(error)) console.error("[search_analytics_trend]", error.message);

  // Fallback: bucket the capped scan in Node.
  const rows = await fallbackRows(supabase, since, until);
  const buckets = new Map<string, SearchTrendPoint>();
  const startMs = Date.parse(since);
  for (const row of rows) {
    const offset = Math.floor((Date.parse(row.searched_at) - startMs) / 86_400_000 / bucketDays) * bucketDays;
    const key = new Date(startMs + offset * 86_400_000).toISOString().slice(0, 10);
    const bucket = buckets.get(key) ?? { date: key, searches: 0, noResults: 0, clicks: 0 };
    bucket.searches += 1;
    if (row.result_count === 0) bucket.noResults += 1;
    buckets.set(key, bucket);
  }
  return [...buckets.values()].sort((a, b) => a.date.localeCompare(b.date));
}

async function topTermsFor(
  supabase: Supabase,
  since: string,
  until: string,
  onlyZero: boolean,
  limit: number,
): Promise<SearchAnalyticsTerm[]> {
  const { data, error } = await supabase.rpc("search_analytics_top_terms", {
    p_since: since,
    p_until: until,
    p_only_zero: onlyZero,
    p_limit: limit,
  });
  if (!error && Array.isArray(data)) {
    return (data as Array<{ term: string; searches: number; last_searched_at: string }>).map((row) => ({
      term: row.term,
      count: Number(row.searches ?? 0),
      lastSearchedAt: row.last_searched_at,
    }));
  }
  if (error && !isMissing(error)) console.error("[search_analytics_top_terms]", error.message);

  const rows = await fallbackRows(supabase, since, until);
  const byTerm = new Map<string, SearchAnalyticsTerm>();
  for (const row of rows) {
    const measurable = row.result_count ?? 1;
    if (onlyZero ? measurable !== 0 : measurable <= 0) continue;
    const key = row.normalized_term || normalizeSearchTerm(row.term);
    if (!key) continue;
    const existing = byTerm.get(key);
    if (existing) {
      existing.count += 1;
      if (!existing.lastSearchedAt || row.searched_at > existing.lastSearchedAt) {
        existing.lastSearchedAt = row.searched_at;
      }
    } else {
      byTerm.set(key, { term: row.term, count: 1, lastSearchedAt: row.searched_at });
    }
  }
  return [...byTerm.values()].sort((a, b) => b.count - a.count).slice(0, limit);
}

async function clickedResultsFor(
  supabase: Supabase,
  since: string,
  until: string,
  limit: number,
): Promise<Array<SearchAnalyticsTerm & { url: string; type: string }>> {
  const { data, error } = await supabase.rpc("search_analytics_clicked_results", {
    p_since: since,
    p_until: until,
    p_limit: limit,
  });
  if (!error && Array.isArray(data)) {
    return (data as Array<{ result_url: string; result_type: string; result_title: string | null; clicks: number; last_clicked_at: string }>)
      .map((row) => ({
        term: row.result_title || row.result_url,
        url: row.result_url,
        type: row.result_type,
        count: Number(row.clicks ?? 0),
        lastSearchedAt: row.last_clicked_at,
      }));
  }
  if (error && !isMissing(error)) console.error("[search_analytics_clicked_results]", error.message);
  return [];
}

/**
 * Everything above the tables: KPIs, the comparison window, the activity
 * trend, the ranked term lists and the language split.
 *
 * One window drives all of it (lib/admin/search-insights-shared.ts), which is
 * the behavioural change from the previous version — that one ran the KPIs
 * over the selected period but the monthly trend over a separate hard-coded
 * 180 days, so a card and the chart beneath it described different periods.
 */
export async function getSearchInsightsOverview(
  filters: SearchInsightsFilters,
): Promise<SearchInsightsOverview> {
  const { supabase } = await requireLibrarian();
  const window = resolveRangeWindow(filters);

  const [current, trend, topTerms, zeroResultTerms, clickedResults, previous] = await Promise.all([
    summaryFor(supabase, window.since, window.until),
    trendFor(supabase, window.since, window.until, window.bucketDays),
    topTermsFor(supabase, window.since, window.until, false, 10),
    topTermsFor(supabase, window.since, window.until, true, 10),
    clickedResultsFor(supabase, window.since, window.until, 10),
    filters.compare
      ? summaryFor(supabase, window.previousSince, window.previousUntil)
      : Promise.resolve(null),
  ]);

  return {
    kpis: computeKpis(current.counts, window.days),
    previousKpis: previous ? computeKpis(previous.counts, window.days) : null,
    trend,
    bucketDays: window.bucketDays,
    topTerms,
    zeroResultTerms,
    clickedResults,
    languageUsage: { km: current.counts.km, en: current.counts.en, other: current.counts.other },
    window: { since: window.since, until: window.until, days: window.days },
    generatedAt: new Date().toISOString(),
    aggregatesAvailable: current.viaAggregate,
  };
}

// ── Zero-result workspace ────────────────────────────────────────────────────

export type TermActionKind =
  | "reviewed"
  | "ignored"
  | "acquisition"
  | "synonym"
  | "curated"
  | "redirect";

export interface ZeroResultEntry {
  /** Most frequent raw spelling in the group (display value). */
  term: string;
  /** Normalized representative used as the action key. */
  normalizedTerm: string;
  /** All raw variants folded into this group (case/typo variants). */
  variants: string[];
  count: number;
  lastSearchedAt: string;
  language: "km" | "en" | "other";
  /** Share of the group's searches that had filters active. */
  withFilters: boolean;
  /** Existing librarian action on this term, if any. */
  action: { kind: TermActionKind; note: string | null; actedAt: string } | null;
  /** Spelling suggestions drawn from catalog titles/subjects. */
  suggestions: string[];
  /** Active synonym mapping, when one exists. */
  synonyms: string[];
}

export interface ZeroResultWorkspace extends PaginatedResult<ZeroResultEntry> {
  /** Counts per status across the whole window, for the filter chips. */
  statusCounts: Record<"all" | "needsReview" | TermActionKind, number>;
  /** True when the window produced more groups than we hydrate at once. */
  truncated: boolean;
}

async function fetchVocabulary(supabase: Supabase): Promise<string[]> {
  const [books, theses, categories] = await Promise.all([
    supabase.from("books").select("title").eq("is_published", true).limit(400),
    supabase.from("research_reports").select("title").eq("is_published", true).limit(300),
    supabase.from("categories").select("name").limit(100),
  ]);
  return [
    ...(books.data ?? []).map((r: { title: string }) => r.title),
    ...(theses.data ?? []).map((r: { title: string }) => r.title),
    ...(categories.data ?? []).map((r: { name: string }) => r.name),
  ].filter(Boolean);
}

type ZeroGroup = { normalized_term: string; term: string; searches: number; filtered_searches: number; last_searched_at: string };

async function zeroResultGroups(supabase: Supabase, since: string, until: string): Promise<ZeroGroup[]> {
  const { data, error } = await supabase.rpc("search_analytics_zero_result_groups", {
    p_since: since,
    p_until: until,
    p_limit: MAX_ZERO_RESULT_GROUPS,
  });
  if (!error && Array.isArray(data)) return data as ZeroGroup[];
  if (error && !isMissing(error)) console.error("[search_analytics_zero_result_groups]", error.message);

  // Fallback: collapse the capped scan in Node (the pre-0121 behaviour).
  const { data: rows } = await supabase
    .from("search_queries")
    .select("term, normalized_term, searched_at, resource_type, sort")
    .eq("result_count", 0)
    .gte("searched_at", since)
    .lt("searched_at", until)
    .order("searched_at", { ascending: false })
    .limit(4000);
  const byNorm = new Map<string, ZeroGroup>();
  for (const row of (rows ?? []) as Array<{ term: string; normalized_term: string | null; searched_at: string; resource_type: string | null; sort: string | null }>) {
    const key = row.normalized_term || normalizeSearchTerm(row.term);
    if (!key) continue;
    const filtered = Boolean(
      (row.resource_type && row.resource_type !== "all") || (row.sort && row.sort !== "relevance"),
    );
    const current = byNorm.get(key);
    if (current) {
      current.searches += 1;
      if (filtered) current.filtered_searches += 1;
      if (row.searched_at > current.last_searched_at) current.last_searched_at = row.searched_at;
    } else {
      byNorm.set(key, {
        normalized_term: key,
        term: row.term,
        searches: 1,
        filtered_searches: filtered ? 1 : 0,
        last_searched_at: row.searched_at,
      });
    }
  }
  return [...byNorm.values()].sort((a, b) => b.searches - a.searches);
}

/**
 * The zero-result workspace: grouped, annotated, filtered, sorted, paginated.
 *
 * The database collapses potentially tens of thousands of raw rows into a few
 * hundred distinct terms (the expensive half). Typo-variant folding, the
 * status/language/text filters and pagination then run over that small set —
 * `groupEquivalentTerms` is edit-distance work that has no SQL equivalent
 * here, and at a few hundred groups it is cheap.
 */
export async function getZeroResultWorkspace(
  filters: SearchInsightsFilters,
): Promise<ZeroResultWorkspace> {
  const { supabase } = await requireLibrarian();
  const window = resolveRangeWindow(filters);

  const raw = await zeroResultGroups(supabase, window.since, window.until);
  const byNorm = new Map(raw.map((group) => [group.normalized_term, group]));

  const grouped = groupEquivalentTerms(raw.map((group) => ({ term: group.term, count: group.searches })));

  const [actionsRes, synonymsRes, vocabulary] = await Promise.all([
    supabase.from("search_term_actions").select("normalized_term, action, note, acted_at"),
    supabase.from("search_synonyms").select("term, synonyms").eq("is_active", true),
    fetchVocabulary(supabase),
  ]);
  // 42P01 = governance tables not created yet (0087 pending) — still renders.
  const actions = new Map(
    (actionsRes.data ?? []).map((a: { normalized_term: string; action: TermActionKind; note: string | null; acted_at: string }) => [
      a.normalized_term,
      { kind: a.action, note: a.note, actedAt: a.acted_at },
    ]),
  );
  const synonyms = new Map(
    (synonymsRes.data ?? []).map((s: { term: string; synonyms: string[] }) => [s.term, s.synonyms]),
  );

  const entries: ZeroResultEntry[] = [];
  for (const [normKey, group] of grouped) {
    const meta = byNorm.get(normKey) ?? byNorm.get(normalizeSearchTerm(group.terms[0]));
    const filtered = group.terms.reduce(
      (sum, term) => sum + (byNorm.get(normalizeSearchTerm(term))?.filtered_searches ?? 0),
      0,
    );
    const last = group.terms
      .map((term) => byNorm.get(normalizeSearchTerm(term))?.last_searched_at ?? "")
      .sort()
      .pop() || meta?.last_searched_at || "";
    entries.push({
      term: group.terms[0],
      normalizedTerm: normKey,
      variants: group.terms,
      count: group.count,
      lastSearchedAt: last,
      language: languageOf(null, normKey),
      withFilters: filtered > 0,
      action: actions.get(normKey) ?? null,
      suggestions: suggestCorrections(normKey, vocabulary).map((s) => s.suggestion),
      synonyms: synonyms.get(normKey) ?? [],
    });
  }

  const statusCounts = {
    all: entries.length,
    needsReview: 0,
    reviewed: 0,
    ignored: 0,
    acquisition: 0,
    synonym: 0,
    curated: 0,
    redirect: 0,
  };
  for (const entry of entries) {
    if (entry.action) statusCounts[entry.action.kind] += 1;
    else statusCounts.needsReview += 1;
  }

  const needle = filters.q.toLowerCase();
  const filteredEntries = entries.filter((entry) => {
    if (filters.lang !== "all" && entry.language !== filters.lang) return false;
    if (filters.status === "needsReview" && entry.action) return false;
    if (filters.status !== "all" && filters.status !== "needsReview" && entry.action?.kind !== filters.status) return false;
    if (needle && !entry.term.toLowerCase().includes(needle)
      && !entry.variants.some((variant) => variant.toLowerCase().includes(needle))) return false;
    return true;
  });

  const sorted = [...filteredEntries].sort((a, b) => {
    if (filters.sort === "recent") return b.lastSearchedAt.localeCompare(a.lastSearchedAt);
    if (filters.sort === "term") return a.term.localeCompare(b.term);
    return b.count - a.count || b.lastSearchedAt.localeCompare(a.lastSearchedAt);
  });

  return {
    ...paginate(sorted, filters.page, filters.size),
    statusCounts,
    truncated: raw.length >= MAX_ZERO_RESULT_GROUPS,
  };
}

// ── Detailed search activity ─────────────────────────────────────────────────

export interface SearchActivityRow {
  id: string;
  term: string;
  resultCount: number | null;
  language: "km" | "en" | "other";
  resourceType: string | null;
  searchedAt: string;
}

/**
 * Row-level search log, paginated IN THE DATABASE.
 *
 * PostgREST's `range()` plus an exact count gives true server-side paging, so
 * page 40 costs the same as page 1 and the browser never holds more than one
 * page. Nothing here reads a `.limit(5000)` and slices it afterwards.
 */
export async function getSearchActivityPage(
  filters: SearchInsightsFilters,
): Promise<PaginatedResult<SearchActivityRow> & { available: boolean }> {
  const { supabase } = await requireLibrarian();
  const window = resolveRangeWindow(filters);
  const { from, to } = rangeBounds(filters.apage, filters.asize);

  let query = supabase
    .from("search_queries")
    .select("id, term, result_count, query_language, resource_type, searched_at", { count: "exact" })
    .gte("searched_at", window.since)
    .lt("searched_at", window.until);

  if (filters.astatus === "noResults") query = query.eq("result_count", 0);
  if (filters.astatus === "results") query = query.gt("result_count", 0);
  if (filters.alang === "km" || filters.alang === "en") query = query.eq("query_language", filters.alang);
  if (filters.alang === "other") query = query.not("query_language", "in", "(km,en)");
  if (filters.atype !== "all") query = query.eq("resource_type", filters.atype);
  // Strip LIKE metacharacters rather than escaping them: PostgREST gives no
  // ESCAPE clause, and a stray "%" from the search box would otherwise turn a
  // term filter into a full-table wildcard.
  const termNeedle = filters.aq.replace(/[%_]/g, " ").trim();
  if (termNeedle) query = query.ilike("term", "%" + termNeedle + "%");

  const { data, error, count } = await query
    .order("searched_at", { ascending: false })
    .range(from, to);

  if (error) {
    if (!isMissing(error)) console.error("[getSearchActivityPage]", error.message);
    return { items: [], page: 1, pageSize: filters.asize, total: 0, totalPages: 1, available: false };
  }

  const total = count ?? 0;
  const rows = (data ?? []) as Array<{
    id: string;
    term: string;
    result_count: number | null;
    query_language: string | null;
    resource_type: string | null;
    searched_at: string;
  }>;

  return {
    items: rows.map((row) => ({
      id: row.id,
      term: row.term,
      resultCount: row.result_count,
      language: languageOf(row.query_language, row.term),
      resourceType: row.resource_type,
      searchedAt: row.searched_at,
    })),
    page: Math.max(1, filters.apage),
    pageSize: filters.asize,
    total,
    totalPages: Math.max(1, Math.ceil(total / filters.asize)),
    available: true,
  };
}

export type ExportSearchActivityInput = Pick<
  SearchInsightsFilters,
  "range" | "from" | "to" | "aq" | "alang" | "astatus" | "atype"
>;

/** Rows a single export may contain — a spreadsheet, not a data-warehouse dump. */
const EXPORT_ROW_LIMIT = 5000;

/**
 * CSV of the detailed search log matching the CURRENT filters — export ==
 * what's on screen, minus pagination. Server-generated (never a client-side
 * dump of a large `.limit()` fetch) and capped at `EXPORT_ROW_LIMIT`; a
 * truncated export says so in its own row rather than silently under-counting.
 */
export async function exportSearchActivity(
  filters: ExportSearchActivityInput,
): Promise<{ ok: true; csv: string; filename: string; rows: number } | { ok: false; error: string }> {
  const { supabase, user } = await requireLibrarian();
  const window = resolveRangeWindow({ ...filters, compare: false, q: "", lang: "all", status: "all", sort: "count", page: 1, size: 10, apage: 1, asize: 10 });

  let query = supabase
    .from("search_queries")
    .select("term, result_count, query_language, resource_type, searched_at")
    .gte("searched_at", window.since)
    .lt("searched_at", window.until);

  if (filters.astatus === "noResults") query = query.eq("result_count", 0);
  if (filters.astatus === "results") query = query.gt("result_count", 0);
  if (filters.alang === "km" || filters.alang === "en") query = query.eq("query_language", filters.alang);
  if (filters.alang === "other") query = query.not("query_language", "in", "(km,en)");
  if (filters.atype !== "all") query = query.eq("resource_type", filters.atype);
  const termNeedle = filters.aq.replace(/[%_]/g, " ").trim();
  if (termNeedle) query = query.ilike("term", "%" + termNeedle + "%");

  const { data, error } = await query
    .order("searched_at", { ascending: false })
    .limit(EXPORT_ROW_LIMIT);

  if (error) return { ok: false, error: isMissing(error) ? "empty" : error.message };

  const rows = (data ?? []) as Array<{
    term: string;
    result_count: number | null;
    query_language: string | null;
    resource_type: string | null;
    searched_at: string;
  }>;
  if (rows.length === 0) return { ok: false, error: "empty" };

  const headers = ["Query", "Results", "Language", "Resource type", "Searched at (UTC)"];
  const csv = buildCsv(
    headers,
    rows.map((row) => [
      row.term,
      row.result_count ?? "",
      languageOf(row.query_language, row.term),
      row.resource_type ?? "",
      row.searched_at,
    ]),
  );
  const filename = `ptec-search-activity-${new Date().toISOString().slice(0, 10)}.csv`;

  await logAdminAction(user.id, "search_insights.export", "search_queries", undefined, {
    rows: rows.length,
    range: filters.range,
    truncated: rows.length >= EXPORT_ROW_LIMIT,
  });

  return { ok: true, csv, filename, rows: rows.length };
}

/** Distinct resource-type values actually present, for the type filter. */
export async function getSearchResourceTypes(): Promise<string[]> {
  const { supabase } = await requireLibrarian();
  const { data, error } = await supabase
    .from("search_queries")
    .select("resource_type")
    .not("resource_type", "is", null)
    .limit(1000);
  if (error) return [];
  const seen = new Set<string>();
  for (const row of (data ?? []) as Array<{ resource_type: string | null }>) {
    if (row.resource_type && row.resource_type !== "all") seen.add(row.resource_type);
  }
  return [...seen].sort();
}

// ── Zero-result action center (0087) ─────────────────────────────────────

// Mutations below. The zero-result *report* now lives above in
// getZeroResultWorkspace(); these are the librarian responses to it.

type ActionResult = { success: true } | { error: string };

function migrationHint(error: { code?: string; message: string }): string {
  return error.code === "42P01"
    ? "Search-governance tables missing — apply migration 0087 first"
    : error.message;
}

function isSafeInternalUrl(value: string): boolean {
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return false;
  try {
    const parsed = new URL(value, "https://library.invalid");
    return parsed.origin === "https://library.invalid";
  } catch {
    return false;
  }
}

/** Mark a zero-result term as handled (reviewed / spam-ignored / etc.). */
export async function actOnSearchTerm(
  term: string,
  kind: TermActionKind,
  note?: string,
): Promise<ActionResult> {
  try {
    const { supabase, user } = await requireLibrarian();
    const normalized = normalizeSearchTerm(term);
    if (!normalized) return { error: "Empty term" };
    const { error } = await supabase.from("search_term_actions").upsert({
      normalized_term: normalized,
      action: kind,
      note: note?.trim() || null,
      acted_by: user.id,
      acted_at: new Date().toISOString(),
    });
    if (error) return { error: migrationHint(error) };
    await logAdminAction(user.id, `search_term.${kind}`, "search_term_actions", normalized, { note });
    revalidatePath("/admin/search-insights");
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Action failed" };
  }
}

/**
 * Create a reviewed synonym mapping. This is the only way analytics data can
 * influence live search: the mapping fires solely when the original term
 * finds zero results (see /api/search/native).
 */
export async function addSearchSynonym(
  term: string,
  synonymList: string[],
  note?: string,
): Promise<ActionResult> {
  try {
    const { supabase, user } = await requireLibrarian();
    const normalized = normalizeSearchTerm(term);
    const cleaned = [
      ...new Set(synonymList.flatMap((synonym) => {
        const value = synonym.trim();
        return value ? [value] : [];
      })),
    ].slice(0, 5);
    if (!normalized || cleaned.length === 0) return { error: "Provide the term and at least one synonym" };

    const { error } = await supabase.from("search_synonyms").upsert(
      {
        term: normalized,
        synonyms: cleaned,
        locale: /[ក-៿]/.test(normalized) ? "km" : "en",
        is_active: true,
        note: note?.trim() || null,
        created_by: user.id,
      },
      { onConflict: "term" },
    );
    if (error) return { error: migrationHint(error) };

    await supabase.from("search_term_actions").upsert({
      normalized_term: normalized,
      action: "synonym",
      note: `→ ${cleaned.join(", ")}`,
      acted_by: user.id,
      acted_at: new Date().toISOString(),
    });
    await logAdminAction(user.id, "search_term.synonym", "search_synonyms", normalized, { synonyms: cleaned });
    revalidatePath("/admin/search-insights");
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Action failed" };
  }
}

/** Pin a curated result for a term (shown ahead of organic results). */
export async function addCuratedSearchResult(
  term: string,
  result: { type: "book" | "thesis" | "publication" | "post" | "page"; url: string; title: string },
): Promise<ActionResult> {
  try {
    const { supabase, user } = await requireLibrarian();
    const normalized = normalizeSearchTerm(term);
    const url = result.url.trim();
    if (!normalized || !isSafeInternalUrl(url) || !result.title.trim()) {
      return { error: "Provide the term, an internal URL (starting with /), and a title" };
    }
    const { error } = await supabase.from("search_curated_results").upsert(
      {
        term: normalized,
        result_type: result.type,
        result_url: url,
        result_title: result.title.trim(),
        is_active: true,
        created_by: user.id,
      },
      { onConflict: "term,result_url" },
    );
    if (error) return { error: migrationHint(error) };

    await supabase.from("search_term_actions").upsert({
      normalized_term: normalized,
      action: "curated",
      note: `→ ${url}`,
      acted_by: user.id,
      acted_at: new Date().toISOString(),
    });
    await logAdminAction(user.id, "search_term.curated", "search_curated_results", normalized, { url });
    revalidatePath("/admin/search-insights");
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Action failed" };
  }
}

/** Raise a zero-result term into the existing book-requests workflow. */
export async function createAcquisitionRequest(term: string, actionTerm = term): Promise<ActionResult> {
  try {
    const { supabase, user } = await requireLibrarian();
    const normalized = normalizeSearchTerm(actionTerm);
    if (!normalized) return { error: "Empty term" };

    const { error } = await supabase.from("book_requests").insert({
      user_id: user.id,
      title: term.trim(),
      reason: "Raised from zero-result search analytics (/admin/search-insights)",
      status: "pending",
    });
    if (error) return { error: error.message };

    // Best-effort marker; the book request itself is the durable record.
    await supabase.from("search_term_actions").upsert({
      normalized_term: normalized,
      action: "acquisition",
      note: "Book request created",
      acted_by: user.id,
      acted_at: new Date().toISOString(),
    });
    await logAdminAction(user.id, "search_term.acquisition", "book_requests", normalized, { term });
    revalidatePath("/admin/search-insights");
    revalidatePath("/admin/book-requests");
    return { success: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Action failed" };
  }
}

"use server";

// Collection-development signal: what are people searching for that the
// library genuinely doesn't have? (migration 0064_search_result_count.sql)

import { requireLibrarian } from "@/lib/auth/requireAdmin";

export interface ZeroResultQuery {
  term: string;
  count: number;
  lastSearchedAt: string;
}

export interface SearchAnalyticsTerm {
  term: string;
  count: number;
  lastSearchedAt?: string;
}

export interface SearchTrendPoint {
  label: string;
  count: number;
  noResults: number;
}

export interface SearchAnalytics {
  totalSearches: number;
  totalNoResultSearches: number;
  conversionRate: number;
  topKeywords: SearchAnalyticsTerm[];
  noResultKeywords: SearchAnalyticsTerm[];
  clickedResults: Array<SearchAnalyticsTerm & { url: string; type: string }>;
  popularSubjects: SearchAnalyticsTerm[];
  missingBookRequests: SearchAnalyticsTerm[];
  languageUsage: { km: number; en: number; other: number };
  trends: {
    daily: SearchTrendPoint[];
    weekly: SearchTrendPoint[];
    monthly: SearchTrendPoint[];
  };
}

type SearchRow = {
  term: string;
  normalized_term?: string | null;
  searched_at: string;
  result_count?: number | null;
  query_language?: string | null;
  resource_type?: string | null;
};

type ClickRow = {
  term: string;
  normalized_term?: string | null;
  result_type: string;
  result_url: string;
  result_title: string | null;
  clicked_at: string;
};

function hasKhmer(text: string): boolean {
  return /[\u1780-\u17ff]/.test(text);
}

function keyOf(row: { term: string; normalized_term?: string | null }) {
  return row.normalized_term || row.term.trim().toLowerCase();
}

function topTerms(rows: SearchRow[], limit = 10, predicate: (row: SearchRow) => boolean = () => true): SearchAnalyticsTerm[] {
  const byTerm = new Map<string, { term: string; count: number; lastSearchedAt: string }>();
  for (const row of rows) {
    if (!predicate(row)) continue;
    const key = keyOf(row);
    const existing = byTerm.get(key);
    if (existing) {
      existing.count += 1;
      if (row.searched_at > existing.lastSearchedAt) existing.lastSearchedAt = row.searched_at;
    } else {
      byTerm.set(key, { term: row.term, count: 1, lastSearchedAt: row.searched_at });
    }
  }
  return [...byTerm.values()].sort((a, b) => b.count - a.count).slice(0, limit);
}

function startOfDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function bucketTrend(rows: SearchRow[], daysBack: number, stepDays: number): SearchTrendPoint[] {
  const now = new Date();
  const buckets: SearchTrendPoint[] = [];
  for (let i = daysBack - stepDays; i >= 0; i -= stepDays) {
    const start = new Date(now);
    start.setDate(now.getDate() - i);
    const label = stepDays === 1
      ? startOfDay(start)
      : `${startOfDay(start)}-${stepDays}d`;
    buckets.push({ label, count: 0, noResults: 0 });
  }

  for (const row of rows) {
    const date = new Date(row.searched_at);
    const diffDays = Math.floor((now.getTime() - date.getTime()) / 86_400_000);
    if (diffDays < 0 || diffDays >= daysBack) continue;
    const idx = Math.min(buckets.length - 1, Math.floor((daysBack - 1 - diffDays) / stepDays));
    const bucket = buckets[idx];
    if (!bucket) continue;
    bucket.count += 1;
    if (row.result_count === 0) bucket.noResults += 1;
  }
  return buckets;
}

async function fetchSearchRows(supabase: Awaited<ReturnType<typeof requireLibrarian>>["supabase"], since: string): Promise<SearchRow[]> {
  const rich = await supabase
    .from("search_queries")
    .select("term, normalized_term, searched_at, result_count, query_language, resource_type")
    .gte("searched_at", since)
    .order("searched_at", { ascending: false })
    .limit(5000);
  if (!rich.error) return (rich.data ?? []) as SearchRow[];

  const basic = await supabase
    .from("search_queries")
    .select("term, normalized_term, searched_at, result_count")
    .gte("searched_at", since)
    .order("searched_at", { ascending: false })
    .limit(5000);
  if (!basic.error) return (basic.data ?? []) as SearchRow[];

  const earliest = await supabase
    .from("search_queries")
    .select("term, normalized_term, searched_at")
    .gte("searched_at", since)
    .order("searched_at", { ascending: false })
    .limit(5000);
  return (earliest.data ?? []) as SearchRow[];
}

async function fetchClickRows(supabase: Awaited<ReturnType<typeof requireLibrarian>>["supabase"], since: string): Promise<ClickRow[]> {
  const { data, error } = await supabase
    .from("search_result_clicks")
    .select("term, normalized_term, result_type, result_url, result_title, clicked_at")
    .gte("clicked_at", since)
    .order("clicked_at", { ascending: false })
    .limit(5000);
  if (error) {
    if (error.code !== "42P01" && error.code !== "42703" && error.code !== "PGRST204") {
      console.error("[fetchClickRows]", error.message);
    }
    return [];
  }
  return (data ?? []) as ClickRow[];
}

/** Zero-result search terms from the last `days` days, most frequent first. */
export async function getZeroResultSearches(days = 30, limit = 50): Promise<ZeroResultQuery[]> {
  const { supabase } = await requireLibrarian();

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("search_queries")
    .select("term, normalized_term, searched_at")
    .eq("result_count", 0)
    .gte("searched_at", since)
    .order("searched_at", { ascending: false });

  if (error) {
    // 42703 = result_count column doesn't exist yet (migration 0064 not applied)
    if (error.code !== "42703") console.error("[getZeroResultSearches]", error.message);
    return [];
  }

  const byTerm = new Map<string, { term: string; count: number; lastSearchedAt: string }>();
  for (const row of data ?? []) {
    const key = row.normalized_term;
    const existing = byTerm.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      byTerm.set(key, { term: row.term, count: 1, lastSearchedAt: row.searched_at });
    }
  }

  return [...byTerm.values()].sort((a, b) => b.count - a.count).slice(0, limit);
}

/** Full admin search analytics dashboard model. */
export async function getSearchAnalytics(days = 30): Promise<SearchAnalytics> {
  const { supabase } = await requireLibrarian();
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const [rows, clicks] = await Promise.all([
    fetchSearchRows(supabase, since),
    fetchClickRows(supabase, since),
  ]);

  const noResultRows = rows.filter((row) => row.result_count === 0);
  const languageUsage = rows.reduce(
    (acc, row) => {
      const lang = row.query_language || (hasKhmer(row.term) ? "km" : "en");
      if (lang === "km") acc.km += 1;
      else if (lang === "en") acc.en += 1;
      else acc.other += 1;
      return acc;
    },
    { km: 0, en: 0, other: 0 },
  );

  const clickedByResult = new Map<string, { term: string; url: string; type: string; count: number; lastSearchedAt: string }>();
  for (const click of clicks) {
    const key = `${click.result_type}:${click.result_url}`;
    const existing = clickedByResult.get(key);
    if (existing) {
      existing.count += 1;
      if (click.clicked_at > existing.lastSearchedAt) existing.lastSearchedAt = click.clicked_at;
    } else {
      clickedByResult.set(key, {
        term: click.result_title || click.result_url,
        url: click.result_url,
        type: click.result_type,
        count: 1,
        lastSearchedAt: click.clicked_at,
      });
    }
  }

  const clickedResults = [...clickedByResult.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return {
    totalSearches: rows.length,
    totalNoResultSearches: noResultRows.length,
    conversionRate: rows.length > 0 ? Math.round((clicks.length / rows.length) * 1000) / 10 : 0,
    topKeywords: topTerms(rows, 12),
    noResultKeywords: topTerms(noResultRows, 12),
    clickedResults,
    popularSubjects: topTerms(rows, 10, (row) => (row.result_count ?? 1) > 0),
    missingBookRequests: topTerms(noResultRows, 10),
    languageUsage,
    trends: {
      daily: bucketTrend(rows, Math.min(days, 14), 1),
      weekly: bucketTrend(rows, Math.min(days, 56), 7),
      monthly: bucketTrend(rows, Math.min(days, 180), 30),
    },
  };
}

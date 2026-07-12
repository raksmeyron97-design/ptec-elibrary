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
import { revalidatePath } from "next/cache";

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

// ── Zero-result action center (0087) ─────────────────────────────────────

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
  language: "km" | "en";
  /** Share of the group's searches that had filters active. */
  withFilters: boolean;
  /** Existing librarian action on this term, if any. */
  action: { kind: TermActionKind; note: string | null; actedAt: string } | null;
  /** Spelling suggestions drawn from catalog titles/subjects. */
  suggestions: string[];
  /** Active synonym mapping, when one exists. */
  synonyms: string[];
}

async function fetchVocabulary(supabase: Awaited<ReturnType<typeof requireLibrarian>>["supabase"]): Promise<string[]> {
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

/** Zero-result terms grouped, annotated with actions/synonyms/suggestions. */
export async function getZeroResultReport(days = 30, limit = 40): Promise<ZeroResultEntry[]> {
  const { supabase } = await requireLibrarian();
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("search_queries")
    .select("term, normalized_term, searched_at, resource_type, sort")
    .eq("result_count", 0)
    .gte("searched_at", since)
    .order("searched_at", { ascending: false })
    .limit(4000);
  if (error) {
    if (error.code !== "42703") console.error("[getZeroResultReport]", error.message);
    return [];
  }

  // Collapse raw rows per normalized term first, then fold typo-variants.
  const byNorm = new Map<string, { term: string; count: number; last: string }>();
  for (const row of data ?? []) {
    const key = row.normalized_term || normalizeSearchTerm(row.term);
    const cur = byNorm.get(key);
    if (cur) {
      cur.count += 1;
      if (row.searched_at > cur.last) cur.last = row.searched_at;
    } else {
      byNorm.set(key, { term: row.term, count: 1, last: row.searched_at });
    }
  }
  const groups = groupEquivalentTerms(
    [...byNorm.entries()].map(([, v]) => ({ term: v.term, count: v.count })),
  );

  const [actionsRes, synonymsRes, vocabulary] = await Promise.all([
    supabase.from("search_term_actions").select("normalized_term, action, note, acted_at"),
    supabase.from("search_synonyms").select("term, synonyms").eq("is_active", true),
    fetchVocabulary(supabase),
  ]);
  // 42P01 = tables not created yet (0087 pending) — report still renders.
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
  for (const [normKey, group] of groups) {
    const meta = byNorm.get(normKey) ?? byNorm.get(normalizeSearchTerm(group.terms[0]));
    const last = group.terms
      .map((t) => byNorm.get(normalizeSearchTerm(t))?.last ?? "")
      .sort()
      .pop() ?? meta?.last ?? "";
    entries.push({
      term: group.terms[0],
      normalizedTerm: normKey,
      variants: group.terms,
      count: group.count,
      lastSearchedAt: last,
      language: /[ក-៿]/.test(normKey) ? "km" : "en",
      withFilters: false,
      action: actions.get(normKey) ?? null,
      suggestions: suggestCorrections(normKey, vocabulary).map((s) => s.suggestion),
      synonyms: synonyms.get(normKey) ?? [],
    });
  }

  return entries.sort((a, b) => b.count - a.count).slice(0, limit);
}

type ActionResult = { success: true } | { error: string };

function migrationHint(error: { code?: string; message: string }): string {
  return error.code === "42P01"
    ? "Search-governance tables missing — apply migration 0087 first"
    : error.message;
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
    const cleaned = [...new Set(synonymList.map((s) => s.trim()).filter(Boolean))].slice(0, 5);
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
    if (!normalized || !url.startsWith("/") || !result.title.trim()) {
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
export async function createAcquisitionRequest(term: string): Promise<ActionResult> {
  try {
    const { supabase, user } = await requireLibrarian();
    const normalized = normalizeSearchTerm(term);
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

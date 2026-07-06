"use server";

// Collection-development signal: what are people searching for that the
// library genuinely doesn't have? (migration 0064_search_result_count.sql)

import { requireLibrarian } from "@/lib/auth/requireAdmin";

export interface ZeroResultQuery {
  term: string;
  count: number;
  lastSearchedAt: string;
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

// Single source of truth for "recent searches" storage. Previously the search
// page (`ptec-recent-searches`) and the homepage/SearchBar (`ptec.recentSearches`)
// tracked recent searches under two different keys, so a search made on one
// surface never showed up as "recent" on the other.
export const RECENT_SEARCHES_KEY = "ptec.recentSearches";
const MAX_RECENT = 8;

export function readRecentSearches(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_SEARCHES_KEY);
    return raw ? (JSON.parse(raw) as string[]).slice(0, MAX_RECENT) : [];
  } catch {
    return [];
  }
}

export function pushRecentSearch(term: string): string[] {
  const clean = term.trim();
  if (!clean) return readRecentSearches();
  const prev = readRecentSearches();
  const next = [clean, ...prev.filter((t) => t.toLowerCase() !== clean.toLowerCase())].slice(0, MAX_RECENT);
  try {
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(next));
  } catch {
    /* private mode or quota */
  }
  return next;
}

export function removeRecentSearch(term: string): string[] {
  const next = readRecentSearches().filter((t) => t !== term);
  try {
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  return next;
}

export function clearRecentSearches(): void {
  try {
    localStorage.removeItem(RECENT_SEARCHES_KEY);
  } catch {
    /* ignore */
  }
}

// components/ui/SearchSuggestions.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";

export const RECENT_KEY = "ptec.recentSearches";
const MAX_RECENT = 5;

type Props = {
  /** Curated/computed popular terms, passed from the server. */
  trending?: string[];
};

/** Read recent searches saved by the search page (see helper below). */
export function readRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    return raw ? (JSON.parse(raw) as string[]).slice(0, MAX_RECENT) : [];
  } catch {
    return [];
  }
}

export default function SearchSuggestions({ trending = [] }: Props) {
  const router = useRouter();
  const t = useTranslations('home');
  const locale = useLocale();
  const [recent, setRecent] = useState<string[]>([]);

  useEffect(() => {
    setRecent(readRecent());
  }, []);

  const go = (term: string) => {
    pushRecentSearch(term);
    router.push(`/books?q=${encodeURIComponent(term)}`);
  };

  const clearRecent = () => {
    try {
      localStorage.removeItem(RECENT_KEY);
    } catch {}
    setRecent([]);
  };

  if (trending.length === 0 && recent.length === 0) return null;

  return (
    <div className="mt-4 space-y-3">
      {recent.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-blue-300">Recent</span>
          {recent.map((term) => (
            <button
              key={`r-${term}`}
              onClick={() => go(term)}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-bg-surface/5 px-3 py-1 text-[13px] text-blue-50 backdrop-blur-sm transition-colors hover:border-gold-500/50 hover:bg-bg-surface/10"
            >
              <svg className="h-3 w-3 text-blue-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 8v4l3 3M3 12a9 9 0 1 0 9-9 9 9 0 0 0-6.36 2.64L3 8" /><path d="M3 4v4h4" />
              </svg>
              {term}
            </button>
          ))}
          <button onClick={clearRecent} className="text-[11px] font-semibold text-blue-300/80 underline-offset-2 hover:text-white hover:underline">
            Clear
          </button>
        </div>
      )}

      {trending.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className={`text-[11px] font-bold text-gold-400 ${locale === 'en' ? 'uppercase tracking-[0.16em]' : 'tracking-normal'}`}>{t('trending')}</span>
          {trending.map((term) => (
            <button
              key={`t-${term}`}
              onClick={() => go(term)}
              className="inline-flex items-center gap-1.5 rounded-full border border-gold-500/25 bg-gold-500/10 px-3 py-1 text-[13px] font-medium text-gold-100 backdrop-blur-sm transition-colors hover:border-gold-500/60 hover:bg-gold-500/20"
            >
              <svg className="h-3 w-3 text-gold-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="m3 17 6-6 4 4 8-8" /><path d="M21 7h-6m6 0v6" />
              </svg>
              {term}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Call this from your search results page whenever a query is run,
 * e.g. inside SearchBar's submit handler or the /books page effect:
 *
 *   import { pushRecentSearch } from "@/components/ui/SearchSuggestions";
 *   pushRecentSearch(query);
 */
export function pushRecentSearch(term: string) {
  const clean = term.trim();
  if (!clean) return;
  try {
    const prev = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]") as string[];
    const next = [clean, ...prev.filter((t) => t.toLowerCase() !== clean.toLowerCase())].slice(0, MAX_RECENT);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {}
}

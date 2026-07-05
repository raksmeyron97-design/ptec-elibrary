"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { useTranslations } from "next-intl";
import Icon from "@/components/ui/core/Icon";
import type { SearchResult, SearchCounts, SearchResultType } from "@/app/api/search/native/route";
import type { Suggestion } from "@/app/api/books/suggestions/route";
import { useBookSuggestions } from "@/components/ui/search/useBookSuggestions";
import SearchAdvancedModal from "@/components/ui/search/SearchAdvancedModal";
import {
  readRecentSearches,
  pushRecentSearch,
  removeRecentSearch,
  clearRecentSearches,
} from "@/lib/recent-searches";
import "@/app/gcse.css";

const SUGGESTION_TYPE_ICON: Record<Suggestion["type"], "library" | "account" | "bookmark" | "school"> = {
  book: "library",
  author: "account",
  category: "bookmark",
  research: "school",
};

const SUGGESTION_TYPE_LABEL_KEY: Record<Suggestion["type"], "suggestBooks" | "suggestAuthors" | "suggestCategories" | "suggestTheses"> = {
  book: "suggestBooks",
  author: "suggestAuthors",
  category: "suggestCategories",
  research: "suggestTheses",
};

function highlightMatch(text: string, query: string) {
  if (!query) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark
        className="rounded-sm not-italic"
        style={{ background: "color-mix(in srgb, var(--ptec-brand) 24%, transparent)", color: "var(--ptec-text-heading)" }}
      >
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  );
}

const SUGGESTIONS = [
  "ភាសាខ្មែរ",
  "Mathematics",
  "Teaching methods",
  "Child development",
  "ការអប់រំ",
  "Pedagogy",
];

type ActiveType = "all" | SearchResultType;

const TAB_IDS: ActiveType[] = ["all", "book", "research", "catalog", "post"];
const TAB_LABEL_KEY: Record<ActiveType, "tabAll" | "tabBooks" | "tabTheses" | "tabCatalog" | "tabPosts"> = {
  all:      "tabAll",
  book:     "tabBooks",
  research: "tabTheses",
  catalog:  "tabCatalog",
  post:     "tabPosts",
};

const TYPE_BADGE: Record<SearchResultType, { labelKey: "badgeBook" | "badgeThesis" | "badgeCatalog" | "badgePost"; className: string }> = {
  book:     { labelKey: "badgeBook",   className: "bg-blue-500/15 text-blue-500 border-blue-500/20" },
  research: { labelKey: "badgeThesis", className: "bg-green-600/15 text-green-600 border-green-600/20" },
  catalog:  { labelKey: "badgeCatalog", className: "bg-amber-500/15 text-amber-600 border-amber-500/20" },
  post:     { labelKey: "badgePost",   className: "bg-purple-500/15 text-purple-500 border-purple-500/20" },
};

// ── Cover placeholder ──────────────────────────────────────────────────────────
function CoverPlaceholder({ title, type }: { title: string; type: SearchResultType }) {
  const colors: Record<SearchResultType, string> = {
    book:     "bg-blue-600",
    research: "bg-green-700",
    catalog:  "bg-amber-600",
    post:     "bg-purple-600",
  };
  const initials = title
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <div className={`flex h-full w-full items-center justify-center rounded-lg ${colors[type]} text-white text-[13px] font-bold`}>
      {initials || "—"}
    </div>
  );
}

// ── Single result card ─────────────────────────────────────────────────────────
function ResultCard({ result }: { result: SearchResult }) {
  const t = useTranslations("search");
  const badge = TYPE_BADGE[result.type];
  return (
    <Link
      href={result.url}
      className="group flex gap-3.5 rounded-[14px] border p-4 transition-all duration-150 hover:shadow-sm"
      style={{
        background: "var(--ptec-bg-surface)",
        borderColor: "var(--ptec-border)",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.borderColor =
          "color-mix(in srgb, var(--ptec-brand) 30%, transparent)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.borderColor = "var(--ptec-border)";
      }}
    >
      {/* Cover */}
      <div className="h-16 w-12 shrink-0 overflow-hidden rounded-lg">
        {result.coverUrl ? (
          <Image
            src={result.coverUrl}
            alt={result.title}
            width={48}
            height={64}
            className="h-full w-full object-cover"
            unoptimized
          />
        ) : (
          <CoverPlaceholder title={result.title} type={result.type} />
        )}
      </div>

      {/* Body */}
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex flex-wrap items-center gap-1.5">
          <span
            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${badge.className}`}
          >
            {t(badge.labelKey)}
          </span>
          {result.department && (
            <span className="text-[10px] font-medium" style={{ color: "var(--ptec-text-muted)" }}>
              {result.department}
            </span>
          )}
          {result.language && (
            <span className="text-[10px] font-medium" style={{ color: "var(--ptec-text-muted)" }}>
              · {result.language}
            </span>
          )}
          {result.year && (
            <span className="text-[10px] font-medium" style={{ color: "var(--ptec-text-muted)" }}>
              · {result.year}
            </span>
          )}
        </div>

        <p
          className="line-clamp-2 text-[14px] font-semibold leading-snug transition-colors group-hover:text-[color:var(--ptec-brand)]"
          style={{ color: "var(--ptec-text-heading)" }}
        >
          {result.title}
        </p>

        {result.author && (
          <p className="mt-0.5 text-[12px]" style={{ color: "var(--ptec-text-muted)" }}>
            {result.author}
          </p>
        )}

        {result.excerpt && (
          <p
            className="mt-1 line-clamp-2 text-[12px] leading-relaxed"
            style={{ color: "var(--ptec-text-body)" }}
          >
            {result.excerpt}
          </p>
        )}

        {/* Rating for books */}
        {result.type === "book" && result.rating != null && result.rating > 0 && (
          <div className="mt-1.5 flex items-center gap-1">
            <svg className="h-3 w-3 fill-amber-400 stroke-amber-400" viewBox="0 0 24 24" strokeWidth={1}>
              <path d="m12 2 3 6.4 7 .8-5.2 4.8 1.4 6.9L12 17.4 5.8 21l1.4-6.9L2 9.2l7-.8L12 2Z" />
            </svg>
            <span className="text-[11px] font-semibold" style={{ color: "var(--ptec-text-muted)" }}>
              {Number(result.rating).toFixed(1)}
            </span>
            {result.downloadCount != null && result.downloadCount > 0 && (
              <span className="text-[11px]" style={{ color: "var(--ptec-text-muted)" }}>
                · {t("downloadsCount", { count: result.downloadCount })}
              </span>
            )}
          </div>
        )}
      </div>
    </Link>
  );
}

// ── Section heading inside "all" view ─────────────────────────────────────────
function SectionHeading({ label, count, onSeeAll }: {
  label: string;
  count: number;
  onSeeAll: () => void;
}) {
  const t = useTranslations("search");
  return (
    <div className="mb-2 flex items-center justify-between">
      <h3 className="text-[12px] font-bold uppercase tracking-[0.08em]" style={{ color: "var(--ptec-text-muted)" }}>
        {label} <span style={{ color: "var(--ptec-brand)" }}>({count})</span>
      </h3>
      {count > 4 && (
        <button
          type="button"
          onClick={onSeeAll}
          className="text-[11px] font-semibold hover:underline underline-offset-2 cursor-pointer"
          style={{ color: "var(--ptec-brand)" }}
        >
          {t("seeAll")}
        </button>
      )}
    </div>
  );
}

type SearchPageClientProps = {
  departments: string[];
  languages: string[];
  categories: string[];
};

// ── Main component ─────────────────────────────────────────────────────────────
export default function SearchPageClient({ departments, languages, categories }: SearchPageClientProps) {
  const t = useTranslations("search");
  const params = useSearchParams();
  const router = useRouter();
  const q = params.get("q") ?? "";

  const {
    query: input,
    setQuery: setInput,
    suggestions,
    loading: suggestLoading,
    open: suggestOpen,
    setOpen: setSuggestOpen,
    activeIdx,
    setActiveIdx,
    grouped,
    groupOrder,
    navigate: navigateToQuery,
    pickSuggestion,
  } = useBookSuggestions({ initialQuery: q, basePath: "/search" });

  const [focused, setFocused] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [counts, setCounts] = useState<SearchCounts | null>(null);
  const [activeType, setActiveType] = useState<ActiveType>("all");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [trending, setTrending] = useState<string[]>([]);
  const [popularSearches, setPopularSearches] = useState<string[]>([]);

  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const fetchedTrending = useRef(false);

  // Sync input with URL param (e.g. back/forward navigation, recent-chip clicks)
  useEffect(() => { setInput(q); }, [q, setInput]);

  // Reset to "all" tab when query changes
  useEffect(() => { setActiveType("all"); setPage(1); }, [q]);

  // Load recent searches (client-only)
  useEffect(() => {
    setRecentSearches(readRecentSearches());
  }, []);

  // Popular searches — the actual top queries by all visitors (falls back to
  // a curated list below when the site has no search history yet)
  useEffect(() => {
    fetch("/api/search/popular")
      .then((res) => res.json())
      .then((data) => { if (Array.isArray(data) && data.length > 0) setPopularSearches(data); })
      .catch(() => {});
  }, []);

  // Fetch trending terms once, the first time the suggestions dropdown opens
  useEffect(() => {
    if (!suggestOpen || fetchedTrending.current) return;
    fetchedTrending.current = true;
    fetch("/api/departments/trending")
      .then((res) => res.json())
      .then((data) => { if (Array.isArray(data) && data.length > 0) setTrending(data); })
      .catch(() => {});
  }, [suggestOpen]);

  // Close suggestions dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        !inputRef.current?.contains(e.target as Node) &&
        !dropdownRef.current?.contains(e.target as Node)
      ) {
        setSuggestOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [setSuggestOpen]);

  // Keyboard "/" shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      e.preventDefault();
      inputRef.current?.focus();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Facet + advanced-search filters — derived straight from the URL, same as `q`
  const filterLang = params.get("lang") ?? "";
  const filterCategory = params.get("category") ?? "";
  const filterDept = params.get("dept") ?? "";
  const filterAuthor = params.get("author") ?? "";
  const filterIsbn = params.get("isbn") ?? "";
  const filterPublisher = params.get("publisher") ?? "";
  const activeFilterCount = [filterLang, filterCategory, filterDept, filterAuthor, filterIsbn, filterPublisher].filter(Boolean).length;

  type Filters = { lang: string; category: string; dept: string; author: string; isbn: string; publisher: string };
  const currentFilters: Filters = {
    lang: filterLang, category: filterCategory, dept: filterDept,
    author: filterAuthor, isbn: filterIsbn, publisher: filterPublisher,
  };

  // Run search whenever q, activeType, page, or a filter changes
  const runSearch = useCallback(
    async (query: string, type: ActiveType, pg: number, filters: Filters) => {
      if (!query) { setResults(null); setCounts(null); setLoading(false); return; }

      abortRef.current?.abort();
      abortRef.current = new AbortController();

      setLoading(true);
      setError(null);

      try {
        const url = new URL("/api/search/native", window.location.origin);
        url.searchParams.set("q", query);
        url.searchParams.set("type", type);
        url.searchParams.set("page", String(pg));
        if (filters.lang) url.searchParams.set("lang", filters.lang);
        if (filters.category) url.searchParams.set("category", filters.category);
        if (filters.dept) url.searchParams.set("dept", filters.dept);
        if (filters.author) url.searchParams.set("author", filters.author);
        if (filters.isbn) url.searchParams.set("isbn", filters.isbn);
        if (filters.publisher) url.searchParams.set("publisher", filters.publisher);

        const res = await fetch(url.toString(), { signal: abortRef.current.signal });
        if (!res.ok) throw new Error("Search failed");

        const data = await res.json();
        setResults(data.results ?? []);
        setCounts(data.counts ?? null);
        setHasMore(data.hasMore ?? false);
        setLoading(false);

        // Persist to recent searches
        if (query.trim()) setRecentSearches(pushRecentSearch(query));
      } catch (err: unknown) {
        if ((err as Error)?.name === "AbortError") return;
        setError(t("errorGeneric"));
        setLoading(false);
      }
    },
    [t],
  );

  useEffect(() => {
    runSearch(q, activeType, page, currentFilters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, activeType, page, filterLang, filterCategory, filterDept, filterAuthor, filterIsbn, filterPublisher]);

  const applyFilter = (key: "lang" | "category", value: string) => {
    const next = new URLSearchParams(params.toString());
    if (next.get(key) === value) next.delete(key); // clicking the active chip toggles it off
    else next.set(key, value);
    next.delete("page");
    router.replace(`/search?${next.toString()}`);
  };

  const removeFilter = (key: "lang" | "category" | "dept" | "author" | "isbn" | "publisher") => {
    const next = new URLSearchParams(params.toString());
    next.delete(key);
    next.delete("page");
    router.replace(`/search?${next.toString()}`);
  };

  const clearFilters = () => {
    const next = new URLSearchParams(params.toString());
    next.delete("lang");
    next.delete("category");
    next.delete("dept");
    next.delete("author");
    next.delete("isbn");
    next.delete("publisher");
    next.delete("page");
    router.replace(`/search?${next.toString()}`);
  };

  const handleSearch = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const t = input.trim();
    if (!t) return;
    if (t !== q) {
      navigateToQuery(t);
    } else {
      setSuggestOpen(false);
      runSearch(t, activeType, 1, currentFilters);
    }
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!suggestOpen) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, -1));
    } else if (e.key === "Enter" && activeIdx >= 0) {
      e.preventDefault();
      pickSuggestion(suggestions[activeIdx]);
    } else if (e.key === "Escape") {
      setSuggestOpen(false);
      setActiveIdx(-1);
    }
  };

  const handleTypeChange = (type: ActiveType) => {
    setActiveType(type);
    setPage(1);
  };

  const clearInput = () => { setInput(""); setSuggestOpen(true); inputRef.current?.focus(); };

  // Grouped results for "all" view
  const byType = (type: SearchResultType) => (results ?? []).filter((r) => r.type === type);

  // Tab count badge
  const countFor = (type: ActiveType): number => {
    if (!counts) return 0;
    if (type === "all") return counts.total;
    return counts[type] ?? 0;
  };

  const hasResults = results !== null && results.length > 0;
  const noResults = results !== null && results.length === 0 && !loading;

  // Facet chips computed from the current result set
  const availableCategories = Array.from(
    new Set((results ?? []).map((r) => r.category).filter((v): v is string => !!v)),
  );
  const availableLanguages = Array.from(
    new Set((results ?? []).map((r) => r.language).filter((v): v is string => !!v)),
  );

  return (
    <>
      {/* ── Search bar ────────────────────────────────────────────────────── */}
      <form onSubmit={handleSearch} className="mb-8">
        <div
          className="relative flex items-center h-[52px] rounded-2xl overflow-hidden transition-all duration-200"
          style={{
            background: "var(--ptec-bg-surface)",
            border: `1.5px solid ${focused ? "var(--ptec-brand)" : "var(--ptec-border)"}`,
            boxShadow: focused
              ? "0 0 0 3px color-mix(in srgb, var(--ptec-brand) 12%, transparent), 0 2px 8px rgba(30,58,138,0.06)"
              : "0 1px 4px rgba(11,21,48,0.04)",
          }}
        >
          <span className="flex-shrink-0 pl-4 pr-2.5 pointer-events-none">
            <Icon
              name="search"
              className="text-[17px]"
              style={{ color: focused ? "var(--ptec-brand)" : "var(--ptec-text-muted)", transition: "color 0.15s" } as React.CSSProperties}
            />
          </span>

          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => { setInput(e.target.value); setSuggestOpen(true); }}
            onFocus={() => { setFocused(true); setSuggestOpen(true); }}
            onBlur={() => setFocused(false)}
            onKeyDown={handleInputKeyDown}
            placeholder={t("placeholder")}
            aria-label={t("ariaLabel")}
            autoFocus
            autoComplete="off"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={suggestOpen}
            aria-haspopup="listbox"
            aria-controls="search-page-listbox"
            className="flex-1 min-w-0 h-full bg-transparent text-[15px] font-medium outline-none placeholder:font-normal"
            style={{ color: "var(--ptec-text-heading)" }}
          />

          {!focused && !input && (
            <kbd
              aria-hidden="true"
              className="hidden sm:inline-flex flex-shrink-0 items-center justify-center h-5 min-w-[20px] px-1.5 mr-1 rounded-md text-[11px] font-semibold"
              style={{ color: "var(--ptec-text-muted)", border: "1px solid var(--ptec-border)", background: "var(--ptec-bg-body)" }}
            >
              /
            </kbd>
          )}

          {input && (
            <button
              type="button"
              onClick={clearInput}
              aria-label={t("clearInput")}
              className="flex-shrink-0 flex items-center justify-center w-7 h-7 rounded-full mx-1 cursor-pointer transition-colors duration-150 hover:bg-[color-mix(in_srgb,var(--ptec-border)_80%,transparent)]"
              style={{ color: "var(--ptec-text-muted)" }}
            >
              <Icon name="x" className="text-[12px]" />
            </button>
          )}

          <button
            type="submit"
            disabled={!input.trim()}
            aria-label={t("searchButton")}
            className="flex-shrink-0 flex items-center gap-1.5 h-[40px] px-3.5 sm:px-4 mx-1.5 rounded-xl text-[13px] font-semibold transition-all duration-150 cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed hover:opacity-90 active:scale-[0.97] focus:outline-none focus:ring-2 focus:ring-offset-1"
            style={{ background: "var(--ptec-brand)", color: "#fff" }}
          >
            <Icon name="search" className="text-[12px]" />
            <span className="hidden sm:inline">{t("searchButton")}</span>
          </button>
        </div>

        {/* ── Instant suggestions dropdown ──────────────────────────────── */}
        {suggestOpen && (input.length >= 2 || recentSearches.length > 0 || trending.length > 0) && (
          <div
            ref={dropdownRef}
            id="search-page-listbox"
            role="listbox"
            aria-label={t("ariaLabel")}
            className="relative z-40 mt-2 overflow-hidden rounded-2xl"
            style={{
              background: "var(--ptec-bg-surface)",
              border: "1px solid var(--ptec-border)",
              boxShadow: "0 12px 32px rgba(11,21,48,0.12)",
            }}
          >
            {input.length < 2 ? (
              <div className="space-y-4 p-4">
                {recentSearches.length > 0 && (
                  <div>
                    <h4 className="mb-2.5 text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--ptec-text-muted)" }}>
                      {t("suggestRecent")}
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {recentSearches.map((term) => (
                        <button
                          key={term}
                          type="button"
                          onMouseDown={(e) => { e.preventDefault(); navigateToQuery(term); }}
                          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm cursor-pointer transition-colors"
                          style={{ border: "1px solid var(--ptec-border)", color: "var(--ptec-text-body)" }}
                        >
                          <Icon name="clock" className="text-[12px] opacity-60" />
                          {term}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {trending.length > 0 && (
                  <div>
                    <h4 className="mb-2.5 text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--ptec-text-muted)" }}>
                      {t("suggestTrending")}
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {trending.map((term) => (
                        <button
                          key={term}
                          type="button"
                          onMouseDown={(e) => { e.preventDefault(); navigateToQuery(term); }}
                          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium cursor-pointer transition-colors"
                          style={{
                            border: "1px solid color-mix(in srgb, var(--ptec-brand) 25%, transparent)",
                            background: "color-mix(in srgb, var(--ptec-brand) 8%, transparent)",
                            color: "var(--ptec-brand)",
                          }}
                        >
                          <Icon name="star" className="text-[11px] opacity-80" />
                          {term}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : suggestLoading && suggestions.length === 0 ? (
              <div className="flex items-center justify-center gap-2 px-4 py-8 text-sm" style={{ color: "var(--ptec-text-muted)" }}>
                <Icon name="spinner" className="h-4 w-4 animate-spin" />
                {t("suggestSearching")}
              </div>
            ) : suggestions.length === 0 ? (
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); navigateToQuery(input); }}
                className="flex w-full items-center gap-2 px-4 py-4 text-left text-sm cursor-pointer"
                style={{ color: "var(--ptec-text-body)" }}
              >
                <Icon name="search" className="text-[14px] opacity-60" />
                {t("suggestSearchAllFor", { query: input })}
              </button>
            ) : (
              groupOrder.map((type) => {
                const items = grouped[type];
                if (!items?.length) return null;
                return (
                  <div key={type}>
                    <div
                      className="flex items-center gap-2 px-4 py-2"
                      style={{ borderBottom: "1px solid var(--ptec-border)", background: "var(--ptec-bg-body)" }}
                    >
                      <Icon name={SUGGESTION_TYPE_ICON[type]} className="text-[12px]" style={{ color: "var(--ptec-brand)" } as React.CSSProperties} />
                      <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--ptec-text-muted)" }}>
                        {t(SUGGESTION_TYPE_LABEL_KEY[type])}
                      </span>
                    </div>
                    {items.map((s, localIdx) => {
                      const globalIdx = suggestions.indexOf(s);
                      const isActive = globalIdx === activeIdx;
                      return (
                        <button
                          key={`${type}-${localIdx}`}
                          type="button"
                          role="option"
                          aria-selected={isActive}
                          onMouseEnter={() => setActiveIdx(globalIdx)}
                          onMouseDown={(e) => { e.preventDefault(); pickSuggestion(s); }}
                          className="flex w-full min-h-[48px] items-center gap-3 px-4 py-2.5 text-left cursor-pointer transition-colors"
                          style={{
                            borderLeft: isActive ? "2px solid var(--ptec-brand)" : "2px solid transparent",
                            background: isActive ? "color-mix(in srgb, var(--ptec-brand) 6%, transparent)" : "transparent",
                          }}
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium" style={{ color: "var(--ptec-text-heading)" }}>
                              {highlightMatch(s.label, input)}
                            </span>
                            {(s.type === "book" || s.type === "research") && s.sub && (
                              <span className="mt-0.5 block truncate text-xs" style={{ color: "var(--ptec-text-muted)" }}>
                                {s.sub}
                              </span>
                            )}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                );
              })
            )}
          </div>
        )}

        {q && (
          <div className="flex items-center gap-2 mt-3 px-1">
            <span className="text-[12px]" style={{ color: "var(--ptec-text-muted)" }}>
              {loading ? t("searchingFor") : t("resultsFor")}
            </span>
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[12px] font-semibold"
              style={{
                background: "color-mix(in srgb, var(--ptec-brand) 8%, transparent)",
                color: "var(--ptec-brand)",
                border: "1px solid color-mix(in srgb, var(--ptec-brand) 20%, transparent)",
              }}
            >
              {q}
            </span>
            {loading && (
              <span
                aria-hidden="true"
                className="inline-block w-3 h-3 rounded-full animate-spin"
                style={{ border: "2px solid var(--ptec-border)", borderTopColor: "var(--ptec-brand)" }}
              />
            )}
          </div>
        )}
      </form>

      {/* SearchAdvancedModal renders its own <form> — must stay outside the search-bar form above (nested forms are invalid HTML) */}
      <div className="flex flex-wrap items-center gap-2 mb-6 px-1">
        <SearchAdvancedModal
          currentQ={q}
          currentAuthor={filterAuthor}
          currentIsbn={filterIsbn}
          currentPublisher={filterPublisher}
          currentCategory={filterCategory}
          currentLanguage={filterLang}
          currentDepartment={filterDept}
          categories={categories}
          languages={languages}
          departments={departments}
        />
        {([
          ["author", filterAuthor, "Author"],
          ["isbn", filterIsbn, "ISBN"],
          ["publisher", filterPublisher, "Publisher"],
          ["dept", filterDept, "Department"],
        ] as const).map(([key, value, label]) =>
          value ? (
            <span
              key={key}
              className="inline-flex items-center gap-1.5 rounded-full pl-3 pr-1.5 py-1 text-[12px] font-medium"
              style={{ background: "var(--ptec-bg-body)", border: "1px solid var(--ptec-border)", color: "var(--ptec-text-body)" }}
            >
              {label}: {value}
              <button
                type="button"
                onClick={() => removeFilter(key)}
                aria-label={`Remove ${label} filter`}
                className="flex items-center justify-center w-4 h-4 rounded-full cursor-pointer transition-colors hover:bg-[color-mix(in_srgb,var(--ptec-border)_80%,transparent)]"
              >
                <Icon name="x" className="text-[9px]" />
              </button>
            </span>
          ) : null,
        )}
        {activeFilterCount > 0 && (
          <button
            type="button"
            onClick={clearFilters}
            className="text-[12px] font-semibold cursor-pointer hover:underline underline-offset-2"
            style={{ color: "var(--ptec-text-muted)" }}
          >
            {t("clearFilters")}
          </button>
        )}
      </div>

      <div className="sr-only" role="status" aria-live="polite">
        {q ? (loading ? `${t("searchingFor")} ${q}` : `${t("resultsFor")} ${q}`) : ""}
      </div>

      {/* ── Type filter tabs (only when there are results or loading) ──── */}
      {q && (hasResults || loading) && (
        <div
          className="mb-6 flex items-center gap-1 overflow-x-auto pb-1"
          style={{ borderBottom: "1px solid var(--ptec-border)" }}
        >
          {TAB_IDS.map((tabId) => {
            const isActive = tabId === activeType;
            const cnt = countFor(tabId);
            if (!loading && cnt === 0 && tabId !== "all") return null;
            return (
              <button
                key={tabId}
                type="button"
                onClick={() => handleTypeChange(tabId)}
                className="flex shrink-0 items-center gap-1.5 whitespace-nowrap px-3 py-2 text-[13px] font-semibold transition-all duration-150 cursor-pointer"
                style={{
                  color: isActive ? "var(--ptec-brand)" : "var(--ptec-text-muted)",
                  borderBottom: isActive ? "2px solid var(--ptec-brand)" : "2px solid transparent",
                  marginBottom: -1,
                }}
              >
                {t(TAB_LABEL_KEY[tabId])}
                {!loading && cnt > 0 && (
                  <span
                    className="rounded-full px-1.5 py-0.5 text-[10px] font-bold"
                    style={{
                      background: isActive
                        ? "color-mix(in srgb, var(--ptec-brand) 12%, transparent)"
                        : "var(--ptec-bg-body)",
                      color: isActive ? "var(--ptec-brand)" : "var(--ptec-text-muted)",
                    }}
                  >
                    {cnt > 99 ? "99+" : cnt}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* ── Facet filters (category / language) ─────────────────────────── */}
      {!loading && hasResults && (availableCategories.length > 0 || availableLanguages.length > 0) && (
        <div className="mb-5 flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-bold uppercase tracking-widest" style={{ color: "var(--ptec-text-muted)" }}>
            {t("filter")}
          </span>
          {availableCategories.map((cat) => {
            const active = filterCategory === cat;
            return (
              <button
                key={`cat-${cat}`}
                type="button"
                onClick={() => applyFilter("category", cat)}
                className="rounded-full px-3 py-1 text-[12px] font-medium cursor-pointer transition-colors"
                style={{
                  background: active ? "var(--ptec-brand)" : "var(--ptec-bg-body)",
                  color: active ? "#fff" : "var(--ptec-text-body)",
                  border: `1px solid ${active ? "var(--ptec-brand)" : "var(--ptec-border)"}`,
                }}
              >
                {cat}
              </button>
            );
          })}
          {availableLanguages.map((lang) => {
            const active = filterLang === lang;
            return (
              <button
                key={`lang-${lang}`}
                type="button"
                onClick={() => applyFilter("lang", lang)}
                className="rounded-full px-3 py-1 text-[12px] font-medium cursor-pointer transition-colors"
                style={{
                  background: active ? "var(--ptec-brand)" : "var(--ptec-bg-body)",
                  color: active ? "#fff" : "var(--ptec-text-body)",
                  border: `1px solid ${active ? "var(--ptec-brand)" : "var(--ptec-border)"}`,
                }}
              >
                {lang}
              </button>
            );
          })}
          {(filterLang || filterCategory) && (
            <button
              type="button"
              onClick={clearFilters}
              className="text-[12px] font-semibold cursor-pointer hover:underline underline-offset-2"
              style={{ color: "var(--ptec-text-muted)" }}
            >
              {t("clearFilters")}
            </button>
          )}
        </div>
      )}

      {/* ── Loading skeleton ───────────────────────────────────────────── */}
      {loading && (
        <div className="space-y-3" aria-hidden="true">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="flex gap-3.5 rounded-[14px] p-4 animate-pulse"
              style={{ background: "var(--ptec-bg-surface)", border: "1px solid var(--ptec-border)" }}
            >
              <div className="h-16 w-12 shrink-0 rounded-lg" style={{ background: "var(--ptec-border)" }} />
              <div className="flex-1 space-y-2 py-1">
                <div className="h-3 w-1/5 rounded" style={{ background: "var(--ptec-border)" }} />
                <div className="h-4 w-3/4 rounded" style={{ background: "var(--ptec-border)" }} />
                <div className="h-3 w-1/3 rounded" style={{ background: "var(--ptec-border)" }} />
                <div className="h-3 w-full rounded" style={{ background: "var(--ptec-border)" }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Error ─────────────────────────────────────────────────────── */}
      {error && !loading && (
        <div
          className="rounded-[14px] p-5 text-center text-[13px]"
          style={{ background: "var(--ptec-bg-surface)", border: "1px solid var(--ptec-border)", color: "var(--ptec-text-muted)" }}
        >
          {error}
        </div>
      )}

      {/* ── No results ────────────────────────────────────────────────── */}
      {noResults && !error && (
        <div
          className="rounded-[14px] p-8 text-center"
          style={{ background: "var(--ptec-bg-surface)", border: "1px solid var(--ptec-border)" }}
        >
          <p className="text-[15px] font-semibold mb-1" style={{ color: "var(--ptec-text-heading)" }}>
            {t("noResultsTitle", { query: q })}
          </p>
          <p className="text-[13px]" style={{ color: "var(--ptec-text-muted)" }}>
            {t("noResultsBody")}
          </p>
          <Link
            href="/books"
            className="mt-4 inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-[13px] font-semibold text-white transition hover:opacity-90"
            style={{ background: "var(--ptec-brand)" }}
          >
            {t("browseLibrary")}
          </Link>
        </div>
      )}

      {/* ── Results ───────────────────────────────────────────────────── */}
      {!loading && hasResults && (
        <>
          {activeType === "all" ? (
            // Grouped "All" view
            <div className="space-y-8">
              {(["book", "research", "catalog", "post"] as SearchResultType[]).map((type) => {
                const group = byType(type);
                if (group.length === 0) return null;
                const totalForType = counts?.[type] ?? group.length;
                const groupLabelKey: Record<SearchResultType, "groupBooks" | "groupTheses" | "groupCatalog" | "groupPosts"> = {
                  book:     "groupBooks",
                  research: "groupTheses",
                  catalog:  "groupCatalog",
                  post:     "groupPosts",
                };
                return (
                  <div key={type}>
                    <SectionHeading
                      label={t(groupLabelKey[type])}
                      count={totalForType}
                      onSeeAll={() => handleTypeChange(type)}
                    />
                    <div className="space-y-2.5">
                      {group.map((r) => (
                        <ResultCard key={r.id} result={r} />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            // Flat type-specific view
            <div className="space-y-2.5">
              {results!.map((r) => (
                <ResultCard key={r.id} result={r} />
              ))}
            </div>
          )}

          {/* Load more (type-specific tabs only) */}
          {activeType !== "all" && hasMore && (
            <div className="mt-6 flex justify-center">
              <button
                type="button"
                onClick={() => setPage((p) => p + 1)}
                className="rounded-xl border px-6 py-2.5 text-[13px] font-semibold transition-all cursor-pointer hover:opacity-80"
                style={{
                  background: "var(--ptec-bg-surface)",
                  borderColor: "var(--ptec-border)",
                  color: "var(--ptec-text-body)",
                }}
              >
                {t("loadMore")}
              </button>
            </div>
          )}
        </>
      )}

      {/* ── Idle / empty state ────────────────────────────────────────── */}
      {!q && (
        <div
          className="relative overflow-hidden rounded-2xl"
          style={{ border: "1.5px dashed var(--ptec-border)", background: "var(--ptec-bg-surface)" }}
        >
          <div
            className="absolute inset-0 opacity-[0.03]"
            style={{
              backgroundImage: `linear-gradient(var(--ptec-brand) 1px, transparent 1px), linear-gradient(90deg, var(--ptec-brand) 1px, transparent 1px)`,
              backgroundSize: "32px 32px",
            }}
          />

          <div className="relative flex flex-col items-center gap-7 py-16 px-6 text-center">
            <div
              className="flex items-center justify-center w-14 h-14 rounded-2xl shadow-sm"
              style={{
                background: "color-mix(in srgb, var(--ptec-brand) 8%, transparent)",
                border: "1px solid color-mix(in srgb, var(--ptec-brand) 15%, transparent)",
              }}
            >
              <Icon
                name="search"
                className="text-[24px]"
                style={{ color: "var(--ptec-brand)", opacity: 0.6 } as React.CSSProperties}
              />
            </div>

            <div className="max-w-xs">
              <p className="text-[17px] font-bold mb-2" style={{ color: "var(--ptec-text-heading)" }}>
                {t("idleTitle")}
              </p>
              <p className="text-[13px] leading-relaxed" style={{ color: "var(--ptec-text-muted)" }}>
                {t("idleBody")}
              </p>
            </div>

            {/* Recent searches */}
            {recentSearches.length > 0 && (
              <div className="flex flex-col items-center gap-3 w-full max-w-sm">
                <div className="flex items-center justify-between w-full">
                  <p className="text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: "var(--ptec-text-muted)" }}>
                    {t("recentSearches")}
                  </p>
                  <button
                    type="button"
                    onClick={() => { clearRecentSearches(); setRecentSearches([]); }}
                    className="text-[10px] font-semibold cursor-pointer hover:underline underline-offset-2"
                    style={{ color: "var(--ptec-text-muted)" }}
                  >
                    {t("clear")}
                  </button>
                </div>
                <div className="flex flex-wrap gap-2 justify-center">
                  {recentSearches.map((s) => (
                    <span
                      key={s}
                      className="inline-flex items-center gap-1 pl-3 pr-1.5 py-1 rounded-full text-[12.5px] font-medium"
                      style={{ background: "var(--ptec-bg-body)", color: "var(--ptec-text-body)", border: "1px solid var(--ptec-border)" }}
                    >
                      <button
                        type="button"
                        onClick={() => router.push(`/search?q=${encodeURIComponent(s)}`)}
                        className="cursor-pointer"
                      >
                        {s}
                      </button>
                      <button
                        type="button"
                        onClick={() => setRecentSearches(removeRecentSearch(s))}
                        aria-label={t("removeRecent", { term: s })}
                        className="flex items-center justify-center w-4 h-4 rounded-full cursor-pointer transition-colors hover:bg-[color-mix(in_srgb,var(--ptec-border)_80%,transparent)]"
                      >
                        <Icon name="x" className="text-[9px]" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Suggestion chips — popular searches when we have data, curated list otherwise */}
            <div className="flex flex-col items-center gap-3 w-full max-w-sm">
              <p className="text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: "var(--ptec-text-muted)" }}>
                {popularSearches.length > 0 ? t("suggestPopular") : t("trying")}
              </p>
              <div className="flex flex-wrap gap-2 justify-center">
                {(popularSearches.length > 0 ? popularSearches : SUGGESTIONS).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => router.push(`/search?q=${encodeURIComponent(s)}`)}
                    className="inline-flex items-center gap-1 px-3.5 py-1.5 rounded-full text-[12.5px] font-medium transition-all duration-150 cursor-pointer active:scale-95"
                    style={{
                      background: "color-mix(in srgb, var(--ptec-brand) 7%, transparent)",
                      color: "var(--ptec-brand)",
                      border: "1px solid color-mix(in srgb, var(--ptec-brand) 20%, transparent)",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "color-mix(in srgb, var(--ptec-brand) 14%, transparent)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "color-mix(in srgb, var(--ptec-brand) 7%, transparent)";
                    }}
                  >
                    <Icon name="search" className="text-[10px] opacity-60" />
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

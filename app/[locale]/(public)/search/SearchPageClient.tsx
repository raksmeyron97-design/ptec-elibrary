"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useCallback } from "react";
import { Link, useRouter } from "@/i18n/navigation";
import Image from "next/image";
import { useTranslations } from "next-intl";
import Icon from "@/components/ui/core/Icon";
import type { SearchResult, SearchCounts, SearchResultType, PageHit } from "@/app/api/search/native/route";
import type { Suggestion } from "@/app/api/books/suggestions/route";
import { useBookSuggestions } from "@/components/ui/search/useBookSuggestions";
import SearchAdvancedModal from "@/components/ui/search/SearchAdvancedModal";
import SearchFacets from "./SearchFacets";
import {
  FACET_DIMENSIONS,
  FACET_PARAM_KEYS,
  parseFacetSelections,
  toggleListParam,
  type FacetDimension,
  type SearchFacetCounts,
} from "@/lib/search/facets";
import {
  readRecentSearches,
  pushRecentSearch,
  removeRecentSearch,
  clearRecentSearches,
} from "@/lib/recent-searches";
import "@/app/gcse.css";

const SUGGESTION_TYPE_ICON: Record<Suggestion["type"], "library" | "account" | "bookmark" | "school" | "file-check"> = {
  book: "library",
  author: "account",
  category: "bookmark",
  research: "school",
  publication: "file-check",
  catalog: "library",
  post: "bookmark",
};

const SUGGESTION_TYPE_LABEL_KEY: Record<Suggestion["type"], "suggestBooks" | "suggestAuthors" | "suggestCategories" | "suggestTheses" | "suggestPublications" | "suggestCatalog" | "suggestNews"> = {
  book: "suggestBooks",
  author: "suggestAuthors",
  category: "suggestCategories",
  research: "suggestTheses",
  publication: "suggestPublications",
  catalog: "suggestCatalog",
  post: "suggestNews",
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

const TAB_IDS: ActiveType[] = ["all", "book", "research", "publication", "catalog", "post"];
const TAB_LABEL_KEY: Record<ActiveType, "tabAll" | "tabBooks" | "tabTheses" | "tabPublications" | "tabCatalog" | "tabPosts"> = {
  all:      "tabAll",
  book:     "tabBooks",
  research: "tabTheses",
  publication: "tabPublications",
  catalog:  "tabCatalog",
  post:     "tabPosts",
};

const TYPE_BADGE: Record<SearchResultType, { labelKey: "badgeBook" | "badgeThesis" | "badgePublication" | "badgeCatalog" | "badgePost"; className: string }> = {
  book:     { labelKey: "badgeBook",   className: "bg-blue-500/15 text-blue-700 border-blue-500/25 dark:bg-blue-400/10 dark:text-blue-300 dark:border-blue-400/25" },
  research: { labelKey: "badgeThesis", className: "bg-green-600/15 text-green-800 border-green-600/25 dark:bg-green-400/10 dark:text-green-300 dark:border-green-400/25" },
  publication: { labelKey: "badgePublication", className: "bg-cyan-600/15 text-cyan-800 border-cyan-500/25 dark:bg-cyan-400/10 dark:text-cyan-300 dark:border-cyan-400/25" },
  catalog:  { labelKey: "badgeCatalog", className: "bg-amber-500/15 text-amber-800 border-amber-500/25 dark:bg-amber-400/10 dark:text-amber-300 dark:border-amber-400/25" },
  post:     { labelKey: "badgePost",   className: "bg-purple-500/15 text-purple-800 border-purple-500/25 dark:bg-purple-400/10 dark:text-purple-300 dark:border-purple-400/25" },
};

const COVER_PLACEHOLDER_COLORS: Record<SearchResultType, string> = {
  book: "bg-blue-600",
  research: "bg-green-700",
  publication: "bg-cyan-700",
  catalog: "bg-amber-600",
  post: "bg-purple-600",
};

// ── Cover placeholder ──────────────────────────────────────────────────────────
function CoverPlaceholder({ title, type }: { title: string; type: SearchResultType }) {
  const initials = title
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <div className={`flex h-full w-full items-center justify-center rounded-lg ${COVER_PLACEHOLDER_COLORS[type]} text-white text-[13px] font-bold`}>
      {initials || "—"}
    </div>
  );
}

function trackSearchClick(result: SearchResult, query: string, action: string) {
  if (!query.trim()) return;
  fetch("/api/search/click", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      q: query,
      resultType: result.type,
      resultId: result.id,
      resultUrl: result.url,
      resultTitle: result.title,
      action,
    }),
    keepalive: true,
  }).catch(() => {});
}

// ── Single result card ─────────────────────────────────────────────────────────
function ResultCard({ result, query }: { result: SearchResult; query: string }) {
  const t = useTranslations("search");
  const badge = TYPE_BADGE[result.type];
  const actionClass =
    "inline-flex h-8 items-center gap-1.5 rounded-lg border border-divider bg-bg-surface px-2.5 text-[11.5px] font-semibold text-text-muted transition-colors hover:border-brand/40 hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/40";

  const actions = [
    result.actions?.read ? { key: "read", href: result.actions.read, label: t("actionRead"), icon: "pdf" as const } : null,
    result.actions?.view ?? result.url ? { key: "view", href: result.actions?.view ?? result.url, label: t("actionView"), icon: "eye" as const } : null,
    result.actions?.download ? { key: "download", href: result.actions.download, label: t("actionDownload"), icon: "download" as const } : null,
    result.actions?.cite ? { key: "cite", href: result.actions.cite, label: t("actionCite"), icon: "bookmark" as const } : null,
    result.actions?.save ? { key: "save", href: result.actions.save, label: t("actionSave"), icon: "bookmark-plus" as const } : null,
  ].filter(Boolean) as { key: string; href: string; label: string; icon: Parameters<typeof Icon>[0]["name"] }[];

  return (
    <article
      className="group flex gap-3.5 rounded-[14px] border border-divider bg-bg-surface p-4 transition-all duration-150 hover:border-brand/30 hover:shadow-sm"
    >
      {/* Cover */}
      <Link
        href={result.url}
        onClick={() => trackSearchClick(result, query, "cover")}
        className="h-16 w-12 shrink-0 overflow-hidden rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50"
        aria-label={result.title}
      >
        {result.coverUrl ? (
          <Image
            src={result.coverUrl}
            alt=""
            width={48}
            height={64}
            className="h-full w-full object-cover"
            unoptimized
          />
        ) : (
          <CoverPlaceholder title={result.title} type={result.type} />
        )}
      </Link>

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
            <span
              className="rounded-full border px-1.5 py-0.5 text-[10px] font-semibold"
              style={{ borderColor: "var(--ptec-border)", color: "var(--ptec-text-muted)" }}
            >
              {result.language}
            </span>
          )}
          {result.year && (
            <span className="text-[10px] font-medium" style={{ color: "var(--ptec-text-muted)" }}>
              · {result.year}
            </span>
          )}
        </div>

        <Link
          href={result.url}
          onClick={() => trackSearchClick(result, query, "title")}
          className="line-clamp-2 rounded-sm text-[14px] font-semibold leading-snug transition-colors group-hover:text-[color:var(--ptec-brand)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50"
          style={{ color: "var(--ptec-text-heading)" }}
        >
          {highlightMatch(result.title, query)}
        </Link>

        {result.author && (
          <p className="mt-0.5 text-[12px]" style={{ color: "var(--ptec-text-muted)" }}>
            {highlightMatch(result.author, query)}
          </p>
        )}

        {result.excerpt && (
          <p
            className="mt-1 line-clamp-2 text-[12px] leading-relaxed"
            style={{ color: "var(--ptec-text-body)" }}
          >
            {highlightMatch(result.excerpt, query)}
          </p>
        )}

        {(result.matchedFields?.length || result.availability || result.format) && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {result.matchedFields?.slice(0, 4).map((field) => (
              <span
                key={field}
                className="rounded-full px-2 py-0.5 text-[10.5px] font-medium"
                style={{ background: "var(--ptec-bg-body)", color: "var(--ptec-text-muted)" }}
              >
                {t("matchedField", { field })}
              </span>
            ))}
            {result.format && (
              <span className="rounded-full px-2 py-0.5 text-[10.5px] font-medium" style={{ background: "var(--ptec-bg-body)", color: "var(--ptec-text-muted)" }}>
                {result.format}
              </span>
            )}
            {result.availability && (
              <span className="rounded-full px-2 py-0.5 text-[10.5px] font-medium" style={{ background: "var(--ptec-bg-body)", color: "var(--ptec-text-muted)" }}>
                {result.availability}
              </span>
            )}
          </div>
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

        <div className="mt-3 flex flex-wrap gap-2">
          {actions.slice(0, 5).map((action) => (
            <Link
              key={action.key}
              href={action.href}
              onClick={() => trackSearchClick(result, query, action.key)}
              className={actionClass}
            >
              <Icon name={action.icon} className="text-[12px]" />
              {action.label}
            </Link>
          ))}
        </div>
      </div>
    </article>
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
  const [facetCounts, setFacetCounts] = useState<SearchFacetCounts | null>(null);
  const [mobileFacetsOpen, setMobileFacetsOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [fuzzy, setFuzzy] = useState(false);
  const [pageHits, setPageHits] = useState<PageHit[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [trending, setTrending] = useState<string[]>([]);
  const [popularSearches, setPopularSearches] = useState<string[]>([]);
  const [relatedSubjects, setRelatedSubjects] = useState<string[]>([]);
  const [popularResources, setPopularResources] = useState<SearchResult[]>([]);

  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const fetchedTrending = useRef(false);

  // The type tab lives in the URL (shareable, back-button safe), like q and the facets.
  const typeParam = params.get("type") ?? "all";
  const activeType: ActiveType = (TAB_IDS as string[]).includes(typeParam) ? (typeParam as ActiveType) : "all";

  // Sync input with URL param (e.g. back/forward navigation, recent-chip clicks)
  useEffect(() => { setInput(q); }, [q, setInput]);

  // Reset pagination when the query changes
  useEffect(() => { setPage(1); }, [q]);

  // Persist to recent searches only when the committed query (URL param)
  // changes — not on every tab/page/filter refetch, which polluted recents
  // with duplicates.
  useEffect(() => {
    if (q.trim()) setRecentSearches(pushRecentSearch(q));
  }, [q]);

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

  // Advanced-search filters — derived straight from the URL, same as `q`.
  // Facet dimensions (types/subject/lang/year/availability) are multi-select
  // and parsed separately below.
  const filterDept = params.get("dept") ?? "";
  const filterAuthor = params.get("author") ?? "";
  const filterAdvisor = params.get("advisor") ?? "";
  const filterProgram = params.get("program") ?? "";
  const filterCohort = params.get("cohort") ?? "";
  const filterFormat = params.get("format") ?? "";
  const filterViews = params.get("views") ?? "";
  const filterDownloads = params.get("downloads") ?? "";
  const filterRating = params.get("rating") ?? "";
  const filterIsbn = params.get("isbn") ?? "";
  const filterPublisher = params.get("publisher") ?? "";
  const sort = params.get("sort") ?? "relevance";

  const selections = parseFacetSelections((key) => params.get(key));
  const selectedFacetCount = FACET_DIMENSIONS.reduce((sum, dim) => sum + selections[dim].length, 0);
  const activeFilterCount =
    [
      filterDept, filterAuthor, filterAdvisor, filterProgram, filterCohort,
      filterFormat, filterViews, filterDownloads, filterRating, filterIsbn, filterPublisher,
    ].filter(Boolean).length + selectedFacetCount;

  // Run search whenever q, activeType, page, or the URL filter state changes
  const runSearch = useCallback(
    async (query: string, type: ActiveType, pg: number) => {
      if (!query) {
        setResults(null);
        setCounts(null);
        setFacetCounts(null);
        setFuzzy(false);
        setPageHits([]);
        setRelatedSubjects([]);
        setPopularResources([]);
        setLoading(false);
        return;
      }

      abortRef.current?.abort();
      abortRef.current = new AbortController();

      setLoading(true);
      setError(null);

      try {
        const url = new URL("/api/search/native", window.location.origin);
        // Forward the page URL's committed state wholesale — it is the single
        // source of truth for filters, facets, and sort.
        for (const [key, value] of params.entries()) url.searchParams.set(key, value);
        url.searchParams.set("q", query);
        url.searchParams.set("type", type);
        url.searchParams.set("page", String(pg));

        const res = await fetch(url.toString(), { signal: abortRef.current.signal });
        if (!res.ok) throw new Error("Search failed");

        const data = await res.json();
        setResults(data.results ?? []);
        setCounts(data.counts ?? null);
        setFacetCounts(data.facetCounts ?? null);
        setHasMore(data.hasMore ?? false);
        setFuzzy(data.fuzzy ?? false);
        setPageHits(data.pageHits ?? []);
        setRelatedSubjects(data.relatedSubjects ?? []);
        setPopularResources(data.popularResources ?? []);
        setLoading(false);
      } catch (err: unknown) {
        if ((err as Error)?.name === "AbortError") return;
        setError(t("errorGeneric"));
        setLoading(false);
      }
    },
    [t, params],
  );

  useEffect(() => {
    runSearch(q, activeType, page);
  }, [q, activeType, page, runSearch]);

  const toggleFacet = (dim: FacetDimension, value: string) => {
    const key = FACET_PARAM_KEYS[dim];
    const next = new URLSearchParams(params.toString());
    const current = dim === "subjects" ? (next.get("subject") ?? next.get("category")) : next.get(key);
    const merged = toggleListParam(current, value);
    if (merged) next.set(key, merged);
    else next.delete(key);
    if (dim === "subjects") next.delete("category");
    setPage(1);
    router.push(`/search?${next.toString()}`);
  };

  const removeFilter = (key: string) => {
    const next = new URLSearchParams(params.toString());
    next.delete(key);
    setPage(1);
    router.push(`/search?${next.toString()}`);
  };

  const clearFilters = () => {
    const next = new URLSearchParams(params.toString());
    for (const key of [
      "types", "lang", "subject", "category", "dept", "author", "advisor", "program",
      "cohort", "year", "format", "availability", "views", "downloads", "rating",
      "isbn", "publisher",
    ]) {
      next.delete(key);
    }
    setPage(1);
    router.push(`/search?${next.toString()}`);
  };

  const handleSearch = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const t = input.trim();
    if (!t) return;
    if (t !== q) {
      navigateToQuery(t);
    } else {
      setSuggestOpen(false);
      runSearch(t, activeType, 1);
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
    const next = new URLSearchParams(params.toString());
    if (type === "all") next.delete("type");
    else next.set("type", type);
    setPage(1);
    router.push(`/search?${next.toString()}`);
  };

  const handleSortChange = (value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value === "relevance") next.delete("sort");
    else next.set("sort", value);
    setPage(1);
    router.push(`/search?${next.toString()}`);
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
  // Page hits count as results too — a term found only inside PDF body text
  // must not render the "no results" dead-end.
  const noResults = results !== null && results.length === 0 && pageHits.length === 0 && !loading;

  const hasFacetValues =
    facetCounts !== null && FACET_DIMENSIONS.some((dim) => facetCounts[dim].length > 0);

  return (
    <>
      <div className="mx-auto max-w-3xl">
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
            autoComplete="off"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={suggestOpen}
            aria-haspopup="listbox"
            aria-controls="search-page-listbox"
            aria-activedescendant={suggestOpen && activeIdx >= 0 ? `search-suggestion-${activeIdx}` : undefined}
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
            className="flex-shrink-0 flex items-center gap-1.5 h-[40px] px-3.5 sm:px-4 mx-1.5 rounded-xl text-[13px] font-semibold transition-all duration-150 cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed hover:opacity-90 active:scale-[0.97] focus:outline-none focus:ring-2 focus:ring-focus-ring focus:ring-offset-1"
            style={{ background: "var(--ptec-brand)", color: "var(--ptec-brand-contrast)" }}
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
            // Only a real option list may carry role="listbox" — the recents/
            // trending chips and loading states are not option children.
            role={input.length >= 2 && suggestions.length > 0 ? "listbox" : undefined}
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
                  <div key={type} role="group" aria-labelledby={`search-suggest-group-${type}`}>
                    <div
                      className="flex items-center gap-2 px-4 py-2"
                      style={{ borderBottom: "1px solid var(--ptec-border)", background: "var(--ptec-bg-body)" }}
                      role="presentation"
                    >
                      <Icon name={SUGGESTION_TYPE_ICON[type]} className="text-[12px]" style={{ color: "var(--ptec-brand)" } as React.CSSProperties} aria-hidden />
                      <span id={`search-suggest-group-${type}`} className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--ptec-text-muted)" }}>
                        {t(SUGGESTION_TYPE_LABEL_KEY[type])}
                      </span>
                    </div>
                    {items.map((s, localIdx) => {
                      const globalIdx = suggestions.indexOf(s);
                      const isActive = globalIdx === activeIdx;
                      return (
                        <button
                          key={`${type}-${localIdx}`}
                          id={`search-suggestion-${globalIdx}`}
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
                            {(s.type === "book" || s.type === "research" || s.type === "publication" || s.type === "catalog" || s.type === "post") && s.sub && (
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
          currentAdvisor={filterAdvisor}
          currentIsbn={filterIsbn}
          currentPublisher={filterPublisher}
          currentSubject={selections.subjects[0] ?? ""}
          currentLanguage={selections.langs[0] ?? ""}
          currentDepartment={filterDept}
          currentProgram={filterProgram}
          currentCohort={filterCohort}
          currentYear={selections.years[0] ?? ""}
          currentFormat={filterFormat}
          currentAvailability={selections.availability[0] ?? ""}
          currentViews={filterViews}
          currentDownloads={filterDownloads}
          currentRating={filterRating}
          categories={categories}
          languages={languages}
          departments={departments}
        />
        <label className="inline-flex h-9 items-center gap-2 rounded-xl border border-divider bg-bg-surface px-3 text-[12.5px] font-semibold text-text-body shadow-sm">
          <span className="text-text-muted">{t("sortLabel")}</span>
          <select
            value={sort}
            onChange={(e) => handleSortChange(e.target.value)}
            className="h-7 cursor-pointer rounded-md bg-transparent text-[12.5px] font-semibold text-text-heading outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
            aria-label={t("sortLabel")}
          >
            <option value="relevance">{t("sortRelevance")}</option>
            <option value="newest">{t("sortNewest")}</option>
            <option value="oldest">{t("sortOldest")}</option>
            <option value="title">{t("sortTitle")}</option>
            <option value="views">{t("sortViews")}</option>
            <option value="downloads">{t("sortDownloads")}</option>
            <option value="rating">{t("sortRating")}</option>
          </select>
        </label>
        {/* Facet dimensions (type/subject/lang/year/availability) live in the
            sidebar as checkboxes; only modal-only fields get removable chips. */}
        {([
          ["author", filterAuthor, t("advFieldAuthor")],
          ["advisor", filterAdvisor, t("advFieldAdvisor")],
          ["isbn", filterIsbn, t("advFieldIsbn")],
          ["publisher", filterPublisher, t("advFieldPublisher")],
          ["dept", filterDept, t("advFieldDepartment")],
          ["program", filterProgram, t("advFieldProgram")],
          ["cohort", filterCohort, t("advFieldCohort")],
          ["format", filterFormat, t("advFieldFormat")],
          ["views", filterViews, t("advFieldViews")],
          ["downloads", filterDownloads, t("advFieldDownloads")],
          ["rating", filterRating, t("advFieldRating")],
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
                aria-label={t("removeFilter", { label })}
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

      {/* Announce search lifecycle to screen readers: searching → N results
          (or fuzzy fallback / error). Counts matter — "results for X" alone
          doesn't tell a non-sighted user whether anything was found. */}
      <div className="sr-only" role="status" aria-live="polite">
        {q
          ? loading
            ? `${t("searchingFor")} ${q}`
            : error
              ? t("errorGeneric")
              : fuzzy
                ? t("fuzzyNotice", { query: q })
                : counts
                  ? t("resultsAnnouncement", { count: counts.total, query: q })
                  : `${t("resultsFor")} ${q}`
          : ""}
      </div>
      </div>

      {/* ── Results region: facet sidebar + main column ─────────────────── */}
      <div className={hasFacetValues ? "lg:grid lg:grid-cols-[240px_minmax(0,1fr)] lg:items-start lg:gap-8" : undefined}>
      {hasFacetValues && facetCounts && (
        <aside className="mb-6 lg:sticky lg:top-24 lg:mb-0" aria-label={t("filter")}>
          {/* Mobile: facets collapse behind a toggle; desktop: always visible */}
          <button
            type="button"
            onClick={() => setMobileFacetsOpen((v) => !v)}
            aria-expanded={mobileFacetsOpen}
            aria-controls="search-facets-panel"
            data-testid="facets-toggle"
            className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-xl border px-3 text-[12.5px] font-semibold lg:hidden"
            style={{ background: "var(--ptec-bg-surface)", borderColor: "var(--ptec-border)", color: "var(--ptec-text-body)" }}
          >
            {t("filter")}
            {selectedFacetCount > 0 && (
              <span
                className="rounded-full px-1.5 py-0.5 text-[10px] font-bold"
                style={{ background: "color-mix(in srgb, var(--ptec-brand) 12%, transparent)", color: "var(--ptec-brand)" }}
              >
                {selectedFacetCount}
              </span>
            )}
          </button>
          <div id="search-facets-panel" className={`${mobileFacetsOpen ? "mt-3 block" : "hidden"} lg:mt-0 lg:block`}>
            <SearchFacets
              facetCounts={facetCounts}
              showTypes={activeType === "all"}
              selectedCount={selectedFacetCount}
              onToggle={toggleFacet}
              onClearAll={clearFilters}
            />
          </div>
        </aside>
      )}
      <div className="min-w-0">

      {/* ── Type filter tabs (only when there are results or loading) ──── */}
      {q && (hasResults || loading) && (
        <div
          className="mb-6 flex items-center gap-1 overflow-x-auto pb-1"
          style={{ borderBottom: "1px solid var(--ptec-border)" }}
        >
          {TAB_IDS.map((tabId) => {
            const isActive = tabId === activeType;
            const cnt = countFor(tabId);
            // Keep the active tab visible even at 0 (a facet may have zeroed
            // it) so the user can still switch away from it.
            if (!loading && cnt === 0 && tabId !== "all" && !isActive) return null;
            return (
              <button
                key={tabId}
                type="button"
                onClick={() => handleTypeChange(tabId)}
                aria-pressed={isActive}
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
          role="alert"
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
          {(relatedSubjects.length > 0 || popularSearches.length > 0) && (
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {(relatedSubjects.length > 0 ? relatedSubjects : popularSearches).slice(0, 6).map((term) => (
                <button
                  key={term}
                  type="button"
                  onClick={() => router.push(`/search?q=${encodeURIComponent(term)}`)}
                  className="rounded-full border px-3 py-1.5 text-[12.5px] font-semibold transition-colors hover:border-brand/40 hover:text-brand"
                  style={{ borderColor: "var(--ptec-border)", color: "var(--ptec-text-body)" }}
                >
                  {term}
                </button>
              ))}
            </div>
          )}
          {popularResources.length > 0 && (
            <div className="mx-auto mt-5 max-w-md space-y-2 text-left">
              <p className="text-center text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: "var(--ptec-text-muted)" }}>
                {t("popularResources")}
              </p>
              {popularResources.slice(0, 3).map((item) => (
                <Link
                  key={`${item.type}-${item.id}`}
                  href={item.url}
                  onClick={() => trackSearchClick(item, q, "no-results-popular")}
                  className="block rounded-xl border px-3 py-2 text-[13px] font-semibold transition-colors hover:border-brand/40 hover:text-brand"
                  style={{ borderColor: "var(--ptec-border)", color: "var(--ptec-text-heading)" }}
                >
                  {item.title}
                </Link>
              ))}
            </div>
          )}
          <Link
            href="/books"
            className="mt-4 inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-[13px] font-semibold text-brand-contrast transition hover:opacity-90"
            style={{ background: "var(--ptec-brand)" }}
          >
            {t("browseLibrary")}
          </Link>
        </div>
      )}

      {/* ── Closest-matches notice (typo-tolerant fallback) ───────────── */}
      {!loading && hasResults && fuzzy && (
        <div
          className="mb-5 rounded-[14px] px-4 py-3 text-[13px]"
          style={{
            background: "color-mix(in srgb, var(--ptec-brand) 8%, var(--ptec-bg-surface))",
            border: "1px solid color-mix(in srgb, var(--ptec-brand) 25%, var(--ptec-border))",
            color: "var(--ptec-text-body)",
          }}
        >
          {t("fuzzyNotice", { query: q })}
        </div>
      )}

      {/* ── Results ───────────────────────────────────────────────────── */}
      {!loading && hasResults && (
        <>
          {activeType === "all" ? (
            // Grouped "All" view
            <div className="space-y-8">
              {(["book", "research", "publication", "catalog", "post"] as SearchResultType[]).map((type) => {
                const group = byType(type);
                if (group.length === 0) return null;
                const totalForType = counts?.[type] ?? group.length;
                const groupLabelKey: Record<SearchResultType, "groupBooks" | "groupTheses" | "groupPublications" | "groupCatalog" | "groupPosts"> = {
                  book:     "groupBooks",
                  research: "groupTheses",
                  publication: "groupPublications",
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
                        <ResultCard key={r.id} result={r} query={q} />
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
                <ResultCard key={r.id} result={r} query={q} />
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

      {/* ── Found inside PDFs (full-text page hits) ───────────────────── */}
      {!loading && activeType === "all" && pageHits.length > 0 && (
        <section className="mt-8" aria-labelledby="page-hits-heading">
          <h3
            id="page-hits-heading"
            className="mb-2 text-[12px] font-bold uppercase tracking-[0.08em]"
            style={{ color: "var(--ptec-text-muted)" }}
          >
            {t("foundInside")}
          </h3>
          <div className="flex flex-col gap-2.5">
            {pageHits.map((hit) => (
              <Link
                key={`${hit.recordType}-${hit.recordId}`}
                href={hit.url}
                className="group relative overflow-hidden rounded-[14px] border p-4 pl-5 transition-all hover:shadow-md"
                style={{ background: "var(--ptec-bg-surface)", borderColor: "var(--ptec-border)" }}
              >
                {/* Bookmark spine — marks the card as a passage pulled from a page */}
                <span
                  aria-hidden
                  className="absolute inset-y-0 left-0 w-[3px] transition-opacity opacity-60 group-hover:opacity-100"
                  style={{ background: "var(--ptec-brand)" }}
                />
                <blockquote
                  className="text-[14.5px] leading-relaxed"
                  style={{
                    color: "var(--ptec-text-body)",
                    fontFamily: "var(--font-var-serif), var(--font-var-hanuman), Georgia, serif",
                  }}
                >
                  {hit.snippet}
                </blockquote>
                <p className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px]">
                  <span className="font-bold group-hover:underline underline-offset-2" style={{ color: "var(--ptec-text-heading)" }}>
                    {hit.title}
                  </span>
                  <span className="rounded-full px-2 py-0.5 text-[10.5px] font-semibold" style={{ background: "var(--ptec-bg-body)", color: "var(--ptec-text-muted)" }}>
                    {t("onPage", { page: hit.pageNo })}
                  </span>
                  {hit.matchType === "semantic" && (
                    <span
                      className="rounded-full px-2 py-0.5 text-[10.5px] font-semibold"
                      style={{
                        background: "color-mix(in srgb, var(--ptec-brand) 9%, transparent)",
                        color: "var(--ptec-brand)",
                      }}
                    >
                      {t("relatedPassage")}
                    </span>
                  )}
                </p>
              </Link>
            ))}
          </div>
        </section>
      )}

      </div>
      </div>

      {/* ── Idle / empty state ────────────────────────────────────────── */}
      {!q && (
        <div
          className="relative mx-auto max-w-3xl overflow-hidden rounded-2xl"
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

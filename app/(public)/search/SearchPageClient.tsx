"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import Icon from "@/components/ui/core/Icon";
import type { SearchResult, SearchCounts, SearchResultType } from "@/app/api/search/native/route";
import "@/app/gcse.css";

const RECENT_KEY = "ptec-recent-searches";
const MAX_RECENT = 6;

const SUGGESTIONS = [
  "ភាសាខ្មែរ",
  "Mathematics",
  "Teaching methods",
  "Child development",
  "ការអប់រំ",
  "Pedagogy",
];

type ActiveType = "all" | SearchResultType;

const TABS: { id: ActiveType; label: string }[] = [
  { id: "all",      label: "All" },
  { id: "book",     label: "Books" },
  { id: "research", label: "Theses" },
  { id: "catalog",  label: "Catalog" },
  { id: "post",     label: "Posts" },
];

const TYPE_BADGE: Record<SearchResultType, { label: string; className: string }> = {
  book:     { label: "E-Book",   className: "bg-blue-500/15 text-blue-500 border-blue-500/20" },
  research: { label: "Thesis", className: "bg-green-600/15 text-green-600 border-green-600/20" },
  catalog:  { label: "Physical", className: "bg-amber-500/15 text-amber-600 border-amber-500/20" },
  post:     { label: "Post",     className: "bg-purple-500/15 text-purple-500 border-purple-500/20" },
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
            {badge.label}
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
                · {result.downloadCount} downloads
              </span>
            )}
          </div>
        )}
      </div>
    </Link>
  );
}

// ── Section heading inside "all" view ─────────────────────────────────────────
function SectionHeading({ label, count, type, onSeeAll }: {
  label: string;
  count: number;
  type: SearchResultType;
  onSeeAll: () => void;
}) {
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
          See all →
        </button>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function SearchPageClient() {
  const params = useSearchParams();
  const router = useRouter();
  const q = params.get("q") ?? "";

  const [input, setInput] = useState(q);
  const [focused, setFocused] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [counts, setCounts] = useState<SearchCounts | null>(null);
  const [activeType, setActiveType] = useState<ActiveType>("all");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);

  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Sync input with URL param
  useEffect(() => { setInput(q); }, [q]);

  // Reset to "all" tab when query changes
  useEffect(() => { setActiveType("all"); setPage(1); }, [q]);

  // Load recent searches (client-only)
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(RECENT_KEY);
      if (raw) setRecentSearches(JSON.parse(raw));
    } catch { /* private mode or quota */ }
  }, []);

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

  // Run search whenever q or activeType or page changes
  const runSearch = useCallback(
    async (query: string, type: ActiveType, pg: number) => {
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

        const res = await fetch(url.toString(), { signal: abortRef.current.signal });
        if (!res.ok) throw new Error("Search failed");

        const data = await res.json();
        setResults(data.results ?? []);
        setCounts(data.counts ?? null);
        setHasMore(data.hasMore ?? false);
        setLoading(false);

        // Persist to recent searches
        const t = query.trim();
        if (t) {
          setRecentSearches((prev) => {
            const next = [t, ...prev.filter((s) => s.toLowerCase() !== t.toLowerCase())].slice(0, MAX_RECENT);
            try { window.localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch { /* ignore */ }
            return next;
          });
        }
      } catch (err: unknown) {
        if ((err as Error)?.name === "AbortError") return;
        setError("Search failed. Please try again.");
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    runSearch(q, activeType, page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, activeType, page]);

  const saveRecent = (next: string[]) => {
    setRecentSearches(next);
    try { window.localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  };

  const handleSearch = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const t = input.trim();
    if (!t) return;
    if (t !== q) {
      router.push(`/search?q=${encodeURIComponent(t)}`);
    } else {
      runSearch(t, activeType, 1);
    }
  };

  const handleTypeChange = (type: ActiveType) => {
    setActiveType(type);
    setPage(1);
  };

  const clearInput = () => { setInput(""); inputRef.current?.focus(); };

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
            onChange={(e) => setInput(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder="Search books, authors, theses…"
            aria-label="Search the PTEC Library"
            autoFocus
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
              aria-label="Clear search input"
              className="flex-shrink-0 flex items-center justify-center w-7 h-7 rounded-full mx-1 cursor-pointer transition-colors duration-150 hover:bg-[color-mix(in_srgb,var(--ptec-border)_80%,transparent)]"
              style={{ color: "var(--ptec-text-muted)" }}
            >
              <Icon name="x" className="text-[12px]" />
            </button>
          )}

          <button
            type="submit"
            disabled={!input.trim()}
            aria-label="Search"
            className="flex-shrink-0 flex items-center gap-1.5 h-[40px] px-3.5 sm:px-4 mx-1.5 rounded-xl text-[13px] font-semibold transition-all duration-150 cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed hover:opacity-90 active:scale-[0.97] focus:outline-none focus:ring-2 focus:ring-offset-1"
            style={{ background: "var(--ptec-brand)", color: "#fff" }}
          >
            <Icon name="search" className="text-[12px]" />
            <span className="hidden sm:inline">Search</span>
          </button>
        </div>

        {q && (
          <div className="flex items-center gap-2 mt-3 px-1">
            <span className="text-[12px]" style={{ color: "var(--ptec-text-muted)" }}>
              {loading ? "Searching for" : "Results for"}
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

      <div className="sr-only" role="status" aria-live="polite">
        {q ? (loading ? `Searching for ${q}` : `Showing results for ${q}`) : ""}
      </div>

      {/* ── Type filter tabs (only when there are results or loading) ──── */}
      {q && (hasResults || loading) && (
        <div
          className="mb-6 flex items-center gap-1 overflow-x-auto pb-1"
          style={{ borderBottom: "1px solid var(--ptec-border)" }}
        >
          {TABS.map((tab) => {
            const isActive = tab.id === activeType;
            const cnt = countFor(tab.id);
            if (!loading && cnt === 0 && tab.id !== "all") return null;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleTypeChange(tab.id)}
                className="flex shrink-0 items-center gap-1.5 whitespace-nowrap px-3 py-2 text-[13px] font-semibold transition-all duration-150 cursor-pointer"
                style={{
                  color: isActive ? "var(--ptec-brand)" : "var(--ptec-text-muted)",
                  borderBottom: isActive ? "2px solid var(--ptec-brand)" : "2px solid transparent",
                  marginBottom: -1,
                }}
              >
                {tab.label}
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
            No results for &ldquo;{q}&rdquo;
          </p>
          <p className="text-[13px]" style={{ color: "var(--ptec-text-muted)" }}>
            Try different keywords, check your spelling, or browse by department.
          </p>
          <Link
            href="/books"
            className="mt-4 inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-[13px] font-semibold text-white transition hover:opacity-90"
            style={{ background: "var(--ptec-brand)" }}
          >
            Browse Library →
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
                const labels: Record<SearchResultType, string> = {
                  book:     "E-Books",
                  research: "Theses",
                  catalog:  "Physical Books",
                  post:     "Posts & News",
                };
                return (
                  <div key={type}>
                    <SectionHeading
                      label={labels[type]}
                      count={totalForType}
                      type={type}
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
                Load more
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
                Search the PTEC Library
              </p>
              <p className="text-[13px] leading-relaxed" style={{ color: "var(--ptec-text-muted)" }}>
                Books, theses, physical catalog, and news — all searchable in one place.
              </p>
            </div>

            {/* Recent searches */}
            {recentSearches.length > 0 && (
              <div className="flex flex-col items-center gap-3 w-full max-w-sm">
                <div className="flex items-center justify-between w-full">
                  <p className="text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: "var(--ptec-text-muted)" }}>
                    Recent searches
                  </p>
                  <button
                    type="button"
                    onClick={() => saveRecent([])}
                    className="text-[10px] font-semibold cursor-pointer hover:underline underline-offset-2"
                    style={{ color: "var(--ptec-text-muted)" }}
                  >
                    Clear
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
                        onClick={() => saveRecent(recentSearches.filter((x) => x !== s))}
                        aria-label={`Remove ${s}`}
                        className="flex items-center justify-center w-4 h-4 rounded-full cursor-pointer transition-colors hover:bg-[color-mix(in_srgb,var(--ptec-border)_80%,transparent)]"
                      >
                        <Icon name="x" className="text-[9px]" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Suggestion chips */}
            <div className="flex flex-col items-center gap-3 w-full max-w-sm">
              <p className="text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: "var(--ptec-text-muted)" }}>
                Try searching for
              </p>
              <div className="flex flex-wrap gap-2 justify-center">
                {SUGGESTIONS.map((s) => (
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

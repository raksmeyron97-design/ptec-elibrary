"use client";

import Script from "next/script";
import { useSearchParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import Icon from "@/components/ui/core/Icon";

declare global {
  interface Window {
    __gcse?: any;
    google?: {
      search?: {
        cse?: {
          element?: {
            getElement(name: string): { execute(q: string): void } | undefined | null;
          };
        };
      };
    };
  }
}

const GNAME = "ptec-search";
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

export default function SearchPageClient() {
  const params = useSearchParams();
  const router = useRouter();
  const q = params.get("q") ?? "";

  const [input, setInput] = useState(q);
  const [focused, setFocused] = useState(false);
  const [resultsLoading, setResultsLoading] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const lastRan = useRef("");
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setInput(q); }, [q]);

  // Load recent searches once, client-side only.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(RECENT_KEY);
      if (raw) setRecentSearches(JSON.parse(raw));
    } catch {
      /* localStorage unavailable — recent searches simply won't persist */
    }
  }, []);

  // Global "/" shortcut to jump into the search box, like most modern search UIs.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) return;
      e.preventDefault();
      inputRef.current?.focus();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const saveRecent = (next: string[]) => {
    setRecentSearches(next);
    try {
      window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    } catch {
      /* ignore write failures (private mode, quota, etc.) */
    }
  };

  const addRecentSearch = (term: string) => {
    const t = term.trim();
    if (!t) return;
    const next = [t, ...recentSearches.filter((s) => s.toLowerCase() !== t.toLowerCase())].slice(0, MAX_RECENT);
    saveRecent(next);
  };

  const removeRecentSearch = (term: string) => {
    saveRecent(recentSearches.filter((s) => s !== term));
  };

  const clearRecentSearches = () => saveRecent([]);

  // Setup Google CSE callbacks to handle loading state
  useEffect(() => {
    window.__gcse = window.__gcse || {};
    window.__gcse.searchCallbacks = {
      web: {
        starting: () => {
          setResultsLoading(true);
        },
        rendered: () => {
          setResultsLoading(false);
        },
      },
    };
  }, []);

  useEffect(() => {
    if (!q) {
      setResultsLoading(false);
      return;
    }
    if (lastRan.current === q) return;

    setResultsLoading(true);

    const run = (n = 0) => {
      const el = window.google?.search?.cse?.element?.getElement(GNAME);
      if (el) {
        try {
          el.execute(q);
          lastRan.current = q;
          addRecentSearch(q);
        } catch (e) {
          if (n < 50) setTimeout(() => run(n + 1), 150);
          else setResultsLoading(false);
        }
      } else if (n < 50) {
        setTimeout(() => run(n + 1), 150);
      } else {
        setResultsLoading(false);
      }
    };
    const kickoff = setTimeout(() => run(), 300);

    return () => clearTimeout(kickoff);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const handleSearch = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const t = input.trim();
    if (!t) return;
    if (t === q) {
      setResultsLoading(true);
      const el = window.google?.search?.cse?.element?.getElement(GNAME);
      if (el) {
        try {
          el.execute(t);
          addRecentSearch(t);
        } catch (err) {
          setResultsLoading(false);
        }
      } else {
        setResultsLoading(false);
      }
    } else {
      router.push(`/search?q=${encodeURIComponent(t)}`);
    }
  };

  const clearInput = () => {
    setInput("");
    inputRef.current?.focus();
  };

  return (
    <>
      <Script
        src="https://cse.google.com/cse.js?cx=5542ee23a89194b67"
        strategy="afterInteractive"
      />

      <style>{`
        /* ── Google CSE — PTEC Theme ── */
        .gsc-control-cse {
          font-family: inherit !important;
          background-color: transparent !important;
          border: none !important;
          padding: 0 !important;
        }
        /* Hide CSE's own search bar */
        .gsc-search-box { display: none !important; }

        /* Refinement tabs */
        .gsc-tabsArea {
          border-bottom: 1px solid var(--ptec-border) !important;
          margin-bottom: 20px !important;
        }
        .gsc-tabHeader {
          color: var(--ptec-text-muted) !important;
          font-family: inherit !important;
          font-weight: 600 !important;
          font-size: 13px !important;
          padding: 9px 14px 7px !important;
          margin-right: 4px !important;
          border: none !important;
          background: transparent !important;
          border-bottom: 2px solid transparent !important;
          transition: all 0.15s ease !important;
          cursor: pointer !important;
        }
        .gsc-tabHeader:hover { color: var(--ptec-brand) !important; }
        .gsc-tabHeader.gsc-tabhActive {
          color: var(--ptec-brand) !important;
          border-bottom: 2px solid var(--ptec-brand) !important;
        }

        /* Result info line */
        .gsc-result-info {
          color: var(--ptec-text-muted) !important;
          font-size: 12px !important;
          padding: 0 4px 16px !important;
          font-family: inherit !important;
        }

        /* Result cards */
        .gsc-webResult.gsc-result {
          background-color: var(--ptec-bg-surface) !important;
          border: 1px solid var(--ptec-border) !important;
          border-radius: 14px !important;
          padding: 18px 20px !important;
          margin-bottom: 12px !important;
          transition: border-color 0.15s ease, box-shadow 0.15s ease !important;
        }
        .gsc-webResult.gsc-result:hover {
          border-color: color-mix(in srgb, var(--ptec-brand) 30%, transparent) !important;
          box-shadow: 0 4px 16px rgba(30,58,138,0.06) !important;
        }

        /* Title */
        .gs-title, .gs-title * {
          color: var(--ptec-brand) !important;
          text-decoration: none !important;
          font-weight: 600 !important;
          font-size: 16px !important;
          font-family: inherit !important;
          line-height: 1.4 !important;
        }
        .gs-title:hover, .gs-title *:hover {
          text-decoration: underline !important;
          text-underline-offset: 2px !important;
        }

        /* URL breadcrumb */
        .gs-visibleUrl, .gs-visibleUrl-short {
          color: var(--ptec-text-muted) !important;
          font-size: 12px !important;
          margin: 3px 0 6px !important;
          font-family: inherit !important;
        }

        /* Snippet */
        .gs-snippet {
          color: var(--ptec-text-body) !important;
          font-size: 13.5px !important;
          line-height: 1.65 !important;
          font-family: inherit !important;
        }
        .gs-snippet b, .gs-snippet em {
          color: var(--ptec-text-heading) !important;
          font-weight: 600 !important;
          font-style: normal !important;
        }

        /* Thumbnail */
        .gs-image {
          border-radius: 8px !important;
          border: 1px solid var(--ptec-border) !important;
          object-fit: cover !important;
        }

        /* Pagination */
        .gsc-cursor-box {
          margin-top: 28px !important;
          text-align: center !important;
        }
        .gsc-cursor-page {
          display: inline-flex !important;
          align-items: center !important;
          justify-content: center !important;
          min-width: 36px !important;
          height: 36px !important;
          padding: 0 10px !important;
          color: var(--ptec-text-muted) !important;
          font-weight: 600 !important;
          font-size: 13px !important;
          margin: 0 3px !important;
          border-radius: 10px !important;
          border: 1px solid var(--ptec-border) !important;
          background: var(--ptec-bg-surface) !important;
          transition: all 0.15s ease !important;
          cursor: pointer !important;
          font-family: inherit !important;
        }
        .gsc-cursor-page:hover {
          border-color: color-mix(in srgb, var(--ptec-brand) 40%, transparent) !important;
          color: var(--ptec-brand) !important;
          background: color-mix(in srgb, var(--ptec-brand) 5%, transparent) !important;
        }
        .gsc-cursor-page.gsc-cursor-current-page {
          background: var(--ptec-brand) !important;
          color: #fff !important;
          border-color: var(--ptec-brand) !important;
        }

        /* Above-wrapper area */
        .gsc-above-wrapper-area {
          border-bottom: none !important;
          padding: 0 !important;
          margin-bottom: 4px !important;
        }

        /* Hide branding */
        .gcsc-branding { display: none !important; }

        /* No results */
        .gs-no-results-result .gs-snippet {
          color: var(--ptec-text-muted) !important;
          font-size: 14px !important;
          padding: 32px 0 !important;
        }
      `}</style>

      {/* ── Search bar ──────────────────────────────────────────────── */}
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
          {/* Search icon */}
          <span className="flex-shrink-0 pl-4 pr-2.5 pointer-events-none">
            <Icon
              name="search"
              className="text-[17px]"
              style={{ color: focused ? "var(--ptec-brand)" : "var(--ptec-text-muted)", transition: "color 0.15s" } as React.CSSProperties}
            />
          </span>

          {/* Input */}
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder="Search books, authors, research…"
            aria-label="Search the PTEC Library"
            autoFocus
            className="flex-1 min-w-0 h-full bg-transparent text-[15px] font-medium outline-none placeholder:font-normal"
            style={{
              color: "var(--ptec-text-heading)",
            }}
          />

          {/* Keyboard-shortcut hint — desktop only, hidden once typing or focused */}
          {!focused && !input && (
            <kbd
              aria-hidden="true"
              className="hidden sm:inline-flex flex-shrink-0 items-center justify-center h-5 min-w-[20px] px-1.5 mr-1 rounded-md text-[11px] font-semibold"
              style={{
                color: "var(--ptec-text-muted)",
                border: "1px solid var(--ptec-border)",
                background: "var(--ptec-bg-body)",
              }}
            >
              /
            </kbd>
          )}

          {/* Clear */}
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

          {/* Submit */}
          <button
            type="submit"
            disabled={!input.trim()}
            aria-label="Search"
            className="flex-shrink-0 flex items-center gap-1.5 h-[40px] px-3.5 sm:px-4 mx-1.5 rounded-xl text-[13px] font-semibold transition-all duration-150 cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed hover:opacity-90 active:scale-[0.97] focus:outline-none focus:ring-2 focus:ring-offset-1"
            style={{
              background: "var(--ptec-brand)",
              color: "#fff",
            }}
          >
            <Icon name="search" className="text-[12px]" />
            <span className="hidden sm:inline">Search</span>
          </button>
        </div>

        {/* Query tag when searching */}
        {q && (
          <div className="flex items-center gap-2 mt-3 px-1">
            <span className="text-[12px]" style={{ color: "var(--ptec-text-muted)" }}>
              {resultsLoading ? "Searching for" : "Results for"}
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
            {resultsLoading && (
              <span
                aria-hidden="true"
                className="inline-block w-3 h-3 rounded-full animate-spin"
                style={{ border: "2px solid var(--ptec-border)", borderTopColor: "var(--ptec-brand)" }}
              />
            )}
          </div>
        )}
      </form>

      {/* Screen-reader announcement for search state changes */}
      <div className="sr-only" role="status" aria-live="polite">
        {q ? (resultsLoading ? `Searching for ${q}` : `Showing results for ${q}`) : ""}
      </div>

      {/* ── Loading skeleton ────────────────────────────────────────── */}
      {q && resultsLoading && (
        <div className="space-y-3" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="rounded-[14px] p-[18px_20px] animate-pulse"
              style={{ background: "var(--ptec-bg-surface)", border: "1px solid var(--ptec-border)" }}
            >
              <div className="h-4 w-2/5 rounded mb-3" style={{ background: "var(--ptec-border)" }} />
              <div className="h-2.5 w-1/4 rounded mb-3" style={{ background: "var(--ptec-border)" }} />
              <div className="h-3 w-full rounded mb-1.5" style={{ background: "var(--ptec-border)" }} />
              <div className="h-3 w-5/6 rounded" style={{ background: "var(--ptec-border)" }} />
            </div>
          ))}
        </div>
      )}

      {/* ── Google CSE results ──────────────────────────────────────── */}
      <div style={{ opacity: resultsLoading ? 0 : 1, transition: "opacity 0.2s ease" }}>
        <div
          ref={resultsRef}
          className="gcse-searchresults-only"
          data-gname={GNAME}
        />
      </div>

      {/* ── Empty / idle state ──────────────────────────────────────── */}
      {!q && (
        <div className="relative overflow-hidden rounded-2xl" style={{ border: "1.5px dashed var(--ptec-border)", background: "var(--ptec-bg-surface)" }}>
          {/* Subtle grid pattern */}
          <div
            className="absolute inset-0 opacity-[0.03]"
            style={{
              backgroundImage: `linear-gradient(var(--ptec-brand) 1px, transparent 1px), linear-gradient(90deg, var(--ptec-brand) 1px, transparent 1px)`,
              backgroundSize: "32px 32px",
            }}
          />

          <div className="relative flex flex-col items-center gap-7 py-16 px-6 text-center">
            {/* Icon */}
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

            {/* Copy */}
            <div className="max-w-xs">
              <p className="text-[17px] font-bold mb-2" style={{ color: "var(--ptec-text-heading)" }}>
                Search the PTEC Library
              </p>
              <p className="text-[13px] leading-relaxed" style={{ color: "var(--ptec-text-muted)" }}>
                Books, research reports, and educational resources — all indexed and searchable.
              </p>
            </div>

            {/* Recent searches */}
            {recentSearches.length > 0 && (
              <div className="flex flex-col items-center gap-3 w-full max-w-sm">
                <div className="flex items-center justify-between w-full">
                  <p
                    className="text-[10px] font-bold uppercase tracking-[0.12em]"
                    style={{ color: "var(--ptec-text-muted)" }}
                  >
                    Recent searches
                  </p>
                  <button
                    type="button"
                    onClick={clearRecentSearches}
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
                      style={{
                        background: "var(--ptec-bg-body)",
                        color: "var(--ptec-text-body)",
                        border: "1px solid var(--ptec-border)",
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => router.push(`/search?q=${encodeURIComponent(s)}`)}
                        aria-label={`Search recent term: ${s}`}
                        className="cursor-pointer"
                      >
                        {s}
                      </button>
                      <button
                        type="button"
                        onClick={() => removeRecentSearch(s)}
                        aria-label={`Remove ${s} from recent searches`}
                        className="flex items-center justify-center w-4 h-4 rounded-full cursor-pointer transition-colors duration-150 hover:bg-[color-mix(in_srgb,var(--ptec-border)_80%,transparent)]"
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
              <p
                className="text-[10px] font-bold uppercase tracking-[0.12em]"
                style={{ color: "var(--ptec-text-muted)" }}
              >
                Try searching for
              </p>
              <div className="flex flex-wrap gap-2 justify-center">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => router.push(`/search?q=${encodeURIComponent(s)}`)}
                    aria-label={`Search for ${s}`}
                    className="inline-flex items-center gap-1 px-3.5 py-1.5 rounded-full text-[12.5px] font-medium transition-all duration-150 cursor-pointer active:scale-95"
                    style={{
                      background: "color-mix(in srgb, var(--ptec-brand) 7%, transparent)",
                      color: "var(--ptec-brand)",
                      border: "1px solid color-mix(in srgb, var(--ptec-brand) 20%, transparent)",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "color-mix(in srgb, var(--ptec-brand) 14%, transparent)";
                      e.currentTarget.style.borderColor = "color-mix(in srgb, var(--ptec-brand) 35%, transparent)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "color-mix(in srgb, var(--ptec-brand) 7%, transparent)";
                      e.currentTarget.style.borderColor = "color-mix(in srgb, var(--ptec-brand) 20%, transparent)";
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
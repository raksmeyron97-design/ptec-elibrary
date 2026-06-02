"use client";

import { useRef, useEffect, useState, FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import Icon, { IconName } from "@/components/ui/core/Icon";
import type { Suggestion } from "@/app/api/books/suggestions/route";
import { useBookSuggestions } from "@/components/ui/search/useBookSuggestions";
import { readRecent } from "@/components/ui/home/SearchSuggestions";

type SearchBarProps = {
  compact?: boolean;
};

const TYPE_ICON: Record<Suggestion["type"], IconName> = {
  book:     "library",
  author:   "account",
  category: "bookmark",
};

const TYPE_LABEL: Record<Suggestion["type"], string> = {
  book:     "Book",
  author:   "Author",
  category: "Category",
};

const TYPE_COLOR: Record<Suggestion["type"], string> = {
  book:     "text-brand",
  author:   "text-gold-700 dark:text-accent-text",
  category: "text-brand",
};

const TYPE_BG: Record<Suggestion["type"], string> = {
  book:     "bg-brand/5",
  author:   "bg-gold-50 dark:bg-accent/10",
  category: "bg-brand/10",
};

const DEFAULT_TRENDING = ["Pedagogy", "Mathematics", "Science", "History"];

export default function SearchBar({ compact = false }: SearchBarProps) {
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get("q") ?? "";

  const {
    query,
    setQuery,
    suggestions,
    loading,
    open,
    setOpen,
    activeIdx,
    setActiveIdx,
    grouped,
    groupOrder,
    navigate,
    pickSuggestion,
  } = useBookSuggestions({ initialQuery });

  const inputRef    = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [recent, setRecent] = useState<string[]>([]);

  useEffect(() => {
    if (open) {
      setRecent(readRecent());
    }
  }, [open]);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        !inputRef.current?.contains(e.target as Node) &&
        !dropdownRef.current?.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [setOpen]);

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    navigate(query);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open) return;
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
      setOpen(false);
      setActiveIdx(-1);
    }
  }

  // Highlight matched text
  function highlight(text: string, q: string) {
    if (!q) return <>{text}</>;
    const idx = text.toLowerCase().indexOf(q.toLowerCase());
    if (idx === -1) return <>{text}</>;
    return (
      <>
        {text.slice(0, idx)}
        <mark className="rounded-sm bg-accent/20 text-text-heading font-semibold not-italic">
          {text.slice(idx, idx + q.length)}
        </mark>
        {text.slice(idx + q.length)}
      </>
    );
  }

  const showRecentTrending = query.length < 2;
  const showNoResults = query.length >= 2 && !loading && suggestions.length === 0;
  const showSuggestions = suggestions.length > 0;

  return (
    <div className="relative w-full">
      <form
        onSubmit={handleSubmit}
        className="flex w-full flex-row items-center gap-2.5"
      >
        <label className="relative min-w-0 flex-1">
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={handleKeyDown}
            className="
              peer h-13 w-full rounded-xl
              border border-divider
              bg-bg-surface
              py-3 pl-4 pr-12
              sm:pl-12 sm:pr-10
              text-text-heading placeholder:text-text-muted caret-brand
              text-[16px] sm:text-sm
              outline-none shadow-sm
              transition-all duration-200
              focus:border-brand
              focus:ring-2 focus:ring-focus-ring/30
              focus:shadow-md
              [&::-webkit-search-decoration]:hidden
              [&::-webkit-search-cancel-button]:hidden
              [&::-webkit-search-results-button]:hidden
              [&::-webkit-search-results-decoration]:hidden
            "
            placeholder="Search title, author, ISBN, or topic"
            type="text"
            inputMode="search"
            enterKeyHint="search"
            autoComplete="off"
            aria-autocomplete="list"
            aria-expanded={open}
            aria-haspopup="listbox"
          />

          {/* Search icon (desktop only, left side) */}
          <div className="absolute left-4 top-1/2 -translate-y-1/2 z-10 hidden sm:flex items-center pointer-events-none text-text-muted peer-focus:text-brand transition-colors duration-200">
            <Icon name="search" className="text-xl" />
          </div>

          {/* Loading spinner */}
          {loading && (
            <span className="absolute right-3.5 top-1/2 -translate-y-1/2">
              <Icon name="spinner" className="h-4 w-4 animate-spin text-brand" />
            </span>
          )}

          {/* Clear button */}
          {query && !loading && (
            <button
              type="button"
              onClick={() => {
                setQuery(""); setOpen(true);
                inputRef.current?.focus();
              }}
              className="
                absolute right-3.5 top-1/2 -translate-y-1/2
                flex h-5 w-5 items-center justify-center
                rounded-full bg-paper text-text-muted
                transition hover:bg-brand/5 hover:text-brand
                active:scale-95
                hidden sm:flex
              "
              aria-label="Clear search"
            >
              <Icon name="x" className="h-3 w-3" strokeWidth={2.5} />
            </button>
          )}

          {/* Mobile submit button inside input */}
          {!loading && (
            <button
              type="submit"
              className="
                absolute right-2 top-1/2 -translate-y-1/2
                flex h-9 w-9 items-center justify-center
                rounded-lg
                bg-brand text-brand-contrast
                shadow-sm transition-all duration-200
                active:scale-95
                sm:hidden
              "
              aria-label="Search"
            >
              <Icon name="search" className="text-[18px]" />
            </button>
          )}
        </label>

        {/* Submit button (desktop only) */}
        <button
          type="submit"
          className="
            hidden sm:inline-flex
            h-13 items-center justify-center gap-2
            rounded-xl
            bg-brand px-6 font-semibold text-brand-contrast
            text-sm shadow-sm
            transition-all duration-200
            hover:bg-brand-hover
            focus:outline-none focus:ring-2 focus:ring-focus-ring focus:ring-offset-2
            active:scale-[0.98]
          "
        >
          <Icon name="search" className="text-[18px]" />
          Search
        </button>
      </form>

      {/* Dropdown */}
      {open && (showRecentTrending || showNoResults || showSuggestions) && (
        <div
          ref={dropdownRef}
          role="listbox"
          className="
            absolute left-0 right-0 top-[calc(100%+8px)] z-50
            overflow-hidden rounded-xl
            border border-divider bg-bg-surface
            shadow-lg ring-1 ring-black/5
            animate-in fade-in slide-in-from-top-1 duration-150
          "
        >
          {showRecentTrending && (
            <div className="p-4 space-y-4">
              {recent.length > 0 && (
                <div>
                  <h4 className="text-[10px] font-bold uppercase tracking-widest text-text-muted mb-2">Recent Searches</h4>
                  <div className="flex flex-wrap gap-2">
                    {recent.map((term) => (
                      <button
                        key={term}
                        type="button"
                        onClick={() => { setQuery(term); navigate(term); }}
                        className="inline-flex items-center gap-1.5 rounded-full border border-divider bg-paper px-3 py-1 text-sm text-text-heading transition-colors hover:border-brand/40 hover:bg-brand/5 hover:text-brand"
                      >
                        <Icon name="clock" className="text-[12px] opacity-70" />
                        {term}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              
              <div>
                <h4 className="text-[10px] font-bold uppercase tracking-widest text-text-muted mb-2">Trending Searches</h4>
                <div className="flex flex-wrap gap-2">
                  {DEFAULT_TRENDING.map((term) => (
                    <button
                      key={term}
                      type="button"
                      onClick={() => { setQuery(term); navigate(term); }}
                      className="inline-flex items-center gap-1.5 rounded-full border border-divider bg-paper px-3 py-1 text-sm text-text-heading transition-colors hover:border-accent/40 hover:bg-accent/10 hover:text-accent-text"
                    >
                      <Icon name="star" className="text-[12px] opacity-70" />
                      {term}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {showNoResults && (
            <div className="px-4 py-8 text-center flex flex-col items-center">
              <Icon name="search-off" className="text-4xl text-text-muted mb-3" />
              <p className="text-text-heading font-medium mb-1">No matches for "{query}"</p>
              <p className="text-sm text-text-muted mb-4">Try checking your spelling or use more general terms.</p>
              <button
                type="button"
                onClick={() => navigate(query)}
                className="inline-flex items-center gap-2 rounded-lg bg-brand/10 px-4 py-2 text-sm font-semibold text-brand transition-colors hover:bg-brand/20"
              >
                <Icon name="search" />
                Search all books for "{query}"
              </button>
            </div>
          )}

          {showSuggestions && groupOrder.map((type) => {
            const items = grouped[type];
            if (!items?.length) return null;
            return (
              <div key={type}>
                {/* Group header */}
                <div className="flex items-center gap-2 border-b border-divider bg-paper px-4 py-2">
                  <span className={`flex h-5 w-5 items-center justify-center rounded-md ${TYPE_BG[type]}`}>
                    <Icon name={TYPE_ICON[type]} className={`text-[13px] ${TYPE_COLOR[type]}`} />
                  </span>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-text-muted">
                    {TYPE_LABEL[type]}s
                  </span>
                </div>

                {/* Items */}
                {items.map((s, localIdx) => {
                  const globalIdx = suggestions.indexOf(s);
                  const isActive  = globalIdx === activeIdx;
                  return (
                    <button
                      key={`${type}-${localIdx}`}
                      type="button"
                      role="option"
                      aria-selected={isActive}
                      onMouseEnter={() => setActiveIdx(globalIdx)}
                      onMouseDown={(e) => { e.preventDefault(); pickSuggestion(s); }}
                      className={`
                        flex w-full items-center gap-3 px-4 py-3 text-left
                        transition-colors duration-100
                        min-h-[52px]
                        ${isActive ? "bg-brand/5" : "hover:bg-paper"}
                      `}
                    >
                      {/* Icon badge */}
                      <span className={`
                        flex h-9 w-9 shrink-0 items-center justify-center
                        rounded-lg ${TYPE_BG[type]}
                        ring-1 ring-white/80
                      `}>
                        <Icon name={TYPE_ICON[type]} className={`text-base ${TYPE_COLOR[type]}`} />
                      </span>

                      {/* Text */}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-text-heading">
                          {highlight(s.label, query)}
                        </span>
                        {s.type === "book" && (
                          <span className="block truncate text-xs text-text-muted mt-0.5">{s.sub}</span>
                        )}
                        {s.type !== "book" && (
                          <span className="block text-xs text-text-muted mt-0.5">
                            Search by {TYPE_LABEL[type].toLowerCase()}
                          </span>
                        )}
                      </span>

                      {/* Chevron */}
                      <Icon
                        name="chevron-right"
                        className={`text-[16px] shrink-0 transition-colors ${isActive ? "text-brand" : "text-text-muted"}`}
                      />
                    </button>
                  );
                })}
              </div>
            );
          })}

          {/* Footer keyboard hint (only when suggestions are shown) */}
          {showSuggestions && (
            <div className="hidden sm:flex items-center gap-3 border-t border-divider bg-paper px-4 py-2">
              {[["↑↓", "Navigate"], ["↵", "Select"], ["Esc", "Close"]].map(([key, label]) => (
                <span key={key} className="flex items-center gap-1.5">
                  <kbd className="rounded-md border border-divider bg-bg-surface px-1.5 py-0.5 font-mono text-[11px] text-text-muted shadow-sm">
                    {key}
                  </kbd>
                  <span className="text-[11px] text-text-muted">{label}</span>
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

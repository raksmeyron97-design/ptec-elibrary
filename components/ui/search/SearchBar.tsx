"use client";

/* eslint-disable @typescript-eslint/no-unused-vars */

import { useRef, useEffect, useState, FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import Icon, { IconName } from "@/components/ui/core/Icon";
import type { Suggestion } from "@/app/api/books/suggestions/route";
import { useBookSuggestions } from "@/components/ui/search/useBookSuggestions";
import { readRecent } from "@/components/ui/home/SearchSuggestions";

type SearchBarProps = {
  compact?: boolean;
  placeholder?: string;
  buttonLabel?: string;
};

const TYPE_ICON: Record<Suggestion["type"], IconName> = {
  book:     "library",
  author:   "account",
  category: "bookmark",
  research: "school",
};

const TYPE_LABEL: Record<Suggestion["type"], string> = {
  book:     "Book",
  author:   "Author",
  category: "Category",
  research: "Research Report",
};

const TYPE_LABEL_PLURAL: Record<Suggestion["type"], string> = {
  book:     "Books",
  author:   "Authors",
  category: "Categories",
  research: "Research Reports",
};

const TYPE_COLOR: Record<Suggestion["type"], string> = {
  book:     "text-brand",
  author:   "text-gold-700 dark:text-accent-text",
  category: "text-brand",
  research: "text-accent-text",
};

const TYPE_BG: Record<Suggestion["type"], string> = {
  book:     "bg-brand/8",
  author:   "bg-gold-50 dark:bg-accent/10",
  category: "bg-brand/10",
  research: "bg-accent/10",
};

const FALLBACK_TRENDING = ["Pedagogy", "Mathematics", "Science", "History"];

export default function SearchBar({
  compact = false,
  placeholder = "Search title, author, ISBN, or topic",
  buttonLabel = "Search",
}: SearchBarProps) {
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

  const [recent, setRecent]     = useState<string[]>([]);
  const [trending, setTrending] = useState<string[]>(FALLBACK_TRENDING);
  const fetchedTrending = useRef(false);

  useEffect(() => {
    if (open) {
      setRecent(readRecent());
      if (!fetchedTrending.current) {
        fetchedTrending.current = true;
        fetch("/api/departments/trending")
          .then((res) => res.json())
          .then((data) => {
            if (Array.isArray(data) && data.length > 0) setTrending(data);
          })
          .catch(() => {});
      }
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
        <mark className="rounded-sm bg-accent/20 font-semibold not-italic text-text-heading">
          {text.slice(idx, idx + q.length)}
        </mark>
        {text.slice(idx + q.length)}
      </>
    );
  }

  const showRecentTrending = query.length < 2;
  const showNoResults      = query.length >= 2 && !loading && suggestions.length === 0;
  const showSuggestions    = suggestions.length > 0;

  return (
    <div className="relative w-full">
      <form onSubmit={handleSubmit} className="flex w-full flex-row items-center gap-2.5">
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
              peer h-13 w-full rounded-2xl
              border border-divider
              bg-bg-surface
              py-3 pl-4 pr-12
              sm:pl-12 sm:pr-10
              text-[16px] text-text-heading placeholder:text-text-muted caret-brand
              sm:text-sm
              outline-none shadow-sm
              transition-all duration-200
              focus:border-brand focus:shadow-md focus:ring-2 focus:ring-focus-ring/30
              [&::-webkit-search-cancel-button]:hidden
              [&::-webkit-search-decoration]:hidden
              [&::-webkit-search-results-button]:hidden
              [&::-webkit-search-results-decoration]:hidden
            "
            placeholder={placeholder}
            type="text"
            inputMode="search"
            enterKeyHint="search"
            autoComplete="off"
            aria-label={placeholder}
            aria-autocomplete="list"
            aria-expanded={open}
            aria-haspopup="listbox"
            aria-controls="searchbar-listbox"
          />

          {/* Search icon — desktop left side */}
          <div className="pointer-events-none absolute left-4 top-1/2 z-10 hidden -translate-y-1/2 items-center text-text-muted transition-colors duration-200 peer-focus:text-brand sm:flex">
            <Icon name="search" className="text-xl" />
          </div>

          {/* Loading spinner */}
          {loading && (
            <span className="absolute right-3.5 top-1/2 -translate-y-1/2">
              <Icon name="spinner" className="h-4 w-4 animate-spin text-brand" />
            </span>
          )}

          {/* Clear button — desktop */}
          {query && !loading && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setOpen(true);
                inputRef.current?.focus();
              }}
              className="
                absolute right-3.5 top-1/2 -translate-y-1/2
                hidden h-5 w-5 cursor-pointer items-center justify-center
                rounded-full bg-paper text-text-muted
                transition hover:bg-brand/8 hover:text-brand
                active:scale-95 sm:flex
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
                flex h-9 w-9 cursor-pointer items-center justify-center
                rounded-xl bg-brand text-brand-contrast
                shadow-sm transition-all duration-200
                active:scale-95 sm:hidden
              "
              aria-label={buttonLabel}
            >
              <Icon name="search" className="text-[18px]" />
            </button>
          )}
        </label>

        {/* Submit button — desktop */}
        <button
          type="submit"
          className="
            btn-brand-gradient
            hidden h-13 cursor-pointer items-center justify-center gap-2
            rounded-2xl px-6 text-sm font-semibold text-white
            focus:outline-none focus:ring-2 focus:ring-focus-ring focus:ring-offset-2
            active:scale-[0.98] sm:inline-flex
          "
        >
          <Icon name="search" className="text-[18px]" />
          {buttonLabel}
        </button>
      </form>

      {/* Dropdown */}
      {open && (showRecentTrending || showNoResults || showSuggestions) && (
        <div
          ref={dropdownRef}
          id="searchbar-listbox"
          role="listbox"
          aria-label="Search suggestions"
          className="
            absolute left-0 right-0 top-[calc(100%+8px)] z-50
            overflow-hidden rounded-2xl
            border border-divider bg-bg-surface
            shadow-xl ring-1 ring-brand/5
            animate-in fade-in slide-in-from-top-1 duration-150
          "
        >
          {/* Recent + Trending */}
          {showRecentTrending && (
            <div className="space-y-4 p-4">
              {recent.length > 0 && (
                <div>
                  <h4 className="mb-2.5 text-[10px] font-bold uppercase tracking-widest text-text-muted">
                    Recent Searches
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {recent.map((term) => (
                      <button
                        key={term}
                        type="button"
                        onClick={() => { setQuery(term); navigate(term); }}
                        className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-divider bg-paper px-3 py-1 text-sm text-text-heading transition-colors hover:border-brand/40 hover:bg-brand/5 hover:text-brand"
                      >
                        <Icon name="clock" className="text-[12px] opacity-60" />
                        {term}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <h4 className="mb-2.5 text-[10px] font-bold uppercase tracking-widest text-text-muted">
                  Trending
                </h4>
                <div className="flex flex-wrap gap-2">
                  {trending.map((term) => (
                    <button
                      key={term}
                      type="button"
                      onClick={() => { setQuery(term); navigate(term); }}
                      className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-gold-200 bg-gold-50 px-3 py-1 text-sm text-gold-700 transition-colors hover:border-accent/60 hover:bg-accent/15 dark:border-accent/30 dark:bg-accent/10 dark:text-accent-text"
                    >
                      <Icon name="star" className="text-[11px] opacity-80" />
                      {term}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* No results */}
          {showNoResults && (
            <div className="flex flex-col items-center px-4 py-10 text-center">
              <Icon name="search-off" className="mb-3 text-4xl text-text-muted/50" />
              <p className="mb-1 font-medium text-text-heading">
                No matches for &quot;{query}&quot;
              </p>
              <p className="mb-4 text-sm text-text-muted">
                Try checking your spelling or use more general terms.
              </p>
              <button
                type="button"
                onClick={() => navigate(query)}
                className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-brand/8 px-4 py-2 text-sm font-semibold text-brand transition-colors hover:bg-brand/15"
              >
                <Icon name="search" />
                Search all books for &quot;{query}&quot;
              </button>
            </div>
          )}

          {/* Suggestion groups */}
          {showSuggestions &&
            groupOrder.map((type) => {
              const items = grouped[type];
              if (!items?.length) return null;
              return (
                <div key={type}>
                  {/* Group header */}
                  <div className="flex items-center gap-2 border-b border-divider bg-bg-app px-4 py-2">
                    <span
                      className={`flex h-5 w-5 items-center justify-center rounded-md ${TYPE_BG[type]}`}
                    >
                      <Icon
                        name={TYPE_ICON[type]}
                        className={`text-[13px] ${TYPE_COLOR[type]}`}
                      />
                    </span>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-text-muted">
                      {TYPE_LABEL_PLURAL[type]}
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
                          flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left
                          min-h-[52px] transition-colors duration-100
                          border-l-2
                          ${isActive
                            ? "border-brand bg-brand/5"
                            : "border-transparent hover:bg-bg-app"
                          }
                        `}
                      >
                        {/* Icon / cover thumbnail */}
                        <span
                          className={`
                            flex h-9 w-9 shrink-0 items-center justify-center
                            overflow-hidden rounded-lg ${TYPE_BG[type]}
                            ring-1 ring-black/5
                          `}
                        >
                          {("coverUrl" in s && s.coverUrl) ? (
                            <img
                              src={s.coverUrl}
                              alt={s.label}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <Icon
                              name={TYPE_ICON[type]}
                              className={`text-base ${TYPE_COLOR[type]}`}
                            />
                          )}
                        </span>

                        {/* Text */}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-text-heading">
                            {highlight(s.label, query)}
                          </span>
                          {(s.type === "book" || s.type === "research") && s.sub && (
                            <span className="mt-0.5 block truncate text-xs text-text-muted">
                              {s.sub}
                            </span>
                          )}
                          {(s.type === "author" || s.type === "category") && (
                            <span className="mt-0.5 block text-xs text-text-muted">
                              Search by {TYPE_LABEL[type].toLowerCase()}
                            </span>
                          )}
                        </span>

                        {/* Chevron */}
                        <Icon
                          name="chevron-right"
                          className={`shrink-0 text-[16px] transition-colors ${
                            isActive ? "text-brand" : "text-text-muted"
                          }`}
                        />
                      </button>
                    );
                  })}
                </div>
              );
            })}

          {/* Keyboard hint footer */}
          {showSuggestions && (
            <div className="hidden items-center gap-3 border-t border-divider bg-bg-app px-4 py-2 sm:flex">
              {[
                ["↑↓", "Navigate"],
                ["↵",  "Select"],
                ["Esc", "Close"],
              ].map(([key, label]) => (
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

"use client";

import { useEffect, useRef, useState } from "react";
import Icon, { IconName } from "@/components/ui/core/Icon";
import type { Suggestion } from "@/app/api/books/suggestions/route";
import { useBookSuggestions } from "@/components/ui/search/useBookSuggestions";
import { readRecent } from "@/components/ui/home/SearchSuggestions";

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
  book:     "bg-brand/5",
  author:   "bg-gold-50 dark:bg-accent/10",
  category: "bg-brand/10",
  research: "bg-accent/10",
};

const FALLBACK_TRENDING = ["Pedagogy", "Mathematics", "Science", "History"];

export default function CommandPalette() {
  const [isOpen, setIsOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [recent, setRecent] = useState<string[]>([]);
  const [trending, setTrending] = useState<string[]>(FALLBACK_TRENDING);
  const fetchedTrending = useRef(false);

  const {
    query,
    setQuery,
    suggestions,
    loading,
    activeIdx,
    setActiveIdx,
    grouped,
    groupOrder,
    navigate,
    pickSuggestion,
  } = useBookSuggestions({
    onClose: () => setIsOpen(false),
  });

  // Toggle with Cmd+K / Ctrl+K
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Update recent searches and focus when opened
  useEffect(() => {
    if (isOpen) {
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
      // Small delay to allow element to mount before focusing
      setTimeout(() => inputRef.current?.focus(), 50);
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
      setQuery("");
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen, setQuery]);

  // Click outside to close
  useEffect(() => {
    function handleOutsideClick(e: MouseEvent) {
      if (
        isOpen &&
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [isOpen]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
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
      e.preventDefault();
      setIsOpen(false);
    }
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (query.trim()) {
      navigate(query);
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

  if (!isOpen) return null;

  const showRecentTrending = query.length < 2;
  const showNoResults = query.length >= 2 && !loading && suggestions.length === 0;
  const showSuggestions = suggestions.length > 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[10vh] px-4 pb-4 sm:pt-[15vh] bg-bg-app/80 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div
        ref={containerRef}
        className="w-full max-w-2xl overflow-hidden rounded-2xl bg-bg-surface shadow-2xl ring-1 ring-divider border border-divider animate-in zoom-in-95 duration-200 flex flex-col max-h-[80vh]"
      >
        <form
          onSubmit={handleSubmit}
          className="relative flex items-center border-b border-divider px-4"
        >
          <Icon name="search" className="text-xl text-text-muted shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search books, authors, or categories..."
            className="h-16 w-full bg-transparent px-4 text-lg text-text-heading placeholder:text-text-muted outline-none caret-brand"
            autoComplete="off"
            spellCheck="false"
          />
          {loading && (
            <Icon name="spinner" className="h-5 w-5 animate-spin text-brand mr-2" />
          )}
          <kbd className="hidden sm:inline-flex items-center gap-1 rounded-md border border-divider bg-paper px-2 py-1 text-xs font-medium text-text-muted">
            ESC
          </kbd>
        </form>

        <div className="overflow-y-auto overscroll-contain">
          {showRecentTrending && (
            <div className="p-6 space-y-6">
              {recent.length > 0 && (
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-text-muted mb-3">
                    Recent Searches
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {recent.map((term) => (
                      <button
                        key={term}
                        type="button"
                        onClick={() => {
                          setQuery(term);
                          navigate(term);
                        }}
                        className="inline-flex items-center gap-2 rounded-full border border-divider bg-paper px-4 py-1.5 text-sm font-medium text-text-heading transition-colors hover:border-brand/40 hover:bg-brand/5 hover:text-brand"
                      >
                        <Icon name="clock" className="text-[14px] opacity-70" />
                        {term}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-text-muted mb-3">
                  Trending
                </h4>
                <div className="flex flex-wrap gap-2">
                  {trending.map((term) => (
                    <button
                      key={term}
                      type="button"
                      onClick={() => {
                        setQuery(term);
                        navigate(term);
                      }}
                      className="inline-flex items-center gap-2 rounded-full border border-divider bg-paper px-4 py-1.5 text-sm font-medium text-text-heading transition-colors hover:border-accent/40 hover:bg-accent/10 hover:text-accent-text"
                    >
                      <Icon name="star" className="text-[14px] opacity-70" />
                      {term}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {showNoResults && (
            <div className="px-6 py-12 text-center flex flex-col items-center">
              <Icon name="search-off" className="text-5xl text-text-muted mb-4" />
              <p className="text-lg text-text-heading font-semibold mb-2">
                No matches for "{query}"
              </p>
              <p className="text-text-muted mb-6">
                Try checking your spelling or use more general terms.
              </p>
              <button
                type="button"
                onClick={() => navigate(query)}
                className="inline-flex items-center gap-2 rounded-lg bg-brand px-6 py-3 text-sm font-semibold text-brand-contrast transition-colors hover:bg-brand-hover shadow-sm"
              >
                <Icon name="search" className="text-lg" />
                Search all books for "{query}"
              </button>
            </div>
          )}

          {showSuggestions && (
            <div className="py-2">
              {groupOrder.map((type) => {
                const items = grouped[type];
                if (!items?.length) return null;
                return (
                  <div key={type}>
                    <div className="px-4 py-2 text-[11px] font-bold uppercase tracking-widest text-text-muted bg-paper/50">
                      {TYPE_LABEL_PLURAL[type]}
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
                          onMouseDown={(e) => {
                            e.preventDefault();
                            pickSuggestion(s);
                          }}
                          className={`
                            flex w-full items-center gap-4 px-4 py-3 text-left transition-colors duration-100
                            ${isActive ? "bg-brand/5 border-l-2 border-brand" : "border-l-2 border-transparent hover:bg-paper"}
                          `}
                        >
                          <span
                            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${TYPE_BG[type]} ring-1 ring-divider`}
                          >
                            <Icon name={TYPE_ICON[type]} className={`text-lg ${TYPE_COLOR[type]}`} />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-text-heading">
                              {highlight(s.label, query)}
                            </span>
                            {(s.type === "book" || s.type === "research") && s.sub && (
                              <span className="block truncate text-xs text-text-muted mt-0.5">
                                {s.sub}
                              </span>
                            )}
                            {(s.type === "author" || s.type === "category") && (
                              <span className="block text-xs text-text-muted mt-0.5">
                                Search by {TYPE_LABEL[type].toLowerCase()}
                              </span>
                            )}
                          </span>
                          <Icon
                            name="chevron-right"
                            className={`text-lg shrink-0 transition-colors ${
                              isActive ? "text-brand" : "text-text-muted opacity-0"
                            }`}
                          />
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}
        </div>
        
        {/* Footer */}
        <div className="hidden sm:flex items-center gap-4 border-t border-divider bg-paper px-4 py-3 text-xs text-text-muted">
          <span className="flex items-center gap-1.5">
            <kbd className="rounded-md border border-divider bg-bg-surface px-1.5 py-0.5 font-sans font-medium text-text-muted shadow-sm">
              ↵
            </kbd>
            to select
          </span>
          <span className="flex items-center gap-1.5">
            <kbd className="rounded-md border border-divider bg-bg-surface px-1.5 py-0.5 font-sans font-medium text-text-muted shadow-sm">
              ↑
            </kbd>
            <kbd className="rounded-md border border-divider bg-bg-surface px-1.5 py-0.5 font-sans font-medium text-text-muted shadow-sm">
              ↓
            </kbd>
            to navigate
          </span>
          <span className="flex items-center gap-1.5 ml-auto">
            <kbd className="rounded-md border border-divider bg-bg-surface px-1.5 py-0.5 font-sans font-medium text-text-muted shadow-sm">
              ESC
            </kbd>
            to close
          </span>
        </div>
      </div>
    </div>
  );
}

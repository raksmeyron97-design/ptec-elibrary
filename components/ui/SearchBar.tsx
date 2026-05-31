"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useState, useEffect, useRef, useCallback } from "react";
import Icon from "@/components/ui/Icon";
import type { Suggestion } from "@/app/api/books/suggestions/route";

type SearchBarProps = {
  compact?: boolean;
};

const TYPE_ICON: Record<Suggestion["type"], string> = {
  book:     "menu-book",
  author:   "person",
  category: "category",
};

const TYPE_LABEL: Record<Suggestion["type"], string> = {
  book:     "Book",
  author:   "Author",
  category: "Category",
};

// ── Brand-harmonized (was teal / violet / amber) ──────────────────────────────
const TYPE_COLOR: Record<Suggestion["type"], string> = {
  book:     "text-brand",
  author:   "text-gold-700",
  category: "text-brand",
};

const TYPE_BG: Record<Suggestion["type"], string> = {
  book:     "bg-brand/5",
  author:   "bg-gold-50",
  category: "bg-brand/10",
};

export default function SearchBar({ compact = false }: SearchBarProps) {
  const router       = useRouter();
  const searchParams = useSearchParams();

  const [query,       setQuery]       = useState(searchParams.get("q") ?? "");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open,        setOpen]        = useState(false);
  const [loading,     setLoading]     = useState(false);
  const [activeIdx,   setActiveIdx]   = useState(-1);

  const inputRef    = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Fetch suggestions (debounced 300 ms) ───────────────────────────────────
  const fetchSuggestions = useCallback(async (q: string) => {
    if (q.length < 2) { setSuggestions([]); setOpen(false); return; }
    setLoading(true);
    try {
      const res  = await fetch(`/api/books/suggestions?q=${encodeURIComponent(q)}`);
      const data = await res.json() as Suggestion[];
      setSuggestions(data);
      setOpen(data.length > 0);
      setActiveIdx(-1);
    } catch {
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(query), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, fetchSuggestions]);

  // ── Close on outside click ─────────────────────────────────────────────────
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        !inputRef.current?.contains(e.target as Node) &&
        !dropdownRef.current?.contains(e.target as Node)
      ) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // ── Navigate ───────────────────────────────────────────────────────────────
  function navigate(q: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (q.trim()) params.set("q", q.trim()); else params.delete("q");
    params.delete("page");
    setOpen(false);
    router.push(`/books?${params.toString()}`);
  }

  function pickSuggestion(s: Suggestion) {
    if (s.type === "book") { setOpen(false); router.push(`/books/${s.slug}`); }
    else { setQuery(s.label); navigate(s.label); }
  }

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

  // ── Highlight matched text (gold highlighter) ───────────────────────────────
  function highlight(text: string, q: string) {
    if (!q) return <>{text}</>;
    const idx = text.toLowerCase().indexOf(q.toLowerCase());
    if (idx === -1) return <>{text}</>;
    return (
      <>
        {text.slice(0, idx)}
        <mark className="bg-gold-100 text-text-heading rounded-sm font-semibold not-italic">
          {text.slice(idx, idx + q.length)}
        </mark>
        {text.slice(idx + q.length)}
      </>
    );
  }

  // ── Group suggestions ──────────────────────────────────────────────────────
  const grouped = suggestions.reduce<Record<string, Suggestion[]>>((acc, s) => {
    (acc[s.type] ??= []).push(s);
    return acc;
  }, {});

  const groupOrder: Suggestion["type"][] = ["book", "author", "category"];

  return (
    <div className="relative w-full">
      <form
        onSubmit={handleSubmit}
        className="flex w-full flex-row items-center gap-2.5"
      >
        {/* ── Input wrapper ────────────────────────────────────────────────── */}
        <label className="relative min-w-0 flex-1">
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => suggestions.length > 0 && setOpen(true)}
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
              <svg className="h-4 w-4 animate-spin text-brand" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
              </svg>
            </span>
          )}

          {/* Clear button */}
          {query && !loading && (
            <button
              type="button"
              onClick={() => {
                setQuery(""); setSuggestions([]); setOpen(false);
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
              <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
              </svg>
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

        {/* ── Submit button (desktop only) ─────────────────────────────────── */}
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

      {/* ── Dropdown ────────────────────────────────────────────────────────── */}
      {open && (
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
          {groupOrder.map((type) => {
            const items = grouped[type];
            if (!items?.length) return null;
            return (
              <div key={type}>
                {/* Group header */}
                <div className="flex items-center gap-2 border-b border-divider bg-paper px-4 py-2">
                  <span className={`flex h-5 w-5 items-center justify-center rounded-md ${TYPE_BG[type]}`}>
                    <Icon name={TYPE_ICON[type] as any} className={`text-[13px] ${TYPE_COLOR[type]}`} />
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
                        <Icon name={TYPE_ICON[type] as any} className={`text-base ${TYPE_COLOR[type]}`} />
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
                      <svg
                        className={`h-4 w-4 shrink-0 transition-colors ${isActive ? "text-brand" : "text-text-muted"}`}
                        viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
                      >
                        <path d="m9 18 6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                  );
                })}
              </div>
            );
          })}

          {/* ── Footer keyboard hint ──────────────────────────────────────── */}
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
        </div>
      )}
    </div>
  );
}
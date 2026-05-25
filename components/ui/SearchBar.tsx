"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useState, useEffect, useRef, useCallback } from "react";
import Icon from "@/components/ui/Icon";
import type { Suggestion } from "@/app/api/books/suggestions/route";

type SearchBarProps = {
  compact?: boolean;
};

// Icon per suggestion type
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

const TYPE_COLOR: Record<Suggestion["type"], string> = {
  book:     "text-[#007c91]",
  author:   "text-violet-500",
  category: "text-amber-500",
};

export default function SearchBar({ compact = false }: SearchBarProps) {
  const router       = useRouter();
  const searchParams = useSearchParams();

  const [query,       setQuery]       = useState(searchParams.get("q") ?? "");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open,        setOpen]        = useState(false);
  const [loading,     setLoading]     = useState(false);
  const [activeIdx,   setActiveIdx]   = useState(-1);

  const inputRef     = useRef<HTMLInputElement>(null);
  const dropdownRef  = useRef<HTMLDivElement>(null);
  const debounceRef  = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Fetch suggestions (debounced 300 ms) ───────────────────────────────────
  const fetchSuggestions = useCallback(async (q: string) => {
    if (q.length < 2) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
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
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // ── Navigate to search results ─────────────────────────────────────────────
  function navigate(q: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (q.trim()) {
      params.set("q", q.trim());
    } else {
      params.delete("q");
    }
    params.delete("page");
    setOpen(false);
    router.push(`/books?${params.toString()}`);
  }

  // ── Pick a suggestion ──────────────────────────────────────────────────────
  function pickSuggestion(s: Suggestion) {
    if (s.type === "book") {
      setOpen(false);
      router.push(`/books/${s.slug}`);
    } else {
      setQuery(s.label);
      navigate(s.label);
    }
  }

  // ── Form submit ────────────────────────────────────────────────────────────
  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    navigate(query);
  }

  // ── Keyboard navigation ────────────────────────────────────────────────────
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

  // ── Highlight matched portion ──────────────────────────────────────────────
  function highlight(text: string, q: string) {
    if (!q) return <>{text}</>;
    const idx = text.toLowerCase().indexOf(q.toLowerCase());
    if (idx === -1) return <>{text}</>;
    return (
      <>
        {text.slice(0, idx)}
        <mark className="bg-[#007c91]/15 text-[#007c91] rounded-sm font-semibold not-italic">
          {text.slice(idx, idx + q.length)}
        </mark>
        {text.slice(idx + q.length)}
      </>
    );
  }

  // ── Group suggestions by type ──────────────────────────────────────────────
  const grouped = suggestions.reduce<Record<string, Suggestion[]>>((acc, s) => {
    (acc[s.type] ??= []).push(s);
    return acc;
  }, {});

  const groupOrder: Suggestion["type"][] = ["book", "author", "category"];

  return (
    <div className={`relative w-full ${compact ? "" : ""}`}>
      <form
        onSubmit={handleSubmit}
        className={`flex w-full gap-3 ${compact ? "items-center" : "flex-col sm:flex-row"}`}
      >
        {/* ── Input ───────────────────────────────────────────────────────── */}
        <label className="relative min-w-0 flex-1">
          <Icon
            name="search"
            className="absolute left-4 top-1/2 -translate-y-1/2 text-xl text-slate-400 pointer-events-none z-10"
          />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => suggestions.length > 0 && setOpen(true)}
            onKeyDown={handleKeyDown}
            className="h-12 w-full rounded-md border border-slate-200 bg-white py-3 pl-12 pr-10 text-slate-900 outline-none transition focus:border-[#007c91] focus:ring-2 focus:ring-[#007c91]/15"
            placeholder="Search title, author, ISBN, or topic"
            type="search"
            autoComplete="off"
            aria-autocomplete="list"
            aria-expanded={open}
            aria-haspopup="listbox"
          />
          {/* Loading spinner */}
          {loading && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2">
              <svg className="h-4 w-4 animate-spin text-slate-400" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
              </svg>
            </span>
          )}
          {/* Clear button */}
          {query && !loading && (
            <button
              type="button"
              onClick={() => { setQuery(""); setSuggestions([]); setOpen(false); inputRef.current?.focus(); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition"
              aria-label="Clear search"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
              </svg>
            </button>
          )}
        </label>

        {/* ── Submit button ────────────────────────────────────────────────── */}
        <button
          type="submit"
          className="inline-flex h-12 items-center justify-center gap-2 rounded-md bg-[#0a1629] px-5 font-semibold text-white transition hover:bg-[#007c91]"
        >
          <Icon name="search" className="text-[20px]" />
          Search
        </button>
      </form>

      {/* ── Dropdown ────────────────────────────────────────────────────────── */}
      {open && (
        <div
          ref={dropdownRef}
          role="listbox"
          className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl ring-1 ring-slate-900/5"
          style={{ maxWidth: "calc(100% - 0px)" }}
        >
          {/* Group sections */}
          {groupOrder.map((type) => {
            const items = grouped[type];
            if (!items?.length) return null;
            return (
              <div key={type}>
                {/* Group header */}
                <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50 px-4 py-2">
                  <Icon name={TYPE_ICON[type] as any} className={`text-base ${TYPE_COLOR[type]}`} />
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
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
                      className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition ${
                        isActive ? "bg-[#007c91]/8" : "hover:bg-slate-50"
                      }`}
                    >
                      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                        type === "book"     ? "bg-cyan-50"   :
                        type === "author"   ? "bg-violet-50" :
                                              "bg-amber-50"
                      }`}>
                        <Icon name={TYPE_ICON[type] as any} className={`text-base ${TYPE_COLOR[type]}`} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-slate-800">
                          {highlight(s.label, query)}
                        </span>
                        {s.type === "book" && (
                          <span className="block truncate text-xs text-slate-400">{s.sub}</span>
                        )}
                        {s.type !== "book" && (
                          <span className="block text-xs text-slate-400">
                            Search by {TYPE_LABEL[type].toLowerCase()}
                          </span>
                        )}
                      </span>
                      {/* Arrow hint */}
                      <svg
                        className={`h-4 w-4 shrink-0 text-slate-300 transition ${isActive ? "text-[#007c91]" : ""}`}
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

          {/* Footer hint */}
          <div className="flex items-center gap-3 border-t border-slate-100 bg-slate-50 px-4 py-2">
            <kbd className="rounded border border-slate-200 bg-white px-1.5 py-0.5 font-mono text-xs text-slate-400 shadow-sm">↑↓</kbd>
            <span className="text-xs text-slate-400">Navigate</span>
            <kbd className="ml-2 rounded border border-slate-200 bg-white px-1.5 py-0.5 font-mono text-xs text-slate-400 shadow-sm">↵</kbd>
            <span className="text-xs text-slate-400">Select</span>
            <kbd className="ml-2 rounded border border-slate-200 bg-white px-1.5 py-0.5 font-mono text-xs text-slate-400 shadow-sm">Esc</kbd>
            <span className="text-xs text-slate-400">Close</span>
          </div>
        </div>
      )}
    </div>
  );
}
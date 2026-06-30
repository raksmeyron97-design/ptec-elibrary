"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Icon, { IconName } from "@/components/ui/core/Icon";
import type { Suggestion } from "@/app/api/books/suggestions/route";
import { pushRecentSearch, readRecent } from "@/components/ui/home/SearchSuggestions";

// ── Static config ──────────────────────────────────────────────────────────────
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
  research: "Research",
};

const TRENDING = ["ការអប់រំ", "Research", "PDF ឯកសារ", "Pedagogy", "Mathematics"];

// ── Google logo ────────────────────────────────────────────────────────────────
const GoogleLogo = () => (
  <svg viewBox="0 0 74 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-[15px] w-auto inline-block align-middle">
    <path d="M9.24 8.19v2.46h5.88c-.18 1.38-.64 2.39-1.34 3.1-.86.86-2.2 1.8-4.54 1.8-3.62 0-6.45-2.92-6.45-6.54s2.83-6.54 6.45-6.54c1.95 0 3.38.77 4.43 1.76L15.4 2.5C13.94 1.08 11.98 0 9.24 0 4.28 0 .11 4.04.11 9s4.17 9 9.13 9c2.68 0 4.7-.88 6.28-2.52 1.62-1.62 2.13-3.91 2.13-5.75 0-.57-.04-1.1-.13-1.54H9.24z" fill="#4285F4"/>
    <path d="M25 6.19c-3.21 0-5.83 2.44-5.83 5.81 0 3.34 2.62 5.81 5.83 5.81s5.83-2.46 5.83-5.81c0-3.37-2.62-5.81-5.83-5.81zm0 9.33c-1.76 0-3.28-1.45-3.28-3.52s1.52-3.52 3.28-3.52 3.28 1.46 3.28 3.52-1.52 3.52-3.28 3.52z" fill="#EA4335"/>
    <path d="M53.58 7.49h-.09c-.57-.68-1.67-1.3-3.06-1.3C47.53 6.19 45 8.72 45 12c0 3.26 2.53 5.81 5.43 5.81 1.39 0 2.49-.62 3.06-1.32h.09v.81c0 2.22-1.19 3.41-3.1 3.41-1.56 0-2.53-1.12-2.93-2.07l-2.22.92c.64 1.54 2.33 3.43 5.15 3.43 2.99 0 5.52-1.76 5.52-6.05V6.49h-2.42v1zm-2.93 8.03c-1.76 0-3.1-1.5-3.1-3.52s1.34-3.52 3.1-3.52c1.74 0 3.1 1.52 3.1 3.54s-1.36 3.5-3.1 3.5z" fill="#4285F4"/>
    <path d="M38 6.19c-3.21 0-5.83 2.44-5.83 5.81 0 3.34 2.62 5.81 5.83 5.81s5.83-2.46 5.83-5.81c0-3.37-2.62-5.81-5.83-5.81zm0 9.33c-1.76 0-3.28-1.45-3.28-3.52s1.52-3.52 3.28-3.52 3.28 1.46 3.28 3.52-1.52 3.52-3.28 3.52z" fill="#FBBC05"/>
    <path d="M58 .24h2.51v17.57H58z" fill="#34A853"/>
    <path d="M63.93 14.85c-1.3 0-2.22-.59-2.82-1.76l7.77-3.21-.26-.66c-.48-1.29-1.96-3.68-4.97-3.68-2.99 0-5.48 2.35-5.48 5.81 0 3.26 2.46 5.81 5.76 5.81 2.66 0 4.2-1.63 4.84-2.57l-1.98-1.32c-.66.96-1.56 1.58-2.86 1.58zm-.18-7.15c1.03 0 1.91.53 2.2 1.28l-5.25 2.17c0-2.44 1.73-3.45 3.05-3.45z" fill="#EA4335"/>
  </svg>
);

const SearchBrandIcon = () => (
  <svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-5 h-5">
    <circle cx="8.5" cy="8.5" r="5" stroke="white" strokeWidth="1.75" strokeLinecap="round"/>
    <path d="M13 13L17 17" stroke="white" strokeWidth="1.75" strokeLinecap="round"/>
  </svg>
);

// ── Suggestion row ─────────────────────────────────────────────────────────────
function SuggestionRow({
  s, isActive, onHover, onPick,
}: {
  s: Suggestion;
  isActive: boolean;
  onHover: () => void;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={isActive}
      onMouseEnter={onHover}
      onMouseDown={(e) => { e.preventDefault(); onPick(); }}
      className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors duration-100 border-l-2 cursor-pointer
        ${isActive ? "border-brand bg-brand/5" : "border-transparent hover:bg-paper"}`}
    >
      {/* Thumbnail or icon */}
      <div
        className="h-9 w-[26px] flex-shrink-0 rounded-md overflow-hidden flex items-center justify-center"
        style={{ background: "var(--ptec-bg-app)", border: "1px solid var(--ptec-border)" }}
      >
        {"coverUrl" in s && s.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={s.coverUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <Icon name={TYPE_ICON[s.type]} className="text-[13px] text-text-muted" />
        )}
      </div>

      {/* Text */}
      <div className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium text-text-heading">{s.label}</span>
        {"sub" in s && s.sub && (
          <span className="block truncate text-[11px] text-text-muted mt-0.5">{s.sub}</span>
        )}
      </div>

      {/* Type badge */}
      <span
        className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
        style={{
          background: "var(--ptec-bg-app)",
          color: "var(--ptec-text-muted)",
          border: "1px solid var(--ptec-border)",
        }}
      >
        {TYPE_LABEL[s.type]}
      </span>
    </button>
  );
}

// ── Main modal ─────────────────────────────────────────────────────────────────
export default function GoogleSearchModal() {
  const router = useRouter();

  const [isOpen, setIsOpen]                   = useState(false);
  const [query, setQuery]                     = useState("");
  const [suggestions, setSuggestions]         = useState<Suggestion[]>([]);
  const [suggestLoading, setSuggestLoading]   = useState(false);
  const [activeIdx, setActiveIdx]             = useState(-1);
  const [recent, setRecent]                   = useState<string[]>([]);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef     = useRef<HTMLInputElement>(null);
  const debounceRef  = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Fetch PTEC book suggestions as user types ──────────────────────────────
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.length < 2) { setSuggestions([]); setActiveIdx(-1); return; }
    debounceRef.current = setTimeout(async () => {
      setSuggestLoading(true);
      try {
        const res  = await fetch(`/api/books/suggestions?q=${encodeURIComponent(query)}`);
        const data = (await res.json()) as Suggestion[];
        setSuggestions(data);
        setActiveIdx(-1);
      } catch {
        setSuggestions([]);
      } finally {
        setSuggestLoading(false);
      }
    }, 280);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  // ── Cmd+K / Ctrl+K toggle ─────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") { e.preventDefault(); setIsOpen((v) => !v); }
      if (e.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // ── Scroll-lock + load recent searches ────────────────────────────────────
  useEffect(() => {
    document.body.style.overflow = isOpen ? "hidden" : "";
    if (isOpen) setRecent(readRecent().slice(0, 4));
    return () => { document.body.style.overflow = ""; };
  }, [isOpen]);

  // ── Auto-focus on open ────────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;
    const id = setTimeout(() => inputRef.current?.focus(), 80);
    return () => clearTimeout(id);
  }, [isOpen]);

  // ── Click-outside to close ────────────────────────────────────────────────
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (isOpen && containerRef.current && !containerRef.current.contains(e.target as Node))
        setIsOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [isOpen]);

  // ── Navigate to a PTEC resource ───────────────────────────────────────────
  const pickSuggestion = useCallback((s: Suggestion) => {
    pushRecentSearch(s.label);
    setIsOpen(false);
    setQuery(s.label);
    setSuggestions([]);
    if (s.type === "book")          router.push(`/books/${s.slug}`);
    else if (s.type === "research") router.push(`/research/${s.id}`);
    else                            router.push(`/books?q=${encodeURIComponent(s.label)}`);
  }, [router]);

  // ── Full text search → Google CSE on /search page ───────────────────────
  const goSearch = useCallback((q: string) => {
    if (!q.trim()) return;
    pushRecentSearch(q.trim());
    setIsOpen(false);
    router.push(`/search?q=${encodeURIComponent(q.trim())}`);
  }, [router]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (activeIdx >= 0 && suggestions[activeIdx]) pickSuggestion(suggestions[activeIdx]);
    else goSearch(query);
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, suggestions.length - 1)); }
    else if (e.key === "ArrowUp")  { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, -1)); }
    else if (e.key === "Enter" && activeIdx >= 0 && suggestions[activeIdx]) {
      e.preventDefault();
      pickSuggestion(suggestions[activeIdx]);
    }
  };

  const handleClear = () => {
    setQuery(""); setSuggestions([]); setActiveIdx(-1);
    inputRef.current?.focus();
  };

  const showSuggestions = query.length >= 2 && (suggestions.length > 0 || suggestLoading);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Global Search"
      aria-hidden={!isOpen}
      className={`fixed inset-0 z-[100] flex items-start justify-center pt-[7vh] px-4 pb-8
        bg-black/60 backdrop-blur-md transition-opacity duration-200
        ${isOpen ? "opacity-100" : "opacity-0 pointer-events-none"}`}
    >
      {/* ── Modal card ──────────────────────────────────────────────── */}
      <div
        ref={containerRef}
        className={`relative w-full max-w-[660px] rounded-2xl overflow-hidden flex flex-col
          transition-all duration-[220ms] ease-out
          ${isOpen ? "opacity-100 scale-100 translate-y-0" : "opacity-0 scale-[0.96] -translate-y-3"}`}
        style={{
          background: "var(--ptec-bg-surface)",
          border: "1px solid var(--ptec-border)",
          boxShadow: "0 32px 80px -12px rgba(11,21,48,0.45), 0 0 0 1px rgba(11,21,48,0.06)",
        }}
      >
        {/* Top gradient accent */}
        <div
          className="absolute top-0 inset-x-0 h-[3px] z-10"
          style={{ background: "linear-gradient(90deg, var(--ptec-brand) 0%, #3A5FC4 50%, var(--ptec-accent) 100%)" }}
        />

        {/* ── Header ────────────────────────────────────────────────── */}
        <div
          className="relative flex flex-col items-center gap-1.5 px-6 pt-7 pb-5"
          style={{ background: "var(--ptec-bg-app)", borderBottom: "1px solid var(--ptec-border)" }}
        >
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            aria-label="Close search"
            className="group absolute top-3.5 right-3.5 flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-bold tracking-wider uppercase transition-all duration-150 cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand/40 border-divider bg-bg-surface text-text-muted hover:border-brand/40 hover:text-brand hover:bg-brand/5"
          >
            <Icon name="x" className="text-[12px] transition-transform duration-150 group-hover:rotate-90" />
            <span className="hidden sm:inline">ESC</span>
          </button>

          <div
            className="flex items-center justify-center w-10 h-10 rounded-[10px] mb-0.5"
            style={{
              background: "linear-gradient(135deg, var(--ptec-brand) 0%, #27499f 100%)",
              boxShadow: "0 8px 20px -6px rgba(30,58,138,0.55)",
            }}
          >
            <SearchBrandIcon />
          </div>

          <h2 className="text-[20px] font-bold tracking-tight" style={{ color: "var(--ptec-text-heading)" }}>
            Global Search
          </h2>

          <div className="flex items-center gap-2 text-[10px] font-semibold tracking-[0.1em] uppercase" style={{ color: "var(--ptec-text-muted)" }}>
            <span className="h-px w-7 rounded" style={{ background: "var(--ptec-border)" }} />
            <span>Powered by</span>
            <GoogleLogo />
            <span className="h-px w-7 rounded" style={{ background: "var(--ptec-border)" }} />
          </div>
        </div>

        {/* ── Search input ──────────────────────────────────────────── */}
        <div style={{ background: "var(--ptec-bg-surface)", borderBottom: showSuggestions ? "none" : "1px solid var(--ptec-border)" }}>
          <form onSubmit={handleSubmit} className="px-5 pt-4 pb-3">
            <div className="relative flex items-center">
              <div className="absolute left-4 pointer-events-none flex items-center">
                {suggestLoading ? (
                  <div className="w-[18px] h-[18px] rounded-full border-2 animate-spin" style={{ borderColor: "var(--ptec-border)", borderTopColor: "var(--ptec-brand)" }} />
                ) : (
                  <Icon name="search" className="text-[18px] text-text-muted" />
                )}
              </div>

              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleInputKeyDown}
                placeholder="Search books, authors, categories…"
                aria-label="Search query"
                aria-autocomplete="list"
                aria-expanded={showSuggestions}
                autoComplete="off"
                spellCheck={false}
                className="w-full h-[50px] pl-11 pr-[96px] rounded-xl text-[15px] font-medium outline-none"
                style={{
                  background: "var(--ptec-bg-app)",
                  border: "1.5px solid var(--ptec-border)",
                  color: "var(--ptec-text-heading)",
                  transition: "border-color 0.15s, box-shadow 0.15s",
                }}
                onFocus={(e) => { e.target.style.borderColor = "var(--ptec-brand)"; e.target.style.boxShadow = "0 0 0 3px rgba(30,58,138,0.10)"; }}
                onBlur={(e)  => { e.target.style.borderColor = "var(--ptec-border)"; e.target.style.boxShadow = "none"; }}
              />

              {query && (
                <button type="button" onClick={handleClear} aria-label="Clear" className="absolute right-[58px] flex items-center justify-center w-6 h-6 rounded-full cursor-pointer transition-all duration-150 text-text-muted hover:text-text-heading hover:bg-bg-app">
                  <Icon name="x" className="text-[13px]" />
                </button>
              )}

              <button
                type="submit"
                disabled={!query.trim()}
                aria-label="Search"
                className="absolute right-2 flex items-center justify-center h-[38px] w-[42px] rounded-lg transition-all duration-150 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 active:scale-95"
                style={{ background: "var(--ptec-brand)", color: "#fff" }}
              >
                <Icon name="search" className="text-[15px]" />
              </button>
            </div>
          </form>

          {/* ── PTEC suggestion dropdown ──────────────────────────── */}
          {showSuggestions && (
            <div role="listbox" aria-label="Search suggestions" style={{ borderTop: "1px solid var(--ptec-border)", borderBottom: "1px solid var(--ptec-border)" }}>
              <div className="px-4 py-2 text-[10px] font-bold uppercase tracking-widest" style={{ background: "var(--ptec-bg-app)", color: "var(--ptec-text-muted)" }}>
                Suggestions
              </div>

              {suggestions.slice(0, 8).map((s, i) => (
                <SuggestionRow
                  key={`${s.type}-${s.label}-${i}`}
                  s={s}
                  isActive={i === activeIdx}
                  onHover={() => setActiveIdx(i)}
                  onPick={() => pickSuggestion(s)}
                />
              ))}

              <div className="flex items-center justify-between px-4 py-2 text-[11px]" style={{ background: "var(--ptec-bg-app)", color: "var(--ptec-text-muted)", borderTop: "1px solid var(--ptec-border)" }}>
                <span className="flex items-center gap-1.5">
                  <kbd className="rounded border px-1.5 py-0.5 font-sans text-[10px] font-medium shadow-sm" style={{ borderColor: "var(--ptec-border)", background: "var(--ptec-bg-surface)" }}>↑↓</kbd>
                  navigate
                </span>
                <span className="flex items-center gap-1.5">
                  <kbd className="rounded border px-1.5 py-0.5 font-sans text-[10px] font-medium shadow-sm" style={{ borderColor: "var(--ptec-border)", background: "var(--ptec-bg-surface)" }}>↵</kbd>
                  <span>select · or view all results</span>
                </span>
              </div>
            </div>
          )}
        </div>

        {/* ── Idle / empty state ────────────────────────────────────── */}
        <div className="px-5 py-5" style={{ display: showSuggestions ? "none" : "" }}>
          {/* Recent */}
          {recent.length > 0 && (
            <div className="mb-5">
              <p className="text-[10.5px] font-bold uppercase tracking-widest mb-2.5" style={{ color: "var(--ptec-text-muted)" }}>Recent</p>
              <div className="flex flex-wrap gap-2">
                {recent.map((term) => (
                  <button key={term} type="button" onClick={() => goSearch(term)}
                    className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-medium transition-all duration-150 cursor-pointer hover:border-brand/40 hover:text-brand hover:bg-brand/5"
                    style={{ border: "1px solid var(--ptec-border)", color: "var(--ptec-text-heading)", background: "var(--ptec-bg-app)" }}
                  >
                    <Icon name="clock" className="text-[12px] opacity-60" />
                    {term}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Trending */}
          <div>
            <p className="text-[10.5px] font-bold uppercase tracking-widest mb-2.5" style={{ color: "var(--ptec-text-muted)" }}>Trending</p>
            <div className="flex flex-wrap gap-2">
              {TRENDING.map((term) => (
                <button key={term} type="button" onClick={() => goSearch(term)}
                  className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-medium transition-all duration-150 cursor-pointer hover:border-brand/40 hover:text-brand hover:bg-brand/5"
                  style={{ border: "1px solid var(--ptec-border)", color: "var(--ptec-text-muted)", background: "var(--ptec-bg-app)" }}
                >
                  <Icon name="star" className="text-[11px] opacity-70" />
                  {term}
                </button>
              ))}
            </div>
          </div>

          {/* Hint */}
          <div className="flex items-center justify-center gap-2 mt-6 opacity-50 text-[12px]" style={{ color: "var(--ptec-text-muted)" }}>
            <Icon name="search" className="text-[14px]" />
            <span>Type to search PTEC books · press <kbd className="rounded px-1 font-sans font-bold">↵</kbd> to search Google</span>
          </div>
        </div>

        {/* ── Footer ────────────────────────────────────────────────── */}
        <div
          className="hidden sm:flex items-center justify-between px-5 py-2.5 text-[11px]"
          style={{ borderTop: "1px solid var(--ptec-border)", background: "var(--ptec-bg-app)", color: "var(--ptec-text-muted)" }}
        >
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            <span>Searching <span className="font-semibold" style={{ color: "var(--ptec-brand)" }}>ptec.edu.kh</span></span>
          </div>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5">
              <kbd className="rounded-md border px-1.5 py-0.5 font-sans font-medium text-[10px] shadow-sm" style={{ borderColor: "var(--ptec-border)", background: "var(--ptec-bg-surface)" }}>↵</kbd>
              search
            </span>
            <span className="w-px h-3 rounded" style={{ background: "var(--ptec-border)" }} />
            <span className="flex items-center gap-1.5">
              <kbd className="rounded-md border px-1.5 py-0.5 font-sans font-medium text-[10px] shadow-sm" style={{ borderColor: "var(--ptec-border)", background: "var(--ptec-bg-surface)" }}>ESC</kbd>
              close
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

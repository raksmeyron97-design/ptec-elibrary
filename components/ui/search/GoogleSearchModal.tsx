"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Icon, { IconName } from "@/components/ui/core/Icon";
import type { Suggestion } from "@/app/api/books/suggestions/route";
import { pushRecentSearch, readRecent } from "@/components/ui/home/SearchSuggestions";
import "@/app/gcse.css";

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
  research: "Thesis",
};

const TRENDING = ["ការអប់រំ", "Thesis", "PDF ឯកសារ", "Pedagogy", "Mathematics"];

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
      className={`group flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors duration-100 cursor-pointer
        ${isActive
          ? "bg-[color-mix(in_srgb,var(--ptec-brand)_8%,transparent)]"
          : "hover:bg-[color-mix(in_srgb,var(--ptec-brand)_4%,transparent)]"
        }`}
    >
      {/* Cover or icon */}
      <div
        className="h-9 w-[26px] flex-shrink-0 rounded-[6px] overflow-hidden flex items-center justify-center"
        style={{
          background: "var(--ptec-bg-app)",
          border: "1px solid var(--ptec-border)",
        }}
      >
        {"coverUrl" in s && s.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={s.coverUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <Icon name={TYPE_ICON[s.type]} className="text-[13px]" style={{ color: "var(--ptec-text-muted)" } as React.CSSProperties} />
        )}
      </div>

      {/* Text */}
      <div className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium" style={{ color: "var(--ptec-text-heading)" }}>
          {s.label}
        </span>
        {"sub" in s && s.sub && (
          <span className="block truncate text-[11px] mt-0.5" style={{ color: "var(--ptec-text-muted)" }}>
            {s.sub}
          </span>
        )}
      </div>

      {/* Type badge */}
      <span
        className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide opacity-0 group-hover:opacity-100 transition-opacity duration-150"
        style={{
          background: "var(--ptec-bg-app)",
          color: "var(--ptec-text-muted)",
          border: "1px solid var(--ptec-border)",
        }}
      >
        {TYPE_LABEL[s.type]}
      </span>

      {/* Arrow indicator on active */}
      {isActive && (
        <Icon name="chevron-right" className="text-[12px] shrink-0" style={{ color: "var(--ptec-brand)" } as React.CSSProperties} />
      )}
    </button>
  );
}

// ── Kbd helper ─────────────────────────────────────────────────────────────────
function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd
      className="rounded-md border px-1.5 py-0.5 font-sans text-[10px] font-semibold shadow-sm leading-none"
      style={{
        borderColor: "var(--ptec-border)",
        background: "var(--ptec-bg-surface)",
        color: "var(--ptec-text-muted)",
      }}
    >
      {children}
    </kbd>
  );
}

// ── Section label ──────────────────────────────────────────────────────────────
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="px-4 pt-3 pb-1.5 text-[10px] font-bold uppercase tracking-[0.12em]"
      style={{ color: "var(--ptec-text-muted)" }}
    >
      {children}
    </p>
  );
}

// ── Main modal ─────────────────────────────────────────────────────────────────
export default function SearchModal() {
  const router = useRouter();

  const [isOpen, setIsOpen]                 = useState(false);
  const [query, setQuery]                   = useState("");
  const [suggestions, setSuggestions]       = useState<Suggestion[]>([]);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [activeIdx, setActiveIdx]           = useState(-1);
  const [recent, setRecent]                 = useState<string[]>([]);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef     = useRef<HTMLInputElement>(null);
  const debounceRef  = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Debounced PTEC suggestions ────────────────────────────────────────────
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
    }, 260);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  // ── Cmd+K / Ctrl+K toggle ────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") { e.preventDefault(); setIsOpen((v) => !v); }
      if (e.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // ── Scroll-lock + load recents on open ───────────────────────────────────
  useEffect(() => {
    document.body.style.overflow = isOpen ? "hidden" : "";
    if (isOpen) {
      setQuery("");
      setSuggestions([]);
      setActiveIdx(-1);
      setRecent(readRecent().slice(0, 5));
    }
    return () => { document.body.style.overflow = ""; };
  }, [isOpen]);

  // ── Auto-focus input on open ──────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;
    const id = setTimeout(() => inputRef.current?.focus(), 60);
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

  // ── Navigation helpers ────────────────────────────────────────────────────
  const pickSuggestion = useCallback((s: Suggestion) => {
    pushRecentSearch(s.label);
    setIsOpen(false);
    if (s.type === "book")          router.push(`/books/${s.slug}`);
    else if (s.type === "research") router.push(`/theses/${s.id}`);
    else                            router.push(`/books?q=${encodeURIComponent(s.label)}`);
  }, [router]);

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
    const total = suggestions.length;
    if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx((i) => (i + 1) % total); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActiveIdx((i) => (i <= 0 ? total - 1 : i - 1)); }
    else if (e.key === "Enter" && activeIdx >= 0 && suggestions[activeIdx]) {
      e.preventDefault();
      pickSuggestion(suggestions[activeIdx]);
    }
  };

  const showSuggestions = query.length >= 2 && (suggestions.length > 0 || suggestLoading);
  const showIdle        = !showSuggestions;

  return (
    <>
      <style>{`
        @media (prefers-reduced-motion: reduce) {
          .ptec-modal-card { transition: none !important; }
        }
      `}</style>

      {/* ── Backdrop ──────────────────────────────────────────────────────── */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search"
        aria-hidden={!isOpen}
        className="fixed inset-0 z-[100] flex items-start justify-center pt-[8vh] px-4 pb-8"
        style={{
          background: "rgba(11,21,48,0.65)",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
          transition: "opacity 200ms ease",
          opacity: isOpen ? 1 : 0,
          pointerEvents: isOpen ? "auto" : "none",
        }}
      >
        {/* ── Modal card ──────────────────────────────────────────────── */}
        <div
          ref={containerRef}
          className="ptec-modal-card relative w-full max-w-[640px] rounded-2xl overflow-hidden flex flex-col"
          style={{
            background: "var(--ptec-bg-surface)",
            border: "1px solid var(--ptec-border)",
            boxShadow: "0 24px 64px -8px rgba(11,21,48,0.5), 0 0 0 1px rgba(11,21,48,0.08)",
            transform: isOpen ? "scale(1) translateY(0)" : "scale(0.96) translateY(-8px)",
            opacity: isOpen ? 1 : 0,
            transition: "transform 220ms cubic-bezier(0.16,1,0.3,1), opacity 180ms ease",
          }}
        >
          {/* Top accent bar */}
          <div
            className="absolute top-0 inset-x-0 h-[2px]"
            style={{ background: "linear-gradient(90deg, var(--ptec-brand), #3A5FC4 50%, var(--ptec-accent))" }}
          />

          {/* ── Search input row ──────────────────────────────────────── */}
          <form onSubmit={handleSubmit} className="relative flex items-center px-4 pt-3.5 pb-3">
            {/* Search icon or spinner */}
            <div className="absolute left-[28px] flex items-center pointer-events-none">
              {suggestLoading ? (
                <div
                  className="w-4 h-4 rounded-full border-2 animate-spin"
                  style={{ borderColor: "var(--ptec-border)", borderTopColor: "var(--ptec-brand)" }}
                />
              ) : (
                <Icon
                  name="search"
                  className="text-[17px]"
                  style={{ color: query ? "var(--ptec-brand)" : "var(--ptec-text-muted)" } as React.CSSProperties}
                />
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
              className="flex-1 h-[46px] pl-9 pr-3 text-[15px] font-medium bg-transparent outline-none"
              style={{ color: "var(--ptec-text-heading)" }}
            />

            {/* Clear */}
            {query && (
              <button
                type="button"
                onClick={() => { setQuery(""); setSuggestions([]); setActiveIdx(-1); inputRef.current?.focus(); }}
                aria-label="Clear search"
                className="flex items-center justify-center w-6 h-6 rounded-full cursor-pointer transition-colors duration-150 hover:bg-[color-mix(in_srgb,var(--ptec-border)_80%,transparent)] mr-2"
                style={{ color: "var(--ptec-text-muted)" }}
              >
                <Icon name="x" className="text-[12px]" />
              </button>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={!query.trim()}
              aria-label="Search"
              className="flex items-center gap-1.5 h-9 px-3.5 rounded-xl text-[12px] font-semibold cursor-pointer transition-all duration-150 disabled:opacity-30 disabled:cursor-not-allowed hover:opacity-90 active:scale-95 focus:outline-none focus:ring-2 focus:ring-offset-1"
              style={{
                background: "var(--ptec-brand)",
                color: "#fff",
              }}
            >
              <Icon name="search" className="text-[12px]" />
              <span className="hidden sm:inline">Search</span>
            </button>

            {/* ESC close */}
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              aria-label="Close"
              className="hidden sm:flex items-center gap-1 ml-2 h-7 px-2 rounded-lg cursor-pointer transition-colors duration-150 hover:bg-[color-mix(in_srgb,var(--ptec-border)_60%,transparent)]"
              style={{ color: "var(--ptec-text-muted)", border: "1px solid var(--ptec-border)", fontSize: "10px", fontWeight: 700, letterSpacing: "0.06em" }}
            >
              ESC
            </button>
          </form>

          {/* Divider */}
          <div style={{ height: "1px", background: "var(--ptec-border)" }} />

          {/* ── Suggestions ───────────────────────────────────────────── */}
          {showSuggestions && (
            <div
              role="listbox"
              aria-label="Search suggestions"
              className="max-h-[320px] overflow-y-auto overscroll-contain"
            >
              <SectionLabel>PTEC Library</SectionLabel>

              {suggestLoading && suggestions.length === 0 ? (
                <div className="flex items-center gap-3 px-4 py-4">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-8 rounded-lg flex-1 animate-pulse" style={{ background: "var(--ptec-border)" }} />
                  ))}
                </div>
              ) : (
                suggestions.slice(0, 7).map((s, i) => (
                  <SuggestionRow
                    key={`${s.type}-${s.label}-${i}`}
                    s={s}
                    isActive={i === activeIdx}
                    onHover={() => setActiveIdx(i)}
                    onPick={() => pickSuggestion(s)}
                  />
                ))
              )}

              {/* Search Google option */}
              {query.length >= 2 && (
                <>
                  <div style={{ height: "1px", background: "var(--ptec-border)", margin: "4px 16px" }} />
                  <button
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); goSearch(query); }}
                    className="flex w-full items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors duration-100 hover:bg-[color-mix(in_srgb,var(--ptec-brand)_4%,transparent)]"
                  >
                    <div
                      className="w-[26px] h-9 flex-shrink-0 rounded-[6px] flex items-center justify-center"
                      style={{ background: "var(--ptec-bg-app)", border: "1px solid var(--ptec-border)" }}
                    >
                      <Icon name="search" className="text-[13px]" style={{ color: "var(--ptec-brand)" } as React.CSSProperties} />
                    </div>
                    <span className="text-[13px] font-medium" style={{ color: "var(--ptec-text-heading)" }}>
                      Search for <span style={{ color: "var(--ptec-brand)" }}>&ldquo;{query}&rdquo;</span> in Library
                    </span>
                    <span
                      className="ml-auto shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                      style={{ background: "var(--ptec-bg-app)", color: "var(--ptec-text-muted)", border: "1px solid var(--ptec-border)" }}
                    >
                      Web
                    </span>
                  </button>
                </>
              )}
            </div>
          )}

          {/* ── Idle state ────────────────────────────────────────────── */}
          {showIdle && (
            <div className="px-4 py-4 max-h-[340px] overflow-y-auto overscroll-contain">
              {/* Recent searches */}
              {recent.length > 0 && (
                <div className="mb-5">
                  <SectionLabel>Recent</SectionLabel>
                  <div className="flex flex-wrap gap-2 px-4 pb-1">
                    {recent.map((term) => (
                      <button
                        key={term}
                        type="button"
                        onClick={() => goSearch(term)}
                        className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium cursor-pointer transition-all duration-150"
                        style={{
                          border: "1px solid var(--ptec-border)",
                          background: "var(--ptec-bg-app)",
                          color: "var(--ptec-text-body)",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.borderColor = "color-mix(in srgb, var(--ptec-brand) 40%, transparent)";
                          e.currentTarget.style.color = "var(--ptec-brand)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.borderColor = "var(--ptec-border)";
                          e.currentTarget.style.color = "var(--ptec-text-body)";
                        }}
                      >
                        <Icon name="clock" className="text-[11px] opacity-50" />
                        {term}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Trending */}
              <div>
                <SectionLabel>Trending</SectionLabel>
                <div className="flex flex-wrap gap-2 px-4 pb-2">
                  {TRENDING.map((term, i) => (
                    <button
                      key={term}
                      type="button"
                      onClick={() => goSearch(term)}
                      className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium cursor-pointer transition-all duration-150"
                      style={{
                        border: "1px solid color-mix(in srgb, var(--ptec-brand) 20%, transparent)",
                        background: "color-mix(in srgb, var(--ptec-brand) 5%, transparent)",
                        color: "var(--ptec-brand)",
                        opacity: 1 - i * 0.1,
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.opacity = "1"; e.currentTarget.style.background = "color-mix(in srgb, var(--ptec-brand) 10%, transparent)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.opacity = String(1 - i * 0.1); e.currentTarget.style.background = "color-mix(in srgb, var(--ptec-brand) 5%, transparent)"; }}
                    >
                      <Icon name="star" className="text-[11px]" />
                      {term}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── Footer ────────────────────────────────────────────────── */}
          <div
            className="hidden sm:flex items-center justify-between px-5 py-2.5 text-[11px]"
            style={{
              borderTop: "1px solid var(--ptec-border)",
              background: "var(--ptec-bg-app)",
              color: "var(--ptec-text-muted)",
            }}
          >
            {/* Live indicator */}
            <div className="flex items-center gap-2">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
              </span>
              <span>
                <span className="font-semibold" style={{ color: "var(--ptec-text-body)" }}>ptec.edu.kh</span>
                {" "}· PTEC Library
              </span>
            </div>

            {/* Keyboard hints */}
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1.5">
                <Kbd>↑↓</Kbd>
                <span>navigate</span>
              </span>
              <span className="w-px h-3 rounded" style={{ background: "var(--ptec-border)" }} />
              <span className="flex items-center gap-1.5">
                <Kbd>↵</Kbd>
                <span>select</span>
              </span>
              <span className="w-px h-3 rounded" style={{ background: "var(--ptec-border)" }} />
              <span className="flex items-center gap-1.5">
                <Kbd>ESC</Kbd>
                <span>close</span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

"use client";

// components/ui/NavSearch.tsx
import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Icon from "@/components/ui/Icon";

export default function NavSearch() {
  const router = useRouter();
  const [open, setOpen]   = useState(false);
  const [query, setQuery] = useState("");
  const inputRef          = useRef<HTMLInputElement>(null);

  // Focus input when opened
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") { setOpen(false); setQuery(""); }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    setOpen(false);
    setQuery("");
    router.push(`/books?q=${encodeURIComponent(q)}`);
  }

  return (
    <>
      {/* ── Collapsed: pill button ── */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="relative hidden items-center rounded-full bg-paper/60 py-2.5 pl-11 pr-5 text-[14px] font-medium text-text-muted transition-all hover:bg-paper/60 md:flex border border-divider/50"
          aria-label="Open search"
        >
          <Icon name="search" className="absolute left-3.5 text-[18px] text-text-muted" />
          Search e-Library...
        </button>
      )}

      {/* ── Expanded: input form ── */}
      {open && (
        <form
          onSubmit={handleSubmit}
          className="relative hidden md:flex items-center"
        >
          <Icon name="search" className="absolute left-3.5 text-[18px] text-text-muted pointer-events-none" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search e-Library..."
            className="w-[280px] rounded-full border border-brand/40 bg-bg-surface py-2.5 pl-11 pr-10 text-[14px] text-text-heading outline-none ring-2 ring-focus-ring/20 placeholder-text-muted"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute right-8 text-text-muted hover:text-text-body"
            >
              ✕
            </button>
          )}
          <button
            type="button"
            onClick={() => { setOpen(false); setQuery(""); }}
            className="absolute right-3 text-text-muted hover:text-text-body text-xs"
            title="Close"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round"/>
            </svg>
          </button>
        </form>
      )}
    </>
  );
}
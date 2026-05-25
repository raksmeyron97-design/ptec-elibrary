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
          className="relative hidden items-center rounded-full bg-slate-100/60 py-2.5 pl-11 pr-5 text-[14px] font-medium text-slate-500 transition-all hover:bg-slate-200/60 md:flex border border-slate-200/50"
          aria-label="Open search"
        >
          <Icon name="search" className="absolute left-3.5 text-[18px] text-slate-400" />
          Search e-Library...
        </button>
      )}

      {/* ── Expanded: input form ── */}
      {open && (
        <form
          onSubmit={handleSubmit}
          className="relative hidden md:flex items-center"
        >
          <Icon name="search" className="absolute left-3.5 text-[18px] text-slate-400 pointer-events-none" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search e-Library..."
            className="w-[280px] rounded-full border border-[#007c91]/40 bg-white py-2.5 pl-11 pr-10 text-[14px] text-slate-800 outline-none ring-2 ring-[#007c91]/20 placeholder-slate-400"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute right-8 text-slate-400 hover:text-slate-600"
            >
              ✕
            </button>
          )}
          <button
            type="button"
            onClick={() => { setOpen(false); setQuery(""); }}
            className="absolute right-3 text-slate-400 hover:text-slate-600 text-xs"
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
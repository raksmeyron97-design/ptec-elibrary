"use client";
// app/admin/catalogs/AdminCatalogSearchBar.tsx

import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useState } from "react";

export default function AdminCatalogSearchBar() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(searchParams.get("q") ?? "");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams(searchParams.toString());
    if (query.trim()) params.set("q", query.trim());
    else params.delete("q");
    params.delete("page");
    router.push(`/admin/catalogs?${params.toString()}`);
  }

  function handleClear() {
    setQuery("");
    const params = new URLSearchParams(searchParams.toString());
    params.delete("q");
    params.delete("page");
    router.push(`/admin/catalogs?${params.toString()}`);
  }

  return (
    <form onSubmit={handleSubmit} className="relative flex w-full items-center gap-2">
      <label className="relative flex-1">
        {/* Search icon */}
        <svg
          className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted pointer-events-none"
          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" strokeLinecap="round" />
        </svg>

        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          type="search"
          autoComplete="off"
          placeholder="Search title, author, ISBN, or category…"
          className="
            h-10 w-full rounded-xl
            border border-divider bg-bg-surface
            pl-10 pr-10 text-sm text-text-heading
            placeholder:text-text-muted
            outline-none ring-0
            transition
            focus:border-brand/50 focus:ring-2 focus:ring-focus-ring/15
            shadow-sm
          "
        />

        {/* Clear button */}
        {query && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-muted transition"
            aria-label="Clear search"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
            </svg>
          </button>
        )}
      </label>

      <button
        type="submit"
        className="
          h-10 rounded-xl
          bg-gradient-to-br from-blue-950 to-brand
          px-5 text-sm font-semibold text-white
          shadow-[0_2px_10px_rgba(0,124,145,0.3)]
          transition hover:shadow-[0_4px_16px_rgba(0,124,145,0.45)]
          active:scale-[0.98] whitespace-nowrap
        "
      >
        Search
      </button>
    </form>
  );
}
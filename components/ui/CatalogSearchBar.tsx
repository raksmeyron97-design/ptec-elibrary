"use client";
// components/ui/CatalogSearchBar.tsx

import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useState } from "react";

export default function CatalogSearchBar() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(searchParams.get("q") ?? "");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams(searchParams.toString());
    if (query.trim()) params.set("q", query.trim());
    else params.delete("q");
    params.delete("page");
    router.push(`/catalogs?${params.toString()}`);
  }

  return (
    <form onSubmit={handleSubmit} className="relative flex w-full items-center gap-2">
      <label className="relative flex-1">
        {/* Search icon */}
        <svg
          className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none"
          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
        >
          <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" strokeLinecap="round" />
        </svg>

        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          type="search"
          autoComplete="off"
          placeholder="Search title, author, or ISBN…"
          className="
            h-11 w-full rounded-xl
            border border-slate-200 bg-white
            pl-10 pr-4 text-sm text-slate-800
            placeholder:text-slate-400
            outline-none ring-0
            transition
            focus:border-[#007c91]/50 focus:ring-2 focus:ring-[#007c91]/15
            shadow-sm
          "
        />
      </label>

      <button
        type="submit"
        className="
          h-11 rounded-xl
          bg-gradient-to-br from-[#0a1629] to-[#007c91]
          px-5 text-sm font-semibold text-white
          shadow-[0_2px_10px_rgba(0,124,145,0.3)]
          transition hover:shadow-[0_4px_16px_rgba(0,124,145,0.45)]
          active:scale-[0.98]
        "
      >
        Search
      </button>
    </form>
  );
}
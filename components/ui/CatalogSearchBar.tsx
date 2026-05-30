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
          className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted pointer-events-none"
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
            border border-divider bg-white
            pl-10 pr-4 text-sm text-text-heading
            placeholder:text-text-muted caret-brand
            outline-none ring-0
            transition
            focus:border-brand focus:ring-2 focus:ring-focus-ring/30
            shadow-sm
          "
        />
      </label>

      <button
        type="submit"
        className="
          h-11 rounded-xl
          bg-brand px-5 text-sm font-semibold text-brand-contrast
          shadow-sm
          transition hover:bg-brand-hover
          focus:outline-none focus:ring-2 focus:ring-focus-ring focus:ring-offset-2
          active:scale-[0.98]
        "
      >
        Search
      </button>
    </form>
  );
}
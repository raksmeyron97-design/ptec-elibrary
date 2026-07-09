"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Plus, Search, X } from "lucide-react";
import { withUpdatedParams } from "@/lib/admin/theses-url";

export default function ThesisToolbar({ totalItems }: { totalItems: number }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(searchParams.get("q") ?? "");

  // Debounce: push the URL 350ms after the user stops typing.
  useEffect(() => {
    const current = searchParams.get("q") ?? "";
    if (query === current) return;
    const timer = setTimeout(() => {
      router.push(withUpdatedParams(searchParams, { q: query || null }));
    }, 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="flex flex-1 items-center gap-3 rounded-xl border border-divider bg-bg-surface px-4 py-3 shadow-sm">
        <Search className="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
        <label htmlFor="thesis-search" className="sr-only">
          Search theses
        </label>
        <input
          id="thesis-search"
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search theses by title, author, advisor, program, keyword…"
          className="flex-1 bg-transparent text-sm text-text-heading placeholder-text-muted outline-none"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="Clear search"
            className="text-text-muted hover:text-text-body"
          >
            <X className="h-4 w-4" />
          </button>
        )}
        <span className="whitespace-nowrap text-xs text-text-muted" aria-live="polite">
          {totalItems.toLocaleString()} result{totalItems !== 1 ? "s" : ""}
        </span>
      </div>

      <Link
        href="/admin/theses/create"
        className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-brand px-6 text-sm font-bold text-white shadow-sm transition hover:bg-brand-hover"
      >
        <Plus className="h-4 w-4" strokeWidth={2.5} />
        Upload Thesis
      </Link>
    </div>
  );
}

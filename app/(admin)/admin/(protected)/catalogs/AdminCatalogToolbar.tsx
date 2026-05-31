"use client";
// app/admin/catalogs/AdminCatalogToolbar.tsx

import { useState, useRef, useCallback, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";

type Filters = { q: string; cat: string; dept: string; status: string; sort: string };

const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: "newest",    label: "Just added" },
  { value: "oldest",    label: "Oldest first" },
  { value: "title",     label: "Title (A–Z)" },
  { value: "author",    label: "Author (A–Z)" },
  { value: "category",  label: "Category" },
  { value: "available", label: "Most available" },
];

export default function AdminCatalogToolbar({
  categories,
  departments,
  filters,
  totalItems,
}: {
  categories: string[];
  departments: string[];
  filters: Filters;
  totalItems: number;
}) {
  const router   = useRouter();
  const pathname = usePathname();
  const params   = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [queryText, setQueryText] = useState(filters.q);

  const setParams = useCallback(
    (updates: Record<string, string | null>, resetPage = true) => {
      const next = new URLSearchParams(params.toString());
      Object.entries(updates).forEach(([k, v]) => {
        if (v === null || v === "") next.delete(k);
        else next.set(k, v);
      });
      if (resetPage) next.delete("page");
      const qs = next.toString();
      startTransition(() => router.push(qs ? `${pathname}?${qs}` : pathname));
    },
    [params, pathname, router]
  );

  const debRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  function onSearchChange(v: string) {
    setQueryText(v);
    if (debRef.current) clearTimeout(debRef.current);
    debRef.current = setTimeout(() => setParams({ q: v || null }), 350);
  }
  function clearSearch() {
    setQueryText("");
    if (debRef.current) clearTimeout(debRef.current);
    setParams({ q: null });
  }

  const anyFilterActive =
    !!filters.q || !!filters.cat || !!filters.dept || !!filters.status || filters.sort !== "newest";

  function resetAll() {
    setQueryText("");
    startTransition(() => router.push(pathname));
  }

  const selectCls =
    "h-10 rounded-xl border border-divider bg-bg-surface px-3 text-sm text-text-body outline-none transition focus:border-brand/50 focus:ring-2 focus:ring-focus-ring/15 shadow-sm";

  return (
    <div className={`space-y-2 ${isPending ? "opacity-70" : ""}`}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        {/* Search */}
        <label className="relative flex-1">
          <svg
            className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted pointer-events-none"
            viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" strokeLinecap="round" />
          </svg>
          <input
            value={queryText}
            onChange={(e) => onSearchChange(e.target.value)}
            type="search"
            autoComplete="off"
            placeholder="Search title, author, ISBN, category, shelf…"
            className="h-10 w-full rounded-xl border border-divider bg-bg-surface pl-10 pr-10 text-sm text-text-heading placeholder:text-text-muted outline-none transition focus:border-brand/50 focus:ring-2 focus:ring-focus-ring/15 shadow-sm"
          />
          {queryText && (
            <button
              type="button"
              onClick={clearSearch}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-muted transition"
              aria-label="Clear search"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
              </svg>
            </button>
          )}
        </label>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={filters.sort}
            onChange={(e) => setParams({ sort: e.target.value })}
            className={selectCls}
            aria-label="Sort by"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>

          <select
            value={filters.cat}
            onChange={(e) => setParams({ cat: e.target.value || null })}
            className={selectCls}
            aria-label="Category"
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>

          <select
            value={filters.dept}
            onChange={(e) => setParams({ dept: e.target.value || null })}
            className={selectCls}
            aria-label="Department"
          >
            <option value="">All departments</option>
            {departments.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>

          <select
            value={filters.status}
            onChange={(e) => setParams({ status: e.target.value || null })}
            className={selectCls}
            aria-label="Status"
          >
            <option value="">All status</option>
            <option value="active">Active</option>
            <option value="deleted">Deleted</option>
          </select>

          {anyFilterActive && (
            <button
              onClick={resetAll}
              className="h-10 rounded-xl border border-divider px-3 text-xs font-semibold text-text-body transition hover:bg-paper"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      <p className="px-1 text-sm text-text-muted">
        <span className="font-semibold text-text-body">{totalItems}</span>{" "}
        result{totalItems !== 1 ? "s" : ""}
        {filters.q && (
          <> for <span className="font-semibold text-brand">&ldquo;{filters.q}&rdquo;</span></>
        )}
      </p>
    </div>
  );
}
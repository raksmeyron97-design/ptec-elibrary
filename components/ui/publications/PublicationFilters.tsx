"use client";

import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";

export type PublicationFilterValues = {
  q: string;
  type: string;
  journal: string;
  year: string;
  language: string;
  keyword: string;
};

export default function PublicationFilters({
  filters,
  journals,
  years,
  labels,
}: {
  filters: PublicationFilterValues;
  journals: string[];
  years: string[];
  labels: {
    searchPlaceholder: string;
    allTypes: string;
    allJournals: string;
    allYears: string;
    allLanguages: string;
    clear: string;
    types: Record<string, string>;
  };
}) {
  const router = useRouter();

  const update = (key: string, value: string) => {
    const params = new URLSearchParams(window.location.search);
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    params.delete("page");
    router.push(`/publications?${params.toString()}`);
  };

  const hasFilters = !!(filters.q || filters.type || filters.journal || filters.year || filters.language || filters.keyword);

  const selectClass =
    "h-10 rounded-lg border border-divider bg-bg-surface px-3 py-2 text-sm text-text-body outline-none transition focus:border-brand cursor-pointer";

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-divider bg-bg-surface p-4">
      <div className="relative min-w-[220px] flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
        <input
          type="search"
          placeholder={labels.searchPlaceholder}
          defaultValue={filters.q}
          onBlur={(e) => update("q", e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && update("q", e.currentTarget.value)}
          className="h-10 w-full rounded-lg border border-divider bg-transparent pl-9 pr-3 text-sm text-text-body outline-none transition focus:border-brand"
        />
      </div>

      <select value={filters.type} onChange={(e) => update("type", e.target.value)} className={selectClass} aria-label={labels.allTypes}>
        <option value="">{labels.allTypes}</option>
        {Object.entries(labels.types).map(([value, label]) => (
          <option key={value} value={value}>{label}</option>
        ))}
      </select>

      {journals.length > 0 && (
        <select value={filters.journal} onChange={(e) => update("journal", e.target.value)} className={selectClass} aria-label={labels.allJournals}>
          <option value="">{labels.allJournals}</option>
          {journals.map((j) => (
            <option key={j} value={j}>{j}</option>
          ))}
        </select>
      )}

      {years.length > 0 && (
        <select value={filters.year} onChange={(e) => update("year", e.target.value)} className={selectClass} aria-label={labels.allYears}>
          <option value="">{labels.allYears}</option>
          {years.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      )}

      <select value={filters.language} onChange={(e) => update("language", e.target.value)} className={selectClass} aria-label={labels.allLanguages}>
        <option value="">{labels.allLanguages}</option>
        <option value="en">English</option>
        <option value="km">ខ្មែរ</option>
      </select>

      {hasFilters && (
        <button
          type="button"
          onClick={() => router.push("/publications")}
          className="inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-lg border border-divider px-3 text-sm font-medium text-text-muted transition-colors hover:border-brand/40 hover:text-brand"
        >
          <X className="h-3.5 w-3.5" />
          {labels.clear}
        </button>
      )}
    </div>
  );
}

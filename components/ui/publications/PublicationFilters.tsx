"use client";

import { useRouter } from "next/navigation";
import { SlidersHorizontal, X } from "lucide-react";

export type PublicationFilterValues = {
  q: string;
  type: string;
  journal: string;
  year: string;
  language: string;
  keyword: string;
};

/**
 * Slim filter toolbar shown under the hero. Free-text search lives in the
 * hero form; this bar only manages the structured facets.
 */
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

  const selectClass = (active: boolean) =>
    `h-9 max-w-[180px] cursor-pointer rounded-full border px-3 text-[13px] outline-none transition focus:border-brand ${
      active
        ? "border-brand/40 bg-brand/5 font-medium text-brand"
        : "border-divider bg-bg-surface text-text-body"
    }`;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-text-muted">
        <SlidersHorizontal className="h-3.5 w-3.5" />
      </span>

      <select
        value={filters.type}
        onChange={(e) => update("type", e.target.value)}
        className={selectClass(!!filters.type)}
        aria-label={labels.allTypes}
      >
        <option value="">{labels.allTypes}</option>
        {Object.entries(labels.types).map(([value, label]) => (
          <option key={value} value={value}>{label}</option>
        ))}
      </select>

      {journals.length > 0 && (
        <select
          value={filters.journal}
          onChange={(e) => update("journal", e.target.value)}
          className={selectClass(!!filters.journal)}
          aria-label={labels.allJournals}
        >
          <option value="">{labels.allJournals}</option>
          {journals.map((j) => (
            <option key={j} value={j}>{j}</option>
          ))}
        </select>
      )}

      {years.length > 0 && (
        <select
          value={filters.year}
          onChange={(e) => update("year", e.target.value)}
          className={selectClass(!!filters.year)}
          aria-label={labels.allYears}
        >
          <option value="">{labels.allYears}</option>
          {years.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      )}

      <select
        value={filters.language}
        onChange={(e) => update("language", e.target.value)}
        className={selectClass(!!filters.language)}
        aria-label={labels.allLanguages}
      >
        <option value="">{labels.allLanguages}</option>
        <option value="en">English</option>
        <option value="km">ខ្មែរ</option>
      </select>

      {hasFilters && (
        <button
          type="button"
          onClick={() => router.push("/publications")}
          className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full border border-dashed border-divider px-3 text-[13px] font-medium text-text-muted transition-colors hover:border-danger/40 hover:text-danger"
        >
          <X className="h-3.5 w-3.5" />
          {labels.clear}
        </button>
      )}
    </div>
  );
}

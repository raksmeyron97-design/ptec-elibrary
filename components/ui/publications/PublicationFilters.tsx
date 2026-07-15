"use client";

import { useRouter } from "@/i18n/navigation";
import { SlidersHorizontal, X } from "lucide-react";
import SearchableSelect from "@/components/ui/search/SearchableSelect";

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

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-text-muted">
        <SlidersHorizontal className="h-3.5 w-3.5" />
      </span>

      <div className="w-[180px]">
        <SearchableSelect
          name="type"
          value={filters.type}
          onChange={(v) => update("type", v)}
          options={[
            { value: "", label: labels.allTypes },
            ...Object.entries(labels.types).map(([value, label]) => ({ value, label }))
          ]}
          ariaLabel={labels.allTypes}
        />
      </div>

      {journals.length > 0 && (
        <div className="w-[180px]">
          <SearchableSelect
            name="journal"
            value={filters.journal}
            onChange={(v) => update("journal", v)}
            options={[
              { value: "", label: labels.allJournals },
              ...journals.map((j) => ({ value: j, label: j }))
            ]}
            ariaLabel={labels.allJournals}
          />
        </div>
      )}

      {years.length > 0 && (
        <div className="w-[150px]">
          <SearchableSelect
            name="year"
            value={filters.year}
            onChange={(v) => update("year", v)}
            options={[
              { value: "", label: labels.allYears },
              ...years.map((y) => ({ value: y, label: y }))
            ]}
            ariaLabel={labels.allYears}
          />
        </div>
      )}

      <div className="w-[150px]">
        <SearchableSelect
          name="language"
          value={filters.language}
          onChange={(v) => update("language", v)}
          options={[
            { value: "", label: labels.allLanguages },
            { value: "en", label: "English" },
            { value: "km", label: "ខ្មែរ" }
          ]}
          ariaLabel={labels.allLanguages}
        />
      </div>

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

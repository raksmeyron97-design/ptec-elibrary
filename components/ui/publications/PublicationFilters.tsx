"use client";

import { useRouter } from "@/i18n/navigation";
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

/** Label above a facet control, associated by wrapping the control. */
function Facet({
  label,
  htmlFor,
  width = "sm:w-[180px]",
  children,
}: {
  label: string;
  htmlFor: string;
  width?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`flex min-w-0 flex-col gap-1 ${width}`}>
      <span id={`${htmlFor}-label`} className="px-0.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-text-muted">
        {label}
      </span>
      {children}
    </div>
  );
}

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
    typeLabel: string;
    journalLabel: string;
    yearLabel: string;
    languageLabel: string;
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

  return (
    // Each facet is labelled. The bar was four visually identical dropdowns
    // behind a lone slider icon — "All types", "All journals", "All years",
    // "All languages" only tell you which is which once one is *set*, and a
    // reader looking for "2014" had to open three of them to find the year.
    // Two even columns on a phone, intrinsic widths from `sm` up. Free-flowing
    // flex-wrap left the last facet stranded on its own row at 390px because
    // the four controls have three different widths.
    <div className="grid grid-cols-2 items-end gap-x-3 gap-y-3 sm:flex sm:flex-wrap">
      <Facet label={labels.typeLabel} htmlFor="pub-filter-type">
        <SearchableSelect
          name="type"
          value={filters.type}
          onChange={(v) => update("type", v)}
          options={[
            { value: "", label: labels.allTypes },
            ...Object.entries(labels.types).map(([value, label]) => ({ value, label }))
          ]}
          ariaLabel={labels.typeLabel}
        />
      </Facet>

      {journals.length > 0 && (
        <Facet label={labels.journalLabel} htmlFor="pub-filter-journal">
          <SearchableSelect
            name="journal"
            value={filters.journal}
            onChange={(v) => update("journal", v)}
            options={[
              { value: "", label: labels.allJournals },
              ...journals.map((j) => ({ value: j, label: j }))
            ]}
            ariaLabel={labels.journalLabel}
          />
        </Facet>
      )}

      {years.length > 0 && (
        <Facet label={labels.yearLabel} htmlFor="pub-filter-year" width="sm:w-[140px]">
          <SearchableSelect
            name="year"
            value={filters.year}
            onChange={(v) => update("year", v)}
            options={[
              { value: "", label: labels.allYears },
              ...years.map((y) => ({ value: y, label: y }))
            ]}
            ariaLabel={labels.yearLabel}
          />
        </Facet>
      )}

      <Facet label={labels.languageLabel} htmlFor="pub-filter-language" width="sm:w-[140px]">
        <SearchableSelect
          name="language"
          value={filters.language}
          onChange={(v) => update("language", v)}
          options={[
            { value: "", label: labels.allLanguages },
            { value: "en", label: "English" },
            { value: "km", label: "ខ្មែរ" }
          ]}
          ariaLabel={labels.languageLabel}
        />
      </Facet>

      {/* No "Clear filters" button here any more: <AppliedFilters> renders
          directly below, names every active facet and carries its own
          "Clear all". Two clear-everything controls one line apart was the
          same defect the theses toolbar already fixed. */}
    </div>
  );
}

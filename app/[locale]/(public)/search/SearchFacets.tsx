"use client";

// Faceted-filter sidebar for /search. Selections are multi-select checkboxes;
// state lives entirely in the URL (the parent owns toggling), counts come from
// the API's facetCounts and follow the exclude-own-dimension rule, so adding a
// second language shows what it would contribute instead of zero.

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { FacetCount, FacetDimension, SearchFacetCounts } from "@/lib/search/facets";

const COLLAPSED_LIMIT = 6;

const TYPE_VALUE_LABEL_KEY: Record<string, "tabBooks" | "tabTheses" | "tabPublications" | "tabCatalog" | "tabLearningPaths" | "tabPosts"> = {
  book: "tabBooks",
  research: "tabTheses",
  publication: "tabPublications",
  catalog: "tabCatalog",
  learning_path: "tabLearningPaths",
  post: "tabPosts",
};

type FacetGroupProps = {
  dim: FacetDimension;
  title: string;
  items: FacetCount[];
  labelOf?: (value: string) => string;
  onToggle: (dim: FacetDimension, value: string) => void;
};

function FacetGroup({ dim, title, items, labelOf, onToggle }: FacetGroupProps) {
  const t = useTranslations("search");
  const [expanded, setExpanded] = useState(false);
  if (items.length === 0) return null;
  const visible = expanded ? items : items.slice(0, COLLAPSED_LIMIT);
  // Selected values must never hide behind "Show more" — they'd be un-uncheckable.
  const hiddenSelected = expanded ? [] : items.slice(COLLAPSED_LIMIT).filter((i) => i.selected);

  return (
    <fieldset className="min-w-0">
      <legend
        className="mb-2 text-[11px] font-bold uppercase tracking-[0.08em]"
        style={{ color: "var(--ptec-text-muted)" }}
      >
        {title}
      </legend>
      <div className="space-y-1">
        {[...visible, ...hiddenSelected].map((item) => (
          <label
            key={item.value}
            className="flex cursor-pointer items-center gap-2 rounded-lg px-1.5 py-1 text-[12.5px] transition-colors hover:bg-[color-mix(in_srgb,var(--ptec-border)_35%,transparent)]"
            style={{ color: item.selected ? "var(--ptec-text-heading)" : "var(--ptec-text-body)" }}
          >
            <input
              type="checkbox"
              checked={item.selected}
              onChange={() => onToggle(dim, item.value)}
              data-facet-dim={dim}
              data-facet-value={item.value}
              className="h-3.5 w-3.5 shrink-0 cursor-pointer accent-[var(--ptec-brand)]"
            />
            <span className="min-w-0 flex-1 truncate font-medium">
              {labelOf ? labelOf(item.value) : item.value}
            </span>
            <span
              className="shrink-0 rounded-full px-1.5 text-[10.5px] font-semibold tabular-nums"
              style={{ background: "var(--ptec-bg-body)", color: "var(--ptec-text-muted)" }}
              data-facet-count={dim}
            >
              {item.count}
            </span>
          </label>
        ))}
      </div>
      {items.length > COLLAPSED_LIMIT && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-1.5 cursor-pointer text-[11.5px] font-semibold hover:underline underline-offset-2"
          style={{ color: "var(--ptec-brand)" }}
        >
          {expanded ? t("facetShowLess") : t("facetShowMore")}
        </button>
      )}
    </fieldset>
  );
}

type SearchFacetsProps = {
  facetCounts: SearchFacetCounts;
  /** Hide the type group on single-type tabs — the tab already fixes it. */
  showTypes: boolean;
  selectedCount: number;
  onToggle: (dim: FacetDimension, value: string) => void;
  onClearAll: () => void;
};

export default function SearchFacets({ facetCounts, showTypes, selectedCount, onToggle, onClearAll }: SearchFacetsProps) {
  const t = useTranslations("search");

  const groups: { dim: FacetDimension; title: string; labelOf?: (value: string) => string }[] = [
    ...(showTypes
      ? [{
          dim: "types" as const,
          title: t("facetType"),
          labelOf: (value: string) => {
            const key = TYPE_VALUE_LABEL_KEY[value];
            return key ? t(key) : value;
          },
        }]
      : []),
    { dim: "subjects", title: t("advFieldSubject") },
    { dim: "langs", title: t("advFieldLanguage") },
    { dim: "years", title: t("advFieldYear") },
    { dim: "availability", title: t("advFieldAvailability") },
  ];

  const hasAnyValues = groups.some((g) => facetCounts[g.dim].length > 0);
  if (!hasAnyValues) return null;

  return (
    <div
      data-testid="search-facets"
      className="space-y-5 rounded-[14px] border p-4"
      style={{ background: "var(--ptec-bg-surface)", borderColor: "var(--ptec-border)" }}
    >
      <div className="flex items-center justify-between">
        <h2 className="text-[12px] font-bold uppercase tracking-[0.08em]" style={{ color: "var(--ptec-text-heading)" }}>
          {t("filter")}
        </h2>
        {selectedCount > 0 && (
          <button
            type="button"
            onClick={onClearAll}
            className="cursor-pointer text-[11.5px] font-semibold hover:underline underline-offset-2"
            style={{ color: "var(--ptec-text-muted)" }}
          >
            {t("clearFilters")}
          </button>
        )}
      </div>
      {groups.map((group) => (
        <FacetGroup
          key={group.dim}
          dim={group.dim}
          title={group.title}
          items={facetCounts[group.dim]}
          labelOf={group.labelOf}
          onToggle={onToggle}
        />
      ))}
    </div>
  );
}

import { Link } from "@/i18n/navigation";
import { LayoutGrid, List, Rows3 } from "lucide-react";
import { FilterLink } from "@/components/ui/books/ClientNavWrapper";
import { SortSelect, RowsPerPageSelect } from "@/components/ui/books/ClientNavWrapper";

const SORT_OPTIONS = [
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
  { value: "views", label: "Most Viewed" },
  { value: "downloads", label: "Most Downloaded" },
];

function buildHref(basePath: string, current: Record<string, string | undefined>, overrides: Record<string, string | undefined>): string {
  const merged = { ...current, ...overrides };
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(merged)) {
    if (v) p.set(k, v);
  }
  const qs = p.toString();
  return `${basePath}${qs ? `?${qs}` : ""}`;
}

function viewBtnClass(active: boolean): string {
  // Two cells inside one rounded, clipped group. The group owns the radius and
  // the border; the cells own only their fill, so the selected one reaches the
  // group's edge instead of floating a rounded pill inside a rounded box.
  return `inline-flex h-[34px] w-9 items-center justify-center transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring/50 ${
    active ? "bg-brand text-brand-contrast" : "text-text-muted hover:bg-paper hover:text-text-heading"
  }`;
}

export default function ResultToolbar({
  countLabel,
  query,
  params,
  isGrid,
  sort,
  pageSize,
  pageSizeOptions,
  summaryLabel,
  basePath = "/theses",
}: {
  /** Pre-resolved, translated count text from the server page — e.g.
   *  "12 theses" or "3 of 12 theses". Built once by the page via
   *  lib/listing-count.ts so the toolbar cannot state a different rule, and
   *  passed in as a string because this toolbar used to hard-code the English
   *  "thesis"/"theses" suffix and never rendered Khmer at all. */
  countLabel: string;
  query?: string;
  params: Record<string, string | undefined>;
  isGrid: boolean;
  sort: string;
  pageSize: number;
  pageSizeOptions: number[];
  summaryLabel?: string;
  basePath?: string;
}) {
  return (
    // No card and no rule: the toolbar sits on the page ground between the
    // filter chips and the stack of result cards, and a container around it
    // would make three bordered things in a row where one list is meant.
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      {/* Result count. aria-live so a filter change is announced — the count
          is the only thing on screen that confirms one took effect. */}
      <p aria-live="polite" className="text-[13.5px] text-text-muted">
        <span className="font-bold tabular-nums text-text-heading">{countLabel}</span>
        {query && <> for &ldquo;{query}&rdquo;</>}
      </p>

      <div className="flex flex-wrap items-center gap-2">
        {/* Items per page */}
        <RowsPerPageSelect value={pageSize} options={pageSizeOptions} basePath={basePath} id="theses-page-size" />

        {/* Sort */}
        <SortSelect
          value={sort}
          options={SORT_OPTIONS}
          defaultLabel="Newest"
          paramKey="sort"
          basePath={basePath}
        />

        {/* View toggle */}
        <div role="group" aria-label="View mode" className="flex items-center overflow-hidden rounded-lg border border-divider [&>*+*]:border-l [&>*+*]:border-divider">
          <FilterLink
            href={buildHref(basePath, params, { view: undefined })}
            className={viewBtnClass(!isGrid)}
            aria-label="List view"
            aria-current={!isGrid ? "true" : undefined}
          >
            <Rows3 className="h-4 w-4" />
          </FilterLink>
          <FilterLink
            href={buildHref(basePath, params, { view: "grid" })}
            className={viewBtnClass(isGrid)}
            aria-label="Grid view"
            aria-current={isGrid ? "true" : undefined}
          >
            <LayoutGrid className="h-4 w-4" />
          </FilterLink>
        </div>

        {/* No "Reset filters" here any more. <AppliedFilters> sits directly
            above this row, names every active facet and carries its own
            "Clear all" — a second clear-everything control one line below the
            first was the third way to do the same thing on one screen. */}

        {/* Summary index (existing feature, preserved) */}
        {summaryLabel && (
          <Link
            href="/theses/summary"
            className="inline-flex h-[34px] items-center gap-2 rounded-lg border border-divider px-3.5 text-[12.5px] font-semibold text-text-body transition-colors duration-150 hover:border-brand/40 hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50"
          >
            <List className="h-4 w-4" aria-hidden="true" />
            {summaryLabel}
          </Link>
        )}
      </div>
    </div>
  );
}

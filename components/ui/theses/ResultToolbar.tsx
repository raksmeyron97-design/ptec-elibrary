import { Link } from "@/i18n/navigation";
import { LayoutGrid, List, Rows3, RotateCcw } from "lucide-react";
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
  return `inline-flex items-center justify-center rounded-md px-2.5 py-1.5 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50 ${
    active ? "bg-brand text-brand-contrast" : "text-text-muted hover:bg-bg-app hover:text-brand"
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
  hasFilters,
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
  hasFilters: boolean;
  summaryLabel?: string;
  basePath?: string;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-divider bg-bg-surface p-3.5 sm:flex-row sm:items-center sm:justify-between">
      {/* Result count */}
      <p aria-live="polite" className="text-[13px] text-text-muted">
        <span className="font-semibold text-text-body tabular-nums">{countLabel}</span>
        {query && <> &mdash; &ldquo;{query}&rdquo;</>}
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
        <div role="group" aria-label="View mode" className="flex items-center rounded-lg border border-divider bg-paper p-0.5">
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

        {/* Reset filters */}
        {hasFilters && (
          <FilterLink
            href={basePath}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-divider bg-paper px-3 py-1.5 text-[12.5px] font-semibold text-text-body transition-colors duration-150 hover:border-brand/30 hover:bg-brand/5 hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset Filters
          </FilterLink>
        )}

        {/* Summary index (existing feature, preserved) */}
        {summaryLabel && (
          <Link
            href="/theses/summary"
            className="inline-flex items-center gap-2 rounded-lg border border-divider bg-paper px-4 py-2 text-[13px] font-semibold text-text-body transition-colors duration-150 hover:border-brand/30 hover:bg-brand/5 hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50"
          >
            <List className="w-4 h-4" />
            {summaryLabel}
          </Link>
        )}
      </div>
    </div>
  );
}

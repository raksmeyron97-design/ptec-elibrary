import Link from "next/link";
import { LayoutGrid, List, Rows3, RotateCcw } from "lucide-react";
import { FilterLink } from "@/components/ui/books/ClientNavWrapper";
import { SortSelect, RowsPerPageSelect } from "@/components/ui/books/ClientNavWrapper";

const SORT_OPTIONS = [
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
  { value: "views", label: "Most Viewed" },
  { value: "downloads", label: "Most Downloaded" },
];

function buildHref(current: Record<string, string | undefined>, overrides: Record<string, string | undefined>): string {
  const merged = { ...current, ...overrides };
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(merged)) {
    if (v) p.set(k, v);
  }
  const qs = p.toString();
  return `/theses${qs ? `?${qs}` : ""}`;
}

function viewBtnClass(active: boolean): string {
  return `inline-flex items-center justify-center rounded-md px-2.5 py-1.5 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/50 ${
    active ? "bg-brand text-brand-contrast" : "text-text-muted hover:bg-bg-app hover:text-brand"
  }`;
}

export default function ResultToolbar({
  total,
  query,
  params,
  isGrid,
  sort,
  pageSize,
  pageSizeOptions,
  hasFilters,
  summaryLabel,
}: {
  total: number;
  query?: string;
  params: Record<string, string | undefined>;
  isGrid: boolean;
  sort: string;
  pageSize: number;
  pageSizeOptions: number[];
  hasFilters: boolean;
  summaryLabel?: string;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-divider bg-bg-surface p-3.5 sm:flex-row sm:items-center sm:justify-between">
      {/* Result count */}
      <p className="text-[13px] text-text-muted">
        <span className="font-semibold text-text-body tabular-nums">{total.toLocaleString()}</span>{" "}
        thesis{total === 1 ? "" : "es"}
        {query && <> for &ldquo;{query}&rdquo;</>}
      </p>

      <div className="flex flex-wrap items-center gap-2">
        {/* Items per page */}
        <RowsPerPageSelect value={pageSize} options={pageSizeOptions} basePath="/theses" id="theses-page-size" />

        {/* Sort */}
        <SortSelect
          value={sort}
          options={SORT_OPTIONS}
          defaultLabel="Newest"
          paramKey="sort"
          basePath="/theses"
        />

        {/* View toggle */}
        <div role="group" aria-label="View mode" className="flex items-center rounded-lg border border-divider bg-paper p-0.5">
          <FilterLink
            href={buildHref(params, { view: undefined })}
            className={viewBtnClass(!isGrid)}
            aria-label="List view"
            aria-pressed={!isGrid}
          >
            <Rows3 className="h-4 w-4" />
          </FilterLink>
          <FilterLink
            href={buildHref(params, { view: "grid" })}
            className={viewBtnClass(isGrid)}
            aria-label="Grid view"
            aria-pressed={isGrid}
          >
            <LayoutGrid className="h-4 w-4" />
          </FilterLink>
        </div>

        {/* Reset filters */}
        {hasFilters && (
          <FilterLink
            href="/theses"
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

import { useTranslations } from "next-intl";
import { FilterLink, RowsPerPageSelect } from "@/components/ui/books/ClientNavWrapper";

type PaginationProps = {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  searchParams: Record<string, string | undefined>;
  basePath?: string; // e.g. "/books" or "/catalogs" — defaults to "/books"
  /**
   * When provided, renders a "Rows per page" selector wired to the URL. The
   * consuming page must read `pageSizeParam` (default "size") to take effect.
   */
  pageSizeOptions?: number[];
  pageSizeParam?: string;
};

/** Build a href preserving existing filters, overriding the page param. */
function pageHref(
  searchParams: Record<string, string | undefined>,
  page: number,
  basePath: string
): string {
  const p = new URLSearchParams();
  Object.entries(searchParams).forEach(([k, v]) => {
    if (v && k !== "page") p.set(k, v);
  });
  if (page > 1) p.set("page", String(page));
  const qs = p.toString();
  return `${basePath}${qs ? `?${qs}` : ""}`;
}

/**
 * Compute the list of page numbers to render, inserting "…" gaps.
 * Always shows the first and last page plus a sibling window around the
 * current page. If a gap would hide exactly one page, that page number is
 * shown instead of an ellipsis (avoids a useless "…" standing in for one page).
 */
function pageRange(current: number, total: number): (number | "ellipsis")[] {
  const siblings = 1;
  // first + last + current + 2 siblings + 2 ellipses
  const maxSlots = siblings * 2 + 5;

  if (total <= maxSlots) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  const start = Math.max(current - siblings, 1);
  const end = Math.min(current + siblings, total);

  // Show an ellipsis only when it would hide 2+ pages; otherwise the number.
  const showLeftEllipsis = start > 3;
  const showRightEllipsis = end < total - 2;

  const pages: (number | "ellipsis")[] = [1];

  if (showLeftEllipsis) {
    pages.push("ellipsis");
  } else {
    for (let i = 2; i < start; i++) pages.push(i);
  }

  for (let i = start; i <= end; i++) {
    if (i !== 1 && i !== total) pages.push(i);
  }

  if (showRightEllipsis) {
    pages.push("ellipsis");
  } else {
    for (let i = end + 1; i < total; i++) pages.push(i);
  }

  pages.push(total);
  return pages;
}

const ChevronLeftIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M15 18l-6-6 6-6" />
  </svg>
);

const ChevronRightIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M9 18l6-6-6-6" />
  </svg>
);

// ── Shared control styles ─────────────────────────────────────────────────
const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/40 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-page";

const interactive =
  `border border-divider bg-bg-surface text-text-body transition-all duration-150 hover:border-brand hover:bg-brand/5 hover:text-brand active:scale-[0.96] ${focusRing}`;

const disabled =
  "border border-divider text-text-muted opacity-50 cursor-not-allowed";

export default function Pagination({
  currentPage,
  totalPages,
  totalItems,
  pageSize,
  searchParams,
  basePath = "/books",
  pageSizeOptions,
  pageSizeParam = "size",
}: PaginationProps) {
  // useTranslations works in both Server and Client components — Pagination is
  // consumed from both (listing pages are RSC, admin UsersClient is client).
  const t = useTranslations("pagination");
  const showRowsPerPage = !!pageSizeOptions?.length;

  // Nothing to page through and no size selector to show → render nothing.
  if (totalPages <= 1 && !showRowsPerPage) return null;

  // Clamp to a valid range so out-of-bounds ?page= values render sanely.
  const page = Math.min(Math.max(1, currentPage), Math.max(1, totalPages));

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, totalItems);

  const hasPrev = page > 1;
  const hasNext = page < totalPages;
  const pages = pageRange(page, totalPages);

  const prevHref = pageHref(searchParams, page - 1, basePath);
  const nextHref = pageHref(searchParams, page + 1, basePath);

  return (
    <nav
      aria-label={t("paginationLabel")}
      className="mt-10 flex flex-col items-center justify-between gap-4 border-t border-divider pt-7 sm:flex-row"
    >
      {/* Left cluster: rows-per-page selector + results summary */}
      <div className="flex flex-col items-center gap-3 sm:flex-row sm:gap-5">
        {showRowsPerPage && (
          <RowsPerPageSelect
            value={pageSize}
            options={pageSizeOptions!}
            param={pageSizeParam}
            basePath={basePath}
            id="pagination-rows-per-page"
            label={t("rowsPerPage")}
          />
        )}
        <p className="text-[13.5px] text-text-muted tabular-nums" aria-live="polite">
          {t("showing", { from, to, total: totalItems })}
        </p>
      </div>

      {/* Page controls */}
      {totalPages > 1 && (
      <div className="flex items-center gap-1.5">
        {/* Prev */}
        {hasPrev ? (
          <FilterLink
            href={prevHref}
            rel="prev"
            className={`inline-flex h-10 w-10 items-center justify-center rounded-[10px] ${interactive}`}
            aria-label={t("previousPage")}
          >
            <ChevronLeftIcon />
          </FilterLink>
        ) : (
          <span
            aria-disabled="true"
            className={`inline-flex h-10 w-10 items-center justify-center rounded-[10px] ${disabled}`}
          >
            <ChevronLeftIcon />
          </span>
        )}

        {/* Compact current/total indicator — mobile only */}
        <span className="px-2 text-[13.5px] text-text-muted tabular-nums sm:hidden">
          {t("pageOf", { page, total: totalPages })}
        </span>

        {/* Numbered pages — sm and up */}
        <div className="hidden items-center gap-1.5 sm:flex">
          {pages.map((p, i) =>
            p === "ellipsis" ? (
              <span
                key={`ellipsis-${i}`}
                aria-hidden="true"
                className="inline-flex h-10 w-10 items-center justify-center text-text-muted"
              >
                …
              </span>
            ) : p === page ? (
              <span
                key={p}
                aria-current="page"
                aria-label={t("currentPage", { page: p })}
                className="inline-flex h-10 min-w-10 items-center justify-center rounded-[10px] bg-brand px-3 text-[13.5px] font-semibold tabular-nums text-brand-contrast shadow-sm shadow-brand/25"
              >
                {p}
              </span>
            ) : (
              <FilterLink
                key={p}
                href={pageHref(searchParams, p, basePath)}
                aria-label={t("goToPage", { page: p })}
                className={`inline-flex h-10 min-w-10 items-center justify-center rounded-[10px] px-3 text-[13.5px] font-medium tabular-nums ${interactive}`}
              >
                {p}
              </FilterLink>
            )
          )}
        </div>

        {/* Next */}
        {hasNext ? (
          <FilterLink
            href={nextHref}
            rel="next"
            className={`inline-flex h-10 w-10 items-center justify-center rounded-[10px] ${interactive}`}
            aria-label={t("nextPage")}
          >
            <ChevronRightIcon />
          </FilterLink>
        ) : (
          <span
            aria-disabled="true"
            className={`inline-flex h-10 w-10 items-center justify-center rounded-[10px] ${disabled}`}
          >
            <ChevronRightIcon />
          </span>
        )}
      </div>
      )}
    </nav>
  );
}

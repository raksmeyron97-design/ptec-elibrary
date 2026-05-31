// components/ui/Pagination.tsx
import Link from "next/link";

type PaginationProps = {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  searchParams: Record<string, string | undefined>;
  basePath?: string; // e.g. "/books" or "/catalogs" — defaults to "/books"
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

/** Compute the list of page numbers to render, inserting "…" gaps. */
function pageRange(current: number, total: number): (number | "ellipsis")[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  const pages: (number | "ellipsis")[] = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);

  if (start > 2) pages.push("ellipsis");
  for (let i = start; i <= end; i++) pages.push(i);
  if (end < total - 1) pages.push("ellipsis");

  pages.push(total);
  return pages;
}

const ArrowLeftIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M19 12H5m0 0 7 7m-7-7 7-7" />
  </svg>
);

const ChevronRightIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 18l6-6-6-6" />
  </svg>
);

// ── Shared control styles ─────────────────────────────────────────────────
const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring/40 focus-visible:ring-offset-2";

const interactive =
  `border border-divider bg-bg-surface text-text-body transition-colors hover:border-brand hover:bg-brand/5 hover:text-brand ${focusRing}`;

const disabled =
  "border border-divider text-text-muted opacity-60 cursor-not-allowed";

export default function Pagination({
  currentPage,
  totalPages,
  totalItems,
  pageSize,
  searchParams,
  basePath = "/books",
}: PaginationProps) {
  if (totalPages <= 1) return null;

  const from = (currentPage - 1) * pageSize + 1;
  const to = Math.min(currentPage * pageSize, totalItems);

  const hasPrev = currentPage > 1;
  const hasNext = currentPage < totalPages;
  const pages = pageRange(currentPage, totalPages);

  return (
    <nav
      aria-label="Pagination"
      className="mt-10 flex flex-col items-center justify-between gap-4 border-t border-divider pt-7 sm:flex-row"
    >
      {/* Results summary */}
      <p className="text-[13.5px] text-text-muted">
        Showing{" "}
        <span className="font-semibold text-text-body">{from}</span>–
        <span className="font-semibold text-text-body">{to}</span> of{" "}
        <span className="font-semibold text-text-body">{totalItems}</span>{" "}
        result{totalItems !== 1 ? "s" : ""}
      </p>

      {/* Page controls */}
      <div className="flex items-center gap-1.5">
        {/* Prev */}
        {hasPrev ? (
          <Link
            href={pageHref(searchParams, currentPage - 1, basePath)}
            className={`inline-flex h-9 w-9 items-center justify-center rounded-[10px] ${interactive}`}
            aria-label="Previous page"
          >
            <ArrowLeftIcon />
          </Link>
        ) : (
          <span
            aria-disabled
            className={`inline-flex h-9 w-9 items-center justify-center rounded-[10px] ${disabled}`}
          >
            <ArrowLeftIcon />
          </span>
        )}

        {/* Numbered pages */}
        {pages.map((p, i) =>
          p === "ellipsis" ? (
            <span
              key={`ellipsis-${i}`}
              className="inline-flex h-9 w-9 items-center justify-center text-text-muted"
            >
              …
            </span>
          ) : p === currentPage ? (
            <span
              key={p}
              aria-current="page"
              className="inline-flex h-9 min-w-9 items-center justify-center rounded-[10px] bg-brand px-3 text-[13.5px] font-semibold text-brand-contrast shadow-sm shadow-brand/25"
            >
              {p}
            </span>
          ) : (
            <Link
              key={p}
              href={pageHref(searchParams, p, basePath)}
              className={`inline-flex h-9 min-w-9 items-center justify-center rounded-[10px] px-3 text-[13.5px] font-medium ${interactive}`}
            >
              {p}
            </Link>
          )
        )}

        {/* Next */}
        {hasNext ? (
          <Link
            href={pageHref(searchParams, currentPage + 1, basePath)}
            className={`inline-flex h-9 w-9 items-center justify-center rounded-[10px] ${interactive}`}
            aria-label="Next page"
          >
            <ChevronRightIcon />
          </Link>
        ) : (
          <span
            aria-disabled
            className={`inline-flex h-9 w-9 items-center justify-center rounded-[10px] ${disabled}`}
          >
            <ChevronRightIcon />
          </span>
        )}
      </div>
    </nav>
  );
}
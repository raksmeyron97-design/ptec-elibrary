// components/ui/Pagination.tsx
import Link from "next/link";
import Icon from "@/components/ui/Icon";

type PaginationProps = {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  searchParams: Record<string, string | undefined>;
};

/** Build a /books href preserving existing filters, overriding the page param. */
function pageHref(
  searchParams: Record<string, string | undefined>,
  page: number
): string {
  const p = new URLSearchParams();
  Object.entries(searchParams).forEach(([k, v]) => {
    if (v && k !== "page") p.set(k, v);
  });
  if (page > 1) p.set("page", String(page));
  const qs = p.toString();
  return `/books${qs ? `?${qs}` : ""}`;
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

export default function Pagination({
  currentPage,
  totalPages,
  totalItems,
  pageSize,
  searchParams,
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
      className="mt-10 flex flex-col items-center justify-between gap-4 border-t border-slate-100 pt-7 sm:flex-row"
    >
      {/* Results summary */}
      <p className="text-[13.5px] text-slate-500">
        Showing{" "}
        <span className="font-semibold text-slate-700">{from}</span>–
        <span className="font-semibold text-slate-700">{to}</span> of{" "}
        <span className="font-semibold text-slate-700">{totalItems}</span>{" "}
        result{totalItems !== 1 ? "s" : ""}
      </p>

      {/* Page controls */}
      <div className="flex items-center gap-1.5">
        {/* Prev */}
        {hasPrev ? (
          <Link
            href={pageHref(searchParams, currentPage - 1)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] border border-slate-200 text-slate-600 transition hover:border-[#0C7C8A] hover:text-[#0C7C8A]"
            aria-label="Previous page"
          >
            <Icon name="arrow-left" className="text-[18px]" />
          </Link>
        ) : (
          <span
            aria-disabled
            className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] border border-slate-100 text-slate-300"
          >
            <Icon name="arrow-left" className="text-[18px]" />
          </span>
        )}

        {/* Numbered pages */}
        {pages.map((p, i) =>
          p === "ellipsis" ? (
            <span
              key={`ellipsis-${i}`}
              className="inline-flex h-9 w-9 items-center justify-center text-slate-400"
            >
              …
            </span>
          ) : p === currentPage ? (
            <span
              key={p}
              aria-current="page"
              className="inline-flex h-9 min-w-9 items-center justify-center rounded-[10px] bg-[#14161B] px-3 text-[13.5px] font-semibold text-white"
            >
              {p}
            </span>
          ) : (
            <Link
              key={p}
              href={pageHref(searchParams, p)}
              className="inline-flex h-9 min-w-9 items-center justify-center rounded-[10px] border border-slate-200 px-3 text-[13.5px] font-medium text-slate-600 transition hover:border-[#0C7C8A] hover:text-[#0C7C8A]"
            >
              {p}
            </Link>
          )
        )}

        {/* Next */}
        {hasNext ? (
          <Link
            href={pageHref(searchParams, currentPage + 1)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] border border-slate-200 text-slate-600 transition hover:border-[#0C7C8A] hover:text-[#0C7C8A]"
            aria-label="Next page"
          >
            <Icon name="chevron-right" className="text-[18px]" />
          </Link>
        ) : (
          <span
            aria-disabled
            className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] border border-slate-100 text-slate-300"
          >
            <Icon name="chevron-right" className="text-[18px]" />
          </span>
        )}
      </div>
    </nav>
  );
}
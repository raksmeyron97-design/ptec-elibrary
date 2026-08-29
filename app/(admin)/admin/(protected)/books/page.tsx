import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/admin/kit";
import Pagination from "@/components/ui/core/Pagination";
import EbookStats from "@/components/admin/ebooks/EbookStats";
import EbookToolbar from "@/components/admin/ebooks/EbookToolbar";
import EbookFilters, { EbookFilterChips } from "@/components/admin/ebooks/EbookFilters";
import EbooksListClient from "@/components/admin/ebooks/EbooksListClient";
import EbookErrorState from "@/components/admin/ebooks/states/EbookErrorState";
import BooksBreadcrumb from "@/components/admin/ebooks/BooksBreadcrumb";
import BooksWorkspaceNav from "@/components/admin/ebooks/BooksWorkspaceNav";
import { getEbooks, getEbooksSummary, getEbookFilterOptions } from "@/lib/admin/ebooks";
import { EBOOKS_BASE_PATH } from "@/lib/admin/ebooks-url";

const PAGE_SIZE = 20;

type SP = {
  q?: string;
  status?: string;
  dept?: string;
  category?: string;
  year?: string;
  language?: string;
  fileStatus?: string;
  coverStatus?: string;
  quality?: string;
  verification?: string;
  sort?: string;
  page?: string;
};

/**
 * The collection workspace — the hub of Book Management.
 *
 * Four reading zones, in the order a librarian uses them: who/where (header +
 * workspace nav), how the collection is doing (KPIs), how to narrow it
 * (command bar), and the records themselves. Upload and Duplicate review are
 * siblings reachable from the nav strip rather than separate destinations you
 * have to find in the sidebar.
 */
export default async function BooksPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? "1") || 1);

  const [t, ebooksResult, summary, filterOptions] = await Promise.all([
    getTranslations("adminEbooks"),
    getEbooks({
      q: sp.q,
      status: sp.status,
      dept: sp.dept,
      category: sp.category,
      year: sp.year,
      language: sp.language,
      fileStatus: sp.fileStatus,
      coverStatus: sp.coverStatus,
      quality: sp.quality,
      verification: sp.verification,
      sort: sp.sort,
      page,
      pageSize: PAGE_SIZE,
    }),
    getEbooksSummary(),
    getEbookFilterOptions(),
  ]);

  const totalPages = Math.max(1, Math.ceil(ebooksResult.total / PAGE_SIZE));
  const hasActiveFilters = Boolean(
    sp.q || sp.status || sp.dept || sp.category || sp.year || sp.language || sp.fileStatus || sp.coverStatus || sp.quality || sp.verification,
  );

  const filtersValue = {
    status: sp.status ?? "",
    dept: sp.dept ?? "",
    category: sp.category ?? "",
    year: sp.year ?? "",
    language: sp.language ?? "",
    fileStatus: sp.fileStatus ?? "",
    coverStatus: sp.coverStatus ?? "",
    quality: sp.quality ?? "",
    verification: sp.verification ?? "",
    sort: sp.sort ?? "newest",
  };

  return (
    <div className="w-full space-y-6">
      {/* Zone 1 — identity. */}
      <PageHeader
        breadcrumb={<BooksBreadcrumb />}
        title={t("title")}
        description={t("description")}
        className="mb-4"
      />

      {/* Zone 2 — the three workspaces, always in the same place on all three
          pages, so Upload and Duplicates are one click from the collection. */}
      <BooksWorkspaceNav current="manage" />

      {/* Zone 3 — the numbers. */}
      <EbookStats summary={summary} />

      {/* Zone 4 — search, filters, primary action. */}
      <EbookToolbar
        totalItems={ebooksResult.total}
        filters={
          <EbookFilters
            value={filtersValue}
            departments={filterOptions.departments}
            categories={filterOptions.categories}
            languages={filterOptions.languages}
            years={filterOptions.years}
            hasActiveFilters={hasActiveFilters}
          />
        }
        chips={
          <EbookFilterChips
            value={filtersValue}
            departments={filterOptions.departments}
            categories={filterOptions.categories}
          />
        }
      />

      {/* Zone 5 — the list. Three distinct outcomes: a load failure, an empty
          collection, and a filtered-to-nothing result — EbooksListClient owns
          the last two. */}
      {ebooksResult.error ? (
        <EbookErrorState />
      ) : (
        <EbooksListClient
          rows={ebooksResult.rows}
          departments={filterOptions.departments}
          hasAnyEbooksAtAll={summary.total > 0}
        />
      )}

      <Pagination
        currentPage={page}
        totalPages={totalPages}
        totalItems={ebooksResult.total}
        pageSize={PAGE_SIZE}
        searchParams={sp as Record<string, string | undefined>}
        basePath={EBOOKS_BASE_PATH}
      />
    </div>
  );
}

import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/admin/kit";
import Pagination from "@/components/ui/core/Pagination";
import EbookStats from "@/components/admin/ebooks/EbookStats";
import EbookToolbar from "@/components/admin/ebooks/EbookToolbar";
import EbookFilters, { EbookFilterChips } from "@/components/admin/ebooks/EbookFilters";
import EbooksListClient from "@/components/admin/ebooks/EbooksListClient";
import EbookErrorState from "@/components/admin/ebooks/states/EbookErrorState";
import { getEbooks, getEbooksSummary, getEbookFilterOptions } from "@/lib/admin/ebooks";

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
  sort?: string;
  page?: string;
};

export default async function ManageEbooksPage({
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
      sort: sp.sort,
      page,
      pageSize: PAGE_SIZE,
    }),
    getEbooksSummary(),
    getEbookFilterOptions(),
  ]);

  const totalPages = Math.max(1, Math.ceil(ebooksResult.total / PAGE_SIZE));
  const hasActiveFilters = Boolean(
    sp.q || sp.status || sp.dept || sp.category || sp.year || sp.language || sp.fileStatus || sp.coverStatus || sp.quality,
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
    sort: sp.sort ?? "newest",
  };

  return (
    <div className="mx-auto max-w-[1200px]">
      {/* Zone 1 — identity. */}
      <PageHeader
        breadcrumb={
          <nav aria-label={t("breadcrumb.label")} className="text-xs text-text-muted">
            <Link href="/admin" className="transition-colors duration-150 hover:text-text-body">
              {t("breadcrumb.home")}
            </Link>
            <span className="px-1.5 text-divider" aria-hidden="true">
              /
            </span>
            <span className="text-text-body">{t("breadcrumb.current")}</span>
          </nav>
        }
        title={t("title")}
        description={t("description")}
        className="mb-8"
      />

      {/* Zone 2 — the numbers. */}
      <div className="mb-6">
        <EbookStats summary={summary} />
      </div>

      {/* Zone 3 — search, filters, primary action. */}
      <div className="mb-4">
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
      </div>

      {/* Zone 4 — the list. */}
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
        basePath="/admin/manage"
      />
    </div>
  );
}

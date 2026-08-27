import { getLocale, getTranslations } from "next-intl/server";
import { SearchX } from "lucide-react";
import Pagination from "@/components/ui/core/Pagination";
import type { ZeroResultWorkspace as WorkspaceData } from "@/app/actions/search-insights";
import type { SearchInsightsFilters } from "@/lib/admin/search-insights-shared";
import ZeroResultFilters from "./ZeroResultFilters";
import ZeroResultTable from "./ZeroResultTable";

/**
 * The operational heart of the page: failed searches, and what was done about
 * them.
 *
 * Server-paginated in the sense that matters — the database collapses the raw
 * rows to distinct terms, and only the current page of hydrated entries is
 * rendered. The previous version rendered up to 40 entries in one list with
 * five equally-weighted buttons on every row and no way to reach term 41.
 */
export default async function ZeroResultWorkspace({
  data,
  filters,
  searchParams,
  basePath,
}: {
  data: WorkspaceData;
  filters: SearchInsightsFilters;
  searchParams: Record<string, string | undefined>;
  basePath: string;
}) {
  const [t, locale] = await Promise.all([
    getTranslations("adminSearchInsights.zero"),
    getLocale(),
  ]);
  const numberFormat = new Intl.NumberFormat(locale);
  const filtered =
    Boolean(filters.q) || filters.lang !== "all" || filters.status !== "all";

  return (
    <section aria-labelledby="zero-result-title" className="rounded-2xl border border-divider bg-bg-surface shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-divider p-5">
        <div className="min-w-0">
          <h2 id="zero-result-title" className="flex items-center gap-2 text-[15px] font-bold text-text-heading">
            <SearchX className="h-4 w-4 text-danger" aria-hidden="true" />
            {t("title")}
          </h2>
          <p className="mt-1 max-w-2xl text-[12px] leading-5 text-text-muted">{t("subtitle")}</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {data.statusCounts.needsReview > 0 && (
            <span className="rounded-full bg-danger/10 px-2.5 py-1 text-[11px] font-bold text-danger">
              {t("needsReviewCount", { count: data.statusCounts.needsReview })}
            </span>
          )}
          <span className="rounded-full bg-paper px-2.5 py-1 text-[11px] font-semibold tabular-nums text-text-muted">
            {t("total", { count: numberFormat.format(data.total) })}
          </span>
        </div>
      </div>

      <ZeroResultFilters
        q={filters.q}
        lang={filters.lang}
        status={filters.status}
        sort={filters.sort}
        size={filters.size}
        statusCounts={data.statusCounts}
      />

      {data.truncated && (
        <p role="status" className="border-b border-divider bg-warning-soft px-5 py-2 text-[11.5px] text-warning-text">
          {t("truncated")}
        </p>
      )}

      {data.items.length === 0 ? (
        <div className="px-5 py-14 text-center">
          <p className="text-[13.5px] font-semibold text-text-heading">
            {filtered ? t("noMatchTitle") : t("emptyTitle")}
          </p>
          <p className="mt-1 text-[12px] text-text-muted">
            {filtered ? t("noMatchBody") : t("emptyBody")}
          </p>
        </div>
      ) : (
        <ZeroResultTable entries={data.items} />
      )}

      {data.totalPages > 1 && (
        <div className="border-t border-divider px-5 py-4">
          <Pagination
            currentPage={data.page}
            totalPages={data.totalPages}
            totalItems={data.total}
            pageSize={data.pageSize}
            searchParams={searchParams}
            basePath={basePath}
          />
        </div>
      )}
    </section>
  );
}

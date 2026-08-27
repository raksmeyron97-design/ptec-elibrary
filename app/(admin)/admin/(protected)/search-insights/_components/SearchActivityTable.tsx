import { getLocale, getTranslations } from "next-intl/server";
import { Activity } from "lucide-react";
import Pagination from "@/components/ui/core/Pagination";
import { StatusBadge } from "@/components/admin/kit";
import type { ExportSearchActivityInput, SearchActivityRow } from "@/app/actions/search-insights";
import type { PaginatedResult } from "@/lib/admin/search-insights-shared";
import ActivityFilters from "./ActivityFilters";
import ActivityExportButton from "./ActivityExportButton";

/**
 * The raw search log, paginated server-side.
 *
 * `getSearchActivityPage()` uses PostgREST `range()` with an exact count, so
 * exactly one page of rows crosses the wire regardless of how large
 * search_queries is — page 400 costs the same as page 1. Nothing here loads a
 * bounded scan and slices it in the browser.
 */
export default async function SearchActivityTable({
  page,
  filters,
  exportFilters,
  resourceTypes,
  searchParams,
  basePath,
}: {
  page: PaginatedResult<SearchActivityRow> & { available: boolean };
  filters: { aq: string; alang: string; astatus: string; atype: string; asize: number };
  exportFilters: ExportSearchActivityInput;
  resourceTypes: string[];
  searchParams: Record<string, string | undefined>;
  basePath: string;
}) {
  const [t, locale] = await Promise.all([
    getTranslations("adminSearchInsights.activity"),
    getLocale(),
  ]);
  const dateFormat = new Intl.DateTimeFormat(locale, {
    timeZone: "Asia/Phnom_Penh",
    dateStyle: "medium",
    timeStyle: "short",
  });
  const numberFormat = new Intl.NumberFormat(locale);

  return (
    <section id="search-activity" aria-labelledby="search-activity-title" className="rounded-2xl border border-divider bg-bg-surface shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-divider p-5">
        <div className="min-w-0">
          <h2 id="search-activity-title" className="flex items-center gap-2 text-[15px] font-bold text-text-heading">
            <Activity className="h-4 w-4 text-brand" aria-hidden="true" />
            {t("title")}
          </h2>
          <p className="mt-1 text-[12px] text-text-muted">{t("subtitle")}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {page.total > 0 && (
            <span className="rounded-full bg-paper px-2.5 py-1 text-[11px] font-semibold tabular-nums text-text-muted">
              {t("count", { count: numberFormat.format(page.total) })}
            </span>
          )}
          <ActivityExportButton filters={exportFilters} />
        </div>
      </div>

      <ActivityFilters {...filters} resourceTypes={resourceTypes} />

      {page.items.length === 0 ? (
        <div className="px-5 py-14 text-center">
          <p className="text-[13.5px] font-semibold text-text-heading">{t("emptyTitle")}</p>
          <p className="mt-1 text-[12px] text-text-muted">{t("emptyBody")}</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left">
            <caption className="sr-only">{t("caption")}</caption>
            <thead className="sticky top-0 z-10 bg-paper">
              <tr className="text-[11px] font-bold uppercase tracking-wide text-text-muted">
                <th scope="col" className="px-4 py-2.5">{t("col.query")}</th>
                <th scope="col" className="px-4 py-2.5 text-end">{t("col.results")}</th>
                <th scope="col" className="px-4 py-2.5">{t("col.language")}</th>
                <th scope="col" className="px-4 py-2.5">{t("col.type")}</th>
                <th scope="col" className="px-4 py-2.5">{t("col.searchedAt")}</th>
              </tr>
            </thead>
            <tbody>
              {page.items.map((row) => (
                <tr key={row.id} className="border-t border-divider transition hover:bg-paper/50">
                  <td className="px-4 py-2">
                    <p className="max-w-[320px] truncate text-[13px] font-medium text-text-heading" dir="auto" title={row.term}>
                      {row.term}
                    </p>
                  </td>
                  <td className="px-4 py-2 text-end">
                    {row.resultCount === null ? (
                      <span className="text-[12px] text-text-muted" title={t("unknownResults")}>—</span>
                    ) : row.resultCount === 0 ? (
                      <StatusBadge tone="danger">{t("noResults")}</StatusBadge>
                    ) : (
                      <span className="text-[13px] font-semibold tabular-nums text-text-heading">
                        {numberFormat.format(row.resultCount)}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-[11px] font-bold uppercase tracking-wide text-text-muted">{row.language}</td>
                  <td className="px-4 py-2 text-[12px] text-text-muted">{row.resourceType ?? "—"}</td>
                  <td className="whitespace-nowrap px-4 py-2 text-[12px] text-text-muted">
                    {dateFormat.format(new Date(row.searchedAt))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {page.totalPages > 1 && (
        <div className="border-t border-divider px-5 py-4">
          <Pagination
            currentPage={page.page}
            totalPages={page.totalPages}
            totalItems={page.total}
            pageSize={page.pageSize}
            searchParams={searchParams}
            basePath={basePath}
            pageParam="apage"
          />
        </div>
      )}
    </section>
  );
}

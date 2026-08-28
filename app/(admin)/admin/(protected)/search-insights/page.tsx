import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { LineChart } from "lucide-react";
import {
  getSearchInsightsOverview,
  getSearchActivityPage,
  getSearchResourceTypes,
  getZeroResultWorkspace,
} from "@/app/actions/search-insights";
import {
  parseSearchInsightsFilters,
  serializeSearchInsightsFilters,
  type SearchInsightsFilters,
} from "@/lib/admin/search-insights-shared";
import { PageHeader } from "@/components/admin/kit";
import InsightsToolbar from "./_components/InsightsToolbar";
import KpiGrid from "./_components/KpiGrid";
import SearchActivityChart from "./_components/SearchActivityChart";
import SearchQualityCard from "./_components/SearchQualityCard";
import LanguageDistribution from "./_components/LanguageDistribution";
import PopularSearches from "./_components/PopularSearches";
import ZeroResultWorkspace from "./_components/ZeroResultWorkspace";
import SearchActivityTable from "./_components/SearchActivityTable";
import { ChartSkeleton, KpiSkeleton, PanelSkeleton, TableSkeleton } from "./_components/Skeletons";

export const dynamic = "force-dynamic";

const BASE_PATH = "/admin/search-insights";

/**
 * A quiet divider naming the question the block below answers, so the page
 * reads as an ordered enquiry rather than a stack of analytics sections.
 */
function ZoneHeader({ label, hint }: { label: string; hint: string }) {
  return (
    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
      <span className="h-3.5 w-[3px] shrink-0 rounded-full bg-accent" aria-hidden="true" />
      <h2 className="text-[10.5px] font-bold uppercase tracking-[0.11em] text-[var(--ptec-accent-text)]">{label}</h2>
      <p className="text-[11.5px] leading-4 text-text-muted">{hint}</p>
    </div>
  );
}

/** Zone 1 — how much, and how well. Streams as one unit: the KPI row and the
 *  chart share a query and should never disagree about the window. */
async function ActivityZone({ filters }: { filters: SearchInsightsFilters }) {
  const [t, overview] = await Promise.all([
    getTranslations("adminSearchInsights"),
    getSearchInsightsOverview(filters),
  ]);
  const qs = serializeSearchInsightsFilters(filters);
  const activityHref = `${BASE_PATH}${qs ? `?${qs}` : ""}#search-activity`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <ZoneHeader label={t("zones.activityLabel")} hint={t("zones.activityHint")} />
        <InsightsToolbar range={filters.range} compare={filters.compare} generatedAt={overview.generatedAt} />
      </div>

      {!overview.aggregatesAvailable && (
        <p role="status" className="rounded-xl border border-warning-line bg-warning-soft px-4 py-2.5 text-[11.5px] leading-4 text-warning-text">
          {t("aggregatesPending")}
        </p>
      )}

      <KpiGrid kpis={overview.kpis} previous={overview.previousKpis} days={overview.window.days} />

      <section aria-labelledby="activity-chart-title" className="rounded-2xl border border-divider bg-bg-surface p-5 shadow-sm">
        <h3 id="activity-chart-title" className="flex items-center gap-2 text-[15px] font-bold text-text-heading">
          <LineChart className="h-4 w-4 text-brand" aria-hidden="true" />
          {t("chart.title")}
        </h3>
        <p className="mb-3 mt-1 text-[12px] text-text-muted">{t("chart.subtitle")}</p>
        <SearchActivityChart points={overview.trend} bucketDays={overview.bucketDays} />
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(280px,1fr)]">
        <PopularSearches
          items={overview.topTerms}
          totalSearches={overview.kpis.searches}
          viewAllHref={activityHref}
        />
        <div className="grid gap-4">
          <SearchQualityCard kpis={overview.kpis} />
          <LanguageDistribution usage={overview.languageUsage} />
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <PopularSearches
          items={overview.zeroResultTerms}
          totalSearches={overview.kpis.searches}
          viewAllHref={`${BASE_PATH}?${new URLSearchParams({ ...Object.fromEntries(new URLSearchParams(qs)), astatus: "noResults" }).toString()}#search-activity`}
          variant="zero"
        />
        <section aria-labelledby="clicked-results-title" className="rounded-2xl border border-divider bg-bg-surface shadow-sm">
          <div className="border-b border-divider p-5">
            <h3 id="clicked-results-title" className="text-[15px] font-bold text-text-heading">{t("clicked.title")}</h3>
            <p className="mt-1 text-[12px] text-text-muted">{t("clicked.subtitle")}</p>
          </div>
          {overview.clickedResults.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <p className="text-[13.5px] font-semibold text-text-heading">{t("clicked.emptyTitle")}</p>
              <p className="mt-1 text-[12px] text-text-muted">{t("clicked.emptyBody")}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px] text-left">
                <caption className="sr-only">{t("clicked.caption")}</caption>
                <thead className="bg-paper text-[11px] font-bold uppercase tracking-wide text-text-muted">
                  <tr>
                    <th scope="col" className="px-4 py-2.5">{t("clicked.colResult")}</th>
                    <th scope="col" className="px-4 py-2.5">{t("clicked.colType")}</th>
                    <th scope="col" className="px-4 py-2.5 text-end">{t("clicked.colClicks")}</th>
                  </tr>
                </thead>
                <tbody>
                  {overview.clickedResults.map((item) => (
                    <tr key={item.url} className="border-t border-divider transition hover:bg-paper/50">
                      <td className="px-4 py-2">
                        <a
                          href={item.url}
                          className="line-clamp-1 text-[13px] font-semibold text-text-heading hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                          dir="auto"
                        >
                          {item.term}
                        </a>
                      </td>
                      <td className="px-4 py-2 text-[12px] text-text-muted">{item.type}</td>
                      <td className="px-4 py-2 text-end text-[13px] font-bold tabular-nums text-text-heading">{item.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

/** Zone 2 — what failed, and what was done about it. */
async function ZeroResultZone({
  filters,
  searchParams,
}: {
  filters: SearchInsightsFilters;
  searchParams: Record<string, string | undefined>;
}) {
  const [t, data] = await Promise.all([
    getTranslations("adminSearchInsights"),
    getZeroResultWorkspace(filters),
  ]);
  return (
    <div className="space-y-4">
      <ZoneHeader label={t("zones.zeroLabel")} hint={t("zones.zeroHint")} />
      <ZeroResultWorkspace data={data} filters={filters} searchParams={searchParams} basePath={BASE_PATH} />
    </div>
  );
}

/** Zone 3 — the raw log, for the question a chart cannot answer. */
async function ActivityLogZone({
  filters,
  searchParams,
}: {
  filters: SearchInsightsFilters;
  searchParams: Record<string, string | undefined>;
}) {
  const [t, page, resourceTypes] = await Promise.all([
    getTranslations("adminSearchInsights"),
    getSearchActivityPage(filters),
    getSearchResourceTypes(),
  ]);
  return (
    <div className="space-y-4">
      <ZoneHeader label={t("zones.logLabel")} hint={t("zones.logHint")} />
      <SearchActivityTable
        page={page}
        filters={{
          aq: filters.aq,
          alang: filters.alang,
          astatus: filters.astatus,
          atype: filters.atype,
          asize: filters.asize,
        }}
        exportFilters={{
          range: filters.range,
          from: filters.from,
          to: filters.to,
          aq: filters.aq,
          alang: filters.alang,
          astatus: filters.astatus,
          atype: filters.atype,
        }}
        resourceTypes={resourceTypes}
        searchParams={searchParams}
        basePath={BASE_PATH}
      />
    </div>
  );
}

/**
 * Search Intelligence.
 *
 * All page state lives in the URL and is parsed through one whitelisting
 * parser (lib/admin/search-insights-shared.ts), so a filtered view is
 * shareable and nothing from the query string reaches a query unvalidated.
 * Every section is scoped by the SAME window — the previous page had no date
 * control at all and each block carried its own hard-coded period.
 *
 * The three zones stream independently: a slow zero-result hydration can no
 * longer hold up the KPI row, and each has a layout-stable skeleton.
 */
export default async function SearchInsightsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const filters = parseSearchInsightsFilters(raw);
  const t = await getTranslations("adminSearchInsights");
  const flat = Object.fromEntries(
    Object.entries(raw).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value]),
  ) as Record<string, string | undefined>;

  return (
    <div className="w-full space-y-8">
      <PageHeader title={t("title")} description={t("description")} />

      <Suspense
        fallback={
          <div className="space-y-4">
            <KpiSkeleton />
            <ChartSkeleton />
            <div className="grid gap-4 xl:grid-cols-2">
              <PanelSkeleton />
              <PanelSkeleton />
            </div>
          </div>
        }
      >
        <ActivityZone filters={filters} />
      </Suspense>

      <Suspense fallback={<TableSkeleton rows={10} />}>
        <ZeroResultZone filters={filters} searchParams={flat} />
      </Suspense>

      <Suspense fallback={<TableSkeleton rows={10} />}>
        <ActivityLogZone filters={filters} searchParams={flat} />
      </Suspense>
    </div>
  );
}

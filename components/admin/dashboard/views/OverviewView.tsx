import { getTranslations } from "next-intl/server";
import {
  getOverviewData,
  getRecentAdminActivity,
  type HealthPulseData,
  type AdminActivityEntry,
  type ContentType,
} from "@/lib/admin/intelligence";
import { getActionCenterOnce, getHealthPulseOnce } from "@/lib/admin/overview-cache";
import { getCollectionPulse, type CollectionCounts, type ScheduledItem } from "@/lib/admin/collection-pulse";
import { weekdayRhythm } from "@/lib/admin/overview-library";
import type { DashboardFilters, DashboardMetric } from "@/lib/admin/dashboard-shared";
import type { EngagementChartVersion } from "@/lib/admin/analytics-flags";
import { serializeDashboardFilters } from "@/lib/admin/dashboard-shared";
import { MetricSelectionProvider } from "../MetricSelection";
import CollectionTiles from "../CollectionTiles";
import ExecutivePulse from "../ExecutivePulse";
import NeedsAttentionPanel from "../NeedsAttentionPanel";
import EngagementChart from "../EngagementChart";
import EngagementPathways from "../EngagementPathways";
import PublishingCalendar from "../PublishingCalendar";
import RecentlyAddedPanel from "../RecentlyAddedPanel";
import ReaderRequestsPanel from "../ReaderRequestsPanel";
import MostReadShelf from "../MostReadShelf";
import ReadingRhythmPanel from "../ReadingRhythmPanel";
import SearchOpportunityPanel from "../SearchOpportunityPanel";
import AutomatedInsightsPanel from "../AutomatedInsightsPanel";
import RecentAdminActivity from "../RecentAdminActivity";
import DashPanel from "../DashPanel";
import DataFreshnessBar from "../DataFreshnessBar";

/**
 * What the viewer may open, decided by the page from the route registry and
 * handed down, so no panel ever links to (or reads) something its viewer
 * could not open.
 */
export type OverviewAccess = {
  requests: boolean;
  /** Which scheduled types the viewer may see in "Coming up". */
  scheduled: Record<ScheduledItem["type"], boolean>;
  /** Which record types link to their edit page. */
  editable: Partial<Record<ContentType, boolean>>;
  tileHrefs: Partial<Record<keyof CollectionCounts, string>>;
  addBookHref: string | null;
  allBooksHref: string | null;
  requestsHref: string;
};

/**
 * The Overview, in the order a library reads its own ledger:
 *
 *   1. What do we hold?              → Collection tiles (stock; ignore the range)
 *   2. What did readers do?          → the four KPI cards (the period)
 *   3. How is it moving, and when
 *      do we publish?                → Engagement trend + publishing calendar
 *   4. What needs me now?            → Needs attention
 *   5. What came in, what was asked? → Recently added + reader requests
 *   6. What is being read?           → Most-read shelf
 *   7. How do readers get there?     → Engagement pathways
 *   8. What should I look at next?   → Rhythm, search gaps, insights, activity
 *
 * "Is anything broken?" is answered before all of it, in the header's status
 * chips; the full health card appears in the KPI section only when a check is
 * not passing. Every supporting read may fail on its own and degrades its own
 * panel — never the page. `MetricSelectionProvider` remains the only client
 * state at this level: it keeps the KPI row and the chart on the same metric.
 */
export default async function OverviewView({
  filters,
  metric,
  canSeeAudit,
  chartVersion,
  access,
}: {
  filters: DashboardFilters;
  metric: DashboardMetric;
  canSeeAudit: boolean;
  chartVersion: EngagementChartVersion;
  access: OverviewAccess;
}) {
  const [t, tLib, data, actions, health, activity, pulse] = await Promise.all([
    getTranslations("adminDashboard"),
    getTranslations("adminDashboard.library"),
    getOverviewData(filters),
    getActionCenterOnce(filters),
    // Supporting probes must not take the page down with them.
    getHealthPulseOnce(filters).catch((): HealthPulseData | null => null),
    canSeeAudit ? getRecentAdminActivity().catch((): AdminActivityEntry[] => []) : Promise.resolve([]),
    getCollectionPulse({ requests: access.requests, scheduled: access.scheduled }),
  ]);

  const rangeLabel = filters.range === "custom" ? data.rangeLabel : t(`rangeLabel.${filters.range}`);
  const periodTitle =
    filters.range === "custom" ? data.rangeLabel : tLib("period.title", { range: filters.range });
  const link = (view: DashboardFilters["view"], extra?: string) => {
    const s = serializeDashboardFilters({ ...filters, view });
    const qs = [s, extra].filter(Boolean).join("&");
    return qs ? `/admin?${qs}` : "/admin";
  };
  // Hourly buckets (Today) have no weekday to speak of.
  const rhythm = data.granularity === "day" ? weekdayRhythm(data.engagement.series.views) : null;
  const scheduledAllowed = Object.values(access.scheduled).some(Boolean);

  return (
    <MetricSelectionProvider initialMetric={metric}>
      {/* `dash-stagger` fades each block up in sequence on mount — a pure CSS
          animation (no client JS) that collapses to an instant reveal under
          prefers-reduced-motion. */}
      <div className="dash-stagger space-y-6">
        {/* 1 — What the library holds. */}
        <CollectionTiles counts={pulse.collection} hrefs={access.tileHrefs} />

        {/* 2 — What readers did in the period (and the health card, only
            when a check is failing). */}
        <ExecutivePulse
          data={data}
          health={health}
          actions={actions.items}
          filters={filters}
          rangeLabel={rangeLabel}
          periodTitle={periodTitle}
        />

        {/* 3 — The trend the KPI cards select, beside the month it ends in.

            Sized by the COLUMN: side by side only once the column can give
            the chart ~650px and the calendar its seven 44px days; stacked
            below that, where a 4-column calendar would crush both. */}
        <div className="@container">
          {/* `items-start`: the chart's height follows its width and the
              calendar's follows its scheduled list, so stretching them to
              one height only ever painted an empty band inside one card. */}
          <div className="grid items-start gap-5 @5xl:grid-cols-12 [&>*]:min-w-0">
            <DashPanel
              id="engagement"
              title={t("engagement.title")}
              subtitle={t("engagement.subtitle", { range: rangeLabel })}
              className="@5xl:col-span-8"
            >
              <EngagementChart
                version={chartVersion}
                series={data.engagement.series}
                prevSeries={data.engagement.prevSeries}
                annotations={data.engagement.annotations}
                granularity={data.granularity}
                compare={filters.compare}
                filters={filters}
                generatedAt={data.generatedAt}
              />
            </DashPanel>
            <PublishingCalendar
              className="@5xl:col-span-4"
              publishing={data.publishing}
              scheduled={pulse.scheduled}
              scheduledAllowed={scheduledAllowed}
              editable={access.editable}
            />
          </div>
        </div>

        {/* 4 — What needs attention now. */}
        <NeedsAttentionPanel data={actions} />

        {/* 5 — What came in, and what readers asked for. A matched pair: both
            are grid items and stretch to one height. */}
        <div className="@container">
        <div className="grid gap-5 @3xl:grid-cols-2 [&>*]:min-w-0">
          <RecentlyAddedPanel
            className={access.requests ? undefined : "@3xl:col-span-2"}
            rows={data.recentlyAdded}
            editable={access.editable}
            addHref={access.addBookHref}
            allHref={access.allBooksHref}
            generatedAt={data.generatedAt}
          />
          {access.requests && (
            <ReaderRequestsPanel data={pulse.requests} href={access.requestsHref} generatedAt={data.generatedAt} />
          )}
        </div>
        </div>

        {/* 6 — What is being read. */}
        <MostReadShelf
          rows={data.topContent}
          periodTitle={periodTitle}
          reportHref={link("content")}
          editable={access.editable}
        />

        {/* 7 — How measurement connects. Full width: the pathways are three
            columns of rates, a layout the component was written for. */}
        <DashPanel
          id="pathways"
          title={t("discovery.title")}
          subtitle={t("discovery.subtitle", { range: rangeLabel })}
        >
          <EngagementPathways
            volumes={data.discovery.volumes}
            prevVolumes={data.discovery.prevVolumes}
            rates={data.discovery.rates}
            prevRates={data.discovery.prevRates}
            compare={filters.compare}
            conversion={data.kpis.conversion}
          />
        </DashPanel>

        {/* 8 — What to look at next. Three readings of the same period —
            stacked until the column fits all three, never two-and-an-orphan. */}
        <div className="@container">
        <div className="grid gap-5 @5xl:grid-cols-3 [&>*]:min-w-0">
          <ReadingRhythmPanel rhythm={rhythm} />
          <SearchOpportunityPanel
            opportunities={data.searchOpportunities}
            rangeLabel={rangeLabel}
            searchHref={link("search")}
          />
          <AutomatedInsightsPanel insights={data.insights} emptyHint={t("insights.emptyHint")} />
        </div>
        </div>

        {canSeeAudit && (
          <RecentAdminActivity entries={activity} logsHref="/admin/logs" generatedAt={data.generatedAt} />
        )}

        <DataFreshnessBar
          generatedAt={data.generatedAt}
          level={health?.level ?? "unknown"}
          notes={[t("kpi.internalExcluded"), t("states.timezoneNote")]}
        />
      </div>
    </MetricSelectionProvider>
  );
}

import { getTranslations } from "next-intl/server";
import {
  getOverviewData,
  getActionCenter,
  getHealthPulse,
  getRecentAdminActivity,
  type HealthPulseData,
  type AdminActivityEntry,
} from "@/lib/admin/intelligence";
import type { DashboardFilters, DashboardMetric } from "@/lib/admin/dashboard-shared";
import { serializeDashboardFilters } from "@/lib/admin/dashboard-shared";
import { MetricSelectionProvider } from "../MetricSelection";
import ExecutivePulse from "../ExecutivePulse";
import NeedsAttentionPanel from "../NeedsAttentionPanel";
import EngagementChart from "../EngagementChart";
import EngagementPathways from "../EngagementPathways";
import SearchOpportunityPanel from "../SearchOpportunityPanel";
import ContentPerformancePanel from "../ContentPerformancePanel";
import AutomatedInsightsPanel from "../AutomatedInsightsPanel";
import RecentAdminActivity from "../RecentAdminActivity";
import DataFreshnessBar from "../DataFreshnessBar";

/**
 * The Overview: a decision-first control centre, ordered by the questions an
 * administrator needs answered fastest.
 *
 *   1. Is anything broken?          → Executive Pulse (health first)
 *   2. What needs me now?           → Needs attention
 *   3. How is engagement moving?    → Engagement trends + pathways
 *   4. What are readers missing?    → Search opportunities
 *   5. What content is working?     → Content performance
 *   6. What should I look at next?  → Rule-based insights + admin activity
 *
 * Health and admin activity are loaded alongside the main analytics but are
 * allowed to fail independently — a failing probe degrades one card, never the
 * page. `MetricSelectionProvider` is the only client state at this level: it
 * keeps the KPI row and the chart on the same metric.
 */
export default async function OverviewView({
  filters,
  metric,
  canSeeAudit,
}: {
  filters: DashboardFilters;
  metric: DashboardMetric;
  canSeeAudit: boolean;
}) {
  const [t, data, actions, health, activity] = await Promise.all([
    getTranslations("adminDashboard"),
    getOverviewData(filters),
    getActionCenter(filters),
    // Supporting probes must not take the page down with them.
    getHealthPulse(filters).catch((): HealthPulseData | null => null),
    canSeeAudit ? getRecentAdminActivity().catch((): AdminActivityEntry[] => []) : Promise.resolve([]),
  ]);

  const rangeLabel = filters.range === "custom" ? data.rangeLabel : t(`rangeLabel.${filters.range}`);
  const link = (view: DashboardFilters["view"], extra?: string) => {
    const s = serializeDashboardFilters({ ...filters, view });
    const qs = [s, extra].filter(Boolean).join("&");
    return qs ? `/admin?${qs}` : "/admin";
  };

  return (
    <MetricSelectionProvider initialMetric={metric}>
      <div className="space-y-4">
        {/* 1 — Executive Pulse: health first, then the four engagement measures. */}
        <ExecutivePulse
          data={data}
          health={health}
          actions={actions.items}
          filters={filters}
          rangeLabel={rangeLabel}
        />

        {/* 2 — What needs attention now. */}
        <NeedsAttentionPanel data={actions} />

        {/* 3 — Engagement trends (8 cols) + measurement pathways (4 cols). */}
        <div className="grid gap-4 lg:grid-cols-12">
          <section aria-labelledby="engagement-heading" className="dash-card min-w-0 p-4 lg:col-span-8">
            <h2 id="engagement-heading" className="text-[14px] font-bold text-text-heading">
              {t("engagement.title")}
            </h2>
            <p className="mb-2.5 text-[11.5px] text-text-muted">
              {t("engagement.subtitle", { range: rangeLabel })}
            </p>
            <EngagementChart
              series={data.engagement.series}
              prevSeries={data.engagement.prevSeries}
              annotations={data.engagement.annotations}
              granularity={data.granularity}
              compare={filters.compare}
            />
          </section>

          <section aria-labelledby="pathways-heading" className="dash-card min-w-0 p-4 lg:col-span-4">
            <h2 id="pathways-heading" className="text-[14px] font-bold text-text-heading">
              {t("discovery.title")}
            </h2>
            <p className="mb-2.5 text-[11.5px] text-text-muted">
              {t("discovery.subtitle", { range: rangeLabel })}
            </p>
            <EngagementPathways
              volumes={data.discovery.volumes}
              prevVolumes={data.discovery.prevVolumes}
              rates={data.discovery.rates}
              prevRates={data.discovery.prevRates}
              compare={filters.compare}
              conversion={data.kpis.conversion}
            />
          </section>
        </div>

        {/* 4 + 5 — Where the collection is short, and what is performing. */}
        <div className="grid min-w-0 gap-4 lg:grid-cols-2 [&>*]:min-w-0">
          <SearchOpportunityPanel
            opportunities={data.searchOpportunities}
            rangeLabel={rangeLabel}
            searchHref={link("search")}
          />
          <ContentPerformancePanel
            rows={data.topContent}
            contentHref={link("content")}
            compare={filters.compare}
          />
        </div>

        {/* 6 — What to look at next. */}
        <div className="grid min-w-0 gap-4 lg:grid-cols-2 [&>*]:min-w-0">
          <AutomatedInsightsPanel insights={data.insights} emptyHint={t("insights.emptyHint")} />
          {canSeeAudit && (
            <RecentAdminActivity entries={activity} logsHref="/admin/logs" generatedAt={data.generatedAt} />
          )}
        </div>

        <DataFreshnessBar
          generatedAt={data.generatedAt}
          level={health?.level ?? "unknown"}
          notes={[t("kpi.internalExcluded"), t("states.timezoneNote")]}
        />
      </div>
    </MetricSelectionProvider>
  );
}

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
import type { EngagementChartVersion } from "@/lib/admin/analytics-flags";
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
 * A quiet divider that names the two intents the Overview is ordered by: act on
 * what is live or waiting ("Right now") vs. explore how the library is used
 * ("Trends & performance"). The gold tick echoes the sidebar/tab active accent,
 * so the grouping reads as part of the existing visual language rather than a
 * new device. Purely a reading cue — each panel keeps its own heading, so the
 * document's heading outline is unchanged.
 */
function ZoneHeader({ label, hint }: { label: string; hint: string }) {
  return (
    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 pt-0.5">
      <span
        className="h-3.5 w-[3px] shrink-0 rounded-full"
        style={{ background: "var(--dash-gold)" }}
        aria-hidden="true"
      />
      <p className="dash-eyebrow">{label}</p>
      <p className="text-xs leading-4 text-text-muted">{hint}</p>
    </div>
  );
}

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
  chartVersion,
}: {
  filters: DashboardFilters;
  metric: DashboardMetric;
  canSeeAudit: boolean;
  chartVersion: EngagementChartVersion;
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
      {/* Two tiers of rhythm: 20px inside a zone, 32px between the "act now"
          and "explore" zones, so the decision-first ordering reads as
          structure. The gap between tiers is what makes the two zones legible
          as zones — keep them a full step apart on the spacing scale.

          `dash-stagger` fades each zone's children up in sequence on mount;
          it is a pure CSS animation (no client JS) and collapses to an
          instant reveal under prefers-reduced-motion. */}
      <div className="space-y-8">
        {/* ── Zone 1 · Right now — act on what is live or waiting ── */}
        <div className="dash-stagger space-y-5">
          <ZoneHeader label={t("overview.zoneNowLabel")} hint={t("overview.zoneNowHint")} />

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
        </div>

        {/* ── Zone 2 · Trends & performance — explore how the library is used ── */}
        <div className="dash-stagger space-y-5">
          <ZoneHeader label={t("overview.zoneTrendsLabel")} hint={t("overview.zoneTrendsHint")} />

          {/* 3 — Engagement trends (8 cols) + measurement pathways (4 cols). */}
          <div className="grid items-start gap-5 xl:grid-cols-12">
            <section aria-labelledby="engagement-heading" className="dash-card min-w-0 p-5 xl:col-span-8">
              <h2 id="engagement-heading" className="text-sm font-bold text-text-heading">
                {t("engagement.title")}
              </h2>
              <p className="mb-2.5 text-xs text-text-muted">
                {t("engagement.subtitle", { range: rangeLabel })}
              </p>
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
            </section>

            <section aria-labelledby="pathways-heading" className="dash-card min-w-0 p-5 xl:col-span-4">
              <h2 id="pathways-heading" className="text-sm font-bold text-text-heading">
                {t("discovery.title")}
              </h2>
              <p className="mb-2.5 text-xs text-text-muted">
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
          <div className="grid min-w-0 gap-5 lg:grid-cols-2 [&>*]:min-w-0">
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
          <div className="grid min-w-0 gap-5 lg:grid-cols-2 [&>*]:min-w-0">
            <AutomatedInsightsPanel insights={data.insights} emptyHint={t("insights.emptyHint")} />
            {canSeeAudit && (
              <RecentAdminActivity entries={activity} logsHref="/admin/logs" generatedAt={data.generatedAt} />
            )}
          </div>
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

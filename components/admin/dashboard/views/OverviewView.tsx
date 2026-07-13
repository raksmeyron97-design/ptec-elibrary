import Link from "next/link";
import { getTranslations, getLocale } from "next-intl/server";
import { Eye, Users, BookOpenCheck, Download, Percent, Library, ArrowRight } from "lucide-react";
import { getOverviewData, getActionCenter } from "@/lib/admin/intelligence";
import type { DashboardFilters } from "@/lib/admin/dashboard-shared";
import { serializeDashboardFilters } from "@/lib/admin/dashboard-shared";
import KpiCard from "../KpiCard";
import EngagementChart from "../EngagementChart";
import DiscoveryEngagement from "../DiscoveryEngagement";
import ActionCenter from "../ActionCenter";
import InsightsPanel from "../InsightsPanel";
import FreshnessLine from "../FreshnessLine";

export default async function OverviewView({ filters }: { filters: DashboardFilters }) {
  const t = await getTranslations("adminDashboard");
  const locale = await getLocale();
  const nf = new Intl.NumberFormat(locale === "km" ? "km-KH" : "en-US");

  const [data, actions] = await Promise.all([getOverviewData(filters), getActionCenter(filters)]);
  const { kpis } = data;
  const rangeLabel =
    filters.range === "custom" ? data.rangeLabel : t(`rangeLabel.${filters.range}`);
  const link = (view: "content" | "audience" | "search" | "system") => {
    const s = serializeDashboardFilters({ ...filters, view });
    return s ? `/admin?${s}` : "/admin";
  };

  const prevOf = (previous: number | undefined) =>
    previous === undefined ? null : t("kpi.previously", { value: nf.format(previous) });

  return (
    <div className="space-y-4">
      {/* ── Row 1: hero KPI + compact secondaries (12-col) ── */}
      <section aria-label={t("kpi.sectionLabel", { range: rangeLabel })}>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-12">
          <div className="col-span-2 lg:col-span-3">
            <KpiCard
              emphasis
              title={t("kpi.conversion")}
              value={
                kpis.conversion.insufficient || kpis.conversion.valuePct === null
                  ? "—"
                  : `${kpis.conversion.valuePct}%`
              }
              definition={t("kpi.conversionDef")}
              trend={null}
              badge={
                kpis.conversion.insufficient
                  ? t("kpi.insufficientData")
                  : kpis.conversion.prevPct !== null
                    ? t("kpi.prevPct", { pct: kpis.conversion.prevPct })
                    : null
              }
              icon={Percent}
            />
          </div>
          <div className="lg:col-span-3">
            <KpiCard
              accent="visitors"
              title={t("kpi.uniqueVisitors")}
              value={nf.format(kpis.uniqueVisitors.value)}
              definition={t("kpi.uniqueVisitorsDef")}
              trend={kpis.uniqueVisitors.collecting ? null : kpis.uniqueVisitors.trend}
              compareLabel={prevOf(kpis.uniqueVisitors.trend?.previous)}
              badge={kpis.uniqueVisitors.collecting ? t("kpi.collecting") : null}
              spark={kpis.uniqueVisitors.collecting ? null : kpis.uniqueVisitors.spark}
              href={link("audience")}
              drillLabel={t("kpi.drill")}
              icon={Users}
            />
          </div>
          <div className="lg:col-span-2">
            <KpiCard
              accent="views"
              title={t("kpi.detailViews")}
              value={nf.format(kpis.detailViews.value)}
              definition={t("kpi.detailViewsDef")}
              trend={kpis.detailViews.trend}
              compareLabel={prevOf(kpis.detailViews.trend?.previous)}
              href={link("content")}
              drillLabel={t("kpi.drill")}
              icon={Eye}
            />
          </div>
          <div className="lg:col-span-2">
            <KpiCard
              accent="reader"
              title={t("kpi.readerOpens")}
              value={nf.format(kpis.readerOpens.value)}
              definition={t("kpi.readerOpensDef")}
              trend={kpis.readerOpens.collecting ? null : kpis.readerOpens.trend}
              compareLabel={prevOf(kpis.readerOpens.trend?.previous)}
              badge={kpis.readerOpens.collecting ? t("kpi.collecting") : null}
              icon={BookOpenCheck}
            />
          </div>
          <div className="lg:col-span-2">
            <KpiCard
              accent="downloads"
              title={t("kpi.downloads")}
              value={nf.format(kpis.downloads.value)}
              definition={t("kpi.downloadsDef")}
              trend={kpis.downloads.trend}
              compareLabel={prevOf(kpis.downloads.trend?.previous)}
              icon={Download}
            />
          </div>
        </div>
      </section>

      {/* ── Row 2: engagement chart (8) + action center (4) ── */}
      <div className="grid gap-4 lg:grid-cols-12">
        <section aria-labelledby="engagement-heading" className="dash-card p-4 lg:col-span-8">
          <h3 id="engagement-heading" className="text-[14px] font-bold text-text-heading">
            {t("engagement.title")}
          </h3>
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

        <div className="lg:col-span-4">
          <ActionCenter data={actions} />
        </div>
      </div>

      {/* ── Row 3: discovery rates + insights & collection preview ── */}
      <div className="grid gap-4 lg:grid-cols-12">
        <section aria-labelledby="discovery-heading" className="dash-card p-4 lg:col-span-5">
          <h3 id="discovery-heading" className="text-[14px] font-bold text-text-heading">
            {t("discovery.title")}
          </h3>
          <p className="mb-2.5 text-[11.5px] text-text-muted">
            {t("discovery.subtitle", { range: rangeLabel })}
          </p>
          <DiscoveryEngagement
            volumes={data.discovery.volumes}
            prevVolumes={data.discovery.prevVolumes}
            rates={data.discovery.rates}
            prevRates={data.discovery.prevRates}
            compare={filters.compare}
          />
        </section>

        <div className="flex flex-col gap-4 lg:col-span-7">
          <InsightsPanel insights={data.insights} />
          <Link
            href={link("content")}
            className="dash-card dash-card--interactive group flex items-center gap-3 p-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            <span className="dash-ico dash-ico--brand dash-ico--lg" aria-hidden="true">
              <Library className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-semibold text-text-heading">{t("overview.collectionLink")}</span>
              <span className="block text-[11.5px] text-text-muted">{t("overview.collectionLinkHint")}</span>
            </span>
            <ArrowRight className="h-4 w-4 shrink-0 text-text-muted transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
          </Link>
        </div>
      </div>

      <FreshnessLine generatedAt={data.generatedAt} note={t("kpi.internalExcluded")} />
    </div>
  );
}

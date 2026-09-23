import { getTranslations, getLocale } from "next-intl/server";
import type { OverviewData, HealthPulseData, ActionItem, TopContentRow } from "@/lib/admin/intelligence";
import type { DashboardFilters, DashboardMetric } from "@/lib/admin/dashboard-shared";
import { serializeDashboardFilters } from "@/lib/admin/dashboard-shared";
import MetricCard, { type MetricCardData } from "./MetricCard";
import { numberFormat } from "./formatters";
import HealthCard from "./HealthCard";
import MetricDetailsDrawer, {
  type HealthDetailPayload,
  type MetricDetailPayload,
} from "./MetricDetailsDrawer";

const METRICS: DashboardMetric[] = ["visitors", "views", "readerOpens", "downloads"];

/** Reader opens are nullable while the event is still collecting. */
const seriesOf = (metric: DashboardMetric, src: OverviewData["engagement"]["series"]) =>
  metric === "readerOpens" ? src.readerOpens : src[metric === "visitors" ? "visitors" : metric];

/** Which full report a metric's drawer links out to. */
const REPORT_TARGET: Record<DashboardMetric, DashboardFilters["view"]> = {
  visitors: "audience",
  views: "content",
  readerOpens: "content",
  downloads: "content",
};

/** Which action-centre modules are worth surfacing next to which metric. */
const METRIC_ALERT_MODULES: Record<DashboardMetric, string[]> = {
  visitors: ["search"],
  views: ["content", "search"],
  readerOpens: ["storage", "content"],
  downloads: ["storage"],
};

/** Which content column a metric's "top content" list should rank by. */
const METRIC_FIELD: Record<DashboardMetric, keyof Pick<TopContentRow, "views" | "visitors" | "readerOpens" | "downloads">> =
  {
    visitors: "visitors",
    views: "views",
    readerOpens: "readerOpens",
    downloads: "downloads",
  };

/**
 * Executive Pulse: system health plus the four engagement measures, as one
 * interactive control row. Every payload the details drawer needs is built
 * here on the server (already-localised strings, no client formatting), so the
 * drawer stays a dumb presentational component and no extra request is made
 * when it opens.
 */
export default async function ExecutivePulse({
  data,
  health,
  actions,
  filters,
  rangeLabel,
}: {
  data: OverviewData;
  health: HealthPulseData | null;
  actions: ActionItem[];
  filters: DashboardFilters;
  rangeLabel: string;
}) {
  // Four independent lookups: awaiting them in sequence made the card row
  // wait for four round trips it never needed.
  const [t, tHealth, tActions, typeLabels, locale] = await Promise.all([
    getTranslations("adminDashboard.kpi"),
    getTranslations("adminDashboard.health"),
    getTranslations("adminDashboard.actionCenter"),
    getTranslations("adminDashboard.toolbar"),
    getLocale(),
  ]);
  const nf = numberFormat(locale);

  const { kpis, engagement, topContent } = data;

  const link = (view: DashboardFilters["view"]) => {
    const s = serializeDashboardFilters({ ...filters, view });
    return s ? `/admin?${s}` : "/admin";
  };

  const datumOf = (metric: DashboardMetric) => {
    switch (metric) {
      case "visitors":
        return kpis.uniqueVisitors;
      case "views":
        return kpis.detailViews;
      case "readerOpens":
        return kpis.readerOpens;
      case "downloads":
        return kpis.downloads;
    }
  };

  const cardData = (metric: DashboardMetric): MetricCardData => {
    const d = datumOf(metric);
    const collecting = Boolean(d.collecting);
    return {
      metric,
      value: d.value,
      formattedValue: nf.format(d.value),
      trend: collecting ? null : d.trend,
      previous: d.trend?.previous ?? null,
      formattedPrevious:
        collecting || d.trend?.previous === undefined || d.trend.mode === "hidden"
          ? null
          : nf.format(d.trend.previous),
      spark: collecting ? null : d.spark,
      collecting,
    };
  };

  /* Said once, not four times.

     Every card carried its own "No previous-period baseline to compare
     against." line, and the case where one card lacks a baseline is almost
     always the case where all four do — a first deployment, a widened range,
     a fresh filter. The result was the same 47-character sentence repeated
     across the row, taking about a quarter of each card's height to say one
     thing. The notice moves under the row when it applies to the WHOLE row;
     a mixed row (some cards comparable, some not) keeps it per-card, because
     there the sentence is telling those cards apart. */
  const rowCards = METRICS.map(cardData);
  const noComparisonEverywhere = rowCards.every(
    (c) => !c.collecting && (!c.trend || c.trend.mode === "hidden"),
  );

  const detailPayload = (metric: DashboardMetric): MetricDetailPayload => {
    const d = datumOf(metric);
    const field = METRIC_FIELD[metric];
    const top = [...topContent]
      .filter((r) => r[field] > 0)
      .sort((a, b) => b[field] - a[field])
      .slice(0, 5)
      .map((r) => ({
        key: `${r.type}:${r.id}`,
        title: r.title,
        href: r.editHref,
        value: nf.format(r[field]),
        secondary: typeLabels(`type.${r.type}`),
      }));

    const modules = METRIC_ALERT_MODULES[metric];
    const alerts = actions
      .filter((a) => modules.includes(a.module))
      .slice(0, 3)
      .map((a) => ({
        key: a.key,
        label: tActions(`items.${a.key}`, { count: a.count }),
        href: a.href,
        severity: a.severity,
        // Localised here, on the server, so the drawer can name the severity
        // rather than encoding it as a colour a screen reader cannot read.
        severityLabel: tActions(`severity.${a.severity}`),
      }));

    const previous = d.trend?.previous;
    const change =
      d.collecting || !d.trend || d.trend.mode === "hidden"
        ? null
        : d.trend.mode === "percent"
          ? d.trend.value
          : d.trend.value;

    return {
      title: t(`${metric}Title`),
      definition: t(`${metric}Def`),
      value: nf.format(d.value),
      previous: previous === undefined || d.collecting ? null : nf.format(previous),
      change,
      changeDirection: d.collecting || !d.trend || d.trend.mode === "hidden" ? null : d.trend.direction,
      series: seriesOf(metric, engagement.series) ?? [],
      prevSeries: filters.compare ? (seriesOf(metric, engagement.prevSeries) ?? null) : null,
      top,
      alerts,
      reportHref: link(REPORT_TARGET[metric]),
      reportLabel: t("openFullReport"),
      limitation: metric === "visitors" ? t("visitorsLimitation") : d.collecting ? t("collectingLimitation") : null,
    };
  };

  const metricPayloads = {
    visitors: detailPayload("visitors"),
    views: detailPayload("views"),
    readerOpens: detailPayload("readerOpens"),
    downloads: detailPayload("downloads"),
  } satisfies Record<DashboardMetric, MetricDetailPayload>;

  const healthPayload: HealthDetailPayload = {
    title: tHealth("title"),
    level: tHealth(`levelLong.${health?.level ?? "unknown"}`),
    checks: (health?.checks ?? []).map((c) => ({
      key: c.key,
      label: tHealth(`check.${c.key}`),
      levelLabel: tHealth(`checkLevel.${c.level}`),
      level: c.level,
      detail:
        c.level === "unknown"
          ? tHealth(`checkUnknown.${c.key}`, { sample: c.sample ?? 0 })
          : tHealth(`checkDetail.${c.key}`, { value: c.value ?? 0, sample: c.sample ?? 0 }),
      href: c.href,
    })),
    reportHref: link("system"),
    reportLabel: tHealth("openSystemReport"),
  };

  return (
    <section aria-labelledby="pulse-heading">
      <h2 id="pulse-heading" className="sr-only">
        {t("sectionLabel", { range: rangeLabel })}
      </h2>
      {/* Status verdict first, full width — answered before the numbers. */}
      {health ? (
        <HealthCard pulse={health} />
      ) : (
        <div className="dash-card flex items-center gap-2 p-3.5 text-xs text-text-muted">
          {tHealth("unavailable")}
        </div>
      )}

      {/* The four engagement measures, as one cohesive group. gap-5 matches
          every other tab's KPI row — this one sat at gap-4 alone.

          Below `sm` this is a SNAP STRIP rather than a stack. Stacked, the four
          cards ran 792px on a 390x844 phone — four numbers costing more than a
          screen of scrolling, before the attention queue below them has said
          anything. Each card keeps its full anatomy (title, figure, trend,
          sparkline, definition and details) at 82% of the viewport, so the next
          card always peeks and the swipe is self-evident; the cards are buttons,
          so Tab still walks the row and the browser scrolls each into view.
          Four across starts at `xl`, not `lg`. The admin shell's sidebar is a
          fixed 256px, so at a 1024px viewport the content column is about
          712px — four cards of 163px, which truncated "Unique visitors" and
          "Detail views" to their own ellipsis. The breakpoint has to be read
          against the content column, not the window. */}
      <div className="dash-scroll-x -mx-1 mt-4 flex snap-x snap-mandatory gap-5 px-1 pb-1 sm:mx-0 sm:grid sm:snap-none sm:grid-cols-2 sm:px-0 sm:pb-0 xl:grid-cols-4 [&>*]:w-[82%] [&>*]:shrink-0 [&>*]:snap-start sm:[&>*]:w-auto">
        {rowCards.map((card) => (
          <MetricCard
            key={card.metric}
            data={card}
            title={t(`${card.metric}Title`)}
            definition={t(`${card.metric}Def`)}
            compareLabel={filters.compare ? data.vsLabel : null}
            collectingLabel={t("collecting")}
            noComparisonLabel={noComparisonEverywhere ? null : t("noComparison")}
          />
        ))}
      </div>

      {noComparisonEverywhere && (
        <p className="dash-prose mt-2.5">{t("noComparison")}</p>
      )}

      <MetricDetailsDrawer metrics={metricPayloads} health={healthPayload} />
    </section>
  );
}

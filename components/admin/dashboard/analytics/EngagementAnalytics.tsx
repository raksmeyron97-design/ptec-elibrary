"use client";

import { useEffect, useMemo, useReducer } from "react";
import { useLocale, useTranslations } from "next-intl";
import { RotateCcw, Table2 } from "lucide-react";
import type { TrendPoint } from "@/lib/admin/dashboard";
import {
  aggregateSeries,
  autoGrain,
  CHART_GRAINS,
  type ChartGrain,
  type DashboardFilters,
  type DashboardMetric,
} from "@/lib/admin/dashboard-shared";
import {
  analyticsBucketKeyFromDay,
  parseAnalyticsBucket,
} from "@/lib/admin/analytics-time";
import type { EngagementBreakdownRequest } from "@/lib/admin/engagement-breakdown";
import type { EngagementSeries } from "../LegacyEngagementChart";
import { useMetricSelection } from "../MetricSelection";
import { useContainerWidth } from "../chart-utils";
import {
  AnalyticsChartPlot,
  type AnalyticsPlotAnnotation,
  type AnalyticsPlotSeries,
} from "./AnalyticsChartPlot";
import SelectedBucketDetails from "./SelectedBucketDetails";
import SeriesKey from "./SeriesKey";
import { analyticsChartReducer, createAnalyticsChartState } from "./chart-state";
import { useEngagementBreakdown } from "./useEngagementBreakdown";

const METRICS: DashboardMetric[] = ["views", "visitors", "readerOpens", "downloads"];
const AGGREGATION_MODE: Record<DashboardMetric, "sum" | "max"> = {
  views: "sum",
  visitors: "max",
  readerOpens: "sum",
  downloads: "sum",
};

const rawSeries = (source: EngagementSeries, metric: DashboardMetric): TrendPoint[] =>
  metric === "readerOpens" ? (source.readerOpens ?? []) : source[metric];

function bucketLabel(bucket: string, grain: ChartGrain, locale: string): string {
  if (grain === "hour") return bucket.slice(11);
  const parsed = parseAnalyticsBucket(bucket, grain);
  if (!parsed) return bucket;
  return new Intl.DateTimeFormat(locale, {
    timeZone: "Asia/Phnom_Penh",
    month: "short",
    day: grain === "month" ? undefined : "numeric",
  }).format(parsed.start);
}

export type EngagementAnalyticsProps = {
  series: EngagementSeries;
  prevSeries: EngagementSeries;
  annotations: Array<{ date: string; count: number; titles?: string[] }>;
  granularity: "hour" | "day";
  compare: boolean;
  filters: DashboardFilters;
  generatedAt: string;
};

/** One reusable V2 graph for views, visitors, reader opens, and downloads. */
export default function EngagementAnalytics({
  series,
  prevSeries,
  annotations,
  granularity,
  compare,
  filters,
  generatedAt,
}: EngagementAnalyticsProps) {
  const t = useTranslations("adminDashboard.engagement");
  const locale = useLocale();
  const { metric, selectMetric } = useMetricSelection();
  const [containerRef, width] = useContainerWidth(760);
  const defaultGrain = autoGrain(series.views.length, granularity);
  const [state, dispatch] = useReducer(
    analyticsChartReducer,
    { metric, grain: defaultGrain, compare },
    createAnalyticsChartState,
  );

  useEffect(() => {
    if (metric !== state.metric) dispatch({ type: "selectMetric", metric });
  }, [metric, state.metric]);

  const aggregate = useMemo(() => {
    const current = {} as Record<DashboardMetric, TrendPoint[]>;
    const previous = {} as Record<DashboardMetric, TrendPoint[]>;
    for (const key of METRICS) {
      current[key] = aggregateSeries(rawSeries(series, key), state.grain, AGGREGATION_MODE[key]);
      previous[key] = aggregateSeries(rawSeries(prevSeries, key), state.grain, AGGREGATION_MODE[key]);
    }
    return { current, previous };
  }, [series, prevSeries, state.grain]);

  const plotSeries: AnalyticsPlotSeries[] = (() => {
    if (state.comparison === "metrics") {
      return state.visibleSeries.map((key) => ({
        id: `${key}-current`,
        metric: key,
        label: t(`series.${key}`),
        points: aggregate.current[key],
      }));
    }
    const current: AnalyticsPlotSeries = {
      id: `${state.metric}-current`,
      metric: state.metric,
      label: t(`series.${state.metric}`),
      points: aggregate.current[state.metric],
    };
    return state.comparison === "previous"
      ? [
          current,
          {
            id: `${state.metric}-previous`,
            metric: state.metric,
            label: t("previousPeriodSeries", { series: t(`series.${state.metric}`) }),
            points: aggregate.previous[state.metric],
            comparison: true,
          },
        ]
      : [current];
  })();

  const plotAnnotations = useMemo<AnalyticsPlotAnnotation[]>(() => {
    const grouped = new Map<string, { count: number; titles: string[] }>();
    for (const annotation of annotations) {
      const date = state.grain === "hour" || state.grain === "day"
        ? annotation.date
        : analyticsBucketKeyFromDay(annotation.date.slice(0, 10), state.grain);
      if (!date) continue;
      const entry = grouped.get(date) ?? { count: 0, titles: [] };
      entry.count += annotation.count;
      entry.titles.push(...(annotation.titles ?? []));
      grouped.set(date, entry);
    }
    return [...grouped.entries()].map(([date, annotation]) => ({
      date,
      label: `${t("publishedAnnotation", { count: annotation.count })}${annotation.titles.length > 0 ? `: ${annotation.titles.slice(0, 3).join(", ")}` : ""}`,
    }));
  }, [annotations, state.grain, t]);

  const activePoints = aggregate.current[state.metric];
  const total = activePoints.reduce((sum, point) => sum + point.value, 0);
  const peak = activePoints.reduce<TrendPoint | null>(
    (best, point) => (!best || point.value > best.value ? point : best),
    null,
  );
  const height = width >= 720 ? 300 : width >= 480 ? 260 : 230;
  const collecting = state.metric === "readerOpens" && series.readerOpens === null;
  const comparisonLabel =
    state.comparison === "metrics"
      ? t("comparisonMetricsStatus")
      : state.comparison === "previous"
        ? t("comparisonPreviousStatus")
        : t("comparisonOffStatus");
  const summary = t("v2Summary", {
    series: t(`series.${state.metric}`),
    total,
    peak: peak?.value ?? 0,
    peakBucket: peak ? bucketLabel(peak.date, state.grain, locale) : "—",
  });

  const breakdownRequest = useMemo<EngagementBreakdownRequest | null>(() => {
    if (!state.selectedBucket) return null;
    return {
      metric: state.metric,
      grain: state.grain,
      bucket: state.selectedBucket,
      range: filters.range,
      from: filters.range === "custom" ? filters.from : undefined,
      to: filters.range === "custom" ? filters.to : undefined,
      contentType: filters.type,
      department: filters.dept,
      contentLanguage: filters.contentLanguage,
      asOf: generatedAt,
    };
  }, [
    state.selectedBucket,
    state.metric,
    state.grain,
    filters.range,
    filters.from,
    filters.to,
    filters.type,
    filters.dept,
    filters.contentLanguage,
    generatedAt,
  ]);
  const breakdown = useEngagementBreakdown(breakdownRequest);

  const selectGraphMetric = (next: DashboardMetric) => {
    dispatch({ type: "selectMetric", metric: next });
    selectMetric(next);
  };
  const selectPoint = ({ bucket, metric: pointMetric }: { bucket: string; metric: DashboardMetric }) => {
    if (pointMetric !== state.metric) selectGraphMetric(pointMetric);
    dispatch({ type: "selectBucket", bucket });
  };

  const selectedPoint = state.selectedBucket
    ? aggregate.current[state.metric].find((point) => point.date === state.selectedBucket)
    : undefined;
  const selectedLabel = state.selectedBucket
    ? bucketLabel(state.selectedBucket, state.grain, locale)
    : "";
  const tableBuckets = Array.from(new Set(plotSeries.flatMap((item) => item.points.map((point) => point.date)))).sort();

  return (
    <div data-engagement-chart-version="v2" data-range={granularity}>
      <div className="flex flex-wrap items-center gap-2">
        <div className="dash-seg" role="group" aria-label={t("metricLabel")}>
          {METRICS.map((key) => (
            <button
              key={key}
              type="button"
              aria-pressed={state.metric === key}
              onClick={() => selectGraphMetric(key)}
              className="dash-seg-btn text-[11.5px]"
            >
              {t(`series.${key}`)}
            </button>
          ))}
        </div>

        <span className="ms-auto rounded-full border border-divider bg-paper px-2 py-1 text-[10.5px] font-semibold text-text-muted">
          {comparisonLabel}
        </span>
        <button
          type="button"
          aria-pressed={state.comparison === "metrics"}
          onClick={() =>
            dispatch({
              type: "setComparison",
              comparison: state.comparison === "metrics" ? state.defaultComparison : "metrics",
            })
          }
          className="rounded-lg px-2.5 py-1.5 text-[11.5px] font-semibold text-brand hover:bg-brand/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          {t("compareMetrics")}
        </button>
        <button
          type="button"
          aria-pressed={state.tableVisible}
          onClick={() => dispatch({ type: "toggleTable" })}
          aria-label={state.tableVisible ? t("hideTable") : t("showTable")}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-text-muted hover:bg-paper hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          <Table2 className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => dispatch({ type: "reset" })}
          aria-label={t("resetChart")}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-text-muted hover:bg-paper hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <div className="dash-seg" role="group" aria-label={t("grainLabel")}>
          {CHART_GRAINS.filter((grain) => granularity === "hour" ? grain === "hour" : grain !== "hour").map((grain) => (
            <button
              key={grain}
              type="button"
              aria-pressed={state.grain === grain}
              onClick={() => dispatch({ type: "setGrain", grain })}
              className="dash-seg-btn text-[11px]"
            >
              {t(`grain.${grain}`)}
            </button>
          ))}
        </div>

        {state.comparison === "metrics" && (
          <fieldset className="flex flex-wrap items-center gap-2" aria-label={t("advancedSeries")}>
            {METRICS.map((key) => {
              const checked = state.visibleSeries.includes(key);
              return (
                <label key={key} className="inline-flex items-center gap-1 text-[11px] font-medium text-text-body">
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={key === state.metric || (!checked && state.visibleSeries.length >= 3)}
                    onChange={() => dispatch({ type: "toggleSeries", metric: key })}
                    className="h-3.5 w-3.5 accent-[var(--ptec-brand)]"
                  />
                  <SeriesKey metric={key} />
                  {t(`series.${key}`)}
                </label>
              );
            })}
          </fieldset>
        )}
      </div>

      {/* Identity for the previous-period overlay. In "compare metrics" mode
          the checkboxes above already carry a line key each, so this would be
          the same legend twice — each mode gets exactly one. */}
      {state.comparison === "previous" && (
        <ul
          aria-label={t("legendLabel")}
          className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1"
        >
          {plotSeries.map((item) => (
            <li key={item.id} className="flex items-center gap-1.5 text-[11.5px] font-medium text-text-body">
              <SeriesKey metric={item.metric} comparison={item.comparison} dashed={false} />
              {item.label}
            </li>
          ))}
        </ul>
      )}

      <p className="mt-2 min-h-5 text-[11.5px] text-text-muted" aria-live="polite">
        {collecting ? t("readerOpensCollecting") : summary}
        {state.metric === "visitors" && (state.grain === "week" || state.grain === "month") && (
          <span className="ms-1">{t("visitorRollupNote")}</span>
        )}
      </p>

      <div ref={containerRef} className="relative mt-1 min-w-0">
        {activePoints.length === 0 ? (
          <div className="flex h-[230px] items-center justify-center rounded-xl border border-dashed border-divider bg-paper/40 px-6 text-center text-[12px] text-text-muted" role="status">
            {collecting ? t("readerOpensCollecting") : t("noChartData")}
          </div>
        ) : (
          <AnalyticsChartPlot
            width={width}
            height={height}
            series={plotSeries}
            annotations={plotAnnotations}
            selectedBucket={state.selectedBucket}
            label={t("chartLabel", { series: t(`series.${state.metric}`) })}
            description={`${summary} ${annotations.length > 0 ? t("publishCount", { count: annotations.length }) : ""}`}
            formatBucket={(bucket) => bucketLabel(bucket, state.grain, locale)}
            formatValue={(value) => new Intl.NumberFormat(locale, { notation: value >= 10_000 ? "compact" : "standard" }).format(value)}
            pointLabel={({ date, value, series: seriesLabel }) =>
              t("pointLabelV2", {
                date: bucketLabel(date, state.grain, locale),
                series: seriesLabel,
                value,
              })
            }
            onSelectPoint={selectPoint}
          />
        )}
      </div>

      {state.tableVisible && (
        <div className="mt-3 max-h-64 overflow-auto rounded-xl border border-divider" tabIndex={0}>
          <table className="w-full min-w-[420px] text-[11.5px]">
            <caption className="sr-only">{t("dataTableCaption", { summary })}</caption>
            <thead className="dash-thead sticky top-0 bg-bg-surface">
              <tr>
                <th scope="col" className="px-3 py-2 text-start font-bold">{t("date")}</th>
                {plotSeries.map((item) => (
                  <th key={item.id} scope="col" className="px-3 py-2 text-end font-bold">{item.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tableBuckets.map((bucket) => (
                <tr key={bucket} className="border-t border-divider">
                  <th scope="row" className="px-3 py-1.5 text-start font-semibold text-text-body">
                    {bucketLabel(bucket, state.grain, locale)}
                  </th>
                  {plotSeries.map((item) => (
                    <td key={item.id} className="px-3 py-1.5 text-end tabular-nums text-text-body">
                      {item.points.find((point) => point.date === bucket)?.value ?? 0}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <SelectedBucketDetails
        bucketLabel={selectedLabel}
        metricLabel={t(`series.${state.metric}`)}
        plottedValue={selectedPoint?.value ?? 0}
        selected={Boolean(state.selectedBucket)}
        expanded={state.detailsExpanded}
        onExpandedChange={(expanded) => dispatch({ type: "setDetailsExpanded", expanded })}
        onClear={() => dispatch({ type: "selectBucket", bucket: null })}
        load={breakdown}
      />
    </div>
  );
}

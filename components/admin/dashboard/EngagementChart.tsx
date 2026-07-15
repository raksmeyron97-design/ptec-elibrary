"use client";

import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import type { TrendPoint } from "@/lib/admin/dashboard";
import { useContainerWidth, formatBucket, niceMax4, AXIS_TEXT, ChartGrid } from "./chart-utils";

type SeriesKey = "views" | "visitors" | "readerOpens" | "downloads";

const SERIES_COLOR: Record<SeriesKey, string> = {
  views: "#1E3A8A",
  visitors: "#0E7490",
  readerOpens: "#7C3AED",
  downloads: "#B45309",
};

/** Dash patterns keep multi-series compare readable without colour alone. */
const SERIES_DASH: Record<SeriesKey, string | undefined> = {
  views: undefined,
  visitors: "5 3",
  readerOpens: "2 3",
  downloads: "8 3 2 3",
};

export type EngagementSeries = {
  views: TrendPoint[];
  visitors: TrendPoint[];
  readerOpens: TrendPoint[] | null;
  downloads: TrendPoint[];
};

/**
 * Primary engagement chart. Default mode shows ONE selected metric with the
 * previous period as a subtle dashed overlay plus a total/average/peak
 * summary; "Compare metrics" is an explicit opt-in mode for all series.
 * Zero-based axis, publish-annotation toggle, table alternative.
 */
export default function EngagementChart({
  series,
  prevSeries,
  annotations,
  granularity,
  compare,
}: {
  series: EngagementSeries;
  prevSeries: EngagementSeries;
  annotations: { date: string; count: number }[];
  granularity: "hour" | "day";
  compare: boolean;
}) {
  const t = useTranslations("adminDashboard.engagement");
  const chartId = useId();
  const [ref, width] = useContainerWidth();
  const [metric, setMetric] = useState<SeriesKey>("views");
  const [compareAll, setCompareAll] = useState(false);
  const [showAnnotations, setShowAnnotations] = useState(true);

  const keys: SeriesKey[] = ["views", "visitors", "readerOpens", "downloads"];
  const available = keys.filter((k) => (k === "readerOpens" ? series.readerOpens !== null : true));
  const activeMetric = available.includes(metric) ? metric : "views";
  const buckets = series.views.map((p) => p.date);

  const height = 210;
  const padLeft = 34;
  const padRight = 10;
  const padTop = 12;
  const padBottom = 24;
  const innerW = Math.max(50, width - padLeft - padRight);
  const innerH = height - padTop - padBottom;

  const seriesOf = (k: SeriesKey, src: EngagementSeries): TrendPoint[] =>
    (k === "readerOpens" ? src.readerOpens ?? [] : src[k]) as TrendPoint[];

  const drawn: { key: SeriesKey; points: TrendPoint[]; prev: TrendPoint[] | null }[] = compareAll
    ? available.map((k) => ({ key: k, points: seriesOf(k, series), prev: null }))
    : [
        {
          key: activeMetric,
          points: seriesOf(activeMetric, series),
          prev: compare ? seriesOf(activeMetric, prevSeries) : null,
        },
      ];

  const allValues = drawn.flatMap((s) => [
    ...s.points.map((p) => p.value),
    ...(s.prev ?? []).map((p) => p.value),
  ]);
  const maxVal = niceMax4(Math.max(1, ...allValues));
  const x = (i: number) => padLeft + (buckets.length > 1 ? (i / (buckets.length - 1)) * innerW : innerW / 2);
  const y = (v: number) => padTop + innerH - (v / maxVal) * innerH;

  const ticks = [0, maxVal / 4, maxVal / 2, (3 * maxVal) / 4, maxVal].map((v) => ({
    v: Math.round(v),
    y: y(v),
  }));

  const labelEvery = Math.max(1, Math.ceil(buckets.length / Math.max(3, Math.floor(innerW / 70))));
  const annotationByDate = new Map(annotations.map((a) => [a.date, a.count]));

  // Summary for the selected metric (single-metric mode).
  const activePoints = seriesOf(activeMetric, series);
  const total = activePoints.reduce((s, p) => s + p.value, 0);
  const avg = activePoints.length > 0 ? Math.round((total / activePoints.length) * 10) / 10 : 0;
  const peak = activePoints.reduce<TrendPoint | null>(
    (best, p) => (p.value > 0 && (!best || p.value > best.value) ? p : best),
    null,
  );
  const prevTotal = compare
    ? seriesOf(activeMetric, prevSeries).reduce((s, p) => s + p.value, 0)
    : null;

  const srSummary = compareAll
    ? drawn.map((s) => t("srSeriesTotal", { series: t(`series.${s.key}`), total: s.points.reduce((a, p) => a + p.value, 0) })).join(" ")
    : t("srSingleSummary", { series: t(`series.${activeMetric}`), total, avg, peak: peak ? peak.value : 0 });

  const pathOf = (points: TrendPoint[]) =>
    points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(p.value)}`).join(" ");

  const areaOf = (points: TrendPoint[]) => {
    if (points.length === 0) return "";
    const baseline = y(0);
    return `${pathOf(points)} L${x(points.length - 1)},${baseline} L${x(0)},${baseline} Z`;
  };
  const fillId = `${chartId}-fill`;

  return (
    <div>
      {/* Metric selector + mode toggles */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <div className="dash-seg" role="group" aria-label={t("metricLabel")}>
          {available.map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={!compareAll && activeMetric === k}
              disabled={compareAll}
              onClick={() => setMetric(k)}
              className="dash-seg-btn text-[11.5px] disabled:cursor-default disabled:opacity-50"
            >
              {t(`series.${k}`)}
            </button>
          ))}
        </div>
        {series.readerOpens === null && (
          <span className="text-[11px] font-medium text-sky-800">{t("readerOpensCollecting")}</span>
        )}
        <div className="ms-auto flex items-center gap-3">
          <label className="flex cursor-pointer select-none items-center gap-1 text-[11.5px] font-medium text-text-muted">
            <input
              type="checkbox"
              checked={showAnnotations}
              onChange={(e) => setShowAnnotations(e.target.checked)}
              className="h-3 w-3 cursor-pointer accent-[#DDB022]"
            />
            {t("annotationsToggle")}
          </label>
          <label className="flex cursor-pointer select-none items-center gap-1 text-[11.5px] font-medium text-text-muted">
            <input
              type="checkbox"
              checked={compareAll}
              onChange={(e) => setCompareAll(e.target.checked)}
              className="h-3 w-3 cursor-pointer accent-[var(--ptec-brand,#1E3A8A)]"
            />
            {t("compareMetrics")}
          </label>
        </div>
      </div>

      {/* Summary line (single-metric mode) or compare legend */}
      {compareAll ? (
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1" aria-hidden="true">
          {drawn.map((s) => (
            <span key={s.key} className="flex items-center gap-1.5 text-[11.5px] font-medium text-text-body">
              <svg width="18" height="8">
                <line x1="0" y1="4" x2="18" y2="4" stroke={SERIES_COLOR[s.key]} strokeWidth="2" strokeDasharray={SERIES_DASH[s.key]} />
              </svg>
              {t(`series.${s.key}`)}
              <span className="tabular-nums text-text-muted">{s.points.reduce((a, p) => a + p.value, 0)}</span>
            </span>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-[12px] text-text-muted">
          {t("summary", { total, avg, peak: peak ? peak.value : 0, peakDay: peak ? formatBucket(peak.date, granularity) : "—" })}
          {prevTotal !== null && prevTotal > 0 && <span className="ms-1.5">{t("summaryPrev", { value: prevTotal })}</span>}
        </p>
      )}

      <div ref={ref} className="mt-1.5">
        <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={srSummary}>
          <defs>
            <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={SERIES_COLOR[activeMetric]} stopOpacity="0.16" />
              <stop offset="100%" stopColor={SERIES_COLOR[activeMetric]} stopOpacity="0" />
            </linearGradient>
          </defs>
          <ChartGrid ticks={ticks} padLeft={padLeft} width={width} padRight={padRight} />

          {/* Soft area fill under the single active series (not in compare mode). */}
          {!compareAll && drawn[0].points.length > 1 && (
            <path d={areaOf(drawn[0].points)} fill={`url(#${fillId})`} stroke="none" />
          )}

          {showAnnotations &&
            buckets.map((b, i) =>
              annotationByDate.has(b) ? (
                <g key={`ann-${b}`}>
                  <line x1={x(i)} y1={padTop} x2={x(i)} y2={padTop + innerH} stroke="#DDB022" strokeWidth="1" strokeDasharray="3 3" />
                  <circle cx={x(i)} cy={padTop} r="3.5" fill="#DDB022">
                    <title>{t("publishedAnnotation", { count: annotationByDate.get(b) ?? 0 })}</title>
                  </circle>
                </g>
              ) : null,
            )}

          {/* Previous period — subtle dashed overlay (single-metric mode) */}
          {!compareAll && drawn[0].prev && (
            <path
              d={pathOf(drawn[0].prev)}
              fill="none"
              stroke={SERIES_COLOR[drawn[0].key]}
              strokeOpacity="0.35"
              strokeWidth="1.5"
              strokeDasharray="4 4"
              strokeLinejoin="round"
            />
          )}

          {drawn.map((s) => (
            <path
              key={s.key}
              d={pathOf(s.points)}
              fill="none"
              stroke={SERIES_COLOR[s.key]}
              strokeWidth="2"
              strokeDasharray={compareAll ? SERIES_DASH[s.key] : undefined}
              strokeLinejoin="round"
            />
          ))}

          {drawn.map((s) =>
            s.points.map((p, i) =>
              p.value > 0 ? (
                <circle key={`${s.key}-${p.date}`} cx={x(i)} cy={y(p.value)} r="2.5" fill={SERIES_COLOR[s.key]}>
                  <title>{`${formatBucket(p.date, granularity)} · ${t(`series.${s.key}`)}: ${p.value}`}</title>
                </circle>
              ) : null,
            ),
          )}

          {buckets.map((b, i) =>
            i % labelEvery === 0 ? (
              <text key={b} x={x(i)} y={height - 6} textAnchor="middle" {...AXIS_TEXT}>
                {formatBucket(b, granularity)}
              </text>
            ) : null,
          )}
        </svg>
      </div>

      {/* Accessible data table alternative */}
      <details className="mt-1">
        <summary className="cursor-pointer text-[11.5px] font-semibold text-text-muted hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
          {t("showTable")}
        </summary>
        <div className="mt-2 max-h-56 overflow-auto rounded-xl border border-divider">
          <table className="w-full text-[11.5px]" aria-describedby={`${chartId}-caption`}>
            <caption id={`${chartId}-caption`} className="sr-only">
              {srSummary}
            </caption>
            <thead className="sticky top-0 bg-paper">
              <tr>
                <th scope="col" className="px-2 py-1.5 text-start font-bold text-text-muted">
                  {t("date")}
                </th>
                {available.map((k) => (
                  <th key={k} scope="col" className="px-2 py-1.5 text-end font-bold text-text-muted">
                    {t(`series.${k}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {buckets.map((b, i) => (
                <tr key={b} className="border-t border-divider">
                  <th scope="row" className="px-2 py-1 text-start font-medium text-text-body">
                    {formatBucket(b, granularity)}
                  </th>
                  {available.map((k) => (
                    <td key={k} className="px-2 py-1 text-end tabular-nums text-text-body">
                      {seriesOf(k, series)[i]?.value ?? 0}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

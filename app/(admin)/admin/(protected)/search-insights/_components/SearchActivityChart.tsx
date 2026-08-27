"use client";

import { useId, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Table2 } from "lucide-react";
import { useContainerWidth } from "@/components/admin/dashboard/chart-utils";
import { createChartGeometry, monotoneAreaPath, monotonePath } from "@/components/admin/dashboard/analytics/chart-math";
import type { SearchTrendPoint } from "@/app/actions/search-insights";
import { ACTIVITY_SERIES, type ActivitySeries } from "@/lib/admin/search-insights-shared";

/**
 * Three series, validated together as a categorical palette (lightness band,
 * chroma floor, protan/deutan ΔE under all pairs, ≥3:1 on white).
 *
 * "No results" wears the danger token on purpose: it is a failure STATE, not
 * an arbitrary third identity, and the legend names it in words either way.
 */
const SERIES_STROKE: Record<ActivitySeries, string> = {
  searches: "var(--ptec-series-views)",
  noResults: "var(--ptec-danger)",
  clicks: "var(--ptec-series-visitors)",
};
const SERIES_DASH: Record<ActivitySeries, string | undefined> = {
  searches: undefined,
  noResults: "5 4",
  clicks: "2 3",
};

type Readout = { index: number } | null;

/**
 * Search activity over the selected window.
 *
 * One chart replaces the three separate bar blocks the page used to stack
 * (daily / weekly / monthly), which each described a different, hard-coded
 * period — the range control now decides the window and the bucket width, and
 * every point comes from the server-side aggregate. Nothing here synthesises
 * a value.
 *
 * Reading is a crosshair interaction: the pointer only has to be at the right
 * date, and one readout lists every visible series at that date. The same
 * numbers are available without hovering at all through the data table
 * toggle, so the tooltip enhances and never gates.
 */
export default function SearchActivityChart({ points, bucketDays }: { points: SearchTrendPoint[]; bucketDays: number }) {
  const t = useTranslations("adminSearchInsights.chart");
  const locale = useLocale();
  const id = useId();
  const [containerRef, width] = useContainerWidth(880);
  const [hidden, setHidden] = useState<Set<ActivitySeries>>(new Set());
  const [readout, setReadout] = useState<Readout>(null);
  const [showTable, setShowTable] = useState(false);

  const visible = ACTIVITY_SERIES.filter((series) => !hidden.has(series));
  const height = width >= 720 ? 340 : width >= 480 ? 280 : 240;

  const formatBucket = useMemo(() => {
    const formatter = new Intl.DateTimeFormat(locale, { timeZone: "UTC", month: "short", day: "numeric" });
    return (iso: string) => {
      const parsed = Date.parse(`${iso}T00:00:00Z`);
      return Number.isNaN(parsed) ? iso : formatter.format(parsed);
    };
  }, [locale]);
  const numberFormat = useMemo(() => new Intl.NumberFormat(locale), [locale]);

  const maximum = Math.max(
    0,
    ...points.flatMap((point) => visible.map((series) => point[series])),
  );
  const geometry = createChartGeometry({ width, height, maximum });
  const plotBottom = height - geometry.bottom;
  const x = (index: number) => geometry.x(index, points.length);

  const totals = ACTIVITY_SERIES.reduce(
    (acc, series) => ({ ...acc, [series]: points.reduce((sum, point) => sum + point[series], 0) }),
    {} as Record<ActivitySeries, number>,
  );

  const summary = t("summary", {
    searches: numberFormat.format(totals.searches),
    noResults: numberFormat.format(totals.noResults),
    clicks: numberFormat.format(totals.clicks),
    buckets: points.length,
    unit: bucketDays === 1 ? t("unitDay") : bucketDays === 7 ? t("unitWeek") : t("unitMonth"),
  });

  const toggle = (series: ActivitySeries) => {
    setHidden((previous) => {
      const next = new Set(previous);
      if (next.has(series)) next.delete(series);
      // Never hide the last visible series — an empty plot is not a state
      // anyone asked for.
      else if (previous.size < ACTIVITY_SERIES.length - 1) next.add(series);
      return next;
    });
  };

  const readPointer = (event: React.PointerEvent<SVGRectElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    if (box.width === 0 || points.length === 0) return null;
    const local = ((event.clientX - box.left) / box.width) * geometry.innerWidth;
    const step = points.length > 1 ? geometry.innerWidth / (points.length - 1) : geometry.innerWidth;
    return Math.min(points.length - 1, Math.max(0, Math.round(local / step)));
  };

  const labelEvery = Math.max(1, Math.ceil(points.length / Math.max(2, Math.floor(geometry.innerWidth / 84))));
  const active = readout?.index ?? null;

  if (points.length === 0) {
    return (
      <p className="flex h-56 items-center justify-center rounded-xl border border-dashed border-divider bg-paper/40 px-6 text-center text-[12.5px] text-text-muted" role="status">
        {t("empty")}
      </p>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <ul className="flex flex-wrap items-center gap-1.5" aria-label={t("legend")}>
          {ACTIVITY_SERIES.map((series) => {
            const isVisible = !hidden.has(series);
            return (
              <li key={series}>
                <button
                  type="button"
                  aria-pressed={isVisible}
                  onClick={() => toggle(series)}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11.5px] font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
                    isVisible
                      ? "border-divider bg-bg-surface text-text-body"
                      : "border-transparent bg-paper text-text-muted line-through"
                  }`}
                >
                  <svg width="16" height="8" viewBox="0 0 16 8" aria-hidden="true">
                    <line
                      x1="0" y1="4" x2="16" y2="4"
                      stroke={SERIES_STROKE[series]}
                      strokeWidth="2.5"
                      strokeDasharray={SERIES_DASH[series]}
                      strokeLinecap="round"
                      opacity={isVisible ? 1 : 0.4}
                    />
                  </svg>
                  {t(`series.${series}`)}
                  <span className="tabular-nums text-text-muted">{numberFormat.format(totals[series])}</span>
                </button>
              </li>
            );
          })}
        </ul>
        <button
          type="button"
          aria-pressed={showTable}
          onClick={() => setShowTable((value) => !value)}
          className="ms-auto inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11.5px] font-semibold text-text-muted transition hover:bg-paper hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          <Table2 className="h-3.5 w-3.5" aria-hidden="true" />
          {showTable ? t("hideTable") : t("showTable")}
        </button>
      </div>

      <p className="mt-2 text-[11.5px] text-text-muted" aria-live="polite">{summary}</p>

      <div ref={containerRef} className="relative mt-1 min-w-0" onPointerLeave={() => setReadout(null)}>
        <svg
          width="100%"
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={t("chartLabel")}
          aria-describedby={`${id}-desc`}
          data-testid="search-activity-chart"
        >
          <desc id={`${id}-desc`}>{summary}</desc>
          <defs>
            <linearGradient id={`${id}-fill`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={SERIES_STROKE.searches} stopOpacity="0.12" />
              <stop offset="100%" stopColor={SERIES_STROKE.searches} stopOpacity="0" />
            </linearGradient>
          </defs>

          {geometry.ticks.map((tick, index) => (
            <g key={tick.value} aria-hidden="true">
              <line
                x1={geometry.left} x2={width - geometry.right} y1={tick.y} y2={tick.y}
                stroke={index === 0 ? "var(--dash-chart-baseline)" : "var(--dash-chart-grid)"}
                strokeWidth="1"
              />
              <text
                x={geometry.left - 8} y={tick.y} textAnchor="end" dominantBaseline="middle"
                fill="var(--dash-chart-axis)" fontSize="10"
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                {numberFormat.format(Math.round(tick.value))}
              </text>
            </g>
          ))}

          {active !== null && (
            <line
              x1={x(active)} x2={x(active)} y1={geometry.top} y2={plotBottom}
              stroke="var(--dash-chart-crosshair)" strokeWidth="1" aria-hidden="true"
              data-testid="search-activity-crosshair"
            />
          )}

          {visible.map((series) => {
            const coordinates = points.map((point, index) => ({ x: x(index), y: geometry.y(point[series]) }));
            return (
              <g key={series}>
                {series === "searches" && coordinates.length > 1 && (
                  <path d={monotoneAreaPath(coordinates, geometry.y(0))} fill={`url(#${id}-fill)`} pointerEvents="none" />
                )}
                <path
                  d={monotonePath(coordinates)}
                  fill="none"
                  stroke={SERIES_STROKE[series]}
                  strokeWidth="2"
                  strokeDasharray={visible.length > 1 ? SERIES_DASH[series] : undefined}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                  pointerEvents="none"
                  data-testid={`series-${series}`}
                />
                {active !== null && (
                  <circle
                    cx={x(active)} cy={geometry.y(points[active][series])} r="4.5"
                    fill={SERIES_STROKE[series]} stroke="var(--dash-surface)" strokeWidth="2"
                    paintOrder="stroke" pointerEvents="none"
                  />
                )}
              </g>
            );
          })}

          <rect
            x={geometry.left} y={geometry.top}
            width={geometry.innerWidth} height={Math.max(1, plotBottom - geometry.top)}
            fill="transparent"
            data-testid="search-activity-surface"
            onPointerMove={(event) => {
              const index = readPointer(event);
              setReadout(index === null ? null : { index });
            }}
            onPointerLeave={() => setReadout(null)}
          />

          {points.map((point, index) =>
            index % labelEvery === 0 || index === points.length - 1 ? (
              <text
                key={point.date}
                x={x(index)} y={height - 8} textAnchor="middle"
                fill="var(--dash-chart-axis)" fontSize="10"
                fontWeight={index === active ? 700 : 400}
                aria-hidden="true"
              >
                {formatBucket(point.date)}
              </text>
            ) : null,
          )}
        </svg>

        {active !== null && (
          <div
            role="tooltip"
            className="pointer-events-none absolute z-20 w-max max-w-64 rounded-xl bg-[var(--dash-ink)] px-3 py-2 shadow-xl ring-1 ring-white/10"
            style={{
              left: x(active),
              top: Math.max(4, geometry.top),
              transform: `translate(${x(active) > width / 2 ? "calc(-100% + 8px)" : "-8px"}, 0)`,
            }}
          >
            <p className="text-[10.5px] font-semibold uppercase tracking-wide text-white/55">
              {formatBucket(points[active].date)}
            </p>
            <ul className="mt-1 space-y-1">
              {visible.map((series) => (
                <li key={series} className="flex items-center gap-2 text-[11.5px] leading-4">
                  <svg width="14" height="8" viewBox="0 0 14 8" aria-hidden="true" className="shrink-0">
                    <line x1="0" y1="4" x2="14" y2="4" stroke={SERIES_STROKE[series]} strokeWidth="2.5" strokeDasharray={SERIES_DASH[series]} strokeLinecap="round" />
                  </svg>
                  <span className="min-w-0 flex-1 truncate text-white/70">{t(`series.${series}`)}</span>
                  <span className="shrink-0 font-bold tabular-nums text-white">
                    {numberFormat.format(points[active][series])}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {showTable && (
        <div className="mt-3 max-h-72 overflow-auto rounded-xl border border-divider" tabIndex={0}>
          <table className="w-full min-w-[420px] text-[11.5px]">
            <caption className="sr-only">{t("tableCaption")}</caption>
            <thead className="sticky top-0 bg-paper">
              <tr>
                <th scope="col" className="px-3 py-2 text-start font-bold text-text-muted">{t("colDate")}</th>
                {ACTIVITY_SERIES.map((series) => (
                  <th key={series} scope="col" className="px-3 py-2 text-end font-bold text-text-muted">
                    {t(`series.${series}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {points.map((point) => (
                <tr key={point.date} className="border-t border-divider">
                  <th scope="row" className="px-3 py-1.5 text-start font-semibold text-text-body">
                    {formatBucket(point.date)}
                  </th>
                  {ACTIVITY_SERIES.map((series) => (
                    <td key={series} className="px-3 py-1.5 text-end tabular-nums text-text-body">
                      {numberFormat.format(point[series])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

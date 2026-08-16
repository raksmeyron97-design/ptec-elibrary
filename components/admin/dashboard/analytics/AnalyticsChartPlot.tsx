"use client";

import { useId, useRef, useState, type KeyboardEvent } from "react";
import type { DashboardMetric } from "@/lib/admin/dashboard-shared";
import { ANALYTICS_LIMITS } from "@/lib/admin/engagement-breakdown";
import {
  createChartGeometry,
  monotoneAreaPath,
  monotonePath,
  visiblePointIndexes,
  type ChartCoordinate,
} from "./chart-math";
import {
  ANALYTICS_CHART_TOKENS,
  METRIC_CHART_STYLE,
  type ChartMarkerShape,
} from "./chart-tokens";

export type AnalyticsPlotPoint = { date: string; value: number };
export type AnalyticsPlotSeries = {
  id: string;
  metric: DashboardMetric;
  label: string;
  points: AnalyticsPlotPoint[];
  comparison?: boolean;
};
export type AnalyticsPlotAnnotation = { date: string; label: string };

type ActivePoint = { seriesId: string; pointIndex: number };

function Marker({ shape, x, y, color }: { shape: ChartMarkerShape; x: number; y: number; color: string }) {
  if (shape === "square") return <rect x={x - 3} y={y - 3} width="6" height="6" rx="1" fill={color} />;
  if (shape === "diamond") {
    return <path d={`M${x},${y - 4} L${x + 4},${y} L${x},${y + 4} L${x - 4},${y} Z`} fill={color} />;
  }
  if (shape === "triangle") {
    return <path d={`M${x},${y - 4} L${x + 4},${y + 3} L${x - 4},${y + 3} Z`} fill={color} />;
  }
  return <circle cx={x} cy={y} r="3.25" fill={color} />;
}

export function AnalyticsChartPlot({
  width,
  height,
  series,
  annotations = [],
  selectedBucket,
  label,
  description,
  formatBucket,
  formatValue = (value) => String(value),
  pointLabel,
  onSelectPoint,
}: {
  width: number;
  height: number;
  series: AnalyticsPlotSeries[];
  annotations?: AnalyticsPlotAnnotation[];
  selectedBucket: string | null;
  label: string;
  description: string;
  formatBucket: (bucket: string) => string;
  formatValue?: (value: number) => string;
  pointLabel: (input: { date: string; value: number; series: string }) => string;
  onSelectPoint?: (input: { bucket: string; metric: DashboardMetric }) => void;
}) {
  const id = useId();
  const [activePoint, setActivePoint] = useState<ActivePoint | null>(null);
  const pointRefs = useRef(new Map<string, SVGGElement>());
  const buckets = Array.from(new Set(series.flatMap((item) => item.points.map((point) => point.date)))).sort();
  const bucketIndex = new Map(buckets.map((bucket, index) => [bucket, index]));
  const maximum = Math.max(0, ...series.flatMap((item) => item.points.map((point) => point.value)));
  const geometry = createChartGeometry({ width, height, maximum });
  const coordinates = (item: AnalyticsPlotSeries): ChartCoordinate[] =>
    item.points
      .map((point) => ({
        x: geometry.x(bucketIndex.get(point.date) ?? 0, buckets.length),
        y: geometry.y(point.value),
      }))
      .sort((a, b) => a.x - b.x);
  const selectedIndex = selectedBucket ? bucketIndex.get(selectedBucket) : undefined;
  const labelEvery = Math.max(1, Math.ceil(buckets.length / Math.max(2, Math.floor(geometry.innerWidth / 82))));
  const interactiveIndexes = new Map(
    series
      .filter((item) => !item.comparison)
      .map((item) => [item.id, visiblePointIndexes(item.points.length, ANALYTICS_LIMITS.maxVisibleChartPoints)]),
  );

  const selectedPoint = selectedBucket
    ? series.flatMap((item) =>
        item.comparison
          ? []
          : item.points.map((point, pointIndex) => ({ item, point, pointIndex })),
      ).find(({ point }) => point.date === selectedBucket)
    : undefined;
  const activeSeries = activePoint ? series.find((item) => item.id === activePoint.seriesId) : undefined;
  const activeDatum = activeSeries && activePoint ? activeSeries.points[activePoint.pointIndex] : undefined;
  const tooltip = activeSeries && activeDatum && activePoint
    ? { item: activeSeries, point: activeDatum, pointIndex: activePoint.pointIndex }
    : selectedPoint;
  const tooltipX = tooltip
    ? geometry.x(bucketIndex.get(tooltip.point.date) ?? 0, buckets.length)
    : 0;
  const tooltipY = tooltip ? geometry.y(tooltip.point.value) : 0;
  const tooltipText = tooltip
    ? pointLabel({ date: tooltip.point.date, value: tooltip.point.value, series: tooltip.item.label })
    : "";
  const tooltipId = `${id}-tooltip`;

  const activate = (
    event: KeyboardEvent<SVGGElement>,
    item: AnalyticsPlotSeries,
    pointIndex: number,
  ) => {
    const point = item.points[pointIndex];
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelectPoint?.({ bucket: point.date, metric: item.metric });
      return;
    }
    if (event.key === "Escape") {
      setActivePoint(null);
      return;
    }
    const indexes = interactiveIndexes.get(item.id) ?? [];
    const position = indexes.indexOf(pointIndex);
    let targetPosition: number | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") targetPosition = Math.min(indexes.length - 1, position + 1);
    if (event.key === "ArrowLeft" || event.key === "ArrowUp") targetPosition = Math.max(0, position - 1);
    if (event.key === "Home") targetPosition = 0;
    if (event.key === "End") targetPosition = indexes.length - 1;
    if (targetPosition === null) return;
    event.preventDefault();
    const targetIndex = indexes[targetPosition];
    pointRefs.current.get(`${item.id}:${targetIndex}`)?.focus();
    setActivePoint({ seriesId: item.id, pointIndex: targetIndex });
  };

  return (
    <div className="relative" onPointerLeave={() => setActivePoint(null)}>
      <svg
        width="100%"
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="group"
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-description`}
        data-testid="analytics-chart-plot"
      >
        <title id={`${id}-title`}>{label}</title>
        <desc id={`${id}-description`}>{description}</desc>
        <defs>
          {series.filter((item) => !item.comparison).map((item) => (
            <linearGradient key={item.id} id={`${id}-${item.id}-area`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={METRIC_CHART_STYLE[item.metric].stroke} stopOpacity="0.14" />
              <stop offset="100%" stopColor={METRIC_CHART_STYLE[item.metric].stroke} stopOpacity="0" />
            </linearGradient>
          ))}
        </defs>

        {geometry.ticks.map((tick, index) => (
          <g key={tick.value} aria-hidden="true">
            <line
              x1={geometry.left}
              x2={width - geometry.right}
              y1={tick.y}
              y2={tick.y}
              stroke={ANALYTICS_CHART_TOKENS.grid}
              strokeWidth={index === 0 ? 1 : 0.75}
              strokeDasharray={index === 0 ? undefined : "3 5"}
            />
            <text
              x={geometry.left - 8}
              y={tick.y}
              textAnchor="end"
              dominantBaseline="middle"
              fill={ANALYTICS_CHART_TOKENS.axis}
              fontSize="10"
            >
              {formatValue(tick.value)}
            </text>
          </g>
        ))}

        {annotations.map((annotation) => {
          const index = bucketIndex.get(annotation.date);
          if (index === undefined) return null;
          const x = geometry.x(index, buckets.length);
          return (
            <g key={`${annotation.date}-${annotation.label}`} aria-label={annotation.label}>
              <line
                x1={x}
                x2={x}
                y1={geometry.top}
                y2={height - geometry.bottom}
                stroke={ANALYTICS_CHART_TOKENS.selection}
                strokeWidth="1"
                strokeDasharray="3 4"
              />
              <circle cx={x} cy={geometry.top} r="3.5" fill={ANALYTICS_CHART_TOKENS.selection}>
                <title>{annotation.label}</title>
              </circle>
            </g>
          );
        })}

        {selectedIndex !== undefined && (
          <line
            x1={geometry.x(selectedIndex, buckets.length)}
            x2={geometry.x(selectedIndex, buckets.length)}
            y1={geometry.top}
            y2={height - geometry.bottom}
            stroke={ANALYTICS_CHART_TOKENS.selection}
            strokeWidth="1.5"
            strokeDasharray="3 3"
            aria-hidden="true"
          />
        )}

        {series.map((item, seriesIndex) => {
          const points = coordinates(item);
          const style = METRIC_CHART_STYLE[item.metric];
          const mainCurrent = !item.comparison && seriesIndex === 0;
          return (
            <g key={item.id} data-series={item.id}>
              {mainCurrent && points.length > 0 && (
                <path
                  d={monotoneAreaPath(points, geometry.y(0))}
                  fill={`url(#${id}-${item.id}-area)`}
                  pointerEvents="none"
                />
              )}
              <path
                d={monotonePath(points)}
                fill="none"
                stroke={style.stroke}
                strokeWidth={item.comparison
                  ? ANALYTICS_CHART_TOKENS.comparisonLineWidth
                  : ANALYTICS_CHART_TOKENS.lineWidth}
                strokeOpacity={item.comparison ? ANALYTICS_CHART_TOKENS.comparisonOpacity : 1}
                strokeDasharray={item.comparison ? ANALYTICS_CHART_TOKENS.comparisonDash : style.dash}
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
                data-testid={`series-path-${item.id}`}
              />
              {!item.comparison && (interactiveIndexes.get(item.id) ?? []).map((pointIndex) => {
                const point = item.points[pointIndex];
                const x = geometry.x(bucketIndex.get(point.date) ?? 0, buckets.length);
                const y = geometry.y(point.value);
                const ariaLabel = pointLabel({ date: point.date, value: point.value, series: item.label });
                const described = tooltip?.item.id === item.id && tooltip.pointIndex === pointIndex;
                return (
                  <g
                    key={`${item.id}-${point.date}`}
                    ref={(node) => {
                      if (node) pointRefs.current.set(`${item.id}:${pointIndex}`, node);
                      else pointRefs.current.delete(`${item.id}:${pointIndex}`);
                    }}
                    role="button"
                    tabIndex={0}
                    aria-label={ariaLabel}
                    aria-describedby={described ? tooltipId : undefined}
                    aria-pressed={selectedBucket === point.date}
                    onClick={() => onSelectPoint?.({ bucket: point.date, metric: item.metric })}
                    onKeyDown={(event) => activate(event, item, pointIndex)}
                    onFocus={() => setActivePoint({ seriesId: item.id, pointIndex })}
                    onBlur={(event) => {
                      if (!event.currentTarget.ownerSVGElement?.contains(event.relatedTarget as Node | null)) {
                        setActivePoint(null);
                      }
                    }}
                    onPointerEnter={() => setActivePoint({ seriesId: item.id, pointIndex })}
                    onPointerDown={() => setActivePoint({ seriesId: item.id, pointIndex })}
                    className="cursor-pointer focus:outline-none [&:focus-visible_.analytics-focus]:opacity-100"
                  >
                    <circle cx={x} cy={y} r="12" fill="transparent" />
                    <circle
                      className="analytics-focus opacity-0"
                      cx={x}
                      cy={y}
                      r="7"
                      fill="none"
                      stroke={ANALYTICS_CHART_TOKENS.focus}
                      strokeWidth="2"
                    />
                    <Marker shape={style.marker} x={x} y={y} color={style.stroke} />
                  </g>
                );
              })}
            </g>
          );
        })}

        {buckets.map((bucket, index) =>
          index % labelEvery === 0 || index === buckets.length - 1 ? (
            <text
              key={bucket}
              x={geometry.x(index, buckets.length)}
              y={height - 8}
              textAnchor="middle"
              fill={ANALYTICS_CHART_TOKENS.axis}
              fontSize="10"
              aria-hidden="true"
            >
              {formatBucket(bucket)}
            </text>
          ) : null,
        )}
      </svg>
      {tooltip && (
        <div
          id={tooltipId}
          role="tooltip"
          className="pointer-events-none absolute z-[var(--dash-z-popover)] max-w-56 rounded-lg bg-[var(--dash-ink)] px-2.5 py-2 text-[11px] font-semibold leading-4 text-white shadow-lg"
          style={{
            left: Math.min(Math.max(76, tooltipX), Math.max(76, width - 76)),
            top: Math.max(8, tooltipY - 10),
            transform: "translate(-50%, -100%)",
          }}
        >
          {tooltipText}
        </div>
      )}
    </div>
  );
}

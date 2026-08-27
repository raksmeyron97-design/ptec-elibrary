"use client";

import { useId, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
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
type ReadoutRow = { id: string; label: string; value: number; metric: DashboardMetric; comparison: boolean };

const RING = ANALYTICS_CHART_TOKENS.markerRing;
const RING_W = ANALYTICS_CHART_TOKENS.markerRingWidth;

/**
 * A data marker: the shape carries the series (so identity survives without
 * colour) and the ring is the page colour, which is what keeps two markers
 * legible where they overlap — a coloured stroke there would be ink that is
 * not data.
 */
function Marker({
  shape,
  x,
  y,
  color,
  emphasis = false,
}: {
  shape: ChartMarkerShape;
  x: number;
  y: number;
  color: string;
  emphasis?: boolean;
}) {
  const scale = emphasis ? 1.25 : 1;
  const common = { fill: color, stroke: RING, strokeWidth: RING_W, paintOrder: "stroke" as const };
  if (shape === "square") {
    const s = 3.2 * scale;
    return <rect x={x - s} y={y - s} width={s * 2} height={s * 2} rx="1" {...common} />;
  }
  if (shape === "diamond") {
    const s = 4.4 * scale;
    return <path d={`M${x},${y - s} L${x + s},${y} L${x},${y + s} L${x - s},${y} Z`} {...common} />;
  }
  if (shape === "triangle") {
    const s = 4.4 * scale;
    return <path d={`M${x},${y - s} L${x + s},${y + s * 0.78} L${x - s},${y + s * 0.78} Z`} {...common} />;
  }
  return <circle cx={x} cy={y} r={ANALYTICS_CHART_TOKENS.markerRadius * scale} {...common} />;
}

/** A short stroke of the series colour — the tooltip/legend key for a line. */
function LineKey({ color, dash }: { color: string; dash?: string }) {
  return (
    <svg width="14" height="8" viewBox="0 0 14 8" aria-hidden="true" className="shrink-0">
      <line x1="0" y1="4" x2="14" y2="4" stroke={color} strokeWidth="2.5" strokeDasharray={dash} strokeLinecap="round" />
    </svg>
  );
}

/**
 * The engagement plot.
 *
 * Reading a value is a *crosshair* interaction, not a "land on the dot"
 * interaction: the pointer only has to be at the right X, an overlay finds the
 * nearest bucket, and one readout names every series there. Aiming at a 4px
 * marker was the previous contract, and it is the classic way a chart ends up
 * technically interactive and practically unusable.
 *
 * Markers are therefore drawn only where they carry meaning — the bucket being
 * read, the selected bucket, and each series' final point — instead of a comb
 * of dots across every sampled position. The invisible per-point hit targets
 * stay, because they are what makes the plot keyboard-navigable (arrow keys,
 * Home/End, Enter to drill in), and keyboard focus produces exactly the same
 * readout as hover.
 */
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
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const pointRefs = useRef(new Map<string, SVGGElement>());
  const buckets = Array.from(new Set(series.flatMap((item) => item.points.map((point) => point.date)))).sort();
  const bucketIndex = new Map(buckets.map((bucket, index) => [bucket, index]));
  const maximum = Math.max(0, ...series.flatMap((item) => item.points.map((point) => point.value)));
  const geometry = createChartGeometry({ width, height, maximum });
  const plotBottom = height - geometry.bottom;
  const metricSeries = series.filter((item) => !item.comparison);
  /** A lone line has nothing to be distinguished from, so it is never dashed. */
  const multiSeries = metricSeries.length > 1;
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
    metricSeries.map((item) => [item.id, visiblePointIndexes(item.points.length, ANALYTICS_LIMITS.maxVisibleChartPoints)]),
  );
  const annotationByBucket = new Map(annotations.map((annotation) => [annotation.date, annotation]));

  // ── What the readout is currently describing ───────────────────────────
  // Pointer hover wins, then keyboard focus, then the pinned selection — one
  // index, so hover and focus can never show two different things.
  const focusIndex = activePoint
    ? bucketIndex.get(series.find((item) => item.id === activePoint.seriesId)?.points[activePoint.pointIndex]?.date ?? "")
    : undefined;
  const readoutIndex = hoverIndex ?? focusIndex ?? selectedIndex ?? null;
  const readoutBucket = readoutIndex === null ? null : buckets[readoutIndex] ?? null;
  const readoutRows: ReadoutRow[] = readoutBucket
    ? series.flatMap((item) => {
        const point = item.points.find((candidate) => candidate.date === readoutBucket);
        return point
          ? [{
              id: item.id,
              label: item.label,
              value: point.value,
              metric: item.metric,
              comparison: Boolean(item.comparison),
            }]
          : [];
      })
    : [];
  const readoutX = readoutIndex === null ? 0 : geometry.x(readoutIndex, buckets.length);
  const readoutTopY = readoutRows.length > 0
    ? Math.min(...readoutRows.map((row) => geometry.y(row.value)))
    : geometry.top;
  const tooltipId = `${id}-tooltip`;
  // Flip the readout at the edges instead of clamping it inward — a clamped
  // tooltip detaches from the crosshair it belongs to.
  const edge = Math.min(160, geometry.innerWidth / 2);
  const anchor = readoutX < geometry.left + edge ? "start" : readoutX > width - geometry.right - edge ? "end" : "center";
  const anchorTransform = anchor === "center" ? "-50%" : anchor === "start" ? "-8px" : "calc(-100% + 8px)";
  const below = readoutTopY < 108;

  /** Pointer position → nearest bucket, in viewBox units (the SVG is scaled). */
  const readPointer = (event: PointerEvent<SVGRectElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    if (box.width === 0 || box.height === 0 || buckets.length === 0) return null;
    const local = ((event.clientX - box.left) / box.width) * geometry.innerWidth;
    const step = buckets.length > 1 ? geometry.innerWidth / (buckets.length - 1) : geometry.innerWidth;
    const index = Math.min(buckets.length - 1, Math.max(0, Math.round(local / step)));
    const pointerY = ((event.clientY - box.top) / box.height) * (plotBottom - geometry.top) + geometry.top;
    return { index, pointerY };
  };

  /** Clicking the plot drills into the series whose point is nearest the pointer. */
  const selectNearest = (event: PointerEvent<SVGRectElement>) => {
    const hit = readPointer(event);
    if (!hit || !onSelectPoint) return;
    const bucket = buckets[hit.index];
    const candidates = metricSeries
      .map((item) => {
        const point = item.points.find((candidate) => candidate.date === bucket);
        return point ? { metric: item.metric, distance: Math.abs(geometry.y(point.value) - hit.pointerY) } : null;
      })
      .filter((candidate): candidate is { metric: DashboardMetric; distance: number } => candidate !== null)
      .sort((a, b) => a.distance - b.distance);
    if (candidates.length > 0) onSelectPoint({ bucket, metric: candidates[0].metric });
  };

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
    <div className="relative" onPointerLeave={() => { setHoverIndex(null); setActivePoint(null); }}>
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
          {metricSeries.map((item) => (
            <linearGradient key={item.id} id={`${id}-${item.id}-area`} x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="0%"
                stopColor={METRIC_CHART_STYLE[item.metric].stroke}
                stopOpacity={ANALYTICS_CHART_TOKENS.areaOpacity}
              />
              <stop offset="100%" stopColor={METRIC_CHART_STYLE[item.metric].stroke} stopOpacity="0" />
            </linearGradient>
          ))}
        </defs>

        {/* Ruler: solid hairlines, the zero line one step stronger. */}
        {geometry.ticks.map((tick, index) => (
          <g key={tick.value} aria-hidden="true">
            <line
              x1={geometry.left}
              x2={width - geometry.right}
              y1={tick.y}
              y2={tick.y}
              stroke={index === 0 ? ANALYTICS_CHART_TOKENS.baseline : ANALYTICS_CHART_TOKENS.grid}
              strokeWidth="1"
            />
            <text
              x={geometry.left - 8}
              y={tick.y}
              textAnchor="end"
              dominantBaseline="middle"
              fill={ANALYTICS_CHART_TOKENS.axis}
              fontSize="10"
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {formatValue(tick.value)}
            </text>
          </g>
        ))}

        {/* Publish markers: a quiet gold rule plus a cap on the top edge. The
            count itself is carried in the readout, so this only has to say
            "something shipped here", not shout it. */}
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
                y2={plotBottom}
                stroke={ANALYTICS_CHART_TOKENS.annotation}
                strokeWidth="1"
                strokeOpacity="0.4"
              />
              <path
                d={`M${x},${geometry.top - 5} L${x + 4},${geometry.top} L${x},${geometry.top + 5} L${x - 4},${geometry.top} Z`}
                fill={ANALYTICS_CHART_TOKENS.annotation}
              >
                <title>{annotation.label}</title>
              </path>
            </g>
          );
        })}

        {/* Pinned selection stays dashed — it is a bookmark, not a reading. */}
        {selectedIndex !== undefined && (
          <line
            x1={geometry.x(selectedIndex, buckets.length)}
            x2={geometry.x(selectedIndex, buckets.length)}
            y1={geometry.top}
            y2={plotBottom}
            stroke={ANALYTICS_CHART_TOKENS.selection}
            strokeWidth="1.5"
            strokeDasharray="3 3"
            aria-hidden="true"
          />
        )}

        {/* Crosshair for the bucket being read. */}
        {readoutIndex !== null && (
          <line
            x1={readoutX}
            x2={readoutX}
            y1={geometry.top}
            y2={plotBottom}
            stroke={ANALYTICS_CHART_TOKENS.crosshair}
            strokeWidth="1"
            aria-hidden="true"
            data-testid="analytics-chart-crosshair"
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
                strokeDasharray={item.comparison
                  ? ANALYTICS_CHART_TOKENS.comparisonDash
                  : multiSeries ? style.dash : undefined}
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
                pointerEvents="none"
                data-testid={`series-path-${item.id}`}
              />
            </g>
          );
        })}

        {/* Marks worth drawing: each series' last value (where the line ends),
            the pinned bucket, and the bucket under the crosshair. */}
        {metricSeries.map((item) => {
          const last = item.points.at(-1);
          const shown = new Map<string, AnalyticsPlotPoint>();
          if (last) shown.set(last.date, last);
          for (const bucket of [selectedBucket, readoutBucket]) {
            if (!bucket) continue;
            const point = item.points.find((candidate) => candidate.date === bucket);
            if (point) shown.set(point.date, point);
          }
          return [...shown.values()].map((point) => (
            <Marker
              key={`${item.id}-mark-${point.date}`}
              shape={METRIC_CHART_STYLE[item.metric].marker}
              x={geometry.x(bucketIndex.get(point.date) ?? 0, buckets.length)}
              y={geometry.y(point.value)}
              color={METRIC_CHART_STYLE[item.metric].stroke}
              emphasis={point.date === readoutBucket || point.date === selectedBucket}
            />
          ));
        })}

        {/* Nearest-X hit layer. The reader aims at a date, never at a mark. */}
        <rect
          x={geometry.left - geometry.innerWidth * 0}
          y={geometry.top}
          width={geometry.innerWidth}
          height={Math.max(1, plotBottom - geometry.top)}
          fill="transparent"
          className="cursor-pointer"
          data-testid="analytics-chart-surface"
          onPointerMove={(event) => setHoverIndex(readPointer(event)?.index ?? null)}
          onPointerDown={(event) => {
            setHoverIndex(readPointer(event)?.index ?? null);
            selectNearest(event);
          }}
          onPointerLeave={() => setHoverIndex(null)}
        />

        {/* Keyboard surface: one focusable target per sampled point, invisible
            and pointer-transparent so it never competes with the hit layer
            above. This is the whole reason arrow-key navigation works. */}
        {metricSeries.map((item) =>
          (interactiveIndexes.get(item.id) ?? []).map((pointIndex) => {
            const point = item.points[pointIndex];
            const x = geometry.x(bucketIndex.get(point.date) ?? 0, buckets.length);
            const y = geometry.y(point.value);
            const ariaLabel = pointLabel({ date: point.date, value: point.value, series: item.label });
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
                aria-describedby={readoutBucket === point.date ? tooltipId : undefined}
                aria-pressed={selectedBucket === point.date}
                onClick={() => onSelectPoint?.({ bucket: point.date, metric: item.metric })}
                onKeyDown={(event) => activate(event, item, pointIndex)}
                onFocus={() => setActivePoint({ seriesId: item.id, pointIndex })}
                onBlur={(event) => {
                  if (!event.currentTarget.ownerSVGElement?.contains(event.relatedTarget as Node | null)) {
                    setActivePoint(null);
                  }
                }}
                className="focus:outline-none [&:focus-visible_.analytics-focus]:opacity-100"
                style={{ pointerEvents: "none" }}
              >
                <circle cx={x} cy={y} r="12" fill="transparent" />
                <circle
                  className="analytics-focus opacity-0"
                  cx={x}
                  cy={y}
                  r="8"
                  fill="none"
                  stroke={ANALYTICS_CHART_TOKENS.focus}
                  strokeWidth="2"
                />
              </g>
            );
          }),
        )}

        {buckets.map((bucket, index) =>
          index % labelEvery === 0 || index === buckets.length - 1 ? (
            <text
              key={bucket}
              x={geometry.x(index, buckets.length)}
              y={height - 8}
              textAnchor="middle"
              fill={ANALYTICS_CHART_TOKENS.axis}
              fontSize="10"
              fontWeight={index === readoutIndex ? 700 : 400}
              aria-hidden="true"
            >
              {formatBucket(bucket)}
            </text>
          ) : null,
        )}
      </svg>

      {/* One readout for every series at that X — the reader never has to land
          on a line to get its number. Values lead, names follow: here you
          already know the series and want the figure. */}
      {readoutBucket && readoutRows.length > 0 && (
        <div
          id={tooltipId}
          role="tooltip"
          className="pointer-events-none absolute z-[var(--dash-z-popover)] w-max max-w-64 rounded-xl bg-[var(--dash-ink)] px-3 py-2 shadow-xl ring-1 ring-white/10"
          style={{
            left: readoutX,
            top: below ? readoutTopY + 16 : Math.max(4, readoutTopY - 14),
            transform: `translate(${anchorTransform}, ${below ? "0" : "-100%"})`,
          }}
        >
          <p className="text-[10.5px] font-semibold uppercase tracking-wide text-white/55">
            {formatBucket(readoutBucket)}
          </p>
          <ul className="mt-1 space-y-1">
            {readoutRows.map((row) => (
              <li key={row.id} className="flex items-center gap-2 text-[11.5px] leading-4">
                <LineKey
                  color={METRIC_CHART_STYLE[row.metric].stroke}
                  dash={row.comparison
                    ? ANALYTICS_CHART_TOKENS.comparisonDash
                    : multiSeries ? METRIC_CHART_STYLE[row.metric].dash : undefined}
                />
                <span className="min-w-0 flex-1 truncate text-white/70">{row.label}</span>
                <span className="shrink-0 font-bold tabular-nums text-white">{formatValue(row.value)}</span>
              </li>
            ))}
          </ul>
          {annotationByBucket.has(readoutBucket) && (
            <p className="mt-1.5 border-t border-white/15 pt-1.5 text-[10.5px] leading-4 text-[var(--ptec-accent)]">
              {annotationByBucket.get(readoutBucket)?.label}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

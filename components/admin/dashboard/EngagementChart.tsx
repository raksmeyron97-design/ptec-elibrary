"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ChevronDown, Loader2, X } from "lucide-react";
import type { TrendPoint } from "@/lib/admin/dashboard";
import {
  aggregateSeries,
  autoGrain,
  CHART_GRAINS,
  type ChartGrain,
  type DashboardMetric,
} from "@/lib/admin/dashboard-shared";
import { useContainerWidth, formatBucket, niceMax4, AXIS_TEXT, ChartGrid } from "./chart-utils";
import { useMetricSelection } from "./MetricSelection";

/** Shape returned by /api/admin/dashboard/day-breakdown. */
type DrillData = {
  bucket: string;
  total: number;
  items: { type: string; id: string; title: string; views: number; editHref: string }[];
};

type SeriesKey = DashboardMetric;

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

/** Unique-visitor buckets are distinct counts — summing them across days would
 *  double-count returning readers, so weekly/monthly rollups take the peak. */
const AGGREGATION_MODE: Record<SeriesKey, "sum" | "max"> = {
  views: "sum",
  visitors: "max",
  readerOpens: "sum",
  downloads: "sum",
};

export type EngagementSeries = {
  views: TrendPoint[];
  visitors: TrendPoint[];
  readerOpens: TrendPoint[] | null;
  downloads: TrendPoint[];
};

type Annotation = { date: string; count: number; titles?: string[] };

/** Reader opens are nullable while the event is still collecting. */
const rawSeriesOf = (k: SeriesKey, src: EngagementSeries): TrendPoint[] =>
  (k === "readerOpens" ? (src.readerOpens ?? []) : src[k]) as TrendPoint[];

/**
 * The dashboard's main analytical workspace.
 *
 * The metric shown is the one selected in the Executive Pulse (shared through
 * MetricSelection), so the KPI row and the chart can never disagree. The
 * toolbar carries only the controls an administrator reaches for constantly —
 * metric, aggregation, comparison — and everything else (publish markers,
 * multi-series compare, the data table) lives behind "More".
 *
 * Long ranges are rolled up to weeks or months rather than rendered as a comb
 * of unreadable daily ticks; the roll-up is honest about distinct counts.
 * Publish markers open a popover naming what was published and how engagement
 * moved *after* it — never a causal claim.
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
  annotations: Annotation[];
  granularity: "hour" | "day";
  compare: boolean;
}) {
  const t = useTranslations("adminDashboard.engagement");
  const chartId = useId();
  const [ref, width] = useContainerWidth();
  const { metric, selectMetric } = useMetricSelection();

  const defaultGrain = autoGrain(series.views.length, granularity);
  const [grain, setGrain] = useState<ChartGrain>(defaultGrain);
  const [compareAll, setCompareAll] = useState(false);
  const [showAnnotations, setShowAnnotations] = useState(true);
  const [moreOpen, setMoreOpen] = useState(false);
  const [showTable, setShowTable] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  // ── Point drill-down (that bucket's top viewed titles) ──
  const [drillBucket, setDrillBucket] = useState<string | null>(null);
  const [drillCache, setDrillCache] = useState<Map<string, DrillData>>(new Map());
  /** Errors are stored with the bucket they belong to, so switching bucket
   *  clears the message without a synchronous setState inside the effect. */
  const [drillError, setDrillError] = useState<{ bucket: string; message: string } | null>(null);
  const drillCloseRef = useRef<HTMLButtonElement>(null);
  const [eventBucket, setEventBucket] = useState<string | null>(null);
  const eventCloseRef = useRef<HTMLButtonElement>(null);
  /** Bumped by "retry" so the drill effect re-runs for the same bucket. */
  const [drillRetry, setDrillRetry] = useState(0);

  // Aggregated series only recompute when the data or the grain changes —
  // never on hover, focus or a tooltip open.
  const keys: SeriesKey[] = useMemo(() => ["views", "visitors", "readerOpens", "downloads"], []);
  const available = useMemo(
    () => keys.filter((k) => (k === "readerOpens" ? series.readerOpens !== null : true)),
    [keys, series.readerOpens],
  );
  const activeMetric: SeriesKey = available.includes(metric) ? metric : "views";

  const agg = useMemo(() => {
    const roll = (points: TrendPoint[], k: SeriesKey) =>
      granularity === "hour" ? points : aggregateSeries(points, grain, AGGREGATION_MODE[k]);
    const current = {} as Record<SeriesKey, TrendPoint[]>;
    const previous = {} as Record<SeriesKey, TrendPoint[]>;
    for (const k of keys) {
      current[k] = roll(rawSeriesOf(k, series), k);
      previous[k] = roll(rawSeriesOf(k, prevSeries), k);
    }
    return { current, previous };
  }, [series, prevSeries, grain, granularity, keys]);

  const buckets = agg.current.views.map((p) => p.date);

  // Publish markers follow the same roll-up as the series.
  const annotationByBucket = useMemo(() => {
    const map = new Map<string, Annotation>();
    for (const a of annotations) {
      const key =
        granularity === "hour" || grain === "day"
          ? a.date
          : (aggregateSeries([{ date: a.date, value: 0 }], grain)[0]?.date ?? a.date);
      const existing = map.get(key);
      if (existing) {
        existing.count += a.count;
        existing.titles = [...(existing.titles ?? []), ...(a.titles ?? [])].slice(0, 3);
      } else {
        map.set(key, { date: key, count: a.count, titles: [...(a.titles ?? [])] });
      }
    }
    return map;
  }, [annotations, grain, granularity]);

  /** Selecting a bucket is pure state; the request itself lives in the effect
   *  below, so React cancels an obsolete fetch when the admin moves on. */
  const openDrill = useCallback((bucket: string) => {
    setEventBucket(null);
    setDrillBucket(bucket);
  }, []);

  useEffect(() => {
    if (!drillBucket || drillCache.has(drillBucket)) return;
    const controller = new AbortController();
    fetch(`/api/admin/dashboard/day-breakdown?bucket=${encodeURIComponent(drillBucket)}`, {
      signal: controller.signal,
    })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<DrillData>;
      })
      .then((d) => setDrillCache((prev) => new Map(prev).set(drillBucket, d)))
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setDrillError({ bucket: drillBucket, message: t("drillError") });
      });
    // Aborts on unmount and whenever the selected bucket changes.
    return () => controller.abort();
  }, [drillBucket, drillCache, drillRetry, t]);

  // Loading is derived, never stored: a bucket is loading exactly while it has
  // neither a cached result nor an error of its own.
  const drillErrorMessage = drillBucket && drillError?.bucket === drillBucket ? drillError.message : null;
  const drillLoading = drillBucket !== null && !drillCache.has(drillBucket) && drillErrorMessage === null;

  // Move focus into whichever panel just opened.
  useEffect(() => {
    if (drillBucket) drillCloseRef.current?.focus();
  }, [drillBucket]);
  useEffect(() => {
    if (eventBucket) eventCloseRef.current?.focus();
  }, [eventBucket]);

  useEffect(() => {
    if (!moreOpen) return;
    const onPointer = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMoreOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [moreOpen]);

  // Adaptive height: taller when there is room, never a vast empty box.
  const height = width > 720 ? 240 : width > 480 ? 210 : 180;
  const padLeft = 36;
  const padRight = 10;
  const padTop = 14;
  const padBottom = 24;
  const innerW = Math.max(50, width - padLeft - padRight);
  const innerH = height - padTop - padBottom;

  const drawn: { key: SeriesKey; points: TrendPoint[]; prev: TrendPoint[] | null }[] = compareAll
    ? available.map((k) => ({ key: k, points: agg.current[k], prev: null }))
    : [
        {
          key: activeMetric,
          points: agg.current[activeMetric],
          prev: compare ? agg.previous[activeMetric] : null,
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

  const labelEvery = Math.max(1, Math.ceil(buckets.length / Math.max(3, Math.floor(innerW / 74))));
  const bucketFormat: "hour" | "day" = granularity === "hour" ? "hour" : "day";

  const annotationLabel = (a: Annotation) => {
    const base = t("publishedAnnotation", { count: a.count });
    const titles = a.titles ?? [];
    if (titles.length === 0) return base;
    const suffix = a.count > titles.length ? ", …" : "";
    return `${base}: ${titles.join(", ")}${suffix}`;
  };

  // Summary for the selected metric (single-metric mode).
  const activePoints = agg.current[activeMetric];
  const total = activePoints.reduce((s, p) => s + p.value, 0);
  const avg = activePoints.length > 0 ? Math.round((total / activePoints.length) * 10) / 10 : 0;
  const peak = activePoints.reduce<TrendPoint | null>(
    (best, p) => (p.value > 0 && (!best || p.value > best.value) ? p : best),
    null,
  );
  const prevTotal = compare ? agg.previous[activeMetric].reduce((s, p) => s + p.value, 0) : null;
  const deltaPct =
    prevTotal !== null && prevTotal > 0 ? Math.round(((total - prevTotal) / prevTotal) * 100) : null;

  const srSummary = compareAll
    ? drawn
        .map((s) =>
          t("srSeriesTotal", {
            series: t(`series.${s.key}`),
            total: s.points.reduce((a, p) => a + p.value, 0),
          }),
        )
        .join(" ")
    : t("srSingleSummary", {
        series: t(`series.${activeMetric}`),
        total,
        avg,
        peak: peak ? peak.value : 0,
      });

  const pathOf = (points: TrendPoint[]) =>
    points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(p.value)}`).join(" ");

  const areaOf = (points: TrendPoint[]) => {
    if (points.length === 0) return "";
    const baseline = y(0);
    return `${pathOf(points)} L${x(points.length - 1)},${baseline} L${x(0)},${baseline} Z`;
  };
  const fillId = `${chartId}-fill`;

  /** Engagement in the buckets after a publish marker vs the buckets before —
   *  reported as correlation, never as cause. */
  const eventContext = (bucket: string) => {
    const i = buckets.indexOf(bucket);
    if (i < 0) return null;
    const window = Math.min(3, Math.max(1, Math.floor(buckets.length / 6)));
    const before = activePoints.slice(Math.max(0, i - window), i);
    const after = activePoints.slice(i, i + window);
    const sum = (arr: TrendPoint[]) => arr.reduce((s, p) => s + p.value, 0);
    if (before.length === 0 || after.length === 0) return null;
    const beforeAvg = sum(before) / before.length;
    const afterAvg = sum(after) / after.length;
    if (beforeAvg === 0) return null;
    return { pct: Math.round(((afterAvg - beforeAvg) / beforeAvg) * 100), window };
  };

  const menuItemClass =
    "flex w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-start text-[12.5px] font-medium text-text-body transition-colors hover:bg-paper focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand";

  return (
    <div>
      {/* ── Toolbar: only the controls reached for constantly ── */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <div className="dash-seg" role="group" aria-label={t("metricLabel")}>
          {available.map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={!compareAll && activeMetric === k}
              disabled={compareAll}
              onClick={() => selectMetric(k)}
              className="dash-seg-btn text-[11.5px] disabled:cursor-default disabled:opacity-50"
            >
              {t(`series.${k}`)}
            </button>
          ))}
        </div>

        {granularity === "day" && (
          <div className="dash-seg" role="group" aria-label={t("grainLabel")}>
            {CHART_GRAINS.map((g) => (
              <button
                key={g}
                type="button"
                aria-pressed={grain === g}
                onClick={() => setGrain(g)}
                className="dash-seg-btn text-[11.5px]"
              >
                {t(`grain.${g}`)}
              </button>
            ))}
          </div>
        )}

        <div ref={moreRef} className="relative ms-auto">
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={moreOpen}
            onClick={() => setMoreOpen((v) => !v)}
            className="flex h-8 cursor-pointer items-center gap-1 rounded-[10px] px-2 text-[11.5px] font-medium text-text-muted transition-colors hover:bg-paper hover:text-text-heading focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            {t("more")}
            <ChevronDown className="h-3 w-3" aria-hidden="true" />
          </button>
          {moreOpen && (
            <div
              role="menu"
              aria-label={t("more")}
              className="dash-popover absolute end-0 top-full mt-1 w-60 p-1.5"
            >
              <label className={menuItemClass}>
                <input
                  type="checkbox"
                  checked={showAnnotations}
                  onChange={(e) => setShowAnnotations(e.target.checked)}
                  className="h-3.5 w-3.5 cursor-pointer accent-[#DDB022]"
                />
                {t("annotationsToggle")}
              </label>
              <label className={menuItemClass}>
                <input
                  type="checkbox"
                  checked={compareAll}
                  onChange={(e) => setCompareAll(e.target.checked)}
                  className="h-3.5 w-3.5 cursor-pointer accent-[var(--ptec-brand,#1E3A8A)]"
                />
                {t("compareMetrics")}
              </label>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setShowTable((v) => !v);
                  setMoreOpen(false);
                }}
                className={menuItemClass}
              >
                {showTable ? t("hideTable") : t("showTable")}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Summary line (single-metric mode) or compare legend */}
      {compareAll ? (
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
          {drawn.map((s) => (
            <span key={s.key} className="flex items-center gap-1.5 text-[11.5px] font-medium text-text-body">
              <svg width="18" height="8" aria-hidden="true">
                <line
                  x1="0"
                  y1="4"
                  x2="18"
                  y2="4"
                  stroke={SERIES_COLOR[s.key]}
                  strokeWidth="2"
                  strokeDasharray={SERIES_DASH[s.key]}
                />
              </svg>
              {t(`series.${s.key}`)}
              <span className="tabular-nums text-text-muted">{s.points.reduce((a, p) => a + p.value, 0)}</span>
            </span>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-[12px] text-text-muted">
          {t("summary", {
            total,
            avg,
            peak: peak ? peak.value : 0,
            peakDay: peak ? formatBucket(peak.date, bucketFormat) : "—",
          })}
          {prevTotal !== null && prevTotal > 0 && (
            <span className="ms-1.5">
              {t("summaryPrev", { value: prevTotal })}
              {deltaPct !== null && (
                <span className={`ms-1 font-semibold ${deltaPct >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                  ({deltaPct > 0 ? "+" : ""}
                  {deltaPct}%)
                </span>
              )}
            </span>
          )}
          {grain !== "day" && activeMetric === "visitors" && (
            <span className="ms-1.5 text-text-muted">{t("visitorRollupNote")}</span>
          )}
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

          {!compareAll && drawn[0].points.length > 1 && (
            <path d={areaOf(drawn[0].points)} fill={`url(#${fillId})`} stroke="none" />
          )}

          {showAnnotations &&
            buckets.map((b, i) => {
              const ann = annotationByBucket.get(b);
              return ann ? (
                <g
                  key={`ann-${b}`}
                  role="button"
                  tabIndex={0}
                  aria-label={annotationLabel(ann)}
                  className="cursor-pointer focus:outline-none [&:focus-visible>.ev-focus]:opacity-100"
                  onClick={() => {
                    setDrillBucket(null);
                    setEventBucket(b);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setDrillBucket(null);
                      setEventBucket(b);
                    }
                  }}
                >
                  <line
                    x1={x(i)}
                    y1={padTop}
                    x2={x(i)}
                    y2={padTop + innerH}
                    stroke="#DDB022"
                    strokeWidth="1"
                    strokeDasharray="3 3"
                  />
                  <circle cx={x(i)} cy={padTop} r="10" fill="transparent">
                    <title>{annotationLabel(ann)}</title>
                  </circle>
                  <circle
                    className="ev-focus opacity-0 transition-opacity"
                    cx={x(i)}
                    cy={padTop}
                    r="7"
                    fill="none"
                    stroke="#B45309"
                    strokeWidth="1.5"
                  />
                  <circle cx={x(i)} cy={padTop} r="3.5" fill="#DDB022" pointerEvents="none" />
                </g>
              ) : null;
            })}

          {/* Previous period — subtle dashed overlay (single-metric mode) */}
          {!compareAll && drawn[0].prev && drawn[0].prev.length > 1 && (
            <path
              d={pathOf(drawn[0].prev)}
              fill="none"
              stroke={SERIES_COLOR[drawn[0].key]}
              strokeOpacity="0.4"
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
                <g
                  key={`${s.key}-${p.date}`}
                  role="button"
                  tabIndex={0}
                  aria-label={t("drillPointLabel", {
                    date: formatBucket(p.date, bucketFormat),
                    series: t(`series.${s.key}`),
                    value: p.value,
                  })}
                  className="cursor-pointer focus:outline-none [&:focus-visible>.pt-focus]:opacity-100"
                  onClick={() => openDrill(p.date)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      openDrill(p.date);
                    }
                  }}
                >
                  <circle cx={x(i)} cy={y(p.value)} r="9" fill="transparent" />
                  <circle
                    className="pt-focus opacity-0 transition-opacity"
                    cx={x(i)}
                    cy={y(p.value)}
                    r="6"
                    fill="none"
                    stroke={SERIES_COLOR[s.key]}
                    strokeWidth="1.5"
                  />
                  <circle cx={x(i)} cy={y(p.value)} r="2.5" fill={SERIES_COLOR[s.key]}>
                    <title>{`${formatBucket(p.date, bucketFormat)} · ${t(`series.${s.key}`)}: ${p.value}`}</title>
                  </circle>
                </g>
              ) : null,
            ),
          )}

          {buckets.map((b, i) =>
            i % labelEvery === 0 ? (
              <text key={b} x={x(i)} y={height - 6} textAnchor="middle" {...AXIS_TEXT}>
                {formatBucket(b, bucketFormat)}
              </text>
            ) : null,
          )}
        </svg>
      </div>

      {/* ── Publishing-event popover ── */}
      {eventBucket &&
        (() => {
          const ann = annotationByBucket.get(eventBucket);
          if (!ann) return null;
          const ctx = eventContext(eventBucket);
          return (
            <div
              role="region"
              aria-label={t("eventTitle", { date: formatBucket(eventBucket, bucketFormat) })}
              onKeyDown={(e) => {
                if (e.key === "Escape") setEventBucket(null);
              }}
              className="mt-2.5 rounded-xl border border-[color-mix(in_srgb,#DDB022_40%,transparent)] bg-[#FEFCF5] p-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="dash-eyebrow">{t("eventEyebrow")}</p>
                  <h4 className="text-[12.5px] font-bold text-text-heading">
                    {t("eventTitle", { date: formatBucket(eventBucket, bucketFormat) })}
                  </h4>
                </div>
                <button
                  ref={eventCloseRef}
                  type="button"
                  onClick={() => setEventBucket(null)}
                  aria-label={t("drillClose")}
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-white hover:text-text-heading focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
              <p className="mt-1 text-[12px] text-text-body">{t("publishedAnnotation", { count: ann.count })}</p>
              {ann.titles && ann.titles.length > 0 && (
                <ul className="mt-1 space-y-0.5">
                  {ann.titles.map((title) => (
                    <li key={title} className="truncate text-[11.5px] text-text-muted" dir="auto" title={title}>
                      • {title}
                    </li>
                  ))}
                </ul>
              )}
              {ctx && (
                <p className="mt-1.5 text-[11.5px] leading-4 text-text-muted">
                  {t("eventCorrelation", {
                    series: t(`series.${activeMetric}`),
                    pct: `${ctx.pct > 0 ? "+" : ""}${ctx.pct}`,
                    window: ctx.window,
                  })}
                </p>
              )}
              <button
                type="button"
                onClick={() => openDrill(eventBucket)}
                className="mt-1.5 cursor-pointer text-[11.5px] font-semibold text-brand hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              >
                {t("eventInspect")}
              </button>
            </div>
          );
        })()}

      {/* ── Point drill-down panel ── */}
      {drillBucket && (
        <div
          role="region"
          aria-label={t("drillTitle", { date: formatBucket(drillBucket, bucketFormat) })}
          onKeyDown={(e) => {
            if (e.key === "Escape") setDrillBucket(null);
          }}
          className="mt-2.5 rounded-xl border border-divider bg-paper/70 p-3"
        >
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-[12.5px] font-bold text-text-heading">
              {t("drillTitle", { date: formatBucket(drillBucket, bucketFormat) })}
            </h4>
            <button
              ref={drillCloseRef}
              type="button"
              onClick={() => setDrillBucket(null)}
              aria-label={t("drillClose")}
              className="flex h-6 w-6 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-bg-surface hover:text-text-heading focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
          {drillLoading && !drillCache.has(drillBucket) ? (
            <p className="mt-2 flex items-center gap-1.5 text-[12px] text-text-muted" role="status">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              {t("drillLoading")}
            </p>
          ) : drillErrorMessage ? (
            <div className="mt-2" role="alert">
              <p className="text-[12px] font-medium text-rose-700">{drillErrorMessage}</p>
              <button
                type="button"
                onClick={() => {
                  setDrillError(null);
                  setDrillRetry((n) => n + 1);
                }}
                className="mt-1 cursor-pointer text-[11.5px] font-semibold text-brand hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              >
                {t("retry")}
              </button>
            </div>
          ) : (
            (() => {
              const d = drillCache.get(drillBucket);
              if (!d) return null;
              if (d.items.length === 0) {
                return <p className="mt-2 text-[12px] text-text-muted">{t("drillEmpty")}</p>;
              }
              return (
                <>
                  <p className="mt-0.5 text-[11px] text-text-muted">{t("drillTotal", { count: d.total })}</p>
                  <ol className="mt-1.5 space-y-0.5">
                    {d.items.map((item) => (
                      <li key={`${item.type}-${item.id}`} className="flex items-center gap-2 text-[12px]">
                        <Link
                          href={item.editHref}
                          className="min-w-0 flex-1 truncate font-medium text-text-body hover:text-brand hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                          title={item.title}
                          dir="auto"
                        >
                          {item.title}
                        </Link>
                        <span className="shrink-0 tabular-nums text-text-muted">
                          {t("drillViews", { count: item.views })}
                        </span>
                      </li>
                    ))}
                  </ol>
                </>
              );
            })()
          )}
        </div>
      )}

      {/* Accessible data table alternative */}
      {showTable && (
        <div className="mt-2 max-h-56 overflow-auto rounded-xl border border-divider">
          <table className="w-full text-[11.5px]" aria-describedby={`${chartId}-caption`}>
            <caption id={`${chartId}-caption`} className="sr-only">
              {srSummary}
            </caption>
            <thead className="dash-thead sticky top-0 bg-paper">
              <tr>
                <th scope="col" className="px-2 py-1.5 text-start font-bold">
                  {t("date")}
                </th>
                {available.map((k) => (
                  <th key={k} scope="col" className="px-2 py-1.5 text-end font-bold">
                    {t(`series.${k}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {buckets.map((b, i) => (
                <tr key={b} className="border-t border-divider">
                  <th scope="row" className="px-2 py-1 text-start font-medium text-text-body">
                    {formatBucket(b, bucketFormat)}
                  </th>
                  {available.map((k) => (
                    <td key={k} className="px-2 py-1 text-end tabular-nums text-text-body">
                      {agg.current[k][i]?.value ?? 0}
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

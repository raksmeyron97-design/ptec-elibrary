"use client";

// Activity over time. Every value is a real server-side aggregate from
// lib/admin/activity-log (one fold over the range-bounded event set) — nothing
// here is interpolated, smoothed into existence, or reconstructed from the
// paginated rows the table happens to be showing.
//
// No chart library: the geometry comes from the dashboard's own pure, unit-
// tested chart-math helpers and the chrome from its chart tokens, so this plot
// and the engagement chart next door draw the same grid, axis and hairlines.

import { useId, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  createChartGeometry,
  monotonePath,
  monotoneAreaPath,
  visiblePointIndexes,
  type ChartCoordinate,
} from "@/components/admin/dashboard/analytics/chart-math";
import { ANALYTICS_CHART_TOKENS as CH } from "@/components/admin/dashboard/analytics/chart-tokens";
import type { ActivityAnalytics } from "@/lib/admin/activity-log";
import type { TimelineBucket } from "@/lib/admin/activity-log-shared";
import { INK, INK2, INK3, SERIES, SERIES_INK, sectionTitle, srOnly, ActivityIcon } from "./logs-ui";

const W = 760;
const H = 240;
const SERIES_KEYS = ["views", "downloads", "security"] as const;
type SeriesKey = (typeof SERIES_KEYS)[number];

/** Dash patterns are the SECOND channel, so the three series stay separable in
 *  greyscale, in print, and under forced-colors. */
const DASH: Record<SeriesKey, string | undefined> = {
  views: undefined,
  downloads: "8 3",
  security: "2 3",
};

export function bucketLabel(iso: string, bucket: TimelineBucket, locale: string): string {
  const d = new Date(iso);
  const tz = "Asia/Phnom_Penh";
  if (bucket === "hour") {
    return new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: tz }).format(d);
  }
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", timeZone: tz }).format(d);
}

export default function ActivityTimeline({
  analytics,
  locale,
  rangeLabel,
}: {
  analytics: ActivityAnalytics;
  locale: string;
  rangeLabel: string;
}) {
  const t = useTranslations("adminLogs");
  const clipId = useId();
  const [active, setActive] = useState<number | null>(null);

  const points = analytics.timeline;
  const totals = useMemo(
    () =>
      points.reduce(
        (acc, p) => ({ views: acc.views + p.views, downloads: acc.downloads + p.downloads, security: acc.security + p.security }),
        { views: 0, downloads: 0, security: 0 },
      ),
    [points],
  );
  const grandTotal = totals.views + totals.downloads + totals.security;

  const maximum = useMemo(
    () => Math.max(1, ...points.map((p) => Math.max(p.views, p.downloads, p.security))),
    [points],
  );
  const geo = useMemo(() => createChartGeometry({ width: W, height: H, maximum, left: 46, right: 14, top: 16, bottom: 34 }), [maximum]);

  const coords = useMemo(() => {
    const out = {} as Record<SeriesKey, ChartCoordinate[]>;
    for (const key of SERIES_KEYS) {
      out[key] = points.map((p, i) => ({ x: geo.x(i, points.length), y: geo.y(p[key]) }));
    }
    return out;
  }, [points, geo]);

  // X labels are sampled, never all drawn: 90 daily buckets would overlap into
  // a grey smear. The endpoints are always kept so the axis states its bounds.
  const labelIndexes = useMemo(() => visiblePointIndexes(points.length, 7), [points.length]);
  const peakIndex = useMemo(() => {
    let best = -1;
    let bestTotal = 0;
    points.forEach((p, i) => {
      const sum = p.views + p.downloads + p.security;
      if (sum > bestTotal) { bestTotal = sum; best = i; }
    });
    return bestTotal > 0 ? best : -1;
  }, [points]);

  const bucketName = t(`chart.bucket.${analytics.bucket}`);
  const readIndex = active ?? peakIndex;
  const readPoint = readIndex >= 0 ? points[readIndex] : null;

  const chartSummary = t("chart.srSummary", {
    range: rangeLabel,
    bucket: bucketName,
    buckets: points.length,
    views: totals.views,
    downloads: totals.downloads,
    security: totals.security,
  });

  const onPointer = (e: React.PointerEvent<SVGSVGElement>) => {
    if (points.length === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const rel = ((e.clientX - rect.left) / rect.width) * W;
    const ratio = (rel - geo.left) / Math.max(1, geo.innerWidth);
    const i = Math.round(ratio * (points.length - 1));
    setActive(Math.min(points.length - 1, Math.max(0, i)));
  };

  return (
    <section className="dash-card" style={{ padding: "16px 18px 12px", display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
      <header style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <span className="dash-ico dash-ico--sm dash-ico--brand"><ActivityIcon size={15} /></span>
          <div style={{ minWidth: 0 }}>
            <h2 style={sectionTitle}>{t("chart.title")}</h2>
            <p style={{ fontSize: 12, color: INK3, marginTop: 2 }}>{t("chart.subtitle", { bucket: bucketName.toLowerCase(), range: rangeLabel })}</p>
          </div>
        </div>
        <Legend totals={totals} t={t} />
      </header>

      {grandTotal === 0 ? (
        <p style={{ padding: "40px 8px", textAlign: "center", fontSize: 13, color: INK3 }}>{t("chart.empty")}</p>
      ) : (
        <>
          {/* Readout: the hovered bucket, or the busiest one at rest. Stated in
              words above the plot so the information exists without a tooltip. */}
          <p aria-live="polite" style={{ fontSize: 12.5, color: INK2, minHeight: 18 }}>
            {readPoint ? (
              <>
                <strong style={{ color: INK, fontWeight: 700 }}>{bucketLabel(readPoint.start, analytics.bucket, locale)}</strong>
                {" · "}
                {t("chart.readout", { views: readPoint.views, downloads: readPoint.downloads, security: readPoint.security })}
                {active === null && peakIndex >= 0 ? ` · ${t("chart.peakHint")}` : ""}
              </>
            ) : null}
          </p>

          <svg
            viewBox={`0 0 ${W} ${H}`}
            width="100%"
            height="auto"
            preserveAspectRatio="xMidYMid meet"
            role="img"
            aria-label={chartSummary}
            style={{ display: "block", maxWidth: "100%", touchAction: "pan-y" }}
            onPointerMove={onPointer}
            onPointerLeave={() => setActive(null)}
          >
            <defs>
              <clipPath id={clipId}>
                <rect x={geo.left} y={geo.top} width={geo.innerWidth} height={geo.innerHeight} />
              </clipPath>
            </defs>

            {geo.ticks.map((tick) => (
              <g key={tick.value}>
                <line x1={geo.left} x2={geo.left + geo.innerWidth} y1={tick.y} y2={tick.y} stroke={CH.grid} strokeWidth={1} />
                <text x={geo.left - 8} y={tick.y + 4} textAnchor="end" fontSize={10.5} fill={CH.axis} fontFamily="inherit">
                  {tick.value.toLocaleString(locale)}
                </text>
              </g>
            ))}
            <line x1={geo.left} x2={geo.left + geo.innerWidth} y1={geo.y(0)} y2={geo.y(0)} stroke={CH.baseline} strokeWidth={1} />

            {labelIndexes.map((i) => (
              <text key={i} x={geo.x(i, points.length)} y={H - 12} textAnchor="middle" fontSize={10.5} fill={CH.axis} fontFamily="inherit">
                {bucketLabel(points[i].start, analytics.bucket, locale)}
              </text>
            ))}

            {active !== null && (
              <line
                x1={geo.x(active, points.length)} x2={geo.x(active, points.length)}
                y1={geo.top} y2={geo.top + geo.innerHeight}
                stroke={CH.crosshair} strokeWidth={1} strokeDasharray="3 3"
              />
            )}

            <g clipPath={`url(#${clipId})`}>
              {/* Views carries the only area fill: it is the base volume the
                  other two are read against. Filling all three would stack
                  three translucent washes into an unreadable mud. */}
              {totals.views > 0 && points.length > 1 && (
                <path d={monotoneAreaPath(coords.views, geo.y(0))} fill={SERIES.views} opacity={CH.areaOpacity} />
              )}
              {SERIES_KEYS.map((key) =>
                totals[key] === 0 ? null : points.length === 1 ? (
                  <circle key={key} cx={coords[key][0].x} cy={coords[key][0].y} r={CH.markerRadius} fill={SERIES[key]} />
                ) : (
                  <path
                    key={key}
                    d={monotonePath(coords[key])}
                    fill="none"
                    stroke={SERIES[key]}
                    strokeWidth={CH.lineWidth}
                    strokeDasharray={DASH[key]}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                ),
              )}
              {active !== null &&
                SERIES_KEYS.map((key) =>
                  totals[key] === 0 ? null : (
                    <circle
                      key={key}
                      cx={coords[key][active].x}
                      cy={coords[key][active].y}
                      r={CH.markerRadius}
                      fill={SERIES[key]}
                      stroke={CH.markerRing}
                      strokeWidth={CH.markerRingWidth}
                      paintOrder="stroke"
                    />
                  ),
                )}
            </g>
          </svg>

          {/* The plot is never the only representation of the data. */}
          <table style={srOnly}>
            <caption>{chartSummary}</caption>
            <thead>
              <tr>
                <th scope="col">{bucketName}</th>
                <th scope="col">{t("chart.legendViews")}</th>
                <th scope="col">{t("chart.legendDownloads")}</th>
                <th scope="col">{t("chart.legendSecurity")}</th>
              </tr>
            </thead>
            <tbody>
              {points.map((p) => (
                <tr key={p.start}>
                  <th scope="row">{bucketLabel(p.start, analytics.bucket, locale)}</th>
                  <td>{p.views}</td>
                  <td>{p.downloads}</td>
                  <td>{p.security}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}

function Legend({ totals, t }: { totals: Record<SeriesKey, number>; t: ReturnType<typeof useTranslations> }) {
  return (
    <ul style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", listStyle: "none", margin: 0, padding: 0 }}>
      {SERIES_KEYS.map((key) => (
        <li key={key} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: INK2 }}>
          <svg width="18" height="8" aria-hidden focusable="false" style={{ flex: "none" }}>
            <line x1="0" y1="4" x2="18" y2="4" stroke={SERIES[key]} strokeWidth="2" strokeDasharray={DASH[key]} strokeLinecap="round" />
          </svg>
          <span>{t(`chart.legend${key === "views" ? "Views" : key === "downloads" ? "Downloads" : "Security"}`)}</span>
          <strong style={{ fontWeight: 700, color: SERIES_INK[key] }}>{totals[key].toLocaleString()}</strong>
        </li>
      ))}
    </ul>
  );
}

import type { DashboardMetric } from "@/lib/admin/dashboard-shared";

export type ChartMarkerShape = "circle" | "square" | "diamond" | "triangle";

export type MetricChartStyle = {
  stroke: string;
  dash: string | undefined;
  marker: ChartMarkerShape;
};

/**
 * Chart chrome, as tokens. Everything here is either a variable declared in
 * app/admin.css or a bare number — no hex ever lands in a component.
 *
 * Two decisions are load-bearing:
 *
 * • `grid` is drawn SOLID (there is no grid dash pattern). A dashed rule in a
 *   plot means "threshold" or "projection"; spending that vocabulary on a
 *   ruler leaves nothing to say it with, and dashes at hairline weight read as
 *   noise. Only the previous-period overlay is dashed, because it genuinely is
 *   the "not the real line" series.
 * • `markerRing` is the surface colour, not a border. Overlapping markers are
 *   separated by a ring of the page behind them; a stroke in a darker colour
 *   would add ink that is not data.
 */
export const ANALYTICS_CHART_TOKENS = {
  grid: "var(--dash-chart-grid)",
  baseline: "var(--dash-chart-baseline)",
  axis: "var(--dash-chart-axis)",
  surface: "var(--dash-surface)",
  markerRing: "var(--dash-surface)",
  crosshair: "var(--dash-chart-crosshair)",
  focus: "var(--ptec-focus-ring)",
  selection: "var(--ptec-accent-line)",
  annotation: "var(--ptec-accent)",
  comparisonDash: "5 5",
  /* Full strength. At 0.42 the previous-period line sat at 1.87:1 against the
     card — below the 3:1 floor for a data mark, i.e. a line drawn to be
     compared that could not reliably be seen. The dash pattern and the
     narrower stroke are what distinguish it; that is what this file's own
     comment says the dash is for, and unlike opacity they cost no contrast. */
  comparisonOpacity: 1,
  lineWidth: 2,
  comparisonLineWidth: 1.5,
  markerRadius: 4,
  markerRingWidth: 2,
  areaOpacity: 0.12,
} as const;

/**
 * Per-metric identity. The stroke is the shared series palette (admin.css),
 * so a metric is the same colour on its KPI tile, in its sparkline and on the
 * chart — select "Downloads" above and the amber line below is the one you
 * selected.
 *
 * Dash and marker are the SECONDARY encoding: they are what keeps two series
 * apart in greyscale print, under forced-colors, and for a reader with severe
 * colour-vision deficiency. The plot applies the dash pattern only when more
 * than one metric is drawn — a lone series has nothing to be distinguished
 * from, and a dashed solo line just looks broken.
 */
export const METRIC_CHART_STYLE: Record<DashboardMetric, MetricChartStyle> = {
  views: {
    stroke: "var(--ptec-series-views)",
    dash: undefined,
    marker: "circle",
  },
  visitors: {
    stroke: "var(--ptec-series-visitors)",
    dash: "8 3",
    marker: "square",
  },
  readerOpens: {
    stroke: "var(--ptec-series-reader)",
    dash: "2 3",
    marker: "diamond",
  },
  downloads: {
    stroke: "var(--ptec-series-downloads)",
    dash: "10 3 2 3",
    marker: "triangle",
  },
};

import type { DashboardMetric } from "@/lib/admin/dashboard-shared";

export type ChartMarkerShape = "circle" | "square" | "diamond" | "triangle";

export type MetricChartStyle = {
  stroke: string;
  dash: string | undefined;
  marker: ChartMarkerShape;
};

/**
 * Semantic chart roles derived only from the existing PTEC navy, royal-blue,
 * and restrained-gold tokens. Dash and marker differences make series
 * identifiable without relying on colour alone.
 */
export const ANALYTICS_CHART_TOKENS = {
  grid: "var(--ptec-divider)",
  axis: "var(--ptec-text-muted)",
  surface: "var(--ptec-bg-surface)",
  focus: "var(--ptec-focus-ring)",
  selection: "var(--ptec-accent-line)",
  comparisonDash: "5 5",
  comparisonOpacity: 0.42,
  lineWidth: 2.25,
  comparisonLineWidth: 1.75,
} as const;

export const METRIC_CHART_STYLE: Record<DashboardMetric, MetricChartStyle> = {
  views: {
    stroke: "var(--ptec-brand)",
    dash: undefined,
    marker: "circle",
  },
  visitors: {
    stroke: "var(--ptec-navy-950)",
    dash: "8 3",
    marker: "square",
  },
  readerOpens: {
    stroke: "var(--ptec-navy-700)",
    dash: "2 3",
    marker: "diamond",
  },
  downloads: {
    stroke: "var(--ptec-accent-text)",
    dash: "10 3 2 3",
    marker: "triangle",
  },
};

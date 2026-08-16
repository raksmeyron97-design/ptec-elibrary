import type { ChartGrain, DashboardMetric } from "@/lib/admin/dashboard-shared";
import { ANALYTICS_LIMITS } from "@/lib/admin/engagement-breakdown";

export type AnalyticsComparisonMode = "none" | "previous" | "metrics";

export type AnalyticsChartState = {
  metric: DashboardMetric;
  grain: ChartGrain;
  defaultGrain: ChartGrain;
  visibleSeries: DashboardMetric[];
  comparison: AnalyticsComparisonMode;
  defaultComparison: AnalyticsComparisonMode;
  selectedBucket: string | null;
  detailsExpanded: boolean;
  tableVisible: boolean;
  fullscreen: boolean;
};

export type AnalyticsChartAction =
  | { type: "selectMetric"; metric: DashboardMetric }
  | { type: "setGrain"; grain: ChartGrain }
  | { type: "toggleSeries"; metric: DashboardMetric }
  | { type: "setComparison"; comparison: AnalyticsComparisonMode }
  | { type: "selectBucket"; bucket: string | null }
  | { type: "setDetailsExpanded"; expanded: boolean }
  | { type: "toggleTable" }
  | { type: "toggleFullscreen" }
  | { type: "reset" };

export function createAnalyticsChartState(input: {
  metric: DashboardMetric;
  grain: ChartGrain;
  compare: boolean;
}): AnalyticsChartState {
  const comparison = input.compare ? "previous" : "none";
  return {
    metric: input.metric,
    grain: input.grain,
    defaultGrain: input.grain,
    visibleSeries: [input.metric],
    comparison,
    defaultComparison: comparison,
    selectedBucket: null,
    detailsExpanded: false,
    tableVisible: false,
    fullscreen: false,
  };
}

export function analyticsChartReducer(
  state: AnalyticsChartState,
  action: AnalyticsChartAction,
): AnalyticsChartState {
  switch (action.type) {
    case "selectMetric":
      return {
        ...state,
        metric: action.metric,
        visibleSeries: [action.metric],
        comparison: state.defaultComparison,
        selectedBucket: null,
        detailsExpanded: false,
      };
    case "setGrain":
      return action.grain === state.grain
        ? state
        : { ...state, grain: action.grain, selectedBucket: null, detailsExpanded: false };
    case "toggleSeries": {
      const exists = state.visibleSeries.includes(action.metric);
      if (exists) {
        if (state.visibleSeries.length === 1 || action.metric === state.metric) return state;
        return { ...state, visibleSeries: state.visibleSeries.filter((metric) => metric !== action.metric) };
      }
      if (state.visibleSeries.length >= ANALYTICS_LIMITS.maxSimultaneousSeries) return state;
      return {
        ...state,
        visibleSeries: [...state.visibleSeries, action.metric],
        comparison: "metrics",
      };
    }
    case "setComparison":
      return {
        ...state,
        comparison: action.comparison,
        visibleSeries: action.comparison === "metrics" ? state.visibleSeries : [state.metric],
      };
    case "selectBucket":
      return {
        ...state,
        selectedBucket: action.bucket,
        detailsExpanded: action.bucket ? state.detailsExpanded : false,
      };
    case "setDetailsExpanded":
      return { ...state, detailsExpanded: Boolean(state.selectedBucket) && action.expanded };
    case "toggleTable":
      return { ...state, tableVisible: !state.tableVisible };
    case "toggleFullscreen":
      return { ...state, fullscreen: !state.fullscreen };
    case "reset":
      return {
        ...state,
        grain: state.defaultGrain,
        visibleSeries: [state.metric],
        comparison: state.defaultComparison,
        selectedBucket: null,
        detailsExpanded: false,
        tableVisible: false,
        fullscreen: false,
      };
  }
}

import { describe, expect, it } from "vitest";
import { analyticsChartReducer, createAnalyticsChartState } from "./chart-state";

const initial = () => createAnalyticsChartState({ metric: "views", grain: "day", compare: true });

describe("analyticsChartReducer", () => {
  it("keeps graph-owned state in one deterministic model", () => {
    let state = initial();
    state = analyticsChartReducer(state, { type: "setGrain", grain: "week" });
    state = analyticsChartReducer(state, { type: "selectBucket", bucket: "2026-07-20" });
    state = analyticsChartReducer(state, { type: "setDetailsExpanded", expanded: true });
    state = analyticsChartReducer(state, { type: "toggleTable" });
    expect(state).toMatchObject({
      grain: "week",
      selectedBucket: "2026-07-20",
      detailsExpanded: true,
      tableVisible: true,
    });
  });

  it("caps advanced comparison at three simultaneous series", () => {
    let state = initial();
    state = analyticsChartReducer(state, { type: "toggleSeries", metric: "visitors" });
    state = analyticsChartReducer(state, { type: "toggleSeries", metric: "readerOpens" });
    const capped = analyticsChartReducer(state, { type: "toggleSeries", metric: "downloads" });
    expect(capped.visibleSeries).toEqual(["views", "visitors", "readerOpens"]);
    expect(capped.comparison).toBe("metrics");
  });

  it("never removes the active metric or final visible series", () => {
    const state = analyticsChartReducer(initial(), { type: "toggleSeries", metric: "views" });
    expect(state.visibleSeries).toEqual(["views"]);
  });

  it("selecting a KPI metric resets incompatible graph-only selections", () => {
    let state = analyticsChartReducer(initial(), { type: "toggleSeries", metric: "downloads" });
    state = analyticsChartReducer(state, { type: "selectBucket", bucket: "2026-07-20" });
    state = analyticsChartReducer(state, { type: "selectMetric", metric: "visitors" });
    expect(state).toMatchObject({
      metric: "visitors",
      visibleSeries: ["visitors"],
      selectedBucket: null,
      comparison: "previous",
    });
  });

  it("reset restores graph defaults without changing the active metric", () => {
    let state = analyticsChartReducer(initial(), { type: "setGrain", grain: "month" });
    state = analyticsChartReducer(state, { type: "toggleFullscreen" });
    state = analyticsChartReducer(state, { type: "toggleTable" });
    state = analyticsChartReducer(state, { type: "reset" });
    expect(state).toMatchObject({
      metric: "views",
      grain: "day",
      visibleSeries: ["views"],
      comparison: "previous",
      fullscreen: false,
      tableVisible: false,
    });
  });
});

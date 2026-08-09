import { describe, expect, it } from "vitest";
import { DASHBOARD_METRICS } from "@/lib/admin/dashboard-shared";
import { ANALYTICS_CHART_TOKENS, METRIC_CHART_STYLE } from "./chart-tokens";

describe("semantic analytics chart tokens", () => {
  it("references the authoritative PTEC variables rather than a new hex palette", () => {
    const serialized = JSON.stringify({ ANALYTICS_CHART_TOKENS, METRIC_CHART_STYLE });
    expect(serialized).not.toMatch(/#[0-9a-f]{3,8}/i);
    for (const metric of DASHBOARD_METRICS) {
      expect(METRIC_CHART_STYLE[metric].stroke).toMatch(/^var\(--ptec-/);
    }
  });

  it("distinguishes every metric without colour alone", () => {
    const encodings = DASHBOARD_METRICS.map((metric) => {
      const style = METRIC_CHART_STYLE[metric];
      return `${style.marker}:${style.dash ?? "solid"}`;
    });
    expect(new Set(encodings).size).toBe(DASHBOARD_METRICS.length);
  });
});

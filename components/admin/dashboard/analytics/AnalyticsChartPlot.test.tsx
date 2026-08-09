import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AnalyticsChartPlot, type AnalyticsPlotSeries } from "./AnalyticsChartPlot";

const series: AnalyticsPlotSeries[] = [
  {
    id: "views-current",
    metric: "views",
    label: "Views",
    points: [
      { date: "2026-07-20", value: 2 },
      { date: "2026-07-21", value: 7 },
      { date: "2026-07-22", value: 4 },
    ],
  },
];

const renderPlot = (onSelectPoint = vi.fn()) => {
  render(
    <AnalyticsChartPlot
      width={640}
      height={240}
      series={series}
      selectedBucket={null}
      label="Engagement over time"
      description="Views total 13"
      formatBucket={(bucket) => bucket.slice(5)}
      pointLabel={({ date, value, series: label }) => `${date}, ${label}: ${value}`}
      onSelectPoint={onSelectPoint}
    />,
  );
  return onSelectPoint;
};

describe("AnalyticsChartPlot", () => {
  it("renders a semantic monotone SVG from reusable series data", () => {
    renderPlot();
    expect(screen.getByTestId("analytics-chart-plot")).toHaveAccessibleName("Engagement over time");
    expect(screen.getByTestId("series-path-views-current").getAttribute("d")).toContain("C");
    expect(screen.getByTestId("series-path-views-current")).toHaveAttribute("stroke", "var(--ptec-brand)");
  });

  it("exposes every sampled point to pointer and keyboard activation", () => {
    const onSelect = renderPlot();
    const point = screen.getByRole("button", { name: "2026-07-21, Views: 7" });
    fireEvent.focus(point);
    expect(screen.getByRole("tooltip")).toHaveTextContent("2026-07-21, Views: 7");
    fireEvent.keyDown(point, { key: "ArrowRight" });
    expect(document.activeElement).toHaveAccessibleName("2026-07-22, Views: 4");
    fireEvent.click(point);
    fireEvent.keyDown(point, { key: "Enter" });
    expect(onSelect).toHaveBeenNthCalledWith(1, { bucket: "2026-07-21", metric: "views" });
    expect(onSelect).toHaveBeenNthCalledWith(2, { bucket: "2026-07-21", metric: "views" });
  });

  it("styles comparison data as a subdued dashed overlay", () => {
    render(
      <AnalyticsChartPlot
        width={640}
        height={240}
        series={[...series, { ...series[0], id: "views-previous", comparison: true }]}
        selectedBucket="2026-07-21"
        label="Engagement"
        description="Comparison"
        formatBucket={(bucket) => bucket}
        pointLabel={({ date }) => date}
      />,
    );
    expect(screen.getByTestId("series-path-views-previous")).toHaveAttribute("stroke-dasharray", "5 5");
    expect(screen.getByRole("button", { name: "2026-07-21" })).toHaveAttribute("aria-pressed", "true");
  });
});

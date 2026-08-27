import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
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

/**
 * jsdom lays nothing out, so the hit layer has a zero-size box and the
 * component's own guard would refuse every pointer reading. Give the plot
 * surface a real geometry — 640×240, matching the props — so nearest-X
 * arithmetic is exercised for real rather than mocked away.
 */
function layOutPlotSurface() {
  const spy = vi
    .spyOn(Element.prototype, "getBoundingClientRect")
    .mockReturnValue({
      x: 0, y: 0, top: 0, left: 0, right: 640, bottom: 240, width: 640, height: 240,
      toJSON: () => ({}),
    } as DOMRect);
  return spy;
}

afterEach(() => vi.restoreAllMocks());

describe("AnalyticsChartPlot", () => {
  it("renders a semantic monotone SVG from reusable series data", () => {
    renderPlot();
    expect(screen.getByTestId("analytics-chart-plot")).toHaveAccessibleName("Engagement over time");
    expect(screen.getByTestId("series-path-views-current").getAttribute("d")).toContain("C");
    expect(screen.getByTestId("series-path-views-current")).toHaveAttribute("stroke", "var(--ptec-series-views)");
  });

  it("leaves a single series solid — a dash pattern only earns its place against another line", () => {
    renderPlot();
    expect(screen.getByTestId("series-path-views-current")).not.toHaveAttribute("stroke-dasharray");

    render(
      <AnalyticsChartPlot
        width={640}
        height={240}
        series={[series[0], { ...series[0], id: "visitors-current", metric: "visitors", label: "Visitors" }]}
        selectedBucket={null}
        label="Engagement"
        description="Two metrics"
        formatBucket={(bucket) => bucket}
        pointLabel={({ date }) => date}
      />,
    );
    expect(screen.getByTestId("series-path-visitors-current")).toHaveAttribute("stroke-dasharray", "8 3");
  });

  it("reads out the nearest bucket from anywhere in the plot, without landing on a mark", () => {
    renderPlot();
    layOutPlotSurface();
    // Two thirds across the plot is nowhere near a marker, but it is nearest
    // to the last bucket.
    fireEvent.pointerMove(screen.getByTestId("analytics-chart-surface"), { clientX: 620, clientY: 120 });

    expect(screen.getByTestId("analytics-chart-crosshair")).toBeInTheDocument();
    const readout = screen.getByRole("tooltip");
    expect(readout).toHaveTextContent("07-22");   // formatBucket() drops the year here
    expect(readout).toHaveTextContent("Views");
    expect(readout).toHaveTextContent("4");
  });

  it("names every series at the read position, comparison included", () => {
    render(
      <AnalyticsChartPlot
        width={640}
        height={240}
        series={[series[0], { ...series[0], id: "views-previous", label: "Views, previous period", comparison: true, points: [
          { date: "2026-07-20", value: 1 },
          { date: "2026-07-21", value: 3 },
          { date: "2026-07-22", value: 9 },
        ] }]}
        selectedBucket={null}
        label="Engagement"
        description="Comparison"
        formatBucket={(bucket) => bucket}
        pointLabel={({ date }) => date}
      />,
    );
    layOutPlotSurface();
    fireEvent.pointerMove(screen.getByTestId("analytics-chart-surface"), { clientX: 320, clientY: 120 });

    const rows = within(screen.getByRole("tooltip")).getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("Views7");
    expect(rows[1]).toHaveTextContent("Views, previous period3");
  });

  it("exposes every sampled point to pointer and keyboard activation", () => {
    const onSelect = renderPlot();
    const point = screen.getByRole("button", { name: "2026-07-21, Views: 7" });
    fireEvent.focus(point);
    // Keyboard focus produces the same readout as hover.
    expect(screen.getByRole("tooltip")).toHaveTextContent("Views7");
    expect(point).toHaveAttribute("aria-describedby", screen.getByRole("tooltip").id);
    fireEvent.keyDown(point, { key: "ArrowRight" });
    expect(document.activeElement).toHaveAccessibleName("2026-07-22, Views: 4");
    fireEvent.click(point);
    fireEvent.keyDown(point, { key: "Enter" });
    expect(onSelect).toHaveBeenNthCalledWith(1, { bucket: "2026-07-21", metric: "views" });
    expect(onSelect).toHaveBeenNthCalledWith(2, { bucket: "2026-07-21", metric: "views" });
  });

  it("drills into the series nearest the pointer when the plot is clicked", () => {
    const onSelect = vi.fn();
    render(
      <AnalyticsChartPlot
        width={640}
        height={240}
        series={[
          series[0],
          { ...series[0], id: "downloads-current", metric: "downloads", label: "Downloads", points: [
            { date: "2026-07-20", value: 0 },
            { date: "2026-07-21", value: 0 },
            { date: "2026-07-22", value: 0 },
          ] },
        ]}
        selectedBucket={null}
        label="Engagement"
        description="Two metrics"
        formatBucket={(bucket) => bucket}
        pointLabel={({ date }) => date}
        onSelectPoint={onSelect}
      />,
    );
    layOutPlotSurface();
    // Low in the plot: nearest to Downloads, which sits on the zero baseline.
    fireEvent.pointerDown(screen.getByTestId("analytics-chart-surface"), { clientX: 320, clientY: 235 });
    expect(onSelect).toHaveBeenCalledWith({ bucket: "2026-07-21", metric: "downloads" });
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

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import enMessages from "@/messages/en.json";
import { DEFAULT_FILTERS } from "@/lib/admin/dashboard-shared";
import { MetricSelectionProvider } from "../MetricSelection";
import EngagementAnalytics from "./EngagementAnalytics";
import { clearEngagementBreakdownCache } from "./useEngagementBreakdown";

vi.stubGlobal(
  "ResizeObserver",
  class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);

const points = [
  { date: "2026-07-20", value: 2 },
  { date: "2026-07-21", value: 5 },
  { date: "2026-07-22", value: 3 },
];
const series = {
  views: points,
  visitors: points.map((point) => ({ ...point, value: point.value - 1 })),
  readerOpens: points.map((point) => ({ ...point, value: point.value + 1 })),
  downloads: points.map((point) => ({ ...point, value: point.value * 2 })),
};

function renderGraph(over: Partial<React.ComponentProps<typeof EngagementAnalytics>> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <MetricSelectionProvider initialMetric="views">
        <EngagementAnalytics
          series={series}
          prevSeries={series}
          annotations={[]}
          granularity="day"
          compare
          filters={DEFAULT_FILTERS}
          generatedAt="2026-07-22T12:00:00.000Z"
          {...over}
        />
      </MetricSelectionProvider>
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  clearEngagementBreakdownCache();
  vi.unstubAllGlobals();
  vi.stubGlobal(
    "ResizeObserver",
    class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  window.history.replaceState(null, "", "/admin?range=30d");
});

describe("EngagementAnalytics V2 integration", () => {
  it("uses one graph system for all four engagement metrics", () => {
    renderGraph();
    const group = screen.getByRole("group", { name: "Chart metric" });
    for (const label of ["Detail views", "Unique visitors", "Reader opens", "Downloads"]) {
      expect(group).toHaveTextContent(label);
    }
    expect(screen.getByTestId("series-path-views-current")).toBeInTheDocument();
  });

  it("keeps metric ownership shallow in the existing URL contract", () => {
    renderGraph();
    fireEvent.click(screen.getByRole("button", { name: "Downloads" }));
    expect(new URLSearchParams(window.location.search).get("metric")).toBe("downloads");
    expect(screen.getByTestId("series-path-downloads-current")).toBeInTheDocument();
    expect(new URLSearchParams(window.location.search).get("range")).toBe("30d");
  });

  it("owns grain and advanced series without duplicating global range/export controls", () => {
    renderGraph();
    expect(screen.getByRole("button", { name: "Weekly" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Compare metrics" }));
    const advanced = screen.getByRole("group", { name: "Additional chart series" });
    fireEvent.click(screen.getByRole("checkbox", { name: /Unique visitors/ }));
    expect(screen.getByTestId("series-path-visitors-current")).toBeInTheDocument();
    expect(advanced).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Export/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /30 days/i })).not.toBeInTheDocument();
  });

  it("uses canonical hour grain only for today data", () => {
    const hourly = [{ date: "2026-07-22T14:00", value: 2 }];
    renderGraph({
      granularity: "hour",
      series: { views: hourly, visitors: hourly, readerOpens: hourly, downloads: hourly },
      prevSeries: { views: hourly, visitors: hourly, readerOpens: hourly, downloads: hourly },
    });
    expect(screen.getByRole("button", { name: "Hourly" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("button", { name: "Daily" })).not.toBeInTheDocument();
  });

  it("fetches canonical selected-date details and exposes a table alternative", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      metric: "views",
      grain: "day",
      scope: {
        bucket: "2026-07-20",
        start: "2026-07-19T17:00:00.000Z",
        end: "2026-07-20T16:59:59.999Z",
        aggregationScope: "fullBucket",
      },
      total: 2,
      partial: false,
      rowsScanned: 2,
      ranking: {
        status: "metric",
        basis: "views",
        items: [{ type: "book", id: "b1", title: "Chemistry", count: 2, editHref: "/admin/edit/b1" }],
      },
      unattributed: 0,
    }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    renderGraph();

    fireEvent.click(screen.getByRole("button", { name: /Jul 20 · Detail views: 2/ }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const requested = new URL(String(fetchMock.mock.calls[0][0]), "http://localhost");
    expect(requested.pathname).toBe("/api/admin/dashboard/engagement-breakdown");
    expect(requested.searchParams.get("metric")).toBe("views");
    expect(requested.searchParams.get("grain")).toBe("day");
    expect(requested.searchParams.get("bucket")).toBe("2026-07-20");
    expect(requested.searchParams.get("range")).toBe("30d");
    expect(requested.searchParams.get("contentLanguage")).toBe("all");
    expect(requested.searchParams.has("uiLocale")).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "View details" }));
    expect(await screen.findByRole("region", { name: "Details for Jul 20" })).toBeInTheDocument();
    expect(screen.getByText("Top resources by Detail views")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Chemistry" })).toHaveAttribute("href", "/admin/edit/b1");

    fireEvent.click(screen.getByRole("button", { name: "Show data table" }));
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hide data table" })).toHaveAttribute("aria-pressed", "true");
  });

  it("defensively suppresses metric rankings for partial API responses", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      metric: "views",
      grain: "day",
      scope: {
        bucket: "2026-07-20",
        start: "2026-07-19T17:00:00.000Z",
        end: "2026-07-20T16:59:59.999Z",
        aggregationScope: "fullBucket",
      },
      total: 20_000,
      partial: true,
      rowsScanned: 20_000,
      ranking: {
        status: "metric",
        basis: "views",
        items: [{ type: "book", id: "b1", title: "Must not rank", count: 10, editHref: "/admin/edit/b1" }],
      },
      unattributed: 0,
    }), { status: 200 })));
    renderGraph();
    fireEvent.click(screen.getByRole("button", { name: /Jul 20 · Detail views: 2/ }));
    fireEvent.click(screen.getByRole("button", { name: "View details" }));
    expect(await screen.findByText(/reached a query limit/)).toBeInTheDocument();
    expect(screen.getByText("Resource ranking unavailable")).toBeInTheDocument();
    expect(screen.queryByText("Must not rank")).not.toBeInTheDocument();
  });
});

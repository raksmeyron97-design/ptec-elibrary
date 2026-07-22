import { describe, expect, it, beforeEach, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import enMessages from "@/messages/en.json";
import kmMessages from "@/messages/km.json";
import type { ActionCenterData } from "@/lib/admin/intelligence";
import type { HealthPulse } from "@/lib/admin/dashboard-shared";
import { MetricSelectionProvider } from "./MetricSelection";
import MetricCard, { type MetricCardData } from "./MetricCard";
import HealthCard from "./HealthCard";
import MetricDetailsDrawer, {
  type HealthDetailPayload,
  type MetricDetailPayload,
} from "./MetricDetailsDrawer";
import NeedsAttentionPanel from "./NeedsAttentionPanel";
import ContentPerformancePanel from "./ContentPerformancePanel";
import type { TopContentRow } from "@/lib/admin/intelligence";

// next/navigation is only reached by components not under test here, but the
// panels import Link, which needs the app-router context in jsdom.
vi.mock("next/link", () => ({
  default: ({ children, href, ...rest }: React.ComponentProps<"a">) => (
    <a href={typeof href === "string" ? href : "#"} {...rest}>
      {children}
    </a>
  ),
}));

function Wrapper({
  children,
  locale = "en",
}: {
  children: React.ReactNode;
  locale?: "en" | "km";
}) {
  return (
    <NextIntlClientProvider locale={locale} messages={locale === "km" ? kmMessages : enMessages}>
      <MetricSelectionProvider initialMetric="views">{children}</MetricSelectionProvider>
    </NextIntlClientProvider>
  );
}

const cardData = (over: Partial<MetricCardData> = {}): MetricCardData => ({
  metric: "views",
  value: 317,
  formattedValue: "317",
  trend: { direction: "up", value: "+49%", label: "vs previous 30 days", previous: 213, mode: "percent" },
  previous: 213,
  formattedPrevious: "213",
  spark: [
    { date: "2026-07-01", value: 4 },
    { date: "2026-07-02", value: 9 },
  ],
  collecting: false,
  ...over,
});

describe("MetricCard", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/admin");
  });

  it("shows the value, percentage change and the previous-period baseline", () => {
    render(
      <Wrapper>
        <MetricCard
          data={cardData()}
          title="Detail views"
          definition="Detail-page views."
          compareLabel="vs previous 30 days"
          collectingLabel="Collecting data"
        />
      </Wrapper>,
    );

    expect(screen.getByText("317")).toBeInTheDocument();
    expect(screen.getByText("+49%")).toBeInTheDocument();
    expect(screen.getByText("213 previously")).toBeInTheDocument();
  });

  it("is a pressable control that reports its selected state", () => {
    render(
      <Wrapper>
        <MetricCard
          data={cardData({ metric: "downloads" })}
          title="Downloads"
          definition="Completed downloads."
          compareLabel={null}
          collectingLabel="Collecting data"
        />
      </Wrapper>,
    );

    // The card itself is the only pressable control; "Details" is a separate
    // affordance that happens to name the same metric.
    const control = screen.getAllByRole("button", { name: /Downloads/ }).find((b) =>
      b.hasAttribute("aria-pressed"),
    );
    expect(control).toBeDefined();
    expect(control).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(control!);
    expect(control).toHaveAttribute("aria-pressed", "true");
    // Selection is mirrored into the URL without a navigation.
    expect(new URLSearchParams(window.location.search).get("metric")).toBe("downloads");
  });

  it("suppresses the comparison entirely while an event is still collecting", () => {
    render(
      <Wrapper>
        <MetricCard
          data={cardData({ collecting: true, trend: null, formattedPrevious: null, spark: null })}
          title="Reader opens"
          definition="Reader opens."
          compareLabel="vs previous 30 days"
          collectingLabel="Collecting data"
        />
      </Wrapper>,
    );

    expect(screen.getByText("Collecting data")).toBeInTheDocument();
    expect(screen.queryByText(/previously/)).not.toBeInTheDocument();
  });

  it("selecting the default metric removes the parameter instead of pinning it", () => {
    window.history.replaceState(null, "", "/admin?metric=downloads");
    render(
      <Wrapper>
        <MetricCard
          data={cardData()}
          title="Detail views"
          definition="Detail-page views."
          compareLabel={null}
          collectingLabel="Collecting data"
        />
      </Wrapper>,
    );

    fireEvent.click(
      screen.getAllByRole("button", { name: /Detail views/ }).find((b) => b.hasAttribute("aria-pressed"))!,
    );
    expect(new URLSearchParams(window.location.search).has("metric")).toBe(false);
  });
});

const pulse: HealthPulse = {
  level: "degraded",
  failing: 1,
  passing: 2,
  unknown: 1,
  checks: [
    { key: "brokenFiles", level: "ok", value: 0, href: "/admin/data-quality" },
    { key: "storageErrors", level: "warn", value: 4.2, sample: 240, href: "/admin?view=system" },
    { key: "aiFailures", level: "unknown", value: null, sample: 2, href: "/admin?view=system" },
    { key: "backupAge", level: "ok", value: 6, href: "/admin?view=system" },
  ],
};

const healthPayload: HealthDetailPayload = {
  title: "System health",
  level: "At least one check is outside its normal range.",
  checks: pulse.checks.map((c) => ({
    key: c.key,
    label: c.key,
    levelLabel: c.level,
    level: c.level,
    detail: `detail for ${c.key}`,
    href: c.href,
  })),
  reportHref: "/admin?view=system",
  reportLabel: "Open the system report",
};

const metricPayloads: Record<string, MetricDetailPayload> = {
  views: {
    title: "Detail views",
    definition: "Detail-page views of library content.",
    value: "317",
    previous: "213",
    change: "+49%",
    changeDirection: "up",
    series: [
      { date: "2026-07-01", value: 4 },
      { date: "2026-07-02", value: 9 },
    ],
    prevSeries: null,
    top: [{ key: "book:1", title: "Chemistry 101", href: "/admin/edit/1", value: "88", secondary: "Books" }],
    alerts: [{ key: "brokenFiles", label: "3 files are broken", href: "/admin/data-quality", severity: "critical" }],
    reportHref: "/admin?view=content",
    reportLabel: "Open the full report",
    limitation: null,
  },
};

describe("HealthCard + MetricDetailsDrawer", () => {
  it("names the failing subsystem rather than only colouring it", () => {
    render(
      <Wrapper>
        <HealthCard pulse={pulse} />
      </Wrapper>,
    );
    expect(screen.getByText("Degraded")).toBeInTheDocument();
    expect(screen.getByText(/Attention needed/)).toBeInTheDocument();
  });

  it("opens as a modal dialog, lists every check, and closes on Escape", async () => {
    render(
      <Wrapper>
        <HealthCard pulse={pulse} />
        <MetricDetailsDrawer
          metrics={metricPayloads as never}
          health={healthPayload}
        />
      </Wrapper>,
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /View checks/ }));
    const dialog = screen.getByRole("dialog", { name: "System health" });
    expect(within(dialog).getByText("detail for storageErrors")).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows current, previous and change for a metric, plus its related alerts", async () => {
    render(
      <Wrapper>
        <MetricCard
          data={cardData()}
          title="Detail views"
          definition="Detail-page views."
          compareLabel={null}
          collectingLabel="Collecting data"
        />
        <MetricDetailsDrawer metrics={metricPayloads as never} health={healthPayload} />
      </Wrapper>,
    );

    fireEvent.click(screen.getByRole("button", { name: /Details/ }));
    const dialog = screen.getByRole("dialog", { name: "Detail views" });
    expect(within(dialog).getByText("317")).toBeInTheDocument();
    expect(within(dialog).getByText("213")).toBeInTheDocument();
    expect(within(dialog).getByText("+49%")).toBeInTheDocument();
    expect(within(dialog).getByText("Chemistry 101")).toBeInTheDocument();
    expect(within(dialog).getByText("3 files are broken")).toBeInTheDocument();
  });
});

const attention: ActionCenterData = {
  generatedAt: "2026-07-22T10:00:00.000Z",
  passedKeys: ["r2Fallback", "aiFailures"],
  items: [
    {
      key: "brokenFiles",
      severity: "critical",
      count: 3,
      oldestAt: "2026-07-22T09:00:00.000Z",
      href: "/admin/data-quality",
      module: "storage",
      impact: { key: "readerAttempts", value: 128 },
      secondary: [{ key: "storage", href: "/admin/storage" }],
    },
    {
      key: "zeroResultQueries",
      severity: "warning",
      count: 3,
      oldestAt: null,
      href: "/admin/search-insights",
      module: "search",
      impact: { key: "searches", value: 72 },
    },
    {
      key: "pendingRequests",
      severity: "pending",
      count: 5,
      oldestAt: "2026-07-19T10:00:00.000Z",
      href: "/admin/book-requests",
      module: "requests",
    },
    {
      key: "contactInbox",
      severity: "pending",
      count: 2,
      oldestAt: null,
      href: "/admin/inbox",
      module: "inbox",
    },
  ],
};

describe("NeedsAttentionPanel", () => {
  it("leads with severity, module, measured impact and a direct action", () => {
    render(
      <Wrapper>
        <NeedsAttentionPanel data={attention} />
      </Wrapper>,
    );

    expect(screen.getByText("3 files are broken or unreachable")).toBeInTheDocument();
    expect(screen.getByText(/128 reader-open or download attempts/)).toBeInTheDocument();
    expect(screen.getByText("Storage")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Repair files/ })).toHaveAttribute("href", "/admin/data-quality");
  });

  it("caps the queue at three items and expands on demand", () => {
    render(
      <Wrapper>
        <NeedsAttentionPanel data={attention} />
      </Wrapper>,
    );

    expect(screen.queryByText("2 unread contact messages")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /View all/ }));
    expect(screen.getByText("2 unread contact messages")).toBeInTheDocument();
  });

  it("filters by severity", () => {
    render(
      <Wrapper>
        <NeedsAttentionPanel data={attention} />
      </Wrapper>,
    );

    fireEvent.click(screen.getByRole("button", { name: /^Critical/ }));
    expect(screen.getByText("3 files are broken or unreachable")).toBeInTheDocument();
    expect(screen.queryByText(/search terms repeatedly find nothing/)).not.toBeInTheDocument();
  });

  it("explains that alerts clear themselves instead of offering a fake resolve", () => {
    render(
      <Wrapper>
        <NeedsAttentionPanel data={attention} />
      </Wrapper>,
    );

    fireEvent.click(screen.getByRole("button", { name: /^Clear/ }));
    expect(screen.getByText(/derived live from your data/)).toBeInTheDocument();
    expect(screen.getByText("R2 fallback")).toBeInTheDocument();
  });

  it("expands a row to show why the issue matters", () => {
    render(
      <Wrapper>
        <NeedsAttentionPanel data={attention} />
      </Wrapper>,
    );

    const expand = screen.getAllByRole("button", { name: /Show why this matters/ })[0];
    expect(expand).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(expand);
    expect(screen.getByText(/readers see an error instead of the document/)).toBeInTheDocument();
  });

  it("renders the Khmer queue without falling back to raw keys", () => {
    render(
      <Wrapper locale="km">
        <NeedsAttentionPanel data={attention} />
      </Wrapper>,
    );
    expect(screen.getByText("ត្រូវការការយកចិត្តទុកដាក់")).toBeInTheDocument();
    expect(screen.queryByText(/adminDashboard\./)).not.toBeInTheDocument();
  });
});

const contentRow = (over: Partial<TopContentRow> & { id: string; title: string }): TopContentRow => ({
  type: "book",
  published: true,
  language: "en",
  department: "Science",
  views: 10,
  prevViews: 5,
  readerOpens: 4,
  downloads: 1,
  visitors: 8,
  engagementPct: 50,
  fileBroken: false,
  missing: [],
  editHref: `/admin/edit/${over.id}`,
  publicHref: null,
  ...over,
});

describe("ContentPerformancePanel", () => {
  const rows: TopContentRow[] = [
    contentRow({ id: "1", title: "Popular but unread", views: 40, readerOpens: 0, prevViews: 40 }),
    contentRow({ id: "2", title: "Steady climber", views: 30, prevViews: 5 }),
    contentRow({ id: "3", title: "Needs metadata", views: 2, missing: ["cover", "description"] }),
  ];

  it("ranks by views by default and switches preset without a request", () => {
    render(
      <Wrapper>
        <ContentPerformancePanel rows={rows} contentHref="/admin?view=content" compare />
      </Wrapper>,
    );

    expect(screen.getByText("Popular but unread")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Viewed, not opened" }));
    expect(screen.getByText("Popular but unread")).toBeInTheDocument();
    expect(screen.queryByText("Steady climber")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Needs work" }));
    expect(screen.getByText("Needs metadata")).toBeInTheDocument();
    expect(screen.queryByText("Popular but unread")).not.toBeInTheDocument();
  });

  it("moves secondary metrics into an expandable detail rather than a wide table", () => {
    render(
      <Wrapper>
        <ContentPerformancePanel rows={rows} contentHref="/admin?view=content" compare />
      </Wrapper>,
    );

    expect(screen.queryByText("Reader opens")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Show details for Popular but unread/ }));
    expect(screen.getByText("Reader opens")).toBeInTheDocument();
  });

  it("shows a preset-specific empty state instead of a blank card", () => {
    render(
      <Wrapper>
        <ContentPerformancePanel
          rows={[contentRow({ id: "9", title: "Healthy", views: 9, readerOpens: 9, downloads: 9, prevViews: 20 })]}
          contentHref="/admin?view=content"
          compare
        />
      </Wrapper>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Rising" }));
    expect(screen.getByText("No record grew against the previous period.")).toBeInTheDocument();
  });
});

import { useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import enMessages from "@/messages/en.json";
import SelectedBucketDetails from "./SelectedBucketDetails";

const load = {
  status: "success" as const,
  error: null,
  retry: vi.fn(),
  data: {
    metric: "visitors" as const,
    grain: "week" as const,
    scope: {
      bucket: "2026-07-20",
      start: "2026-07-19T17:00:00.000Z",
      end: "2026-07-26T16:59:59.999Z",
      aggregationScope: "peakDay" as const,
      representativeDate: "2026-07-22",
      representativeDateTotal: 4,
    },
    total: 4,
    partial: false,
    rowsScanned: 10,
    ranking: { status: "unavailable" as const, basis: null, items: [], reason: "identifierCoverage" as const },
    unattributed: 2,
  },
};

function setViewport(mode: "mobile" | "tablet" | "desktop") {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn((query: string) => ({
      matches: query.includes("min-width") ? mode === "desktop" : mode === "mobile",
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

function Controlled({ mode }: { mode: "mobile" | "tablet" | "desktop" }) {
  setViewport(mode);
  const [expanded, setExpanded] = useState(false);
  return (
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <SelectedBucketDetails
        bucketLabel="Jul 20"
        metricLabel="Unique visitors"
        plottedValue={4}
        selected
        expanded={expanded}
        onExpandedChange={setExpanded}
        onClear={vi.fn()}
        load={load}
      />
    </NextIntlClientProvider>
  );
}

beforeEach(() => vi.clearAllMocks());

describe("SelectedBucketDetails adaptive pattern", () => {
  it("uses an expandable inline region on tablet", () => {
    render(<Controlled mode="tablet" />);
    fireEvent.click(screen.getByRole("button", { name: "View details" }));
    expect(screen.getByRole("region", { name: "Details for Jul 20" })).toBeInTheDocument();
    expect(screen.getByText("Peak day within this week/month: 2026-07-22")).toBeInTheDocument();
  });

  it("uses a modal side drawer on desktop and restores opener focus", async () => {
    render(<Controlled mode="desktop" />);
    const opener = screen.getByRole("button", { name: "View details" });
    fireEvent.click(opener);
    const dialog = screen.getByRole("dialog", { name: "Details for Jul 20" });
    expect(dialog.className).toContain("end-0");
    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(opener).toHaveFocus());
  });

  it("uses a bottom sheet on mobile", () => {
    render(<Controlled mode="mobile" />);
    fireEvent.click(screen.getByRole("button", { name: "View details" }));
    expect(screen.getByRole("dialog").className).toContain("bottom-0");
  });
});

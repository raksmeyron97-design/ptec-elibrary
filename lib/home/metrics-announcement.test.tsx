// lib/home/metrics-announcement.test.ts
//
// Pins the "a number is announced exactly once" contract, which a homepage
// audit read as a defect and which is easy to break by "simplifying".
//
// Reader-activity counts are rendered as a PAIR of elements:
//     <span aria-hidden="true">38</span><span class="sr-only">38 views</span>
//
// Sighted users see the compact figure; assistive tech skips it (aria-hidden)
// and reads the sr-only phrase instead — one announcement, with a unit.
// Extracting the DOM's raw *text* concatenates the pair into "3838 views",
// which is what an HTML-scraping audit sees and misreports as a duplication.
//
// The failure mode this guards is real and has two shapes:
//   • dropping aria-hidden  → the number IS announced twice
//   • dropping the sr-only  → a bare "38" with no unit is announced
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/messages/en.json";
import ResourceMetrics from "@/components/ui/core/ResourceMetrics";

function renderMetrics(props: { views?: number; downloads?: number }) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ResourceMetrics {...props} />
    </NextIntlClientProvider>,
  );
}

/** What a screen reader would announce: text content minus aria-hidden nodes. */
function accessibleText(root: HTMLElement): string {
  const clone = root.cloneNode(true) as HTMLElement;
  clone.querySelectorAll("[aria-hidden='true'],[aria-hidden='']").forEach((n) => n.remove());
  return (clone.textContent ?? "").replace(/\s+/g, " ").trim();
}

describe("reader-activity counts announce once", () => {
  it("announces the figure exactly once, with its unit", () => {
    const { container } = renderMetrics({ views: 38 });
    expect(accessibleText(container)).toBe("38 views");
    // The digits appear twice in raw text — that is the intended pattern, not
    // a bug. If this ever equals "38 views" the aria-hidden figure was dropped.
    expect(container.textContent?.replace(/\s+/g, " ").trim()).toBe("3838 views");
  });

  it("keeps views and downloads as separate announcements", () => {
    const { container } = renderMetrics({ views: 38, downloads: 4 });
    expect(accessibleText(container)).toBe("38 views, 4 downloads");
  });

  it("uses the singular form for a count of one", () => {
    const { container } = renderMetrics({ downloads: 1 });
    expect(accessibleText(container)).toBe("1 download");
  });

  it("announces the exact figure even when the visible one is abbreviated", () => {
    const { container } = renderMetrics({ views: 1200 });
    expect(screen.getByText("1.2K")).toHaveAttribute("aria-hidden", "true");
    expect(accessibleText(container)).toBe("1,200 views");
  });

  it("renders nothing at all when every metric is zero", () => {
    const { container } = renderMetrics({ views: 0, downloads: 0 });
    expect(container.textContent).toBe("");
  });
});

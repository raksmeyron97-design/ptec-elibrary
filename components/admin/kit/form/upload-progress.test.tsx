// Pins the three claims the upload panel makes to a user watching a 40 MB PDF
// leave a slow connection, each of which is a lie in a specific way if it
// regresses:
//
//   1. The bar is determinate ONLY while bytes are measurably moving. A
//      determinate bar parked at 99% while the server hashes and scans reads
//      as a hang, and is the reason someone reloads and uploads twice.
//   2. The rail and the bar move from the SAME fraction. Two progress signals
//      that disagree are worse than one.
//   3. The percentage is never inside a live region. It updates several times
//      a second; announcing it would make the panel unusable with a screen
//      reader — which is exactly what wrapping the whole panel in
//      `aria-live` (what both predecessors did) would now do.

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import UploadProgress from "./UploadProgress";
import type { UploadProgress as Transfer } from "@/lib/upload-progress";

const STEPS = [
  { id: "uploading-pdf", label: "Uploading PDF" },
  { id: "uploading-cover", label: "Uploading cover" },
  { id: "saving", label: "Saving record" },
] as const;

const sending = (loaded: number, total: number): Transfer => ({
  loaded,
  total,
  fraction: loaded / total,
  stage: "sending",
});

const MB = 1024 * 1024;

function renderPanel(props: Partial<React.ComponentProps<typeof UploadProgress>> = {}) {
  return render(
    <UploadProgress
      steps={STEPS}
      currentId="uploading-pdf"
      processingLabel="Processing on the server…"
      {...props}
    />,
  );
}

describe("<UploadProgress>", () => {
  it("renders nothing when no step is in flight", () => {
    const { container } = renderPanel({ currentId: null });
    expect(container).toBeEmptyDOMElement();
  });

  it("is determinate while bytes are moving, and says which file", () => {
    renderPanel({
      transfer: sending(18 * MB, 40 * MB),
      fileName: "pedagogy-handbook.pdf",
    });

    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "45");
    expect(screen.getByText("45%")).toBeInTheDocument();
    expect(screen.getByText("pedagogy-handbook.pdf")).toBeInTheDocument();
    expect(screen.getByText("18.0 MB of 40.0 MB")).toBeInTheDocument();
  });

  it("goes indeterminate once the bytes are gone and the server is working", () => {
    renderPanel({
      transfer: { loaded: 40 * MB, total: 40 * MB, fraction: 1, stage: "finalizing" },
    });

    const bar = screen.getByRole("progressbar");
    // No claimed position at all — not 100, not 99.
    expect(bar).not.toHaveAttribute("aria-valuenow");
    expect(bar.className).toContain("upl-bar--indeterminate");
    expect(screen.getByText("Processing on the server…")).toBeInTheDocument();
  });

  it("has no measurable progress for a step that transfers nothing", () => {
    renderPanel({ currentId: "saving" });
    expect(screen.getByRole("progressbar")).not.toHaveAttribute("aria-valuenow");
    expect(screen.getByText("Processing on the server…")).toBeInTheDocument();
  });

  it("fills the connector behind the active step from the same fraction as the bar", () => {
    const { container } = renderPanel({
      currentId: "uploading-cover",
      transfer: sending(1 * MB, 4 * MB),
    });

    const fills = container.querySelectorAll<HTMLElement>(".upl-link-fill");
    // Two connectors: the one behind the finished first step, and the one the
    // active second step is currently filling.
    expect(fills).toHaveLength(2);
    expect(fills[0].style.width).toBe("100%");
    expect(fills[1].style.width).toBe("25%");
    expect(container.querySelector<HTMLElement>(".upl-fill")!.style.width).toBe("25%");
  });

  it("announces the step and nothing that ticks", () => {
    const { container } = renderPanel({
      transfer: sending(18 * MB, 40 * MB),
      fileName: "pedagogy-handbook.pdf",
    });

    const live = container.querySelectorAll("[aria-live]");
    expect(live).toHaveLength(1);
    expect(live[0].textContent).toBe("Step 1 of 3: Uploading PDF");
    expect(live[0].textContent).not.toContain("%");
    expect(live[0].textContent).not.toContain("MB");
  });

  it("takes its tone from a data attribute rather than a second component", () => {
    const { container } = renderPanel({ tone: "info" });
    expect(container.querySelector(".upl")).toHaveAttribute("data-tone", "info");
  });
});

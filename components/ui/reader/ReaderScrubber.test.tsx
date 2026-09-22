import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import enMessages from "@/messages/en.json";
import ReaderScrubber from "./ReaderScrubber";

function scrubber({
  onCommit = vi.fn(),
  currentPage = 5,
  numPages = 40,
  fmt = String as (n: number | string) => string,
} = {}) {
  const view = render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <ReaderScrubber currentPage={currentPage} numPages={numPages} progressPct={12} onCommit={onCommit} fmt={fmt} />
    </NextIntlClientProvider>,
  );
  return { onCommit, view, slider: () => screen.getByRole("slider", { name: "Go to page" }) };
}

describe("ReaderScrubber", () => {
  it("names where it will land while dragging, and moves the reader only on `change`", () => {
    const { onCommit, slider } = scrubber();
    expect(slider()).toHaveAttribute("aria-valuetext", "Page 5 of 40");

    // A drag is a run of `input` events…
    fireEvent.input(slider(), { target: { value: "12" } });
    fireEvent.input(slider(), { target: { value: "20" } });
    expect(onCommit).not.toHaveBeenCalled();
    expect(screen.getByText("Page 20 of 40")).toBeInTheDocument(); // the bubble
    expect(screen.getByText("50%")).toBeInTheDocument(); // the figure follows the thumb
    expect(slider()).toHaveAttribute("aria-valuetext", "Page 20 of 40");

    // …the finger lifting is NOT the commit…
    fireEvent.pointerUp(slider());
    expect(onCommit).not.toHaveBeenCalled();

    // …the one `change` is — the same event a keyboard arrow and a screen
    // reader's adjust gesture send. One drag, one jump.
    fireEvent.change(slider());
    fireEvent.blur(slider());
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith(20);
    expect(screen.queryByText("Page 20 of 40")).toBeNull();
  });

  it("a drag that ends where it began moves nothing and clears its bubble", () => {
    const { onCommit, slider } = scrubber();
    fireEvent.input(slider(), { target: { value: "9" } });
    fireEvent.input(slider(), { target: { value: "5" } });
    fireEvent.pointerUp(slider());
    expect(onCommit).not.toHaveBeenCalled();
    expect(screen.queryByText("Page 5 of 40")).toBeNull();
  });

  it("the bubble is presentation only; the slider carries the name and value", () => {
    const { slider } = scrubber();
    fireEvent.input(slider(), { target: { value: "30" } });
    expect(screen.getByText("Page 30 of 40")).toHaveAttribute("aria-hidden", "true");
  });

  it("shows reading progress beside the track", () => {
    scrubber();
    expect(screen.getByText("12%")).toBeInTheDocument();
  });

  it("formats with the reader's digits (Khmer)", () => {
    const km = (n: number | string) => String(n).replace(/\d/g, (d) => "០១២៣៤៥៦៧៨៩"[Number(d)]);
    const { slider } = scrubber({ fmt: km });
    expect(slider()).toHaveAttribute("aria-valuetext", "Page ៥ of ៤០");
    expect(screen.getByText("១២%")).toBeInTheDocument();
  });

  it("a one-page document gets no slider, only the spacer that keeps the bar's layout", () => {
    const { view } = scrubber({ numPages: 1, currentPage: 1 });
    expect(screen.queryByRole("slider")).toBeNull();
    expect(view.container.firstElementChild).toHaveClass("md:hidden");
  });
});

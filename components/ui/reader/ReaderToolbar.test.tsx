import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import enMessages from "@/messages/en.json";
import ReaderToolbar from "./ReaderToolbar";

/**
 * The compact variant is OPT-IN, and that is the whole contract.
 *
 * `ReaderToolbar` is rendered by three callers: the journal article's abstract
 * (inline, compact), the thesis abstract (inline, default) and the fullscreen
 * reader dialog (dialog). Folding the size controls behind an "Aa" disclosure
 * was a journal-article decision; the thesis page is outside that work, and the
 * dialog IS the reading surface, so its controls stay out where one press
 * reaches them — `e2e/abstract-reader.spec.ts` asserts exactly that.
 */
function toolbar(props: Partial<React.ComponentProps<typeof ReaderToolbar>> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <ReaderToolbar
        textSize={100}
        canDecrease
        canIncrease
        onDecrease={vi.fn()}
        onIncrease={vi.fn()}
        onReset={vi.fn()}
        mode="inline"
        onOpen={vi.fn()}
        {...props}
      />
    </NextIntlClientProvider>,
  );
}

const sizeControlsVisible = () =>
  screen.queryAllByRole("button", { name: /Increase text size|Decrease text size|Current text size/ }).length;

describe("ReaderToolbar variants", () => {
  it("inline defaults to the full strip — the thesis page must not change", () => {
    toolbar();
    expect(sizeControlsVisible()).toBe(3);
    expect(screen.queryByRole("button", { name: "Text size" })).not.toBeInTheDocument();
  });

  it("the dialog keeps its controls out, whatever variant is asked for", () => {
    toolbar({ mode: "dialog", variant: "compact", onClose: vi.fn(), onOpen: undefined });
    expect(sizeControlsVisible()).toBe(3);
    expect(screen.queryByRole("button", { name: "Text size" })).not.toBeInTheDocument();
  });

  it("compact folds the size controls behind one labelled disclosure", () => {
    toolbar({ variant: "compact" });
    const trigger = screen.getByRole("button", { name: "Text size" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(sizeControlsVisible()).toBe(0);
    // The action that is NOT about size stays reachable in one press.
    expect(screen.getByRole("button", { name: "Open abstract reader" })).toBeVisible();

    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(trigger).toHaveAttribute("aria-controls", screen.getByText("Text size", { selector: "p" }).closest("div")!.id);
    expect(sizeControlsVisible()).toBe(3);
  });

  it("compact closes on Escape and hands focus back to the control that opened it", () => {
    toolbar({ variant: "compact" });
    const trigger = screen.getByRole("button", { name: "Text size" });
    fireEvent.click(trigger);
    expect(sizeControlsVisible()).toBe(3);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(sizeControlsVisible()).toBe(0);
    expect(trigger).toHaveFocus();
  });

  it("compact closes when the reader presses somewhere else, but not inside itself", () => {
    toolbar({ variant: "compact" });
    fireEvent.click(screen.getByRole("button", { name: "Text size" }));

    fireEvent.pointerDown(screen.getByRole("button", { name: "Increase text size" }));
    expect(sizeControlsVisible()).toBe(3);

    fireEvent.pointerDown(document.body);
    expect(sizeControlsVisible()).toBe(0);
  });

  it("every control stays a 44px touch target in both variants", () => {
    const { unmount } = toolbar();
    for (const b of screen.getAllByRole("button")) expect(b).toHaveClass("h-11");
    unmount();

    toolbar({ variant: "compact" });
    fireEvent.click(screen.getByRole("button", { name: "Text size" }));
    for (const b of screen.getAllByRole("button")) expect(b).toHaveClass("h-11");
  });
});

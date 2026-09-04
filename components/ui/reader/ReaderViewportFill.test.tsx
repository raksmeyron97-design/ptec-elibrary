import { beforeAll, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import ReaderViewportFill from "./ReaderViewportFill";

beforeAll(() => {
  vi.stubGlobal("ResizeObserver", class {
    observe() {}
    disconnect() {}
    unobserve() {}
  });
});

describe("ReaderViewportFill", () => {
  it("sizes itself to the viewport minus its document offset and the reserved bottom strip", () => {
    const { container } = render(
      <ReaderViewportFill>
        <div>reader</div>
      </ReaderViewportFill>,
    );
    const el = container.firstElementChild as HTMLElement;
    vi.spyOn(el, "getBoundingClientRect").mockReturnValue({ top: 120 } as DOMRect);
    window.dispatchEvent(new Event("resize"));
    expect(el.style.getPropertyValue("--reader-top-offset")).toBe("120px");
    expect(el.style.height).toBe("calc(100dvh - var(--reader-top-offset, 0px) - var(--reader-bottom-reserve, 0px))");
    // The phone-only reserve is a class-driven custom property, cleared at lg.
    expect(el.className).toContain("[--reader-bottom-reserve:calc(4.5rem+env(safe-area-inset-bottom))]");
    expect(el.className).toContain("lg:[--reader-bottom-reserve:0px]");
  });

  it("never reports a negative offset when the page is scrolled past it", () => {
    const { container } = render(<ReaderViewportFill>x</ReaderViewportFill>);
    const el = container.firstElementChild as HTMLElement;
    vi.spyOn(el, "getBoundingClientRect").mockReturnValue({ top: -300 } as DOMRect);
    Object.defineProperty(window, "scrollY", { configurable: true, value: 100 });
    window.dispatchEvent(new Event("resize"));
    expect(el.style.getPropertyValue("--reader-top-offset")).toBe("0px");
  });
});

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import enMessages from "@/messages/en.json";
import kmMessages from "@/messages/km.json";
import ThesisAbstractReader from "./ThesisAbstractReader";
import { READER_TEXT_SIZE_STORAGE_KEY } from "@/components/ui/reader/useReaderPreferences";

// KeywordList links via next-intl navigation; render a plain anchor in tests.
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) =>
    createElement("a", { href, ...rest }, children),
}));

const englishAbstract =
  "This thesis studies teacher education in Cambodia.\n\nA second paragraph keeps the reading sample realistic and reflows at every zoom step.";
const khmerAbstract =
  "សារណានេះសិក្សាអំពីការបណ្ដុះបណ្ដាលគរុកោសល្យនៅកម្ពុជា។\n\nកថាខណ្ឌទីពីរធ្វើឱ្យគំរូអានមានលក្ខណៈជាក់ស្តែង។";

beforeAll(() => {
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  window.scrollTo = vi.fn();
  // jsdom has no layout; the shared focus trap filters controls by offsetParent.
  Object.defineProperty(HTMLElement.prototype, "offsetParent", {
    configurable: true,
    get() {
      return this.parentElement;
    },
  });
});

beforeEach(() => {
  window.localStorage.clear();
  document.body.removeAttribute("style");
});

afterEach(() => {
  vi.clearAllMocks();
});

function renderReader(
  locale: "en" | "km" = "en",
  props: Partial<Parameters<typeof ThesisAbstractReader>[0]> = {},
) {
  const messages = locale === "km" ? kmMessages : enMessages;
  return render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <ThesisAbstractReader
        abstract={englishAbstract}
        keywords={["Pedagogy", "Assessment"]}
        basePath="/theses"
        title="A Study of Teacher Education"
        locale={locale}
        {...props}
      />
    </NextIntlClientProvider>,
  );
}

function inlineCopy(): HTMLElement {
  const copy = document.querySelector<HTMLElement>(
    ".abstract-reader-copy:not(.abstract-reader-copy--fullscreen)",
  );
  if (!copy) throw new Error("Inline abstract copy was not rendered");
  return copy;
}

describe("ThesisAbstractReader inline controls", () => {
  it("renders localized touch-sized controls and scales only the abstract", () => {
    renderReader();

    for (const name of ["Decrease text size", "Increase text size", "Open abstract reader"]) {
      const control = screen.getByRole("button", { name });
      expect(control).toHaveClass("h-11");
      expect(control).toHaveAttribute("title");
    }
    expect(inlineCopy().style.getPropertyValue("--reader-scale")).toBe("1");
    // Plain-text abstract split into paragraphs, no citation markers.
    expect(inlineCopy().querySelectorAll("p")).toHaveLength(2);
    expect(inlineCopy().querySelector('a[href^="#reference-"]')).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent("Text size 100%");
    // Keywords remain outside the scaled reading column.
    expect(screen.getByRole("link", { name: "Pedagogy" })).toBeInTheDocument();
  });

  it("increments by 10%, enforces the 80–160% limits, and resets", async () => {
    renderReader();
    const decrease = screen.getByRole("button", { name: "Decrease text size" });
    const increase = screen.getByRole("button", { name: "Increase text size" });

    fireEvent.click(decrease);
    fireEvent.click(decrease);
    expect(decrease).toBeDisabled();
    expect(inlineCopy().style.getPropertyValue("--reader-scale")).toBe("0.8");

    for (let size = 90; size <= 160; size += 10) fireEvent.click(increase);
    expect(increase).toBeDisabled();
    expect(inlineCopy().style.getPropertyValue("--reader-scale")).toBe("1.6");

    fireEvent.click(screen.getByRole("button", { name: /Current text size: 160%.*Reset text size/ }));
    expect(inlineCopy().style.getPropertyValue("--reader-scale")).toBe("1");
  });

  it("loads and persists the shared reader preference", async () => {
    window.localStorage.setItem(READER_TEXT_SIZE_STORAGE_KEY, "120");
    renderReader();
    await screen.findByRole("button", { name: /Current text size: 120%/ });
    expect(inlineCopy().style.getPropertyValue("--reader-scale")).toBe("1.2");

    fireEvent.click(screen.getByRole("button", { name: "Increase text size" }));
    await waitFor(() => {
      expect(window.localStorage.getItem(READER_TEXT_SIZE_STORAGE_KEY)).toBe("130");
    });
  });

  it("shows the empty state and detects Khmer-dominant abstracts", () => {
    const { rerender } = renderReader("en", { abstract: "" });
    expect(screen.getByText("No abstract provided.")).toBeInTheDocument();

    rerender(
      <NextIntlClientProvider locale="km" messages={kmMessages}>
        <ThesisAbstractReader
          abstract={khmerAbstract}
          keywords={[]}
          basePath="/theses"
          title="ការសិក្សា"
          locale="km"
        />
      </NextIntlClientProvider>,
    );
    expect(inlineCopy()).toHaveAttribute("lang", "km");
    expect(inlineCopy()).toHaveClass("font-khmer-serif");
  });
});

describe("ThesisAbstractReader fullscreen reader", () => {
  it("opens a labelled dialog, traps focus, and restores focus on Escape", async () => {
    renderReader();
    const trigger = screen.getByRole("button", { name: "Open abstract reader" });
    trigger.focus();
    fireEvent.click(trigger);

    const dialog = await screen.findByRole("dialog", {
      name: "Abstract: A Study of Teacher Education",
    });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(within(dialog).getByText("Fullscreen reading mode")).toBeInTheDocument();
    expect(document.body.style.overflow).toBe("hidden");
    const firstControl = within(dialog).getByRole("button", { name: "Decrease text size" });
    await waitFor(() => expect(firstControl).toHaveFocus());
    expect(dialog.querySelector("main .abstract-reader-copy--fullscreen")).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
    expect(document.body.style.overflow).toBe("");
  });

  it("shares zoom state between page and dialog and localizes Khmer chrome", async () => {
    renderReader("km");
    fireEvent.click(screen.getByRole("button", { name: "បង្កើនទំហំអក្សរ" }));
    fireEvent.click(screen.getByRole("button", { name: "បើកផ្ទាំងអានសេចក្តីសង្ខេប" }));
    const dialog = await screen.findByRole("dialog");
    const article = dialog.querySelector<HTMLElement>(".abstract-reader-copy--fullscreen");

    expect(within(dialog).getByText("របៀបអានពេញអេក្រង់")).toBeInTheDocument();
    expect(article?.style.getPropertyValue("--reader-scale")).toBe("1.1");
    expect(dialog.querySelectorAll("main article p")).toHaveLength(2);
  });
});

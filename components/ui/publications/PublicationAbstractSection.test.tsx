import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { act } from "react";
import { renderToString } from "react-dom/server";
import { hydrateRoot } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";

import enMessages from "@/messages/en.json";
import kmMessages from "@/messages/km.json";
import type { PublicationReference } from "@/lib/publications";
import { collectCitationOccurrences } from "@/lib/publications/citations";
import PublicationAbstractSection from "./PublicationAbstractSection";
import ReferencesSection from "./ReferencesSection";
import { READER_TEXT_SIZE_STORAGE_KEY } from "@/components/ui/reader/useReaderPreferences";

const references: PublicationReference[] = [
  { id: "ref-water", index: 1, text: "A reference about water." },
];

const englishAbstract =
  "**Water** is H<sub>2</sub>O and the result is significant [cite:ref-water].\n\nA second paragraph keeps the reading sample realistic.";
const khmerAbstract =
  "**ទឹក** មានរូបមន្ត H<sub>2</sub>O និងមានឯកសារយោង [cite:ref-water]។\n\nកថាខណ្ឌទីពីរសម្រាប់សាកល្បងការអាន។";

class ResizeObserverMock {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

beforeAll(() => {
  vi.stubGlobal("ResizeObserver", ResizeObserverMock);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  Element.prototype.scrollIntoView = vi.fn();
  window.scrollTo = vi.fn();

  // jsdom has no layout, while the shared focus trap intentionally filters
  // display:none controls through offsetParent in a real browser.
  Object.defineProperty(HTMLElement.prototype, "offsetParent", {
    configurable: true,
    get() {
      return this.parentElement;
    },
  });
});

beforeEach(() => {
  window.localStorage.clear();
  window.location.hash = "";
  document.body.removeAttribute("style");
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

type RenderOptions = {
  abstract?: string;
  abstractKm?: string | null;
  includeReferences?: boolean;
};

function abstractUi(locale: "en" | "km" = "en", options: RenderOptions = {}) {
  const messages = locale === "km" ? kmMessages : enMessages;
  const abstract = options.abstract ?? englishAbstract;
  const abstractKm = options.abstractKm === undefined ? khmerAbstract : options.abstractKm;
  const occurrences = collectCitationOccurrences(
    [
      { id: "abstract-en", text: abstract },
      { id: "abstract-km", text: abstractKm },
    ],
    references,
  );

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <>
        <PublicationAbstractSection
          abstract={abstract}
          abstractKm={abstractKm}
          references={references}
          heading={locale === "km" ? "សេចក្តីសង្ខេប" : "Abstract"}
          publicationTitle={locale === "km" ? "ការសិក្សាអំពីការរៀនវិទ្យាសាស្ត្រ" : "A Study of Science Learning"}
          locale={locale}
        />
        {options.includeReferences && (
          <ReferencesSection references={references} occurrences={occurrences} />
        )}
      </>
    </NextIntlClientProvider>
  );
}

function renderAbstract(locale: "en" | "km" = "en", options: RenderOptions = {}) {
  return render(abstractUi(locale, options));
}

function inlineEnglishCopy(): HTMLElement {
  const copy = document.querySelector<HTMLElement>(
    '.abstract-reader-copy[lang="en"]:not(.abstract-reader-copy--fullscreen)',
  );
  if (!copy) throw new Error("Inline English abstract was not rendered");
  return copy;
}

describe("PublicationAbstractSection reader controls", () => {
  it("renders localized, touch-sized controls and safely scales only the abstract", () => {
    renderAbstract();

    const decrease = screen.getByRole("button", { name: "Decrease text size" });
    const increase = screen.getByRole("button", { name: "Increase text size" });
    const reset = screen.getByRole("button", { name: /Current text size: 100%.*Reset text size/ });
    const open = screen.getByRole("button", { name: "Open abstract reader" });

    for (const control of [decrease, increase, reset, open]) {
      expect(control).toHaveClass("h-11");
      expect(control).toHaveAttribute("title");
    }
    expect(inlineEnglishCopy().style.getPropertyValue("--reader-scale")).toBe("1");
    expect(screen.getByRole("status")).toHaveTextContent("Text size 100%");
    expect(inlineEnglishCopy().querySelector("strong")).toHaveTextContent("Water");
    expect(inlineEnglishCopy().querySelector("sub")).toHaveTextContent("2");
    expect(inlineEnglishCopy().querySelector('a[href="#reference-ref-water"]')).toBeInTheDocument();
  });

  it("increments by 10%, enforces the 80–160% limits, and resets to 100%", () => {
    renderAbstract();

    const decrease = screen.getByRole("button", { name: "Decrease text size" });
    const increase = screen.getByRole("button", { name: "Increase text size" });

    fireEvent.click(decrease);
    fireEvent.click(decrease);
    expect(decrease).toBeDisabled();
    expect(screen.getByRole("button", { name: /Current text size: 80%/ })).toBeInTheDocument();
    expect(inlineEnglishCopy().style.getPropertyValue("--reader-scale")).toBe("0.8");

    for (let size = 90; size <= 160; size += 10) fireEvent.click(increase);
    expect(increase).toBeDisabled();
    expect(screen.getByRole("button", { name: /Current text size: 160%/ })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Text size 160%");
    expect(inlineEnglishCopy().style.getPropertyValue("--reader-scale")).toBe("1.6");

    fireEvent.click(screen.getByRole("button", { name: /Current text size: 160%.*Reset text size/ }));
    expect(screen.getByRole("button", { name: /Current text size: 100%/ })).toBeInTheDocument();
    expect(inlineEnglishCopy().style.getPropertyValue("--reader-scale")).toBe("1");
  });

  it("loads and persists the reader preference", async () => {
    window.localStorage.setItem(READER_TEXT_SIZE_STORAGE_KEY, "130");
    const first = renderAbstract();

    await screen.findByRole("button", { name: /Current text size: 130%/ });
    expect(inlineEnglishCopy().style.getPropertyValue("--reader-scale")).toBe("1.3");

    fireEvent.click(screen.getByRole("button", { name: "Increase text size" }));
    await waitFor(() => {
      expect(window.localStorage.getItem(READER_TEXT_SIZE_STORAGE_KEY)).toBe("140");
    });

    first.unmount();
    renderAbstract();
    await screen.findByRole("button", { name: /Current text size: 140%/ });
  });

  it("server-renders 100% and hydrates a saved preference without mismatch errors", async () => {
    window.localStorage.setItem(READER_TEXT_SIZE_STORAGE_KEY, "130");
    const ui = abstractUi("en");
    const markup = renderToString(ui);
    expect(markup).toContain("Current text size: 100%");

    const host = document.createElement("div");
    host.innerHTML = markup;
    document.body.appendChild(host);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const root = hydrateRoot(host, ui);

    await waitFor(() => {
      expect(within(host).getByRole("button", { name: /Current text size: 130%/ })).toBeInTheDocument();
    });
    expect(consoleError.mock.calls.flat().join(" ")).not.toMatch(/hydration|did not match/i);

    await act(async () => root.unmount());
    host.remove();
    consoleError.mockRestore();
  });

  it("continues working when localStorage is unavailable", async () => {
    const getItem = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("Storage blocked", "SecurityError");
    });
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Storage blocked", "SecurityError");
    });

    renderAbstract();
    fireEvent.click(screen.getByRole("button", { name: /Current text size: .*Reset text size/ }));
    fireEvent.click(screen.getByRole("button", { name: "Increase text size" }));
    expect(await screen.findByRole("button", { name: /Current text size: 110%/ })).toBeInTheDocument();

    expect(getItem).toHaveBeenCalled();
    expect(setItem).toHaveBeenCalled();

    getItem.mockRestore();
    setItem.mockRestore();
    fireEvent.click(screen.getByRole("button", { name: /Current text size: 110%.*Reset text size/ }));
    expect(window.localStorage.getItem(READER_TEXT_SIZE_STORAGE_KEY)).toBe("100");
  });

  it("keeps the in-memory preference when reads work but storage writes fail", async () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Storage is read-only", "QuotaExceededError");
    });

    renderAbstract();
    fireEvent.click(screen.getByRole("button", { name: "Increase text size" }));
    expect(await screen.findByRole("button", { name: /Current text size: 110%/ })).toBeInTheDocument();

    setItem.mockRestore();
    fireEvent.click(screen.getByRole("button", { name: /Current text size: 110%.*Reset text size/ }));
    expect(window.localStorage.getItem(READER_TEXT_SIZE_STORAGE_KEY)).toBe("100");
  });
});

describe("Abstract fullscreen reader", () => {
  it("opens as a labelled fallback dialog, traps focus, and restores focus and page styles", async () => {
    document.body.style.overflow = "clip";
    const { container } = renderAbstract();
    const trigger = screen.getByRole("button", { name: "Open abstract reader" });
    trigger.focus();
    fireEvent.click(trigger);

    const dialog = await screen.findByRole("dialog", {
      name: "Abstract: A Study of Science Learning",
    });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(within(dialog).getByText("Fullscreen reading mode")).toBeInTheDocument();
    expect(document.body.style.overflow).toBe("hidden");
    expect(document.body.style.position).toBe("fixed");
    expect(document.documentElement.requestFullscreen).toBeUndefined();

    const firstControl = within(dialog).getByRole("button", { name: "Decrease text size" });
    const close = within(dialog).getByRole("button", { name: "Close abstract reader" });
    await waitFor(() => expect(firstControl).toHaveFocus());
    expect(container).toHaveAttribute("aria-hidden", "true");
    expect(container.inert).toBe(true);
    // The reader owns a single <main> scroll region holding the scaled column.
    expect(dialog.querySelector("main .abstract-reader-copy--fullscreen")).toBeInTheDocument();

    trigger.focus();
    expect(dialog).toHaveFocus();
    firstControl.focus();

    const focusables = dialog.querySelectorAll<HTMLElement>('a[href], button:not([disabled])');
    const lastControl = focusables[focusables.length - 1];
    expect(close).toBeInTheDocument();
    lastControl.focus();
    fireEvent.keyDown(lastControl, { key: "Tab" });
    expect(firstControl).toHaveFocus();
    fireEvent.keyDown(firstControl, { key: "Tab", shiftKey: true });
    expect(lastControl).toHaveFocus();

    fireEvent.click(close);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
    expect(document.body.style.overflow).toBe("clip");
    expect(document.body.style.position).toBe("");
    expect(container).not.toHaveAttribute("aria-hidden");
    expect(container.inert).toBe(false);
    expect(window.scrollTo).toHaveBeenCalled();
    expect(container.querySelector("#citation-abstract-en-ref-water-1")).toBeInTheDocument();
  });

  it("closes with Escape and returns focus to the expand control", async () => {
    renderAbstract("en", { includeReferences: true });
    const trigger = screen.getByRole("button", { name: "Open abstract reader" });
    fireEvent.click(trigger);
    await screen.findByRole("dialog");

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it("keeps rich text and citation links while namespacing every modal citation ID", async () => {
    renderAbstract("en", { includeReferences: true });
    fireEvent.click(screen.getByRole("button", { name: "Open abstract reader" }));
    const dialog = await screen.findByRole("dialog");

    expect(within(dialog).getByText("Water", { selector: "strong" })).toBeInTheDocument();
    expect(within(dialog).getAllByText("2", { selector: "sub" })).not.toHaveLength(0);
    const modalCitation = dialog.querySelector<HTMLAnchorElement>('a[href="#reference-ref-water"]');
    expect(modalCitation).toHaveAttribute("id", "citation-abstract-reader-en-ref-water-1");
    expect(document.querySelector("#citation-abstract-en-ref-water-1")).toBeInTheDocument();

    const ids = [...document.querySelectorAll<HTMLElement>("[id]")].map((element) => element.id);
    expect(new Set(ids).size).toBe(ids.length);

    fireEvent.click(modalCitation!);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(window.location.hash).toBe("#reference-ref-water");
    const referenceTarget = document.getElementById("reference-ref-water");
    await waitFor(() => expect(referenceTarget).toHaveFocus());
    expect(referenceTarget?.querySelector('a[href="#citation-abstract-en-ref-water-1"]')).toBeInTheDocument();
  });

  it("shares zoom state between page and dialog and resets from the percentage control", async () => {
    renderAbstract();
    fireEvent.click(screen.getByRole("button", { name: "Increase text size" }));
    fireEvent.click(screen.getByRole("button", { name: "Open abstract reader" }));
    const dialog = await screen.findByRole("dialog");
    const article = dialog.querySelector<HTMLElement>(".abstract-reader-copy--fullscreen");

    expect(within(dialog).getByRole("button", { name: /Current text size: 110%/ })).toBeInTheDocument();
    expect(article?.style.getPropertyValue("--reader-scale")).toBe("1.1");

    fireEvent.click(within(dialog).getByRole("button", { name: /Current text size: 110%.*Reset text size/ }));
    expect(within(dialog).getByRole("status")).toHaveTextContent("Text size 100%");
    expect(article?.style.getPropertyValue("--reader-scale")).toBe("1");
  });

  it("uses Khmer labels, Khmer-first content order, and Khmer reading typography", async () => {
    renderAbstract("km");
    const trigger = screen.getByRole("button", { name: "បើកផ្ទាំងអានសេចក្តីសង្ខេប" });
    fireEvent.click(trigger);

    const dialog = await screen.findByRole("dialog", {
      name: "សេចក្តីសង្ខេប: ការសិក្សាអំពីការរៀនវិទ្យាសាស្ត្រ",
    });
    expect(within(dialog).getByText("របៀបអានពេញអេក្រង់")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "បង្កើនទំហំអក្សរ" })).toHaveClass("h-11");

    const languageSections = dialog.querySelectorAll<HTMLElement>("main article > section");
    expect(languageSections[0]).toHaveAttribute("lang", "km");
    expect(languageSections[0].querySelector(".font-khmer-serif")).toBeInTheDocument();
    expect(languageSections[1]).toHaveAttribute("lang", "en");
  });

  it("renders only available languages and shows one empty state when neither exists", async () => {
    const khmerOnly = renderAbstract("km", { abstract: "", abstractKm: khmerAbstract });
    fireEvent.click(screen.getByRole("button", { name: "បើកផ្ទាំងអានសេចក្តីសង្ខេប" }));
    let dialog = await screen.findByRole("dialog");
    expect(dialog.querySelectorAll("article > section")).toHaveLength(1);
    expect(dialog.querySelector("article > section")).toHaveAttribute("lang", "km");
    expect(within(dialog).queryByText("មិនមានសេចក្តីសង្ខេបទេ។")).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "បិទផ្ទាំងអានសេចក្តីសង្ខេប" }));
    khmerOnly.unmount();

    renderAbstract("en", { abstract: "", abstractKm: null });
    fireEvent.click(screen.getByRole("button", { name: "Open abstract reader" }));
    dialog = await screen.findByRole("dialog");
    expect(dialog.querySelector("article > section")).not.toBeInTheDocument();
    expect(within(dialog).getAllByText("No abstract provided.")).toHaveLength(1);
  });
});

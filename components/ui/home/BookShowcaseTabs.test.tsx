import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import enMessages from "@/messages/en.json";
import kmMessages from "@/messages/km.json";
import BookShowcaseTabs from "./BookShowcaseTabs";

// Same swap as LibraryNow.test.tsx: the locale-aware <Link> needs app-router
// context this test does not set up.
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) =>
    createElement("a", { href, ...rest }, children),
}));

// BookCard reaches image/analytics plumbing that is irrelevant here — the
// subject of this file is the tab semantics, not the card.
vi.mock("@/components/ui/books/BookCard", () => ({
  default: ({ book }: { book: { slug: string; title: string } }) =>
    createElement("article", null, book.title),
}));

// jsdom has no IntersectionObserver, and the panel renders its cards inside
// <StaggerRevealContainer>. Stub it as "already on screen" so the reveal
// wrapper settles into its visible state — the subject here is the tab
// semantics, not the scroll animation. Local to this file rather than added to
// vitest.setup.ts: a global shim would silently change what every other
// suite's observers do.
class ImmediateIntersectionObserver {
  constructor(private cb: IntersectionObserverCallback) {}
  observe(target: Element) {
    this.cb(
      [{ isIntersecting: true, target } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    );
  }
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
  root = null;
  rootMargin = "";
  thresholds = [];
}
vi.stubGlobal("IntersectionObserver", ImmediateIntersectionObserver);

function book(slug: string, title: string) {
  return { slug, title } as never;
}

const TRENDING = [book("a", "Trending A"), book("b", "Trending B")];
const RECENT = [book("c", "Recent C")];
const DEPTS = ["Mathematics"];
const DEPT_BOOKS = { Mathematics: [book("d", "Maths D")] };

function renderTabs(messages: Record<string, unknown> = enMessages, locale = "en") {
  return render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <BookShowcaseTabs
        trending={TRENDING}
        recent={RECENT}
        depts={DEPTS}
        deptBooks={DEPT_BOOKS}
        layout="grid"
      />
    </NextIntlClientProvider>,
  );
}

const tabs = () => screen.getAllByRole("tab");
const selected = () => tabs().filter((t) => t.getAttribute("aria-selected") === "true");

describe("BookShowcaseTabs — WAI-ARIA tabs pattern", () => {
  it("pairs every tab with the panel and keeps one tab in the tab order", () => {
    renderTabs();
    const panel = screen.getByRole("tabpanel");

    for (const tab of tabs()) {
      expect(tab.getAttribute("aria-controls")).toBe(panel.id);
    }
    // Roving tabIndex: exactly one tab is reachable with Tab.
    expect(tabs().filter((t) => t.getAttribute("tabindex") === "0")).toHaveLength(1);
    expect(panel.getAttribute("aria-labelledby")).toBe(selected()[0].id);
  });

  it("moves selection with Arrow/Home/End keys", () => {
    renderTabs();

    tabs()[0].focus();
    fireEvent.keyDown(document.activeElement!, { key: "ArrowRight" });
    expect(selected()[0]).toHaveTextContent("Recently Added");
    // Selection follows focus, so the newly selected tab must also hold it —
    // otherwise the next arrow press goes to the tab the user just left.
    expect(selected()[0]).toHaveFocus();

    fireEvent.keyDown(document.activeElement!, { key: "Home" });
    expect(selected()[0]).toHaveTextContent("Trending");

    fireEvent.keyDown(document.activeElement!, { key: "End" });
    expect(selected()[0]).toHaveTextContent("Recently Added");
  });

  // The defect this file exists for. `aria-selected` used to be
  // `key === tab && !activeDept`, so choosing a department left a tablist with
  // NO selected tab — and, because every department's books are ordered by
  // download count, the still-lit "Recently Added" label described an order the
  // panel was not in.
  it("keeps exactly one tab selected when a department filter is applied", () => {
    renderTabs();

    fireEvent.click(screen.getByRole("tab", { name: "Recently Added" }));
    expect(selected()).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "Mathematics" }));

    expect(selected()).toHaveLength(1);
    // Department books are download-ranked, so the honest label is Trending.
    expect(selected()[0]).toHaveTextContent("Trending");
    expect(screen.getByRole("tabpanel")).toHaveTextContent("Maths D");
  });

  it("exposes department chip state as aria-pressed, not colour alone", () => {
    renderTabs();
    const group = screen.getByRole("group", { name: enMessages.home.deptFilterLabel });

    const all = within(group).getByRole("button", { name: "All" });
    const maths = within(group).getByRole("button", { name: "Mathematics" });
    expect(all).toHaveAttribute("aria-pressed", "true");
    expect(maths).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(maths);
    expect(maths).toHaveAttribute("aria-pressed", "true");
    expect(all).toHaveAttribute("aria-pressed", "false");
  });
});

describe("BookShowcaseTabs — bilingual", () => {
  // Every string here used to be an English literal in the component, so a
  // Khmer reader got "Browse books" / "Nothing added recently." verbatim.
  it("takes the tablist and empty-state strings from the message catalogue", () => {
    render(
      <NextIntlClientProvider locale="km" messages={kmMessages}>
        <BookShowcaseTabs trending={[]} recent={[]} layout="grid" />
      </NextIntlClientProvider>,
    );

    expect(screen.getByRole("tablist")).toHaveAccessibleName(kmMessages.home.browseTabsLabel);
    expect(screen.getByRole("tabpanel")).toHaveTextContent(kmMessages.home.browseEmptyTrending);
  });
});

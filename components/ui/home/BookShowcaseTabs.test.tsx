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

// The cover reaches image plumbing that is irrelevant here — the subject of
// this file is the tab semantics, not the cover.
vi.mock("./ShelfCover", () => ({
  default: ({ item }: { item: { kind: string; title?: string; book?: { title: string } } }) =>
    createElement("article", null, item.kind === "book" ? item.book!.title : item.title),
}));


function book(slug: string, title: string) {
  return { slug, title } as never;
}

const TRENDING = [book("a", "Trending A"), book("b", "Trending B")];
const RECENT = [book("c", "Recent C")];
const DEPTS = ["Mathematics"];
const DEPT_BOOKS = { Mathematics: [book("d", "Maths D")] };
const THESES = [
  { kind: "thesis" as const, id: "t1", href: "/theses/t1", title: "Thesis T1", author: "A", typeLabel: "Thesis" },
];

function renderTabs(messages: Record<string, unknown> = enMessages, locale = "en") {
  return render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <BookShowcaseTabs
        trending={TRENDING}
        recent={RECENT}
        theses={THESES}
        depts={DEPTS}
        deptBooks={DEPT_BOOKS}
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

  it("offers three tabs: Trending, Recently Added, Theses", () => {
    renderTabs();
    expect(tabs().map((t) => t.textContent)).toEqual(["Trending", "Recently Added", "Theses"]);
  });

  it("moves selection with Arrow/Home/End keys, wrapping at both ends", () => {
    renderTabs();

    tabs()[0].focus();
    fireEvent.keyDown(document.activeElement!, { key: "ArrowRight" });
    expect(selected()[0]).toHaveTextContent("Recently Added");
    // Selection follows focus, so the newly selected tab must also hold it —
    // otherwise the next arrow press goes to the tab the user just left.
    expect(selected()[0]).toHaveFocus();

    fireEvent.keyDown(document.activeElement!, { key: "ArrowRight" });
    expect(selected()[0]).toHaveTextContent("Theses");
    fireEvent.keyDown(document.activeElement!, { key: "ArrowRight" });
    expect(selected()[0]).toHaveTextContent("Trending");
    fireEvent.keyDown(document.activeElement!, { key: "ArrowLeft" });
    expect(selected()[0]).toHaveTextContent("Theses");

    fireEvent.keyDown(document.activeElement!, { key: "Home" });
    expect(selected()[0]).toHaveTextContent("Trending");

    fireEvent.keyDown(document.activeElement!, { key: "End" });
    expect(selected()[0]).toHaveTextContent("Theses");
    expect(selected()[0]).toHaveFocus();
  });

  it("shows the theses in the Theses tab", () => {
    renderTabs();
    fireEvent.click(screen.getByRole("tab", { name: "Theses" }));
    expect(screen.getByRole("tabpanel")).toHaveTextContent("Thesis T1");
    expect(screen.getByRole("tabpanel")).not.toHaveTextContent("Trending A");
  });

  it("shows the department chips on Trending only", () => {
    renderTabs();
    const label = enMessages.home.deptFilterLabel;
    expect(screen.getByRole("group", { name: label })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Recently Added" }));
    expect(screen.queryByRole("group", { name: label })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Theses" }));
    expect(screen.queryByRole("group", { name: label })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Trending" }));
    expect(screen.getByRole("group", { name: label })).toBeInTheDocument();
  });

  // `aria-selected` used to be `key === tab && !activeDept`, so choosing a
  // department left a tablist with NO selected tab. Every department's books
  // are download-ranked, so the honest selected tab is Trending — and leaving
  // Trending must drop the department filter with its chips.
  it("keeps exactly one tab selected through a department filter", () => {
    renderTabs();

    fireEvent.click(screen.getByRole("button", { name: "Mathematics" }));
    expect(selected()).toHaveLength(1);
    expect(selected()[0]).toHaveTextContent("Trending");
    expect(screen.getByRole("tabpanel")).toHaveTextContent("Maths D");

    fireEvent.click(screen.getByRole("tab", { name: "Recently Added" }));
    expect(selected()).toHaveLength(1);
    expect(screen.getByRole("tabpanel")).toHaveTextContent("Recent C");
    expect(screen.getByRole("tabpanel")).not.toHaveTextContent("Maths D");
  });

  it("shows at most six items in a tab", () => {
    const many = Array.from({ length: 9 }, (_, i) => book(`m${i}`, `Many ${i}`));
    render(
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <BookShowcaseTabs trending={many} recent={[]} />
      </NextIntlClientProvider>,
    );
    expect(within(screen.getByRole("tabpanel")).getAllByRole("article")).toHaveLength(6);
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
        <BookShowcaseTabs trending={[]} recent={[]} />
      </NextIntlClientProvider>,
    );

    expect(screen.getByRole("tablist")).toHaveAccessibleName(kmMessages.home.browseTabsLabel);
    expect(screen.getByRole("tabpanel")).toHaveTextContent(kmMessages.home.browseEmptyTrending);
  });
});

describe("BookShowcaseTabs — the hero fan's books", () => {
  const nine = Array.from({ length: 9 }, (_, i) => book(`n${i}`, `Nine ${i}`));

  function renderSkip() {
    return render(
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <BookShowcaseTabs trending={nine} recent={[]} skipOnDesktop={3} />
      </NextIntlClientProvider>,
    );
  }

  it("hides the fan's three at lg and shows the next six there; phones keep the top six", () => {
    renderSkip();
    const items = within(screen.getByRole("tabpanel")).getAllByRole("listitem");
    expect(items).toHaveLength(9);
    const at = (i: number) => items[i].className;
    // Top three: on phones, not at lg (the hero fan shows them there).
    for (const i of [0, 1, 2]) expect(at(i)).toContain("lg:hidden");
    // Four to six: everywhere.
    for (const i of [3, 4, 5]) expect(at(i)).not.toMatch(/hidden/);
    // Seven to nine: lg only.
    for (const i of [6, 7, 8]) expect(at(i)).toContain("max-lg:hidden");
  });

  it("never skips on the other tabs", () => {
    renderSkip();
    fireEvent.click(screen.getByRole("tab", { name: "Recently Added" }));
    fireEvent.click(screen.getByRole("tab", { name: "Trending" }));
    // No departments in this render; the other tabs never skip.
    fireEvent.click(screen.getByRole("tab", { name: "Theses" }));
    expect(screen.getByRole("tabpanel").querySelectorAll(".lg\\:hidden")).toHaveLength(0);
  });
});

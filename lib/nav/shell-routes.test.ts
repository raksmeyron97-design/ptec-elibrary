import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  activeTab,
  assistantFabHidden,
  assistantFabHiddenOnPhone,
  EXPLORE_ROUTES,
  isImmersiveReaderRoute,
  MORE_ROUTES,
  SAVED_ROUTES,
  SHELL_TABS,
  shellTabIndex,
  stripLocale,
  tabBarVisible,
} from "./shell-routes";

describe("stripLocale", () => {
  it("removes a locale prefix and nothing else", () => {
    expect(stripLocale("/km")).toBe("/");
    expect(stripLocale("/km/books/x")).toBe("/books/x");
    expect(stripLocale("/en/paths")).toBe("/paths");
    expect(stripLocale("/books")).toBe("/books");
    // A slug that merely starts with the letters is not a locale.
    expect(stripLocale("/kmer-guide")).toBe("/kmer-guide");
  });
});

describe("the tab order", () => {
  it("is Home · Explore · Search · Saved · More, with Search in the centre", () => {
    // The sliding indicator is positioned from this order, so it is the layout.
    expect([...SHELL_TABS]).toEqual(["home", "explore", "search", "saved", "more"]);
    expect(shellTabIndex("search")).toBe(Math.floor(SHELL_TABS.length / 2));
  });
});

describe("activeTab", () => {
  it.each([
    ["/", "home"],
    ["/km", "home"],
    ["/search", "search"],
    ["/km/search", "search"],
    // Learning Paths moved into Explore when Search took the centre slot.
    ["/paths", "explore"],
    ["/paths/early-grade-learning-package", "explore"],
    ["/books", "explore"],
    ["/books/some-book", "explore"],
    ["/theses/a-thesis", "explore"],
    ["/journals", "explore"],
    ["/journals/articles/an-article", "explore"],
    ["/km/journals/a-journal/issues/vol-1-issue-1", "explore"],
    ["/catalogs", "explore"],
    ["/km/subjects/x", "explore"],
    ["/authors/kenneth-berk", "explore"],
    ["/dashboard", "saved"],
    ["/lists/abc", "saved"],
    ["/offline-books", "saved"],
    ["/km/offline-reader", "saved"],
    // Settings sit under /dashboard but belong to the account, which More carries.
    ["/dashboard/settings", "more"],
    ["/about", "more"],
    ["/km/about/team", "more"],
    ["/posts/news-item", "more"],
    ["/contact", "more"],
    ["/privacy", "more"],
    ["/policy", "more"],
  ] as const)("%s → %s", (pathname, tab) => {
    expect(activeTab(pathname)).toBe(tab);
  });

  it("does not light a tab for a route that merely shares a prefix", () => {
    expect(activeTab("/booksmith")).toBeNull();
    expect(activeTab("/searching")).toBeNull();
    expect(activeTab("/authorship")).toBeNull();
    expect(activeTab("/aboutness")).toBeNull();
    expect(activeTab("/dashboards")).toBeNull();
  });

  it("only ever answers with a tab the bar draws", () => {
    for (const p of ["/", "/search", "/books", "/dashboard", "/about"]) {
      expect(SHELL_TABS as readonly string[]).toContain(activeTab(p));
    }
  });
});

describe("the immersive reader route", () => {
  it("is the dedicated /read route in either locale, and only that", () => {
    expect(isImmersiveReaderRoute("/books/foundations/read")).toBe(true);
    expect(isImmersiveReaderRoute("/km/books/foundations/read")).toBe(true);
    expect(isImmersiveReaderRoute("/books/foundations/read/")).toBe(true);
    expect(isImmersiveReaderRoute("/books/foundations")).toBe(false);
    // Offline, the tab bar is the way back to the offline library.
    expect(isImmersiveReaderRoute("/offline-reader")).toBe(false);
    expect(tabBarVisible("/offline-reader")).toBe(true);
    expect(tabBarVisible("/books/foundations/read")).toBe(false);
  });
});

describe("assistantFabHidden", () => {
  // The regex AskWidget carried before this module existed. The shared
  // predicate must answer exactly as it did, in both locales.
  const LEGACY = /\/books\/[^/]+\/read\/?$|\/offline-reader|\/paths\/[^/]+\/?$/;

  it.each([
    "/books/x/read",
    "/km/books/x/read",
    "/offline-reader",
    "/km/offline-reader",
    "/paths/early-grade",
    "/km/paths/early-grade/",
    "/paths",
    "/books/x",
    "/",
    "/search",
    "/km/theses/y",
  ])("agrees with the legacy AskWidget rule for %s", (pathname) => {
    expect(assistantFabHidden(pathname)).toBe(LEGACY.test(pathname));
  });
});

describe("assistantFabHiddenOnPhone", () => {
  // Pages whose phone dock carries the assistant, so the FAB would otherwise
  // be a second floating control in the same corner.
  it.each([
    ["/books/x", true],
    ["/km/books/x/", true],
    ["/journals/articles/handmade-conductivity", true],
    ["/km/journals/articles/handmade-conductivity", true],
    // Collections and the reader own no dock.
    ["/books", false],
    ["/books/x/read", false],
    ["/journals", false],
    ["/journals/articles", false],
    ["/journals/cambodian-journal-of-teacher-education", false],
    ["/journals/cambodian-journal-of-teacher-education/issues/vol-7-issue-2", false],
    ["/theses/y", false],
  ])("%s → %s", (pathname, hidden) => {
    expect(assistantFabHiddenOnPhone(pathname)).toBe(hidden);
  });
});

describe("the routes the tabs own", () => {
  it("names only public routes that have a page", () => {
    // A tab that lights for a route with no page, or a sheet row that 404s,
    // is the defect this guards against. /lists has no index of its own — it
    // is the prefix of /lists/[id], one of the reader's lists.
    const root = path.resolve(__dirname, "../../app/[locale]/(public)");
    const routes = [...EXPLORE_ROUTES, ...SAVED_ROUTES, ...MORE_ROUTES].filter((r) => r !== "/lists");
    for (const route of routes) {
      expect(fs.existsSync(path.join(root, route.slice(1), "page.tsx")), route).toBe(true);
    }
    expect(fs.existsSync(path.join(root, "lists", "[id]", "page.tsx"))).toBe(true);
  });
});

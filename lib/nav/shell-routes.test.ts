import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  activeTab,
  assistantFabHidden,
  assistantFabHiddenOnPhone,
  isImmersiveReaderRoute,
  LIBRARY_ROUTES,
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

describe("activeTab", () => {
  it.each([
    ["/", "home"],
    ["/km", "home"],
    ["/search", "search"],
    ["/km/search", "search"],
    ["/paths", "paths"],
    ["/paths/early-grade-learning-package", "paths"],
    ["/books", "library"],
    ["/books/some-book", "library"],
    ["/theses/a-thesis", "library"],
    ["/journals", "library"],
    ["/journals/articles/an-article", "library"],
    ["/km/journals/a-journal/issues/vol-1-issue-1", "library"],
    ["/catalogs", "library"],
    ["/km/subjects/x", "library"],
    ["/authors/kenneth-berk", "library"],
    ["/dashboard", "profile"],
    ["/dashboard/settings", "profile"],
    ["/lists/abc", "profile"],
    ["/offline-books", "profile"],
    ["/about", null],
    ["/posts/news-item", null],
    ["/contact", null],
  ] as const)("%s → %s", (pathname, tab) => {
    expect(activeTab(pathname)).toBe(tab);
  });

  it("does not light a tab for a route that merely shares a prefix", () => {
    expect(activeTab("/booksmith")).toBeNull();
    expect(activeTab("/searching")).toBeNull();
    expect(activeTab("/authorship")).toBeNull();
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

describe("the Library tab and the routes that exist", () => {
  it("names only public routes that have a page", () => {
    // A tab that lights for a route with no page, or a sheet row that 404s,
    // is the defect this guards against.
    const root = path.resolve(__dirname, "../../app/[locale]/(public)");
    for (const route of LIBRARY_ROUTES) {
      expect(fs.existsSync(path.join(root, route.slice(1), "page.tsx")), route).toBe(true);
    }
  });
});

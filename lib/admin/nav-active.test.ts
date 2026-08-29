import { describe, it, expect } from "vitest";
import { isUnder, resolveActiveHref, makeIsActive } from "./nav-active";

/**
 * The rule these pin exists because /admin/books, /admin/books/upload and
 * /admin/books/duplicates are nested. Under the previous
 * `pathname.startsWith(href)` test, standing on the upload page marked BOTH
 * "Collection" and "Upload" as the current page.
 */
const NAV = [
  "/admin",
  "/admin/inbox",
  "/admin/books",
  "/admin/books/upload",
  "/admin/books/duplicates",
  "/admin/review",
  "/admin/book-requests",
  "/admin/catalogs",
] as const;

/** What AdminSidebar passes: the panel root matches only itself. */
const ROOT = { exact: ["/admin"] } as const;

describe("isUnder", () => {
  it("matches the href itself and its descendants", () => {
    expect(isUnder("/admin/books", "/admin/books")).toBe(true);
    expect(isUnder("/admin/books/upload", "/admin/books")).toBe(true);
  });

  it("respects segment boundaries", () => {
    // The one that would break a naive startsWith: book-requests is a
    // different section, not a book sub-page.
    expect(isUnder("/admin/book-requests", "/admin/books")).toBe(false);
    expect(isUnder("/admin/booksellers", "/admin/books")).toBe(false);
  });

  it("is false for empty inputs", () => {
    expect(isUnder("", "/admin/books")).toBe(false);
    expect(isUnder("/admin/books", "")).toBe(false);
  });
});

describe("resolveActiveHref", () => {
  it("picks the most specific match, not the first", () => {
    expect(resolveActiveHref("/admin/books/upload", NAV)).toBe("/admin/books/upload");
    expect(resolveActiveHref("/admin/books/duplicates", NAV)).toBe("/admin/books/duplicates");
  });

  it("keeps the collection active on the collection route", () => {
    expect(resolveActiveHref("/admin/books", NAV)).toBe("/admin/books");
  });

  it("does not let /admin swallow every other section", () => {
    expect(resolveActiveHref("/admin/review", NAV)).toBe("/admin/review");
    expect(resolveActiveHref("/admin", NAV, ROOT)).toBe("/admin");
  });

  /* The panel root is declared exact-only by the sidebar. Without that,
     /admin/edit/[id] — a route with no nav entry — would light up Dashboard. */
  it("leaves nothing current on a route with no nav entry", () => {
    expect(resolveActiveHref("/admin/edit/abc-123", NAV, ROOT)).toBeNull();
    expect(resolveActiveHref("/admin/profile", NAV, ROOT)).toBeNull();
  });

  it("returns null for empty inputs", () => {
    expect(resolveActiveHref(null, NAV)).toBeNull();
    expect(resolveActiveHref("/admin/books", [])).toBeNull();
  });
});

describe("makeIsActive", () => {
  it("marks exactly one nav entry current on a nested route", () => {
    const isActive = makeIsActive("/admin/books/upload", NAV, ROOT);
    expect(NAV.filter(isActive)).toEqual(["/admin/books/upload"]);
  });

  it("still lets a parent group highlight via its children", () => {
    const isActive = makeIsActive("/admin/books/duplicates", NAV, ROOT);
    const bookChildren = ["/admin/books", "/admin/books/upload", "/admin/books/duplicates"];
    expect(bookChildren.some(isActive)).toBe(true);
  });
});

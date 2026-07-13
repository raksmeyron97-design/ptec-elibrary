import { describe, it, expect } from "vitest";
import { isAdminPath } from "./is-admin-path";

describe("isAdminPath", () => {
  it("matches the admin root and its descendants", () => {
    expect(isAdminPath("/admin")).toBe(true);
    expect(isAdminPath("/admin/")).toBe(true);
    expect(isAdminPath("/admin/login")).toBe(true);
    expect(isAdminPath("/admin/manage/duplicates")).toBe(true);
  });

  it("does not match public routes", () => {
    expect(isAdminPath("/")).toBe(false);
    expect(isAdminPath("/home")).toBe(false);
    expect(isAdminPath("/books")).toBe(false);
    expect(isAdminPath("/dashboard")).toBe(false);
  });

  it("does not match lookalike prefixes", () => {
    // Guards against a naive startsWith("/admin") matching a public route.
    expect(isAdminPath("/administration")).toBe(false);
    expect(isAdminPath("/admins")).toBe(false);
    expect(isAdminPath("/books/administrator-guide")).toBe(false);
  });

  it("does not match a locale-prefixed lookalike (admin is never localized)", () => {
    expect(isAdminPath("/km/admin")).toBe(false);
  });
});

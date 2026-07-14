import { describe, it, expect } from "vitest";
import { safeReturnTo, downloadProfileSettingsPath } from "@/lib/security/return-to";

describe("safeReturnTo — open-redirect guard", () => {
  it("allows internal absolute paths, preserving query + hash", () => {
    expect(safeReturnTo("/theses/my-thesis")).toBe("/theses/my-thesis");
    expect(safeReturnTo("/km/theses/foo?x=1#abstract")).toBe("/km/theses/foo?x=1#abstract");
  });

  it("rejects absolute external URLs", () => {
    expect(safeReturnTo("https://evil.com")).toBe("/theses");
    expect(safeReturnTo("http://evil.com/x")).toBe("/theses");
  });

  it("rejects protocol-relative and backslash tricks", () => {
    expect(safeReturnTo("//evil.com")).toBe("/theses");
    expect(safeReturnTo("/\\evil.com")).toBe("/theses");
    expect(safeReturnTo("\\\\evil.com")).toBe("/theses");
  });

  it("rejects non-path and control-char inputs", () => {
    expect(safeReturnTo("javascript:alert(1)")).toBe("/theses");
    expect(safeReturnTo("theses/no-leading-slash")).toBe("/theses");
    expect(safeReturnTo("/a\nb")).toBe("/theses");
    expect(safeReturnTo("")).toBe("/theses");
    expect(safeReturnTo(null)).toBe("/theses");
    expect(safeReturnTo(undefined)).toBe("/theses");
  });

  it("honours a custom fallback", () => {
    expect(safeReturnTo("https://evil.com", "/home")).toBe("/home");
  });

  it("builds a settings deep link carrying a validated returnTo", () => {
    const link = downloadProfileSettingsPath("/theses/foo", "en");
    expect(link).toContain("/dashboard/settings");
    expect(link).toContain("section=download-profile");
    expect(link).toContain("returnTo=%2Ftheses%2Ffoo");

    const km = downloadProfileSettingsPath("/km/theses/foo", "km");
    expect(km.startsWith("/km/dashboard/settings")).toBe(true);
  });

  it("sanitises a malicious returnTo when building the settings link", () => {
    const link = downloadProfileSettingsPath("https://evil.com", "en");
    expect(link).toContain("returnTo=%2Ftheses");
    expect(link).not.toContain("evil.com");
  });
});

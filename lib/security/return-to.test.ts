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

  // The OAuth callback (app/(auth)/auth/callback/route.ts) reuses safeReturnTo
  // with a "/dashboard" fallback for the post-sign-in destination. These lock
  // in that a hostile callbackUrl can never redirect a freshly-authenticated
  // user off-site, while legitimate internal destinations still pass through.
  describe("as used by the OAuth callback (fallback /dashboard)", () => {
    it("keeps safe internal destinations", () => {
      expect(safeReturnTo("/dashboard/settings?section=x", "/dashboard")).toBe(
        "/dashboard/settings?section=x",
      );
      expect(safeReturnTo("/km/theses/foo", "/dashboard")).toBe("/km/theses/foo");
    });

    it("falls back to /dashboard for open-redirect and injection attempts", () => {
      for (const bad of [
        "https://evil.com",
        "//evil.com",
        "/\\evil.com",
        "http:evil.com",
        "javascript:alert(1)",
        "/legit\r\nSet-Cookie: x=1",
        null,
        undefined,
        "",
      ]) {
        expect(safeReturnTo(bad, "/dashboard")).toBe("/dashboard");
      }
    });
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

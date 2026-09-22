import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

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

// ── Invariant: one guard, and every redirect reader uses it ─────────────────
//
// This exists because a second, weaker copy is how the defect came back. The
// login page carried its own three-prefix test — starts with "/", not "//",
// not "/\" — and a control character defeated all three: `?callbackUrl=/%09/evil.com`
// arrives percent-DECODED, passes every prefix, and `router.push` then resolves
// it with the URL parser, which strips tab/CR/LF BEFORE parsing and lands on
// "//evil.com". The rule cannot be a prefix list; it has to be a re-resolution
// against a sentinel origin, and there is exactly one implementation of that.
describe("every redirect-target reader uses the shared guard", () => {
  const ROOTS = ["app", "components", "lib"];
  /** Reads a caller-controlled navigation target out of the query string. */
  const READS_TARGET =
    /searchParams\)?\.get\(\s*["'](?:callbackUrl|returnTo|next|redirect|redirectTo)["']/;

  function sourceFiles(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) sourceFiles(full, out);
      else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(full);
    }
    return out;
  }

  it("routes every query-string redirect target through safeReturnTo", () => {
    const offenders: string[] = [];
    for (const root of ROOTS) {
      for (const file of sourceFiles(root)) {
        const src = readFileSync(file, "utf8");
        if (!READS_TARGET.test(src)) continue;
        // A CALL, not a mention: the negative control for this test reverted
        // the login page and left the explanatory comment behind, and
        // `includes("safeReturnTo")` was satisfied by the prose.
        if (!/\bsafeReturnTo\s*\(/.test(src)) offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("leaves no hand-rolled prefix guard beside a redirect target", () => {
    // `startsWith("//")` on its own is a legitimate shape (deciding whether a
    // href is locale-scoped, whether an image is remote). It is only wrong
    // when it is what DECIDES a navigation target — so the pairing is what is
    // banned, not the idiom.
    const offenders: string[] = [];
    for (const root of ROOTS) {
      for (const file of sourceFiles(root)) {
        if (file.endsWith(join("lib", "security", "return-to.ts"))) continue;
        const src = readFileSync(file, "utf8");
        if (!READS_TARGET.test(src)) continue;
        if (/startsWith\(\s*["']\/\/["']\s*\)/.test(src)) offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });
});

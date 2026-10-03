/**
 * Links to the public Koha OPAC (lib/opac/links.ts): absolute, on the one
 * public name, a record link only for a real Koha id, and every surface that
 * links there takes its URL from this module.
 */
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  KOHA_OPAC_ACCOUNT_URL,
  KOHA_OPAC_ORIGIN,
  KOHA_OPAC_PUBLIC_HOST,
  kohaOpacRecordUrl,
} from "./links";
import { KOHA_OPAC_PUBLIC_HOST as PROXIED_HOST } from "@/lib/koha/opac-proxy";

const ROOT = join(__dirname, "../..");
const read = (f: string) => readFileSync(join(ROOT, f), "utf8");
// --untracked: a new surface must be caught before it is committed, too.
const gitGrep = (args: string[]) => {
  try {
    return execFileSync("git", ["grep", "--untracked", ...args], { cwd: ROOT, encoding: "utf8" })
      .split("\n")
      .filter(Boolean);
  } catch {
    return [];
  }
};

/** Surfaces that write their own <a> to the OPAC. */
const ANCHOR_SURFACES = [
  "components/ui/books/LibraryAccountStrip.tsx",
  "app/[locale]/(public)/catalogs/[slug]/page.tsx",
  "components/ui/dashboard/LibraryLoans.tsx",
];

describe("OPAC links", () => {
  it("are absolute https URLs on the public name, never locale-prefixed", () => {
    expect(KOHA_OPAC_ORIGIN).toBe("https://koha.ptec.edu.kh");
    expect(KOHA_OPAC_ACCOUNT_URL).toBe("https://koha.ptec.edu.kh/cgi-bin/koha/opac-user.pl");
    for (const url of [KOHA_OPAC_ORIGIN, KOHA_OPAC_ACCOUNT_URL, kohaOpacRecordUrl(1)!]) {
      const u = new URL(url);
      expect(u.protocol).toBe("https:");
      expect(u.host).toBe(KOHA_OPAC_PUBLIC_HOST);
      expect(u.pathname).not.toMatch(/^\/(km|en)(\/|$)/);
    }
  });

  it("link to the name the proxy answers (one constant for both)", () => {
    expect(PROXIED_HOST).toBe(KOHA_OPAC_PUBLIC_HOST);
  });

  it("link a record by its canonical OPAC address", () => {
    expect(kohaOpacRecordUrl(1)).toBe("https://koha.ptec.edu.kh/bib/1");
    expect(kohaOpacRecordUrl(2638)).toBe("https://koha.ptec.edu.kh/bib/2638");
    expect(kohaOpacRecordUrl(Number.MAX_SAFE_INTEGER)).toBe(`https://koha.ptec.edu.kh/bib/${Number.MAX_SAFE_INTEGER}`);
  });

  it.each([
    ["zero", 0],
    ["negative", -1],
    ["a fraction", 1.5],
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["past the safe range", Number.MAX_SAFE_INTEGER + 1],
    ["a numeric string", "1"],
    ["a path in a string", "1/../../cgi-bin/koha/mainpage.pl"],
    ["a URL", "https://evil.example/"],
    ["null", null],
    ["undefined", undefined],
    ["a bigint", BigInt(1)],
  ])("give no record link for %s", (_what, id) => {
    expect(kohaOpacRecordUrl(id)).toBeNull();
  });

  it("are written by nothing but this module", () => {
    const hits = gitGrep(["-l", "-F", KOHA_OPAC_PUBLIC_HOST, "--", "app", "components", "lib", "i18n", "messages"])
      .filter((f) => f !== "lib/opac/links.ts" && !f.endsWith(".test.ts") && !f.endsWith(".test.tsx"))
      // Comments in the proxy module name the host; its code imports it from here.
      .filter((f) => f !== "lib/koha/opac-proxy.ts");
    expect(hits).toEqual([]);
    expect(read("lib/koha/opac-proxy.ts")).not.toMatch(/=\s*["']koha\.ptec\.edu\.kh["']/);
  });

  it.each(ANCHOR_SURFACES)("%s takes its URL from lib/opac/links and opens it as an external link", (file) => {
    const src = read(file);
    expect(src).toMatch(/from ["']@\/lib\/opac\/links["']/);
    const anchors = src.match(/<a\b[^>]*href=\{(?:KOHA_OPAC_[A-Z_]+|kohaRecordUrl)\}[^>]*>/g) ?? [];
    expect(anchors.length, file).toBeGreaterThan(0);
    for (const a of anchors) {
      expect(a, file).toContain('target="_blank"');
      expect(a, file).toMatch(/rel="(nofollow )?noopener noreferrer"/);
    }
  });

  it("the phone Explore sheet and the footer list the account as an external link", () => {
    const sheets = read("components/layout/MobileNavSheets.tsx");
    expect(sheets).toMatch(/from ["']@\/lib\/opac\/links["']/);
    expect(sheets).toMatch(/href=\{KOHA_OPAC_ACCOUNT_URL\}[^/]*?\bexternal\b/);
    const footer = read("components/layout/Footer.tsx");
    expect(footer).toMatch(/href: KOHA_OPAC_ACCOUNT_URL, external: true/);
  });

  it("the Physical Library page shows the account strip on its landing view", () => {
    expect(read("app/[locale]/(public)/catalogs/page.tsx")).toMatch(
      /!hasFilters && page === 1 && <LibraryAccountStrip \/>/,
    );
  });

  it("the per-record link is nofollow: crawlers must not walk every record into Koha", () => {
    const src = read("app/[locale]/(public)/catalogs/[slug]/page.tsx");
    expect(src).toMatch(/href=\{kohaRecordUrl\}[^>]*rel="nofollow noopener noreferrer"/);
  });
});

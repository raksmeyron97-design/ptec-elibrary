/**
 * The public OPAC's host rules (lib/koha/opac-proxy.ts): one public name,
 * proxied; every other name redirected to it; and never a redirect on the
 * public name itself, which would loop every OPAC request.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  KOHA_OPAC_PUBLIC_HOST,
  KOHA_OPAC_PROXIED_HOSTS,
  KOHA_OPAC_RETIRED_HOSTS,
  kohaOpacRedirectRules,
  kohaOpacRewriteRules,
} from "./opac-proxy";
import { canonicalHostRedirect } from "@/lib/canonical-host";

const hostsOf = (rules: { has: { value: string }[] }[]) => rules.flatMap((r) => r.has.map((h) => h.value));
const hostname = (h: string) => h.split(":")[0];
const DEST = "http://10.1.1.146:8480/:path*";

describe("Koha OPAC host rules", () => {
  it("proxies the public name and its host:port forms, and nothing else", () => {
    const rules = kohaOpacRewriteRules(DEST);
    expect(hostsOf(rules)).toEqual([...KOHA_OPAC_PROXIED_HOSTS]);
    for (const r of rules) expect(r).toMatchObject({ source: "/:path*", destination: DEST });
    for (const h of hostsOf(rules)) expect(hostname(h)).toBe(KOHA_OPAC_PUBLIC_HOST);
  });

  it("never proxies a retired name: it would serve the whole OPAC a second time", () => {
    const proxied = hostsOf(kohaOpacRewriteRules(DEST)).map(hostname);
    for (const retired of KOHA_OPAC_RETIRED_HOSTS) expect(proxied).not.toContain(retired);
  });

  it("redirects every retired name, permanently, to the same path on the public name", () => {
    const rules = kohaOpacRedirectRules();
    expect(hostsOf(rules).sort()).toEqual([...KOHA_OPAC_RETIRED_HOSTS].sort());
    for (const r of rules) {
      expect(r).toMatchObject({
        source: "/:path*",
        destination: `https://${KOHA_OPAC_PUBLIC_HOST}/:path*`,
        permanent: true,
      });
    }
  });

  it("no redirect matches the public name (that would loop every request)", () => {
    for (const h of hostsOf(kohaOpacRedirectRules())) {
      expect(hostname(h)).not.toBe(KOHA_OPAC_PUBLIC_HOST);
    }
  });

  it("the site's own canonical-host redirect leaves every Koha name alone", () => {
    const PROD = { nodeEnv: "production", siteUrl: "https://library.ptec.edu.kh" };
    for (const h of [...KOHA_OPAC_PROXIED_HOSTS, ...KOHA_OPAC_RETIRED_HOSTS]) {
      expect(canonicalHostRedirect(h, PROD), h).toBeNull();
    }
  });

  it("next.config.ts takes its Koha rules from this module and names no Koha host itself", () => {
    // Comments stripped: prose may name a host; only code must not.
    const src = readFileSync(join(process.cwd(), "next.config.ts"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(src).toContain('from "./lib/koha/opac-proxy"');
    expect(src).toMatch(/async redirects\(\)[\s\S]*?kohaOpacRedirectRules\(\)[\s\S]*?async rewrites\(\)/);
    expect(src).toMatch(/async rewrites\(\)[\s\S]*?kohaOpacRewriteRules\(kohaDestination\)/);
    expect(src).not.toMatch(/koha\.ptec\.edu\.kh|koha\.storage-ptec\.online/);
  });
});

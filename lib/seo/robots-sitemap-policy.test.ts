import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { PRIVATE_PATH_PREFIXES, getLocalizedPrivateSeoPaths } from "@/lib/seo/indexing";

// Source-scanning invariants for the two routes that TELL crawlers what to do.
// Both defects these encode were invisible in review and obvious in one curl:
// robots.txt drifting from the private-path source, and a sitemap advertising
// hubs with nothing behind them.
//
// Comments are stripped before every scan — this file and the routes it reads
// both quote the defects they prevent, and a naive scan would match the prose.

const ROOT = path.join(__dirname, "..", "..");

function sourceWithoutComments(rel: string): string {
  const raw = fs.readFileSync(path.join(ROOT, rel), "utf8");
  return raw
    .replace(/\/\*[\s\S]*?\*\//g, " ") // block comments
    .replace(/(^|[^:])\/\/.*$/gm, "$1 "); // line comments, sparing "https://"
}

describe("app/robots.ts — one source of truth for the private-path policy", () => {
  const src = sourceWithoutComments("app/robots.ts");

  it("derives its Disallow list from lib/seo/indexing.ts", () => {
    expect(src).toMatch(/getLocalizedPrivateSeoPaths/);
    expect(src).toMatch(/from ['"]@\/lib\/seo\/indexing['"]/);
    expect(src).toMatch(/getLocalizedPrivateSeoPaths\(\)/);
  });

  it.each(PRIVATE_PATH_PREFIXES.map((p) => [p]))(
    "never hard-codes the private prefix %s",
    (prefix) => {
      // The drift this replaced was a second, hand-maintained array here: it
      // disallowed a /login route that does not exist while omitting the Khmer
      // /km/auth and /km/admin forms middleware really does treat as private.
      // Add a prefix to PRIVATE_PATH_PREFIXES and all three layers follow.
      expect(
        src.includes(`"${prefix}"`) || src.includes(`'${prefix}'`),
        `app/robots.ts writes ${prefix} as a literal — it must come from ` +
          `getLocalizedPrivateSeoPaths() so robots.txt, the X-Robots-Tag header ` +
          `and the metadata robots cannot disagree`,
      ).toBe(false);
    },
  );

  it("advertises no public library path that is also private", () => {
    // The allow-list for AI/search crawlers is hand-written on purpose (it is a
    // curation choice, not a policy), so it is the one place a private prefix
    // could be allowed back in by accident.
    const allowed = [...src.matchAll(/^\s*'(\/[^']*)',?$/gm)].map((m) => m[1]);
    expect(allowed.length).toBeGreaterThan(5);
    for (const entry of allowed) {
      const stripped = entry.replace(/^\/km/, "") || "/";
      const isPrivate = PRIVATE_PATH_PREFIXES.some(
        (p) => stripped === p || stripped.startsWith(`${p}/`),
      );
      expect(isPrivate, `robots.txt allows the private path ${entry}`).toBe(false);
    }
  });

  it("still references the sitemap", () => {
    expect(src).toMatch(/sitemap:\s*`\$\{SITE_URL\}\/sitemap\.xml`/);
  });

  it("emits both the bare and trailing-slash form of every private prefix", () => {
    const paths = getLocalizedPrivateSeoPaths();
    for (const prefix of PRIVATE_PATH_PREFIXES) {
      for (const locale of ["", "/km"]) {
        expect(paths).toContain(`${locale}${prefix}`);
        expect(paths).toContain(`${locale}${prefix}/`);
      }
    }
  });
});

describe("app/sitemap.ts — a hub earns its entry by having something to list", () => {
  const src = sourceWithoutComments("app/sitemap.ts");

  // Every collection listing, with the array whose length gates it. An empty
  // one renders only an empty state, which is the same soft-404 that already
  // keeps empty subjects and empty entity hubs out of this file.
  const COLLECTION_HUBS = [
    "/books",
    "/theses",
    "/theses/summary",
    "/catalogs",
    "/posts",
    "/publications",
    "/paths",
  ] as const;

  it.each(COLLECTION_HUBS.map((h) => [h]))("gates %s on its collection count", (hub) => {
    expect(
      src.includes(`hub('${hub}',`),
      `${hub} must be emitted through hub(path, count, …) so a collection with ` +
        `zero rows is not advertised for indexing`,
    ).toBe(true);
  });

  it.each(COLLECTION_HUBS.map((h) => [h]))(
    "never emits %s unconditionally through entry()",
    (hub) => {
      // /publications and /paths were both live, indexable and in this sitemap
      // with zero rows behind them (production, 2026-09-09) because they sat in
      // an unconditional staticUrls array.
      expect(
        src.includes(`entry('${hub}',`),
        `${hub} is emitted by a bare entry() call — it would be advertised even ` +
          `with an empty collection`,
      ).toBe(false);
    },
  );

  it("keeps the homepage unconditional — it is the site, not a collection", () => {
    expect(src).toMatch(/entry\('\/',\s*\{/);
    expect(src.includes("hub('/',")).toBe(false);
  });

  it("keeps the subject and author hubs gated the way they already were", () => {
    expect(src).toMatch(/subjects\.length > 0/);
    expect(src).toMatch(/authorUrls\.length > 0/);
  });

  it("keeps informational pages unconditional — real content regardless of holdings", () => {
    for (const info of ["/about", "/contact", "/policy", "/privacy"]) {
      expect(src.includes(`'${info}',`)).toBe(true);
      expect(src.includes(`hub('${info}',`)).toBe(false);
    }
  });

  it("still validates every entry before serving", () => {
    expect(src).toMatch(/validateSitemapEntry/);
    expect(src).toMatch(/private-url-in-sitemap/);
  });
});

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

  it("emits an anchored segment root plus a descendant rule for every private prefix", () => {
    const paths = getLocalizedPrivateSeoPaths();
    for (const prefix of PRIVATE_PATH_PREFIXES) {
      for (const locale of ["", "/km"]) {
        expect(paths).toContain(`${locale}${prefix}$`);
        expect(paths).toContain(`${locale}${prefix}/`);
      }
    }
  });
});

// ── What robots.txt actually DOES to our URLs ────────────────────────────────
//
// The tests above pin the SHAPE of the rules. Shape was never the problem: the
// rules looked entirely reasonable and blocked the author hub and all 157
// author profiles anyway, because a robots.txt rule is a PREFIX match with no
// implicit end anchor — so `Disallow: /auth` matched `/authors`. Google then
// resolves a conflict by the LONGEST matching rule, so the group's own
// `Allow: /` (length 1) lost to `Disallow: /auth` (length 5).
//
// Nothing in this repository could see that, because nothing evaluated the
// rules the way a crawler does. This block does. It is the regression test for
// the defect; the shape assertions above are only its supporting detail.

/** Escape a literal for embedding in a RegExp. */
function escapeLiteral(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Does one robots.txt pattern match `path`?
 *
 * Prefix match by default; `*` matches any run of characters; a trailing `$`
 * anchors the end of the URL (RFC 9309 §2.2.3).
 */
function ruleMatches(pattern: string, path: string): boolean {
  let body = pattern;
  let anchored = false;
  if (body.endsWith("$")) {
    anchored = true;
    body = body.slice(0, -1);
  }
  const source = `^${body.split("*").map(escapeLiteral).join(".*")}${anchored ? "$" : ""}`;
  return new RegExp(source).test(path);
}

type Rule = { allow: boolean; pattern: string };

/**
 * Google's conflict resolution: the most specific (longest) matching rule
 * wins; a tie goes to Allow; no match at all means allowed.
 */
function isCrawlable(path: string, rules: Rule[]): boolean {
  let best: { length: number; allow: boolean } | null = null;
  for (const rule of rules) {
    if (!ruleMatches(rule.pattern, path)) continue;
    const length = rule.pattern.replace(/\$$/, "").length;
    if (!best || length > best.length || (length === best.length && rule.allow)) {
      best = { length, allow: rule.allow };
    }
  }
  return best ? best.allow : true;
}

describe("robots.txt — evaluated the way a crawler evaluates it", () => {
  // The `User-Agent: *` group exactly as app/robots.ts builds it: a blanket
  // Allow, plus the derived private Disallow list. This is the group that
  // governs Googlebot.
  const rules: Rule[] = [
    { allow: true, pattern: "/" },
    ...getLocalizedPrivateSeoPaths().map((pattern) => ({ allow: false, pattern })),
  ];

  const PUBLIC_URLS = [
    "/",
    "/books",
    "/books/educational-psychology-14th-edition-global-edition",
    "/authors",
    "/authors/adrian-wallwork",
    "/authors/សិត-សេង",
    "/subjects",
    "/subjects/អប់រំ",
    "/theses",
    "/theses/summary",
    "/publications",
    "/paths",
    "/paths/foundation-of-mathematics",
    "/posts",
    "/catalogs",
    "/about",
    "/about/team",
    "/about/team/someone",
    "/contact",
    "/policy",
    "/privacy",
    "/search",
    "/llms.txt",
    "/sitemap.xml",
  ];

  it.each(PUBLIC_URLS.flatMap((u) => [[u], [u === "/" ? "/km" : `/km${u}`]]))(
    "leaves the public URL %s crawlable",
    (url) => {
      expect(
        isCrawlable(url, rules),
        `${url} is disallowed by robots.txt. The sitemap advertises it, so this ` +
          `is a URL we ask crawlers to fetch and then forbid them from fetching.`,
      ).toBe(true);
    },
  );

  const PRIVATE_URLS = [
    "/admin",
    "/admin/books/upload",
    "/auth",
    "/auth/login",
    "/api",
    "/api/health",
    "/dashboard",
    "/profile",
    "/lists",
    "/lists/abc",
    "/offline-books",
    "/offline-reader",
  ];

  it.each(PRIVATE_URLS.flatMap((u) => [[u], [`/km${u}`]]))(
    "still blocks the private URL %s",
    (url) => {
      expect(isCrawlable(url, rules), `${url} is crawlable — it must not be`).toBe(false);
    },
  );

  // The general form of the defect, independent of which routes exist today.
  // /auth vs /authors is the instance that shipped; a later /list vs /lists or
  // /api vs /apidocs would be the same mistake with a different name.
  it.each(PRIVATE_PATH_PREFIXES.map((p) => [p]))(
    "does not let %s swallow a sibling route that merely starts with it",
    (prefix) => {
      for (const sibling of [`${prefix}s`, `${prefix}-guide`, `${prefix}ors`]) {
        expect(
          isCrawlable(sibling, rules),
          `${sibling} is blocked by the rule for ${prefix} — an unanchored ` +
            `prefix rule is matching a sibling route`,
        ).toBe(true);
      }
    },
  );

  it("blocks a private root exactly, without an implicit wildcard", () => {
    // Sanity-check the matcher itself against the two shapes we emit, so a bug
    // in the harness cannot make the assertions above vacuously pass.
    expect(ruleMatches("/auth$", "/auth")).toBe(true);
    expect(ruleMatches("/auth$", "/authors")).toBe(false);
    expect(ruleMatches("/auth/", "/auth/login")).toBe(true);
    expect(ruleMatches("/auth/", "/authors")).toBe(false);
    // ...and that the OLD, unanchored rule really did match /authors.
    expect(ruleMatches("/auth", "/authors")).toBe(true);
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

// lib/seo/breadcrumbs.test.ts
//
// SEO V3 invariants for BreadcrumbList output.
//
// Three defects, all found in LIVE production HTML, all silent — the JSON was
// valid, the page returned 200, and nothing in the suite noticed
// (docs/SEO-V3-AUDIT.md D-3/D-4/D-5):
//
//   D-3  Khmer pages emitted English breadcrumb URLs.
//   D-4  The book page's "Home" crumb pointed at /home, which 308s to /.
//   D-5  Crumbs pointed at filtered listings the same site serves as
//        `noindex, follow` and canonicalises away.
//
// The last block is a source scan: the rule is about what CALL SITES may pass,
// and only reading them can assert it.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { breadcrumbSchema } from "@/lib/seo/schema";
import { SITE_URL } from "@/lib/seo/site";

const ROOT = process.cwd();

type Crumb = { "@type": string; position: number; name: string; item?: string };
function items(schema: ReturnType<typeof breadcrumbSchema>): Crumb[] {
  return schema.itemListElement as Crumb[];
}

describe("shape", () => {
  it("numbers positions from 1 and omits `item` on the current page", () => {
    const crumbs = items(
      breadcrumbSchema([
        { name: "Home", path: "/" },
        { name: "Books", path: "/books" },
        { name: "A Title" },
      ]),
    );
    expect(crumbs.map((c) => c.position)).toEqual([1, 2, 3]);
    expect(crumbs[2].item).toBeUndefined();
  });

  it("is anonymous without a pageUrl and @id-anchored with one", () => {
    expect(breadcrumbSchema([{ name: "Home" }])["@id"]).toBeUndefined();
    expect(
      breadcrumbSchema([{ name: "Home" }], { pageUrl: `${SITE_URL}/books/x` })["@id"],
    ).toBe(`${SITE_URL}/books/x#breadcrumb`);
  });
});

describe("D-3 · locale", () => {
  it("English crumbs are unprefixed", () => {
    const crumbs = items(
      breadcrumbSchema([{ name: "Home", path: "/" }, { name: "Theses", path: "/theses" }], {
        locale: "en",
      }),
    );
    expect(crumbs[0].item).toBe(`${SITE_URL}/`);
    expect(crumbs[1].item).toBe(`${SITE_URL}/theses`);
  });

  it("Khmer crumbs stay inside /km", () => {
    const crumbs = items(
      breadcrumbSchema([{ name: "ទំព័រដើម", path: "/" }, { name: "និក្ខេបបទ", path: "/theses" }], {
        locale: "km",
      }),
    );
    expect(crumbs[0].item).toBe(`${SITE_URL}/km`);
    expect(crumbs[1].item).toBe(`${SITE_URL}/km/theses`);
  });

  it("the Khmer locale root is /km, never /km/", () => {
    const [home] = items(breadcrumbSchema([{ name: "ទំព័រដើម", path: "/" }], { locale: "km" }));
    expect(home.item).toBe(`${SITE_URL}/km`);
    expect(home.item).not.toMatch(/\/km\/$/);
  });

  it("no Khmer crumb ever points at an English URL", () => {
    const crumbs = items(
      breadcrumbSchema(
        [
          { name: "ទំព័រដើម", path: "/" },
          { name: "សៀវភៅ", path: "/books" },
          { name: "មុខវិជ្ជា", path: "/subjects/pisa" },
        ],
        { locale: "km" },
      ),
    );
    for (const c of crumbs) expect(c.item).toContain("/km");
  });
});

describe("D-4 · redirecting paths", () => {
  it("/home resolves to the locale root instead of the 308 it serves", () => {
    expect(items(breadcrumbSchema([{ name: "Home", path: "/home" }]))[0].item).toBe(
      `${SITE_URL}/`,
    );
    expect(
      items(breadcrumbSchema([{ name: "ទំព័រដើម", path: "/home" }], { locale: "km" }))[0].item,
    ).toBe(`${SITE_URL}/km`);
  });
});

describe("D-5 · query strings", () => {
  it("drops the query so a crumb never points at a noindex filtered listing", () => {
    const [crumb] = items(
      breadcrumbSchema([{ name: "Science", path: "/books?dept=Science" }]),
    );
    expect(crumb.item).toBe(`${SITE_URL}/books`);
  });

  it("no emitted item ever contains a query or fragment", () => {
    const crumbs = items(
      breadcrumbSchema(
        [
          { name: "Home", path: "/home" },
          { name: "Publications", path: "/publications?journal=X" },
          { name: "Books", path: "/books?dept=Y&page=2" },
        ],
        { locale: "km" },
      ),
    );
    for (const c of crumbs) {
      expect(c.item).not.toContain("?");
      expect(c.item?.indexOf("#")).toBe(-1);
    }
  });
});

// ── Source scan ─────────────────────────────────────────────────────────────

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next" || name.startsWith(".")) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

/**
 * Every `breadcrumbSchema(...)` call in a file, extracted by balancing
 * brackets from the opening paren.
 *
 * A regex cannot do this: a call whose array contains a conditional spread
 * (`...(x ? [a] : [])`) closes an inner `]` first, so a non-greedy match ends
 * mid-call and silently skips the options argument it was written to check.
 * books/[slug] is exactly that shape.
 */
function calls(src: string): string[] {
  const out: string[] = [];
  const NEEDLE = "breadcrumbSchema(";
  for (let i = src.indexOf(NEEDLE); i !== -1; i = src.indexOf(NEEDLE, i + 1)) {
    let depth = 0;
    for (let j = i + NEEDLE.length - 1; j < src.length; j++) {
      const c = src[j];
      if (c === "(" || c === "[" || c === "{") depth++;
      else if (c === ")" || c === "]" || c === "}") {
        depth--;
        if (depth === 0) {
          out.push(src.slice(i, j + 1));
          break;
        }
      }
    }
  }
  return out;
}

const callSites = ["app", "components"]
  .flatMap((d) => walk(join(ROOT, d)))
  .filter((f) => readFileSync(f, "utf8").includes("breadcrumbSchema("));

describe("call sites", () => {
  it("there is at least one, so this scan cannot pass vacuously", () => {
    expect(callSites.length).toBeGreaterThan(10);
  });

  it("pass locale-less paths — the builder applies the locale prefix", () => {
    // A call site that prefixes the path itself produces "/km/km/theses" once
    // the builder also prefixes, and bypasses the redirect/query rules if it
    // ever stops. books/[slug] used to be the lone site doing this.
    const offenders: string[] = [];
    for (const f of callSites) {
      const src = readFileSync(f, "utf8");
      for (const call of calls(src)) {
        if (/path:\s*`?\$\{localePrefix\}/.test(call) || /path:\s*["'`]\/km\//.test(call)) {
          offenders.push(f.slice(ROOT.length + 1));
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("never pass a query string as a crumb path", () => {
    const offenders: string[] = [];
    for (const f of callSites) {
      const src = readFileSync(f, "utf8");
      for (const call of calls(src)) {
        if (/path:\s*[^,\n]*\?/.test(call)) offenders.push(f.slice(ROOT.length + 1));
      }
    }
    expect(offenders).toEqual([]);
  });

  it("never pass the retired /home path", () => {
    const offenders: string[] = [];
    for (const f of callSites) {
      const src = readFileSync(f, "utf8");
      for (const call of calls(src)) {
        if (/path:\s*[^,\n]*\/home/.test(call)) offenders.push(f.slice(ROOT.length + 1));
      }
    }
    expect(offenders).toEqual([]);
  });

  it("every call site passes a locale", () => {
    const offenders: string[] = [];
    for (const f of callSites) {
      const src = readFileSync(f, "utf8");
      // Match the whole call including its closing "])" plus any options arg.
      for (const call of calls(src)) {
        if (!/\blocale\b/.test(call)) offenders.push(f.slice(ROOT.length + 1));
      }
    }
    expect(offenders).toEqual([]);
  });
});

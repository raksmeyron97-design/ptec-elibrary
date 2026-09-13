import { describe, expect, it } from "vitest";

import {
  isPrivatePath,
  isRobotsDisallowed,
  normalizeCrawlUrl,
  parseRobotsDisallow,
  routeFamily,
} from "./crawl-policy";

const ORIGIN = "https://library.ptec.edu.kh";
const at = (href: string, from = `${ORIGIN}/`, robots: string[] = []) =>
  normalizeCrawlUrl(href, from, { origin: ORIGIN, robotsDisallow: robots });

describe("the skip list matches on a segment boundary", () => {
  // The mistake this file exists to pin: "/auth" must never swallow "/authors".
  // robots.txt once did exactly that and hid 157 author pages; the crawler's
  // first draft reproduced it and dropped 158 of 508 sitemap URLs.
  it("excludes /auth and /auth/login but follows /authors", () => {
    expect(isPrivatePath("/auth")).toBe(true);
    expect(isPrivatePath("/auth/login")).toBe(true);
    expect(isPrivatePath("/authors")).toBe(false);
    expect(isPrivatePath("/authors/adrian-wallwork")).toBe(false);
  });

  it("does the same for every other prefix that has a longer sibling", () => {
    expect(isPrivatePath("/admin")).toBe(true);
    expect(isPrivatePath("/administration")).toBe(false);
    expect(isPrivatePath("/lists")).toBe(true);
    expect(isPrivatePath("/listsomething")).toBe(false);
  });

  it("follows a Khmer author page too", () => {
    expect(at("/km/authors/x")).toBe("/km/authors/x");
    expect(at("/km/auth/login")).toBe(null);
  });
});

describe("robots.txt is read the way Googlebot reads it", () => {
  const rules = parseRobotsDisallow(`
User-Agent: *
Allow: /
Disallow: /admin$
Disallow: /admin/
Disallow: /auth$
Disallow: /auth/

User-Agent: GPTBot
Disallow: /
`);

  it("keeps only the * group, in order", () => {
    expect(rules).toEqual(["/admin$", "/admin/", "/auth$", "/auth/"]);
  });

  it("honours the $ end-anchor and the trailing slash — so /authors survives", () => {
    expect(isRobotsDisallowed("/admin", rules)).toBe(true);
    expect(isRobotsDisallowed("/admin/users", rules)).toBe(true);
    expect(isRobotsDisallowed("/auth/login", rules)).toBe(true);
    expect(isRobotsDisallowed("/authors", rules)).toBe(false);
    expect(isRobotsDisallowed("/authors/x", rules)).toBe(false);
  });

  it("but a BARE prefix really does block, because that is what the file means", () => {
    // If a site writes `Disallow: /auth`, Googlebot skips /authors. The audit
    // reports what Googlebot sees; it does not correct the file.
    expect(isRobotsDisallowed("/authors/x", ["/auth"])).toBe(true);
    expect(at("/authors/x", `${ORIGIN}/`, ["/auth"])).toBe(null);
  });

  it("ignores comments and CRLF", () => {
    expect(parseRobotsDisallow("User-agent: *\r\nDisallow: /x # note\r\n")).toEqual(["/x"]);
  });
});

describe("normalising an href into a crawl key", () => {
  it("follows same-origin paths and nothing else", () => {
    expect(at("/books")).toBe("/books");
    expect(at(`${ORIGIN}/books`)).toBe("/books");
    expect(at("https://example.com/books")).toBe(null);
    expect(at("https://library.storage-ptec.online/books")).toBe(null);
  });

  it("drops fragments, mailto, tel and javascript", () => {
    expect(at("#top")).toBe(null);
    expect(at("/books#list")).toBe("/books");
    expect(at("mailto:x@y")).toBe(null);
    expect(at("tel:+855")).toBe(null);
    expect(at("javascript:void(0)")).toBe(null);
  });

  it("keeps page=N for N>1 and folds page=1 into the base", () => {
    expect(at("/books?page=2")).toBe("/books?page=2");
    expect(at("/books?page=17")).toBe("/books?page=17");
    expect(at("/books?page=1")).toBe("/books");
    expect(at("/books?page=abc")).toBe("/books");
  });

  it("drops every other query — filtered listings are noindex and canonicalise to their base", () => {
    expect(at("/books?lang=km")).toBe("/books");
    expect(at("/books?subject=Math&page=3")).toBe("/books?page=3");
  });

  it("normalises the trailing slash, except the root", () => {
    expect(at("/books/")).toBe("/books");
    expect(at("/")).toBe("/");
    expect(at(`${ORIGIN}`)).toBe("/");
    expect(at("/km")).toBe("/km");
    expect(at("/km/")).toBe("/km");
  });

  it("decodes percent-encoding so a Khmer slug is one node however the page wrote it", () => {
    const raw = "/subjects/ស្រាវជ្រាវ";
    expect(at(raw)).toBe(raw);
    expect(at(encodeURI(raw))).toBe(raw);
  });

  it("never follows an asset", () => {
    expect(at("/pwa/splash/iphone.png")).toBe(null);
    expect(at("/sitemap.xml")).toBe(null);
    expect(at("/robots.txt")).toBe(null);
    expect(at("/some/file.pdf")).toBe(null);
  });

  it("resolves a relative href against the page it appeared on", () => {
    expect(at("page-2", `${ORIGIN}/books/`)).toBe("/books/page-2");
  });
});

describe("route family", () => {
  it("strips the locale prefix and the query", () => {
    expect(routeFamily("/books/x")).toBe("/books");
    expect(routeFamily("/km/books/x")).toBe("/books");
    expect(routeFamily("/books?page=2")).toBe("/books");
    expect(routeFamily("/km")).toBe("/");
    expect(routeFamily("/")).toBe("/");
  });
});

// ── Source scan: the two crawler rules that a tidy-up would most plausibly
// undo, each of which produced a wrong measurement on 2026-09-13.
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("scripts/audit-crawl-depth.ts keeps its two correctness rules", () => {
  const src = readFileSync(join(__dirname, "..", "..", "scripts", "audit-crawl-depth.ts"), "utf8");

  it("computes click depth ONCE, post-hoc, over anchor edges", () => {
    // Tracking it incrementally during discovery is order-dependent: a node
    // first reached through an hreflang edge carries null, its children
    // inherit null, and they are never revisited when an anchor path to the
    // parent turns up later. The first run under-counted click-reachable
    // authors by 62 that way.
    expect(src).toContain("clickDepthsWithout(() => true)");
    expect(src).not.toMatch(/clickDepth:\s*kind === "anchor"/);
  });

  it("re-queues pages that got no answer before reporting them", () => {
    // 17 of 1,651 fetches got no answer in the first run — five of them
    // depth-1 hubs (/authors, /subjects among them), which silently emptied
    // whole families from the graph and reported the weather as orphans.
    expect(src).toContain("retry round");
    expect(src).toMatch(/for \(let round = 1; round <= 2; round\+\+\)/);
  });

  it("reports how many pages answered only on retry, so shed load is visible", () => {
    expect(src).toContain("answered only on retry");
  });

  it("uses the shared URL policy rather than an inline copy", () => {
    expect(src).toContain('from "../lib/verify/crawl-policy"');
    expect(src).not.toMatch(/^function normalize\(/m);
    expect(src).not.toMatch(/^const PRIVATE_PREFIXES/m);
  });
});

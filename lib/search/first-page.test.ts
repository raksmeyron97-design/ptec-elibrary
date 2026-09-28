// Phase 9.3 — the first page of /search is rendered on the server
// (docs/UNIFIED-DISCOVERY.md). Pinned by reading the three files that carry
// it: the shared door, the page, and the client that must not search twice.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (f: string) => readFileSync(join(process.cwd(), f), "utf8");
const door = () => read("lib/search/serve-search.ts");
const route = () => read("app/api/search/native/route.ts");
const page = () => read("app/[locale]/(public)/search/page.tsx");
const client = () => read("app/[locale]/(public)/search/SearchPageClient.tsx");

describe("one door for both ways a search arrives", () => {
  it("the JSON route and the page both go through serveNativeSearch, each naming itself", () => {
    expect(route()).toMatch(/serveNativeSearch\([^;]{0,160}"\/api\/search\/native"/);
    expect(page()).toMatch(/serveNativeSearch\([^;]{0,160}"\/search"/);
  });

  it("neither door meters, logs or searches on its own", () => {
    for (const src of [route(), page()]) {
      expect(src).not.toMatch(/\brateLimit\(/);
      expect(src).not.toMatch(/\blogSearchQuery\(/);
      expect(src).not.toMatch(/\brunNativeSearch\(/);
      expect(src).not.toMatch(/\blogSecurityEvent\(/);
    }
  });

  it("meters before it reads the query, and logs only what may be logged", () => {
    const src = door();
    expect(src.indexOf("rateLimit(")).toBeGreaterThan(-1);
    expect(src.indexOf("rateLimit(")).toBeLessThan(src.indexOf("parseNativeSearchParams("));
    expect(src).toMatch(/if \(!skipLogging && outcome\.logTotal !== null\) \{\s*logSearchQuery\(/);
  });
});

describe("the page renders the first page for a document load only", () => {
  it("skips a fetch() (the router's client-side navigation), and renders when the header is absent", () => {
    const src = page();
    expect(src).toMatch(/requestHeaders\.get\("sec-fetch-dest"\)/);
    // Absent → render: the condition must require the header to be PRESENT
    // before it may skip.
    expect(src).toMatch(/if \(dest && dest !== "document" && dest !== "iframe"\) return null;/);
  });

  it("streams the results: the header paints first, and the fallback is the same client, searching", () => {
    const src = page();
    expect(src).toMatch(/const first = firstPage\(searchParams\);/);
    expect(src).toMatch(/<Suspense fallback=\{<SearchPageClient [^>]*initial=\{\{ state: "pending" \}\} \/>\}>/);
    // Nothing slow is awaited before the heading: only the translations.
    const body = src.slice(src.indexOf("export default async function SearchPage"));
    expect(body.slice(0, body.indexOf("return ("))).not.toMatch(/await (?!getTranslations)/);
  });
});

describe("the client never searches for what the server already answered", () => {
  it("skips the served search and the pending fallback, and clears the served key on the first change", () => {
    const src = client();
    expect(src).toMatch(/if \(pendingOnServer\) return;/);
    expect(src).toMatch(/if \(servedKeyRef\.current === key\) return;\s*servedKeyRef\.current = null;\s*runSearch\(/);
  });

  it("starts every piece of result state from the served answer, so hydration matches the server HTML", () => {
    const src = client();
    for (const field of ["results", "counts", "facetCounts", "page", "hasMore", "fuzzy", "pageHits", "partial", "relatedSubjects", "popularResources"]) {
      expect(src, field).toMatch(new RegExp(`useState<?[^(]*\\(served\\?\\.${field}`));
    }
  });
});

describe("the first page works without JavaScript", () => {
  it("the search bar is a GET form that keeps the search but never the page number", () => {
    const src = client();
    expect(src).toMatch(/<form action=\{locale === "km" \? "\/km\/search" : "\/search"\} method="get"/);
    expect(src).toMatch(/\.filter\(\(\[key\]\) => key !== "q" && key !== "page"\)/);
    expect(src).toMatch(/name="q"/);
    // A disabled default button also blocks Enter; nothing enables it without JS.
    expect(src).toMatch(/disabled=\{hydrated && !input\.trim\(\)\}/);
  });

  it("scope and type are links, and Load more is a link JavaScript takes over", () => {
    const src = client();
    expect(src).toMatch(/href=\{scopeHref\(scope\)\}/);
    expect(src).toMatch(/href=\{typeHref\(tabId\)\}/);
    expect(src).toMatch(/href=\{nextPageHref\(\)\}[\s\S]{0,120}e\.preventDefault\(\);/);
    expect(src).not.toMatch(/aria-pressed/);
  });

  it("a control's URL starts its search over at page 1", () => {
    expect(client()).toMatch(/const nextParams = \(\) => \{\s*const next = new URLSearchParams\(paramsKey\);\s*next\.delete\("page"\);/);
    expect(client()).not.toMatch(/new URLSearchParams\(params\.toString\(\)\)/);
  });

  it("server-rendered facets stand in the sidebar from lg until the client knows the viewport", () => {
    expect(client()).toMatch(/facetPlacement === "css" \? "hidden lg:block " : ""/);
  });
});

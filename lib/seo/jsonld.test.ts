import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { pageGraph, pruneEmpty, siteGraphNodes } from "./jsonld";
import { LIBRARY_ID, ORGANIZATION_ID, WEBSITE_ID } from "./entity-ids";
import type { SiteConfig } from "@/lib/system-settings/types";

const ROOT = path.resolve(__dirname, "../..");

// Just the fields the site graph reads.
const cfg = {
  name: { en: "Phnom Penh Teacher Education College", km: "វិទ្យាស្ថានគរុកោសល្យរាជធានីភ្នំពេញ", short: "PTEC" },
  libraryName: { en: "PTEC Library", km: "បណ្ណាល័យ វ.គ.ភ" },
  links: { website: "https://www.ptec.edu.kh" },
  sameAs: ["https://www.ptec.edu.kh", "https://facebook.com/ptec", "https://youtube.com/@ptec"],
  phone: "023 000 000",
  email: "library@example.test",
  address: { streetAddress: "Street", city: "Phnom Penh", country: "KH" },
  hours: { openingHoursSpecification: [{ "@type": "OpeningHoursSpecification", dayOfWeek: ["Monday"] }] },
  seo: { siteName: "PTEC Library", siteDescription: { en: "A library.", km: "" } },
} as unknown as SiteConfig;

describe("siteGraphNodes", () => {
  const [college, library, website] = siteGraphNodes(cfg);
  it("declares the college, the library and the website with their stable ids", () => {
    expect(college).toMatchObject({ "@type": "CollegeOrUniversity", "@id": ORGANIZATION_ID, url: "https://www.ptec.edu.kh" });
    expect(library).toMatchObject({ "@type": "Library", "@id": LIBRARY_ID, parentOrganization: { "@id": ORGANIZATION_ID } });
    expect(website).toMatchObject({
      "@type": "WebSite",
      "@id": WEBSITE_ID,
      name: "PTEC Library",
      alternateName: "បណ្ណាល័យ វ.គ.ភ",
      inLanguage: ["en", "km"],
      publisher: { "@id": LIBRARY_ID },
    });
  });
  it("has no SearchAction (D10)", () => {
    expect(JSON.stringify(siteGraphNodes(cfg))).not.toContain("SearchAction");
  });
  it("never lists a node's own site in its sameAs", () => {
    expect(college.sameAs).not.toContain("https://www.ptec.edu.kh");
    expect(library.sameAs).not.toContain("https://www.ptec.edu.kh");
    expect(library.sameAs).toContain("https://facebook.com/ptec");
  });
});

describe("pageGraph", () => {
  const book = { "@context": "https://schema.org", "@type": "Book", "@id": "https://x/books/a#book", name: "A", author: [] };
  const crumbs = { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [{ position: 1 }] };
  const graph = pageGraph(cfg, [book, null, false, crumbs]);

  it("is one document: one @context and one @graph, site nodes first", () => {
    expect(graph["@context"]).toBe("https://schema.org");
    const types = (graph["@graph"] as { "@type": string }[]).map((n) => n["@type"]);
    expect(types).toEqual(["CollegeOrUniversity", "Library", "WebSite", "Book", "BreadcrumbList"]);
    expect(JSON.stringify(graph["@graph"])).not.toContain("@context");
  });
  it("flattens a builder's own { @context, @graph }", () => {
    const g = pageGraph(cfg, [{ "@context": "https://schema.org", "@graph": [{ "@type": "Person" }, { "@type": "ProfilePage" }] }]);
    expect((g["@graph"] as { "@type": string }[]).slice(3).map((n) => n["@type"])).toEqual(["Person", "ProfilePage"]);
  });
  it("drops a page node that redeclares a sitewide entity", () => {
    const g = pageGraph(cfg, [{ "@type": "Library", "@id": LIBRARY_ID, name: "Other" }]);
    expect((g["@graph"] as unknown[]).length).toBe(3);
  });
  it("prunes empty values at any depth", () => {
    expect(JSON.stringify(graph)).not.toContain('"author"');
    expect(pruneEmpty({ a: "", b: null, c: [], d: { e: undefined }, f: "undefined", g: 0, h: false, i: ["", "x"] })).toEqual({
      g: 0,
      h: false,
      i: ["x"],
    });
  });
});

// ── Source scans ──────────────────────────────────────────────────────────

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx$/.test(name) && !/\.test\.tsx$/.test(name)) out.push(full);
  }
  return out;
}
const code = (f: string) => readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("one JSON-LD block per page", () => {
  it("nothing but PageJsonLd renders <JsonLd> — a second block is a second document", () => {
    const files = ["app", "components"].flatMap((d) => walk(path.join(ROOT, d)));
    const offenders = files
      .filter((f) => !f.endsWith(path.join("components", "seo", "PageJsonLd.tsx")))
      .filter((f) => /<JsonLd\b/.test(code(f)));
    expect(offenders.map((f) => path.relative(ROOT, f))).toEqual([]);
  });

  it("the root layout emits no JSON-LD of its own", () => {
    expect(code(path.join(ROOT, "components/layout/RootShell.tsx"))).not.toMatch(/JsonLd|ld\+json/);
  });

  // Private and noindex utility pages carry no structured data; every other
  // public page renders exactly one graph, itself or through its shell.
  const WITHOUT = new Set([
    "dashboard/page.tsx",
    "dashboard/settings/page.tsx",
    "lists/[id]/page.tsx",
    "offline-books/page.tsx",
    "offline-reader/page.tsx",
    "search/page.tsx",
    "books/[slug]/read/page.tsx",
  ]);
  const PUBLIC = path.join(ROOT, "app/[locale]/(public)");
  const pages = walk(PUBLIC).filter((f) => f.endsWith("page.tsx"));

  it.each(pages.map((f) => path.relative(PUBLIC, f).replace("(home)/", "")))("%s renders one graph", (rel) => {
    const file = pages.find((f) => path.relative(PUBLIC, f).replace("(home)/", "") === rel)!;
    const src = code(file);
    const count = (src.match(/<PageJsonLd\b|<AboutPageShell\b|<ThesisBrowseView\b/g) ?? []).length;
    if (WITHOUT.has(rel)) expect(count).toBe(0);
    else expect(count).toBe(1);
  });
});

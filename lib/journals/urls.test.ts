import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  ARTICLES_BASE_PATH,
  JOURNALS_PATH,
  PTEC_PUBLICATIONS_URL,
  articlePath,
  issuePath,
  journalIssuesPath,
  journalPath,
  legacyPublicationRedirectRules,
} from "@/lib/journals/urls";
import { DIGITAL_LIBRARY_ITEMS } from "@/components/layout/digital-library-nav";

const ROOT = path.resolve(__dirname, "..", "..");
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");

describe("journal URL shapes", () => {
  it("builds every level from one module", () => {
    expect(JOURNALS_PATH).toBe("/journals");
    expect(ARTICLES_BASE_PATH).toBe("/journals/articles");
    expect(articlePath("a-b")).toBe("/journals/articles/a-b");
    expect(journalPath("cjte")).toBe("/journals/cjte");
    expect(journalIssuesPath("cjte")).toBe("/journals/cjte/issues");
    expect(issuePath("cjte", "vol-7-issue-2")).toBe("/journals/cjte/issues/vol-7-issue-2");
  });

  it("keeps the journal OUT of the article URL — a corrected mapping must never move an article", () => {
    expect(articlePath("x")).not.toContain("cjte");
    expect(articlePath("x").split("/")).toHaveLength(4);
  });
});

describe("legacy /publications redirects", () => {
  const rules = legacyPublicationRedirectRules();
  const sources = new Set(rules.map((r) => r.source));

  it.each([
    ["/publications", "/journals"],
    ["/en/publications", "/journals"],
    ["/km/publications", "/km/journals"],
    ["/publications/:slug", "/journals/articles/:slug"],
    ["/en/publications/:slug", "/journals/articles/:slug"],
    ["/km/publications/:slug", "/km/journals/articles/:slug"],
    ["/journals/articles", "/journals"],
    ["/km/journals/articles", "/km/journals"],
  ])("%s → %s, 301, one hop", (source, destination) => {
    const rule = rules.find((r) => r.source === source);
    expect(rule, `no rule for ${source}`).toBeDefined();
    expect(rule!.destination).toBe(destination);
    expect(rule!.statusCode).toBe(301);
  });

  it("no destination is itself a redirect source (no chains)", () => {
    for (const r of rules) expect(sources.has(r.destination), `${r.destination} redirects again`).toBe(false);
  });

  it("never loses the Khmer locale and never emits /en", () => {
    for (const r of rules) {
      if (r.source.startsWith("/km/")) expect(r.destination.startsWith("/km/")).toBe(true);
      else expect(r.destination.startsWith("/km")).toBe(false);
      expect(r.destination.startsWith("/en")).toBe(false);
    }
  });

  it("next.config.ts registers them (config redirects run before middleware)", () => {
    const src = read("next.config.ts");
    expect(src).toContain('from "./lib/journals/urls"');
    expect(src).toMatch(/legacyPublicationRedirectRules\(\)/);
  });
});

describe("Publications ↗ is the college's page, and Journals is the collection", () => {
  it("points at the official PTEC publications URL", () => {
    expect(PTEC_PUBLICATIONS_URL).toBe("https://www.ptec.edu.kh/publications/");
  });

  it("the shared nav list carries Journals internally and Publications externally", () => {
    const journals = DIGITAL_LIBRARY_ITEMS.find((i) => i.labelKey === "journals");
    const pubs = DIGITAL_LIBRARY_ITEMS.find((i) => i.labelKey === "ptecPublications");
    expect(journals).toMatchObject({ href: JOURNALS_PATH });
    expect("external" in journals! && journals.external).toBeFalsy();
    expect(pubs).toMatchObject({ href: PTEC_PUBLICATIONS_URL, external: true });
    // No internal item may be the retired collection.
    for (const item of DIGITAL_LIBRARY_ITEMS) {
      if (!("external" in item && item.external)) expect(item.href.startsWith("/publications")).toBe(false);
    }
  });

  it("the footer lists Journals and the external Publications link", () => {
    const src = read("components/layout/Footer.tsx");
    expect(src).toContain('navT("journals"), href: JOURNALS_PATH');
    expect(src).toContain('navT("ptecPublications"), href: PTEC_PUBLICATIONS_URL, external: true');
  });

  it("the homepage grid renders EVERY external item, not only the first", () => {
    const src = read("components/ui/home/CollectionGrid.tsx");
    expect(src).toContain("DIGITAL_LIBRARY_ITEMS.filter((item) => item.external)");
    expect(src).not.toContain("DIGITAL_LIBRARY_ITEMS.find((item) => item.external)");
  });
});

// ── Source scan ────────────────────────────────────────────────────────────
//
// The article URL used to be a hand-written `/publications/${slug}` in ~70
// places. After the move, a new hand-written internal /publications URL would
// be a link into a 301 at best — and a copy of the old shape that the next
// route change misses. Build URLs with lib/journals/urls.ts.
//
// Comments are stripped first (docs and history may say "/publications"), and
// three things legitimately contain the string: the API file routes
// (/api/publications — the rights gate, deliberately not moved), the admin
// section (/admin/publications — an internal tool URL), and the external PTEC
// URL, which is https://…/publications/ and never a bare path.
function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name.startsWith(".")) continue;
      sourceFiles(rel, out);
    } else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) {
      out.push(rel);
    }
  }
  return out;
}

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

const LEGACY_URL = /(["'`]|\}|\/km)\/publications(?=[/"'`?#]|$)/;

describe("no hand-written internal /publications URL remains", () => {
  const files = [...sourceFiles("app"), ...sourceFiles("components"), ...sourceFiles("lib")].filter(
    (f) => !f.startsWith(path.join("lib", "journals", "urls.ts")),
  );

  it("finds the source tree", () => {
    expect(files.length).toBeGreaterThan(200);
  });

  it.each(files.map((f) => [f]))("%s", (file) => {
    const lines = stripComments(read(file)).split("\n");
    const offenders = lines.filter(
      (l) =>
        LEGACY_URL.test(l) &&
        !/\/(api|admin)\/publications/.test(l) &&
        !l.includes("ptec.edu.kh/publications"),
    );
    expect(offenders, `${file} builds a /publications URL by hand — use lib/journals/urls.ts`).toEqual([]);
  });
});

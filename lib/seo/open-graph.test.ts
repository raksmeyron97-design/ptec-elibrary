// lib/seo/open-graph.test.ts
//
// Source scan, not a unit test, because the defect it guards is an ABSENCE.
//
// Next.js replaces `openGraph` rather than deep-merging it, so a page that
// declares its own og:title silently drops the layout's og:site_name and
// og:locale. Nothing errors; the tags are simply gone. Eight public routes
// shipped that way — the homepage, /about, /about/committee, /contact,
// /policy, /privacy, /posts/[slug] and /catalogs/[slug] — while their siblings
// carried the tags, so a diff of any two routes was the only way to see it.
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..", "..");
const PUBLIC_TREE = path.join(ROOT, "app/[locale]/(public)");

function metadataFiles(): string[] {
  return fs
    .readdirSync(PUBLIC_TREE, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && (e.name === "page.tsx" || e.name === "layout.tsx"))
    .map((e) => path.join(e.parentPath ?? PUBLIC_TREE, e.name))
    .filter((f) => /openGraph\s*:/.test(fs.readFileSync(f, "utf8")));
}

const rel = (f: string) => path.relative(ROOT, f);

describe("every public page that declares openGraph keeps the site identity", () => {
  const files = metadataFiles();

  it("finds the pages that declare openGraph", () => {
    // Guards the scan itself: at zero, every assertion below is vacuous.
    expect(files.length).toBeGreaterThan(5);
  });

  it("declares siteName, via openGraphBase() or explicitly", () => {
    const offenders = files
      .filter((f) => {
        const src = fs.readFileSync(f, "utf8");
        return !/openGraphBase\(/.test(src) && !/siteName\s*:/.test(src);
      })
      .map(rel);
    expect(offenders).toEqual([]);
  });

  it("spreads openGraphBase() FIRST, so the page's own fields win", () => {
    // `{ title, ...(await openGraphBase(locale)) }` would let the shared
    // defaults overwrite the page's title — the opposite of the intent.
    const offenders: string[] = [];
    for (const f of files) {
      const src = fs.readFileSync(f, "utf8");
      if (!/openGraphBase\(/.test(src)) continue;
      const block = src.slice(src.indexOf("openGraph: {"));
      const firstEntry = block.slice(0, block.indexOf("\n", block.indexOf("\n") + 1));
      if (!/\.\.\.\(await openGraphBase\(/.test(firstEntry)) offenders.push(rel(f));
    }
    expect(offenders).toEqual([]);
  });

  it("never hardcodes the site name in an openGraph block", () => {
    // The name lives in published System Settings. A literal here is a second
    // source of truth, which is how "PTEC Digital Library" and "PTEC Library"
    // ended up in circulation at the same time.
    const offenders: string[] = [];
    for (const f of files) {
      const src = fs.readFileSync(f, "utf8");
      if (/siteName\s*:\s*["'`]/.test(src)) offenders.push(rel(f));
    }
    expect(offenders).toEqual([]);
  });
});

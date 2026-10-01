// lib/verify/sitemap.ts
//
// Read the whole sitemap as ONE <urlset>, following the index. Pure apart from
// the fetch function it is handed, so every verifier keeps its own fault
// vocabulary (lib/verify/http.ts).
//
// Since Phase 1.5 (docs/seo/AUDIT-VERIFICATION.md F6) /sitemap.xml is an INDEX
// naming one child per resource type. The verifiers were written against a
// single <urlset> and extract <loc> with a regex, so pointed at the index they
// would have found eight child URLs and silently checked nothing else. This
// merges the children back into the shape they expect.
//
// Child URLs in the index name the canonical origin (SITE_URL is baked in at
// build time), so they are re-based onto the origin under test: a verifier
// run against a local build must read the local children, not production's.

export const SITEMAP_INDEX_PATH = "/sitemap.xml";

/** The <loc> values of a sitemap index, or null when `xml` is not one. */
export function sitemapIndexChildren(xml: string): string[] | null {
  if (!/<sitemapindex[\s>]/.test(xml)) return null;
  return [...xml.matchAll(/<sitemap>[\s\S]*?<loc>([^<]+)<\/loc>[\s\S]*?<\/sitemap>/g)].map((m) =>
    m[1].replace(/&amp;/g, "&").trim(),
  );
}

/** `url` moved onto `base`'s origin, keeping path and query. */
export function rebaseUrl(url: string, base: string): string {
  const u = new URL(url);
  const b = new URL(base);
  return `${b.origin}${u.pathname}${u.search}`;
}

/** Every <url>…</url> block of a urlset document. */
export function urlBlocks(xml: string): string[] {
  return [...xml.matchAll(/<url>[\s\S]*?<\/url>/g)].map((m) => m[0]);
}

/**
 * /sitemap.xml at `base`, as a single <urlset>: an index is followed and its
 * children's <url> blocks concatenated in index order; a plain urlset is
 * returned unchanged. A child that fails to load throws — a verifier must not
 * report on a sitemap it only half read.
 */
export async function fetchMergedSitemap(base: string, fetchText: (url: string) => Promise<string>): Promise<string> {
  const root = await fetchText(`${new URL(base).origin}${SITEMAP_INDEX_PATH}`);
  const children = sitemapIndexChildren(root);
  if (!children) return root;
  const blocks: string[] = [];
  for (const child of children) blocks.push(...urlBlocks(await fetchText(rebaseUrl(child, base))));
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    ...blocks,
    "</urlset>",
  ].join("\n");
}

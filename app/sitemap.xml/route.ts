// /sitemap.xml — the sitemap INDEX: one child per resource type
// (lib/seo/sitemap-entries.ts). robots.txt names this URL, unchanged.
//
// A child with no URLs is left out of the index rather than listed empty, and
// off-production (or with the System Settings indexing switch off) the index
// lists nothing at all — the same two gates the single sitemap had.

import { getSitemapEntries, sitemapChildUrl, sitemapIsPublished, SITEMAP_TYPES } from "@/lib/seo/sitemap-entries";
import { renderSitemapIndex, SITEMAP_HEADERS } from "@/lib/seo/sitemap-xml";

export const dynamic = "force-static";
export const revalidate = 3600;

export async function GET(): Promise<Response> {
  if (!(await sitemapIsPublished())) {
    return new Response(renderSitemapIndex([]), { headers: SITEMAP_HEADERS });
  }
  const children: { url: string; lastModified?: string | null }[] = [];
  for (const type of SITEMAP_TYPES) {
    const entries = await getSitemapEntries(type);
    if (entries.length === 0) continue;
    // The child's lastmod is its newest entry's, when any entry carries one.
    const newest = entries
      .map((e) => (e.lastModified instanceof Date ? e.lastModified.toISOString() : e.lastModified))
      .filter((v): v is string => Boolean(v))
      .sort()
      .at(-1);
    children.push({ url: sitemapChildUrl(type), lastModified: newest ?? null });
  }
  return new Response(renderSitemapIndex(children), { headers: SITEMAP_HEADERS });
}

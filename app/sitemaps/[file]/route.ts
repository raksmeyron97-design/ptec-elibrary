// /sitemaps/<type>.xml — one child of the sitemap index (app/sitemap.xml).
// Every <loc> is percent-encoded exactly as the page's canonical is, and every
// entry carries en, km and x-default alternates (lib/seo/sitemap-xml.ts).

import { getSitemapEntries, isSitemapType, sitemapIsPublished } from "@/lib/seo/sitemap-entries";
import { renderUrlset, SITEMAP_HEADERS } from "@/lib/seo/sitemap-xml";

// Rendered at REQUEST time, never prerendered at build. The entries depend on
// the box's runtime environment (SEO_DESCRIPTION_GATE, SEO_AUTHOR_MIN_WORKS…),
// which the CI image build does not have: prerendered there, every deploy
// shipped a sitemap built WITHOUT those flags and served it as a cache hit for
// an hour (seen 2026-10-01: the two gated books back in books.xml after a
// deploy while their pages said noindex). The hour of caching that matters is
// kept — getSitemapEntries() is an unstable_cache under the `sitemap` tag, and
// a route handler's `fetchCache` is only ever its own export, so
// force-dynamic does not bypass it. Each request renders XML from that cache.
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }): Promise<Response> {
  const { file } = await params;
  const type = file.replace(/\.xml$/, "");
  if (!file.endsWith(".xml") || !isSitemapType(type)) return new Response("Not found", { status: 404 });
  const entries = (await sitemapIsPublished()) ? await getSitemapEntries(type) : [];
  return new Response(renderUrlset(entries), { headers: SITEMAP_HEADERS });
}

// /sitemaps/<type>.xml — one child of the sitemap index (app/sitemap.xml).
// Every <loc> is percent-encoded exactly as the page's canonical is, and every
// entry carries en, km and x-default alternates (lib/seo/sitemap-xml.ts).

import { getSitemapEntries, isSitemapType, sitemapIsPublished, SITEMAP_TYPES } from "@/lib/seo/sitemap-entries";
import { renderUrlset, SITEMAP_HEADERS } from "@/lib/seo/sitemap-xml";

export const dynamic = "force-static";
export const dynamicParams = false;
export const revalidate = 3600;

export function generateStaticParams() {
  return SITEMAP_TYPES.map((type) => ({ file: `${type}.xml` }));
}

export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }): Promise<Response> {
  const { file } = await params;
  const type = file.replace(/\.xml$/, "");
  if (!file.endsWith(".xml") || !isSitemapType(type)) return new Response("Not found", { status: 404 });
  const entries = (await sitemapIsPublished()) ? await getSitemapEntries(type) : [];
  return new Response(renderUrlset(entries), { headers: SITEMAP_HEADERS });
}

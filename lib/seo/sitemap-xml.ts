// lib/seo/sitemap-xml.ts
//
// Sitemap XML, written here rather than by Next's metadata serializer. Pure.
//
// Three things the serializer could not be made to do (docs/seo/AUDIT-VERIFICATION.md F6):
//
//   * PERCENT-ENCODE <loc>. Next writes a sitemap URL verbatim, while it
//     resolves every canonical through `new URL()`. So 1,851 Khmer <loc> values
//     were raw Unicode while the same page's canonical was percent-encoded —
//     the same URL to a browser, but not the same bytes, and the sitemap
//     protocol asks for escaped URLs. Both now go through the WHATWG URL
//     serializer, which is what makes them byte-identical.
//   * An INDEX. One <urlset> held everything; the index names one child per
//     resource type, so Search Console reports coverage per type.
//   * x-default. Every page head carries en/km/x-default; the sitemap carried
//     only en/km.
//
// The root is the one special case: Next serializes the homepage canonical as
// the bare origin (no trailing slash, lib/seo/alternates.ts), and a <loc> of
// "https://…/" would differ from it by one byte.

export type SitemapUrlEntry = {
  url: string;
  lastModified?: string | Date;
  changeFrequency?: string;
  priority?: number;
  alternates?: { languages?: Record<string, string | undefined> };
};

/** The byte form a canonical takes: WHATWG-serialized, bare origin for "/". */
export function encodeSitemapUrl(raw: string): string {
  const url = new URL(raw);
  if (url.pathname === "/" && !url.search && !url.hash) return url.origin;
  return `${url.origin}${url.pathname}${url.search}`;
}

function xmlEscape(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function lastmodText(value: string | Date | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : value;
}

export function renderUrlset(entries: readonly SitemapUrlEntry[]): string {
  const out: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
  ];
  for (const e of entries) {
    out.push("<url>", `<loc>${xmlEscape(encodeSitemapUrl(e.url))}</loc>`);
    for (const [lang, href] of Object.entries(e.alternates?.languages ?? {})) {
      if (!href) continue;
      out.push(`<xhtml:link rel="alternate" hreflang="${xmlEscape(lang)}" href="${xmlEscape(encodeSitemapUrl(href))}" />`);
    }
    const lastmod = lastmodText(e.lastModified);
    if (lastmod) out.push(`<lastmod>${xmlEscape(lastmod)}</lastmod>`);
    if (e.changeFrequency) out.push(`<changefreq>${xmlEscape(e.changeFrequency)}</changefreq>`);
    if (e.priority != null) out.push(`<priority>${e.priority}</priority>`);
    out.push("</url>");
  }
  out.push("</urlset>", "");
  return out.join("\n");
}

export function renderSitemapIndex(children: readonly { url: string; lastModified?: string | null }[]): string {
  const out: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ];
  for (const c of children) {
    out.push("<sitemap>", `<loc>${xmlEscape(encodeSitemapUrl(c.url))}</loc>`);
    if (c.lastModified) out.push(`<lastmod>${xmlEscape(c.lastModified)}</lastmod>`);
    out.push("</sitemap>");
  }
  out.push("</sitemapindex>", "");
  return out.join("\n");
}

/** Response headers every sitemap document is served with. */
export const SITEMAP_HEADERS = {
  "content-type": "application/xml; charset=utf-8",
} as const;

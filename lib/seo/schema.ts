import { SITE_URL } from "@/lib/seo/site";

type Crumb = {
  name: string;
  /** Route path starting with "/", e.g. "/theses". Omit for the current page. */
  path?: string;
};

/**
 * schema.org BreadcrumbList for JSON-LD. The last crumb is the current page
 * and per Google's guidance may omit `item`.
 */
export function breadcrumbSchema(crumbs: Crumb[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((crumb, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: crumb.name,
      ...(crumb.path ? { item: `${SITE_URL}${crumb.path}` } : {}),
    })),
  };
}

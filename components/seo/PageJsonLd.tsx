import JsonLd from "@/components/seo/JsonLd";
import { pageGraph } from "@/lib/seo/jsonld";
import { getSiteConfig } from "@/lib/system-settings/config";

/**
 * The page's ONE JSON-LD block (SEO Phase 4): the sitewide college, library
 * and website nodes plus `nodes`, as a single `@graph` (lib/seo/jsonld.ts).
 * Render it once per public page; lib/seo/jsonld-graph.test.ts fails on a
 * page or component that renders <JsonLd> directly.
 */
export default async function PageJsonLd({ nodes = [] }: { nodes?: readonly unknown[] }) {
  const cfg = await getSiteConfig();
  return <JsonLd data={pageGraph(cfg, nodes)} />;
}

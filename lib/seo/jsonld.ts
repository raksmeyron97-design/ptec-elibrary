// lib/seo/jsonld.ts
//
// One JSON-LD document per page (SEO Phase 4, finding F10). Every public page
// emits exactly one <script type="application/ld+json"> holding an `@graph`:
// the three sitewide nodes — the college, the library, the website — and the
// page's own nodes, which reference them by `@id`. Before, the site graph was
// one block (RootShell) and each page added one to three more, each with its
// own `@context`; a consumer that reads blocks separately saw a book whose
// provider was an unresolved id, and one that merges saw what the prune below
// now removes: `null`, empty strings, empty lists.
//
// Pure: the sitewide nodes are built from the published settings the caller
// passes in; components/seo/PageJsonLd.tsx is the one renderer.

import { toInternationalKhPhone } from "@/lib/seo/phone";
import { SITE_URL } from "@/lib/seo/site";
import { LIBRARY_ID, ORGANIZATION_ID, WEBSITE_ID, ref } from "@/lib/seo/entity-ids";
import type { SiteConfig } from "@/lib/system-settings/types";

export const SCHEMA_CONTEXT = "https://schema.org";

type Node = Record<string, unknown>;

/**
 * `sameAs` is "other web presences of THIS entity": a node never lists its
 * own `url` or its parent's. `cfg.sameAs` is `[website, facebook, youtube,
 * telegram]`, so without this both nodes claimed https://www.ptec.edu.kh —
 * the library/institution conflation SEO V3 removed once already. The social
 * profiles STAY on both, a recorded owner decision: PTEC runs one Facebook
 * page, one YouTube channel and one Telegram channel, and the footer links
 * them from the library brand block.
 */
function profilesFor(cfg: SiteConfig, selfUrl: string, parentUrl?: string): string[] {
  const excluded = new Set([selfUrl, parentUrl].filter(Boolean).map((u) => u!.replace(/\/$/, "")));
  return cfg.sameAs.filter((u) => !excluded.has(u.replace(/\/$/, "")));
}

/**
 * The college, the library and the website — declared here and nowhere else
 * (lib/seo/entity-graph.test.ts). Every other node refers to them by `@id`.
 * No SearchAction (D10): Google retired the sitelinks search box in 2024.
 */
export function siteGraphNodes(cfg: SiteConfig): Node[] {
  const address = {
    "@type": "PostalAddress",
    streetAddress: cfg.address.streetAddress,
    addressLocality: cfg.address.city,
    addressCountry: cfg.address.country,
  };
  const libraryNameKm = cfg.libraryName.km?.trim() || null;
  return [
    {
      "@type": "CollegeOrUniversity",
      "@id": ORGANIZATION_ID,
      name: cfg.name.en,
      alternateName: [cfg.name.short, cfg.name.km].filter(Boolean),
      url: cfg.links.website,
      logo: `${SITE_URL}/logo.png`,
      telephone: toInternationalKhPhone(cfg.phone),
      email: cfg.email,
      // Its own site is `url` above; repeating it in sameAs says nothing.
      sameAs: profilesFor(cfg, cfg.links.website),
      address,
    },
    {
      "@type": "Library",
      "@id": LIBRARY_ID,
      name: cfg.seo.siteName,
      alternateName: libraryNameKm,
      url: SITE_URL,
      image: `${SITE_URL}/logo.png`,
      telephone: toInternationalKhPhone(cfg.phone),
      email: cfg.email,
      description: cfg.seo.siteDescription.en,
      isAccessibleForFree: true,
      // The structured twin of the footer's hours, from the same weekly
      // grouping (lib/system-settings/hours.ts), so the two cannot disagree.
      openingHoursSpecification: cfg.hours.openingHoursSpecification,
      sameAs: profilesFor(cfg, SITE_URL, cfg.links.website),
      address,
      parentOrganization: ref(ORGANIZATION_ID),
    },
    {
      "@type": "WebSite",
      "@id": WEBSITE_ID,
      name: cfg.seo.siteName,
      alternateName: libraryNameKm,
      url: SITE_URL,
      inLanguage: ["en", "km"],
      publisher: ref(LIBRARY_ID),
    },
  ];
}

/** Is this value nothing — the absence a node should not state? */
function isEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim() === "" || value === "undefined" || value === "null";
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.keys(value as object).length === 0;
  return false;
}

/**
 * The value without `null`, `undefined`, blank strings, empty lists and empty
 * objects, at any depth. An empty value is not a fact: `"author": []` says
 * "no author" where the page means "not recorded", and validators flag it.
 */
export function pruneEmpty(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(pruneEmpty).filter((v) => !isEmpty(v));
  }
  if (value && typeof value === "object") {
    const out: Node = {};
    for (const [k, v] of Object.entries(value as Node)) {
      const pruned = pruneEmpty(v);
      if (!isEmpty(pruned)) out[k] = pruned;
    }
    // A list with no items states nothing (an out-of-range page of a listing
    // builds one): it goes, and so does the property that held it.
    if (out["@type"] === "ItemList" && !out.itemListElement) return {};
    return out;
  }
  return value;
}

/** A page's nodes, flattened: a builder's `{ @context, @graph }` contributes
 *  its graph, a single node loses its own `@context`. */
function flatten(nodes: readonly unknown[]): Node[] {
  const out: Node[] = [];
  for (const node of nodes) {
    if (!node || typeof node !== "object") continue;
    if (Array.isArray(node)) {
      out.push(...flatten(node));
      continue;
    }
    const { "@context": _context, "@graph": graph, ...rest } = node as Node;
    void _context;
    if (Array.isArray(graph)) out.push(...flatten(graph));
    if (Object.keys(rest).length > 0) out.push(rest);
  }
  return out;
}

/**
 * The page's one JSON-LD document: the sitewide nodes, then the page's own.
 * A page node that redeclares a sitewide `@id` is dropped — the site graph is
 * the declaration, the page may only refer to it.
 */
export function pageGraph(cfg: SiteConfig, nodes: readonly unknown[]): { "@context": string; "@graph": unknown[] } {
  const site = siteGraphNodes(cfg);
  const siteIds = new Set(site.map((n) => n["@id"]));
  const own = flatten(nodes).filter((n) => !(typeof n["@id"] === "string" && siteIds.has(n["@id"])));
  return { "@context": SCHEMA_CONTEXT, "@graph": pruneEmpty([...site, ...own]) as unknown[] };
}

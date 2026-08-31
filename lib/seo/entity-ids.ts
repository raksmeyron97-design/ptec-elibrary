// lib/seo/entity-ids.ts
//
// The stable `@id` anchors for the three entities this site declares about
// itself. ONE definition, imported by both the producer of the full nodes
// (components/layout/RootShell.tsx) and every builder that needs to point at
// them (lib/seo/org-nodes.ts).
//
// Why this module exists
// ──────────────────────
// RootShell.buildSiteGraph() carries the rule: "Nothing else may declare an
// Organization/Library/WebSite node — duplicates with diverging names/URLs
// read as conflicting entities to search engines." lib/seo/org-nodes.ts broke
// it. Live production HTML on a book page contained, in the same document:
//
//   {"@type":"EducationalOrganization","@id":".../#organization",
//    "url":"https://www.ptec.edu.kh"}                       ← site graph
//   {"provider":{"@type":"Library","parentOrganization":
//    {"@type":"EducationalOrganization","url":"https://library.ptec.edu.kh"}}}
//                                                            ← resource node
//
// One institution, two `url` values, and the second node had no `@id` — so a
// consumer could not merge them and read it as a *different* organization that
// happens to share a name. See docs/SEO-V3-AUDIT.md D-2.
//
// The anchors are literal-free here for the same reason: RootShell used to
// build them inline from SITE_URL, and org-nodes.ts had no way to reference
// them at all.
//
// The `/#fragment` form (slash before the hash) matches what RootShell has
// always emitted and what is already indexed. Do not "tidy" it to `#fragment`
// — changing an @id changes the entity's identity.

import { SITE_URL } from "@/lib/seo/site";

/** The institution: PTEC itself. Declared once by RootShell's site graph. */
export const ORGANIZATION_ID = `${SITE_URL}/#organization`;

/** The library service operated by that institution. */
export const LIBRARY_ID = `${SITE_URL}/#library`;

/** This website. */
export const WEBSITE_ID = `${SITE_URL}/#website`;

/**
 * A bare node reference — `{"@id": "..."}` — for use inside the site graph,
 * where the full node is a sibling and merging is unambiguous.
 */
export function ref(id: string): { "@id": string } {
  return { "@id": id };
}

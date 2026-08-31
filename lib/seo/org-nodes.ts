// lib/seo/org-nodes.ts
//
// The two schema.org nodes that describe *us* — the institution and the
// library that provides the hosted items. Every JSON-LD builder (books,
// theses, publications, learning paths, posts) emits one or both, so they are
// built from a resolved OrgIdentity here instead of being re-declared as
// module constants in each file (which is how the publisher name in JSON-LD
// drifted away from the published settings in the first place).
//
// Roles, deliberately: PTEC is an `EducationalOrganization`; the library is a
// `Library` whose `parentOrganization` is that institution. For hosted books
// the library is the *provider*, never the publisher — see lib/seo/book-seo.ts.
//
// ── These are REFERENCES, not declarations (SEO V3) ─────────────────────────
//
// The full nodes are declared exactly once per page, by
// RootShell.buildSiteGraph(), which every root layout renders. What these
// builders emit is an `@id`-anchored reference to those nodes.
//
// They were previously anonymous inline copies, and the copies were wrong:
// `parentOrganization.url` resolved to the LIBRARY origin
// (https://library.ptec.edu.kh) while the site graph gave the same
// organization its real url (https://www.ptec.edu.kh). One document, one
// institution, two URLs, no `@id` to merge them by. See docs/SEO-V3-AUDIT.md
// D-2 — it was live on every book, thesis, publication, path, post, subject
// and author page.
//
// Why a reference carrying `@type`/`name`/`url` rather than a bare `{"@id"}`:
// the site graph and the resource node are separate <script> blocks, and while
// Google merges JSON-LD blocks across a page, stricter consumers treat each
// block as its own document. Repeating the identifying fields keeps the
// reference self-describing there, and the shared `@id` guarantees that a
// consumer which *does* merge sees one entity rather than two. The values
// repeated are the ones the site graph declares, from the same resolved
// OrgIdentity — so they cannot contradict it.

import { LIBRARY_ID, ORGANIZATION_ID, ref } from "@/lib/seo/entity-ids";
import type { OrgIdentity } from "@/lib/system-settings/org-identity";

/**
 * PTEC, the institution. `url` is the institution's OWN website
 * (`links.website` → https://www.ptec.edu.kh), never this library's origin —
 * that confusion was the defect this module was rewritten to fix.
 */
export function organizationNode(org: OrgIdentity) {
  return {
    "@type": "EducationalOrganization",
    "@id": ORGANIZATION_ID,
    name: org.institutionName,
    url: org.institutionUrl,
  } as const;
}

/**
 * The library service. `parentOrganization` is a bare reference: the
 * institution is fully described by its own node in the site graph, and
 * repeating it here is exactly what produced the duplicate-entity defect.
 */
export function libraryNode(org: OrgIdentity) {
  return {
    "@type": "Library",
    "@id": LIBRARY_ID,
    name: org.siteName,
    url: org.url,
    parentOrganization: ref(ORGANIZATION_ID),
  } as const;
}

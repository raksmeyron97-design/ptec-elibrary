// lib/verify/jsonld.ts
//
// Reading a page's JSON-LD the way a search engine does, for the production
// verifiers (scripts/verify-production-entities.ts). Pure, and free of npm
// and `@/` imports, so CI can run those verifiers with tsx alone.
//
// ── Why this is its own module ───────────────────────────────────────────────
//
// On 2026-10-01 the site moved to ONE JSON-LD document per page holding an
// `@graph` (1b9ef26, "F10"), and the institution's @id became
// https://www.ptec.edu.kh/#org. The entity verifier still looked for a
// top-level `@type` and for `<site>/#organization`, so from that day every
// fixture "carried no Book JSON-LD" on a site that carried exactly that — 12 of
// 12 red on every deploy, on a correct site. A check that is always red is not
// read. So the reader now follows the graph, and the institution id is pinned
// to the site's own constant by a test (jsonld.test.ts), not copied by hand.

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * The institution's node id — the value of ORGANIZATION_ID in
 * lib/seo/entity-ids.ts. Repeated here (that module pulls in the site config),
 * and held equal to it by jsonld.test.ts.
 */
export const INSTITUTION_ID = "https://www.ptec.edu.kh/#org";

/** Every JSON-LD document on the page; a block that does not parse is skipped. */
export function jsonLdDocuments(html: string): any[] {
  const out: any[] = [];
  for (const m of html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script\s*>/gi)) {
    try {
      out.push(JSON.parse(m[1]));
    } catch {
      /* a malformed block is reported by the caller as a missing node */
    }
  }
  return out;
}

/** Every top-level node: a document's `@graph` members, an array's items, or the document itself. */
export function jsonLdNodes(html: string): any[] {
  const nodes: any[] = [];
  const add = (d: any): void => {
    if (Array.isArray(d)) return d.forEach(add);
    if (!d || typeof d !== "object") return;
    if (Array.isArray(d["@graph"])) return d["@graph"].forEach(add);
    nodes.push(d);
  };
  jsonLdDocuments(html).forEach(add);
  return nodes;
}

/** Does this node have that type? `@type` may be a string or a list ("Book", ["Book", "Product"]). */
export function hasType(node: any, type: string): boolean {
  const t = node?.["@type"];
  return Array.isArray(t) ? t.includes(type) : t === type;
}

/** The first node of a type, or undefined. */
export function findNode(nodes: readonly any[], type: string): any {
  return nodes.find((n) => hasType(n, type));
}

/**
 * A bare `@id` reference to the institution — never a second node describing
 * it — and one that resolves: the page's own graph declares that node.
 */
export function isInstitutionRef(v: any, nodes: readonly any[]): boolean {
  return (
    !!v && typeof v === "object" && "@id" in v && !("@type" in v) &&
    v["@id"] === INSTITUTION_ID &&
    nodes.some((n) => n?.["@id"] === INSTITUTION_ID)
  );
}

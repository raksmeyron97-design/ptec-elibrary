// lib/seo/contributor.ts
//
// JSON-LD PROJECTION of the contributor normalization contract. This file does
// not decide what a byline names — `lib/resources/contributor-identity.ts`
// does, once, for ingestion and every render path alike. This is the thin
// layer that turns that answer into schema.org nodes.
//
// ── The defect this exists to make unrepresentable ──────────────────────────
//
// Every byline in this library used to be typed `Person`, unconditionally, at
// eight separate call sites. A byline is free text copied off a title page,
// and in this collection it is very often not one person:
//
//   the college's own name, spelled out                     an institution
//   "ក្រសួងអប់រំ យុវជន និងកីឡា"                                  a ministry
//   "Bert P.M. Creemers, Leonidas Kyriakides, Pam Sammons (Editors)"  three people
//
// Measured on production 2026-09-12: 47 of 157 author entities (30%) were
// multiple people published as one `Person`, and at least 7 were corporate
// bodies. The worst case was PTEC itself — `/authors/phnom-penh-teacher-
// education-college` asserted a `Person` carrying the institution's own name,
// in the *same document* whose site graph declares that same name as an
// `EducationalOrganization` at `#organization`. One document, one institution,
// two entity types, two @ids.
//
// The institution's name is deliberately NOT written out anywhere in this
// file. It is published from System Settings and can be edited there, so a
// literal copy here would be a second source of truth that goes stale —
// `lib/settings-consistency.test.ts` enforces that, and caught this file.
//
// That is the duplicate-institution defect SEO V3 removed from RootShell,
// re-entering through a door `lib/seo/entity-graph.test.ts` does not watch: it
// guards declaration sites, not byline builders.
//
// ── What this layer adds over the contract ──────────────────────────────────
//
// Exactly one thing: an `institution` contributor becomes a bare `@id`
// reference to the node the site graph already declares, rather than a second
// node describing the same body. Everything else is a direct mapping of
// `NormalizedContributor.kind`.

import {
  normalizeByline,
  type ContributorKind,
} from "@/lib/resources/contributor-identity";
import { ORGANIZATION_ID, ref } from "@/lib/seo/entity-ids";
import type { OrgIdentity } from "@/lib/system-settings/org-identity";

// Re-exported so existing importers keep one name for one concept. The
// definitions live in the domain module; these are not second copies.
export {
  classifyName,
  extractRole,
  isOwnInstitution,
  looksLikeOrganization,
  normalizeByline,
  splitByline,
  stripRoleSuffix,
  type ContributorKind,
  type NormalizedByline,
  type NormalizedContributor,
} from "@/lib/resources/contributor-identity";

/** A schema.org node for one contributor, or an `@id` reference to the site's
 *  own institution node. */
export type ContributorNode =
  | { "@type": "Person"; name: string }
  | { "@type": "Organization"; name: string }
  | { "@id": string };

/**
 * Every schema.org node a byline honestly supports.
 *
 * - the institution → a bare `@id` reference to `#organization`
 * - a corporate body → one `Organization`
 * - a safely splittable list → one correctly-typed node PER contributor
 * - one person → one `Person`
 * - several people that cannot be separated safely → **[]**
 *
 * An empty array is a real answer: it means this library does not know who
 * the byline names precisely enough to publish a claim, and the caller must
 * OMIT the property rather than fall back to the raw string.
 */
export function contributorNodes(
  name: string | null | undefined,
  org?: OrgIdentity,
): ContributorNode[] {
  return normalizeByline(name, org).contributors.map((c) => nodeFor(c.kind, c.displayName));
}

function nodeFor(kind: ContributorKind, displayName: string): ContributorNode {
  if (kind === "institution") return ref(ORGANIZATION_ID);
  if (kind === "organization") return { "@type": "Organization", name: displayName };
  return { "@type": "Person", name: displayName };
}

/** The same decision for a list of bylines (books/theses carry arrays). */
export function contributorNodesFor(
  names: readonly (string | null | undefined)[] | null | undefined,
  org?: OrgIdentity,
): ContributorNode[] {
  return (names ?? []).flatMap((n) => contributorNodes(n, org));
}

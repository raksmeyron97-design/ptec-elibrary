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
import type { ResourceContributorView } from "@/lib/resources/contributor-view";
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

/**
 * The SEO 3.2 entry point: project already-resolved contributor credits.
 *
 * This is the shape every resource builder should be given. A
 * `ResourceContributorView` has ALREADY been separated into one entity per
 * credit and ALREADY been typed — by the canonical graph where one exists, by
 * `normalizeByline()` where only a legacy string does. Re-parsing it here
 * would be the round trip SEO 3.2 removed: a contributor the database records
 * as a corporate body coming back out of the renderer as a Person because a
 * keyword heuristic over its name disagreed with the column.
 *
 * So this function classifies NOTHING. It maps `kind` to a node and stops.
 */
export function contributorNodesFromViews(
  views: readonly ResourceContributorView[] | null | undefined,
): ContributorNode[] {
  return (views ?? [])
    .filter((v) => v.name.trim().length > 0)
    .map((v) => nodeFor(v.kind, v.name.trim()));
}

/** The same decision for a list of bylines (books/theses carry arrays). */
export function contributorNodesFor(
  names: readonly (string | null | undefined)[] | null | undefined,
  org?: OrgIdentity,
): ContributorNode[] {
  return (names ?? []).flatMap((n) => contributorNodes(n, org));
}

/**
 * What a resource builder should call: resolved credits when the caller has
 * them, the legacy byline classification when it does not.
 *
 * The two are never combined. A caller that resolved contributors has already
 * applied the canonical read policy (`resolveContributors()`), including its
 * own legacy fallback — so re-adding `names` here would re-introduce exactly
 * the duplicate the policy exists to prevent: one credit from the graph, one
 * from the string the graph was built from.
 *
 * `views` being an EMPTY array is therefore meaningful and is honoured: it
 * means the resolver found nothing it could stand behind. Only `null` or
 * `undefined` — "this caller has not been wired to the graph yet" — falls
 * through to the strings.
 */
export function resolveContributorNodes(
  views: readonly ResourceContributorView[] | null | undefined,
  names: readonly (string | null | undefined)[] | null | undefined,
  org?: OrgIdentity,
): ContributorNode[] {
  if (views != null) return contributorNodesFromViews(views);
  return contributorNodesFor(names, org);
}

/**
 * The ONE entity a contributor URL may claim to be, or `undefined`.
 *
 * `/authors/<slug>` is one URL, so it can carry at most one identity. A byline
 * that resolves to several — 43 of production's 157 contributor rows on
 * 2026-09-12, every one of them a real multi-author title page — has no single
 * answer, and the honest output is none.
 *
 * SEO 3.0 already reached that conclusion for the case where a byline cannot
 * be SEPARATED. This is the other half, and it is the one that shipped:
 * "Bert P.M. Creemers, Leonidas Kyriakides, Pam Sammons (Editors)" separates
 * perfectly into three, so the page took `[0]` and published a `Person` named
 * Bert P.M. Creemers at a URL denoting three editors — dropping two of them
 * and misattributing the work to the first.
 *
 * Zero and several are deliberately the same answer here. They differ in the
 * data (one is unsplittable, one splits into many) but not in what this URL
 * may assert, and collapsing them keeps the rule impossible to apply by
 * halves.
 */
export function soleContributorNode(
  nodes: readonly ContributorNode[],
): ContributorNode | undefined {
  return nodes.length === 1 ? nodes[0] : undefined;
}

/**
 * Let the canonical graph CORRECT what the name said — never replace it.
 *
 * A keyword heuristic over a name gets one thing wrong that stored data can
 * fix: a corporate body whose name contains no vocabulary this library knows
 * ("Angkor Collective" reads as a person). So a stored `organization` may
 * upgrade a `Person`.
 *
 * Everything else is left exactly as the contract resolved it, and the two
 * exclusions are the whole point:
 *
 *   a bare `@id`  — the institution. It is a REFERENCE to the node the site
 *                   graph already declares. Re-typing it from a stored kind
 *                   mints a second node carrying the institution's name and
 *                   its own `@id`, which is the duplicate-institution defect
 *                   SEO V3 removed. A cached, cookieless data loader has no
 *                   published `OrgIdentity` to compare against and therefore
 *                   cannot answer `institution` at all.
 *
 *   `undefined`   — the byline named several entities, or none. A stored kind
 *                   must not manufacture an identity the contract refused to
 *                   find; that is how a 3-editor URL published all three names
 *                   inside one `Person`.
 *
 * Both of those shipped to production on 2026-09-12 from a version that let
 * the stored kind build its own node, and both are fixed by this direction of
 * travel: name first, graph as a correction.
 */
export function correctedContributorNode(
  node: ContributorNode | undefined,
  storedKind: ContributorKind | null | undefined,
): ContributorNode | undefined {
  if (!node || !("@type" in node)) return node;
  if (node["@type"] === "Person" && storedKind === "organization") {
    return { "@type": "Organization", name: node.name };
  }
  return node;
}

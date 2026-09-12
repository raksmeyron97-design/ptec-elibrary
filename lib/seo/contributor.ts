// lib/seo/contributor.ts
//
// WHAT A BYLINE IS, for schema.org. Pure — no server imports — so the decision
// is unit-testable offline like every other lib/seo/* builder.
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
// ── The three rules ─────────────────────────────────────────────────────────
//
// 1. THE INSTITUTION IS REFERENCED, NEVER RE-MINTED. A byline naming the
//    organization the site graph already declares resolves to a bare `@id`
//    reference to `#organization`. A second node for one institution is now
//    unrepresentable from a byline, not merely avoided.
//
// 2. A CORPORATE BODY IS AN `Organization`. Detection is vocabulary-based in
//    BOTH scripts, because this collection is largely Khmer and an
//    English-only word list would silently classify every Khmer ministry and
//    university as a person.
//
// 3. A BYLINE THAT IS NOT ONE ENTITY IS NOT PUBLISHED AS ONE. Where the parts
//    can be split SAFELY the byline becomes several correctly-typed nodes;
//    where it cannot, the claim is OMITTED rather than fabricated (§0.5 of the
//    SEO 3.0 brief: unknown must stay unknown). Splitting is deliberately
//    conservative — see `splitByline()`.

import { parseAuthorNames } from "@/lib/resources/author-names";
import { ORGANIZATION_ID, ref } from "@/lib/seo/entity-ids";
import type { OrgIdentity } from "@/lib/system-settings/org-identity";

export type ContributorKind = "person" | "organization" | "institution" | "composite";

/** A schema.org node for one contributor, or an `@id` reference to the site's
 *  own institution node. */
export type ContributorNode =
  | { "@type": "Person"; name: string }
  | { "@type": "Organization"; name: string }
  | { "@id": string };

/**
 * Words that make a name a corporate body rather than a human.
 *
 * Latin entries are matched as whole words (so "Institute" matches but the
 * "press" inside a surname does not). Khmer has no word boundaries and no
 * segmenter here, so Khmer entries are matched as substrings — which is safe
 * because these are long, unambiguous compounds that do not occur inside
 * personal names.
 */
const ORG_WORDS_LATIN = [
  "ministry", "association", "university", "college", "institute", "institution",
  "council", "centre", "center", "foundation", "organization", "organisation",
  "society", "academy", "committee", "commission", "department", "faculty",
  "publishers", "publishing", "bureau", "agency", "authority",
  "unesco", "unicef", "oecd", "undp", "usaid",
  "corporation", "limited", "incorporated",
  "partnership", "consortium", "federation",
  "secretariat", "directorate",
];

// Deliberately NOT in that list: "press", "board", "trust", "fund", "union",
// "network", "office". Each is a plausible surname, and a false positive here
// retypes a real person as an institution — the same class of untrue claim
// this module exists to remove, pointed the other way.

const ORG_WORDS_KHMER = [
  "ក្រសួង",          // ministry
  "សាកលវិទ្យាល័យ",   // university
  "វិទ្យាស្ថាន",       // institute
  "មជ្ឈមណ្ឌល",       // centre
  "អង្គការ",          // organization
  "នាយកដ្ឋាន",       // department
  "មន្ទីរ",           // bureau/office
  "គណៈកម្មការ",      // committee
  "សមាគម",          // association
  "មូលនិធិ",         // foundation
];

/**
 * Role words a cataloguer appends to a byline. They are not part of anyone's
 * name, and a `Person` whose name ends in "(Editors)" is a false claim about
 * the name itself, separate from how many people it describes.
 */
const ROLE_WORDS = [
  "editor", "editors", "ed", "eds", "edited by",
  "translator", "translators", "trans", "tr",
  "compiler", "compilers", "comp",
  "author", "authors",
];

const ROLE_SUFFIX = new RegExp(
  String.raw`[\s,]*[（(\[]?\s*(?:${ROLE_WORDS.join("|")})\.?\s*[）)\]]?\s*$`,
  "i",
);

function collapse(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

/** Fold for comparison: casefolded, punctuation-insensitive, space-insensitive. */
function fold(value: string): string {
  return collapse(value)
    .toLowerCase()
    .replace(/[.,'"“”‘’\-–—_()[\]]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Strip a trailing cataloguer role marker: "A, B (Editors)" → "A, B".
 * Applied repeatedly so "… (eds.), trans." reduces fully.
 */
export function stripRoleSuffix(name: string | null | undefined): string {
  let out = collapse(name);
  for (let i = 0; i < 3; i++) {
    const next = out.replace(ROLE_SUFFIX, "").trim();
    if (next === out || next.length === 0) break;
    out = next;
  }
  return out;
}

/** Does this name read as a corporate body rather than a human? */
export function looksLikeOrganization(name: string | null | undefined): boolean {
  const raw = collapse(name);
  if (!raw) return false;
  if (ORG_WORDS_KHMER.some((w) => raw.includes(w))) return true;
  const words = fold(raw).split(" ").filter(Boolean);
  return words.some((w) => ORG_WORDS_LATIN.includes(w));
}

/**
 * Split a byline into individual names, but ONLY when doing so is safe.
 *
 * `parseAuthorNames()` is the library's one splitter (it mirrors migration
 * 0105's SQL), and it splits on commas — which is ambiguous, because a comma
 * is also how a single name is inverted: "Smith, John" is ONE person, and
 * splitting it invents two.
 *
 * The rule: a list of people has full names on both sides of every delimiter.
 * So a comma-delimited byline splits only when EVERY resulting segment has at
 * least two whitespace-separated tokens. "Smith, John" → ["Smith"], ["John"] →
 * one token each → refused, left whole. "Donald Ary, Lucy Cheser Jacobs" →
 * two tokens each → split.
 *
 * Being wrong by refusing costs a less granular (still true) node. Being wrong
 * by splitting invents a person who does not exist. The asymmetry decides.
 *
 * Returns [] when the byline cannot be split safely.
 */
export function splitByline(raw: string | null | undefined): string[] {
  const cleaned = stripRoleSuffix(raw);
  if (!cleaned) return [];

  const parts = parseAuthorNames(cleaned).map(stripRoleSuffix).filter(Boolean);
  if (parts.length < 2) return [];

  // A non-comma delimiter (";", "&", "/", " and ") is unambiguous — a name is
  // never inverted with one. Commas alone must clear the full-name bar.
  const commaOnly = !/[;&/]|\s+and\s+/.test(cleaned);
  if (commaOnly) {
    // A full name has at least two tokens. "Smith, John" fails this on both
    // sides and is therefore left whole.
    const everyPartIsAFullName = parts.every((part) => /\s/.test(part));
    if (!everyPartIsAFullName) return [];
  }
  return parts;
}

/** What kind of entity is this byline? */
export function classifyContributor(
  name: string | null | undefined,
  org?: OrgIdentity,
): ContributorKind {
  const cleaned = stripRoleSuffix(name);
  if (!cleaned) return "composite";

  if (org && isOwnInstitution(cleaned, org)) return "institution";
  if (looksLikeOrganization(cleaned)) return "organization";
  if (splitByline(name).length > 1) return "composite";
  if (parseAuthorNames(cleaned).length > 1) return "composite";
  return "person";
}

/** Is this byline the institution the site graph already declares? */
export function isOwnInstitution(name: string, org: OrgIdentity): boolean {
  const target = fold(name);
  if (!target) return false;
  return [org.institutionName, org.institutionNameKm, org.abbreviation]
    .filter(Boolean)
    .some((known) => fold(known) === target);
}

/**
 * Every schema.org node a byline honestly supports.
 *
 * - the institution → a bare `@id` reference to `#organization`
 * - a corporate body → one `Organization`
 * - a safely splittable list → one correctly-typed node PER contributor
 * - anything else → one `Person`
 * - a byline that is several people but cannot be split safely → **[]**
 *
 * An empty array is a real answer: it means "this library does not know who
 * this is precisely enough to publish a claim", and callers must omit the
 * property rather than fall back to the raw string.
 */
export function contributorNodes(
  name: string | null | undefined,
  org?: OrgIdentity,
): ContributorNode[] {
  const cleaned = stripRoleSuffix(name);
  if (!cleaned) return [];

  if (org && isOwnInstitution(cleaned, org)) return [ref(ORGANIZATION_ID)];

  // ORGANISATION IS DECIDED BEFORE SPLITTING, and the order is load-bearing.
  // An institution's name is a UNIT that frequently contains the very
  // delimiters a list uses: "Ministry of Education, Youth and Sport" is one
  // body, and splitting it first yields three entities named "Ministry of
  // Education", "Youth" and "Sport" — three fabrications from one true fact.
  // Deciding the whole string first keeps such a name intact. The cost is that
  // a mixed byline ("<person> and <organisation>") is typed by its
  // organisational word; no such byline exists in this collection, and the
  // alternative shreds real institution names, which do.
  if (looksLikeOrganization(cleaned)) return [{ "@type": "Organization", name: cleaned }];

  const parts = splitByline(name);
  if (parts.length > 1) {
    return parts.flatMap((part) => contributorNodes(part, org));
  }

  // Still more than one name, but not safely separable: publish nothing rather
  // than assert that several people are one.
  if (parseAuthorNames(cleaned).length > 1) return [];

  return [{ "@type": "Person", name: cleaned }];
}

/** The same decision for a list of bylines (books/theses carry arrays). */
export function contributorNodesFor(
  names: readonly (string | null | undefined)[] | null | undefined,
  org?: OrgIdentity,
): ContributorNode[] {
  return (names ?? []).flatMap((n) => contributorNodes(n, org));
}

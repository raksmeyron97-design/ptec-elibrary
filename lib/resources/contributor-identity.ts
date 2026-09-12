// lib/resources/contributor-identity.ts
//
// THE ONE CONTRIBUTOR NORMALIZATION CONTRACT.
//
// A byline in this library is free text copied off a title page. Before this
// module there was no single answer to "who does this string name?", so every
// consumer answered it again, differently — and the SEO layer answered
// "one Person" every time, which was wrong for 30% of the collection
// (docs/SEO-3.0-AUDIT.md F-1..F-3).
//
// This module is PURE and lives in the domain layer, not in lib/seo, because
// the answer is not an SEO fact — it is a fact about the catalogue that
// INGESTION, schema.org, citations, search and the admin UI must all agree on.
// lib/seo/contributor.ts is now a projection of this into JSON-LD; it is not a
// second parser. Adding a third is the failure mode this file exists to close.
//
// ── The pipeline, and why the order is load-bearing ─────────────────────────
//
//   raw string
//     → whitespace collapse
//     → role suffix EXTRACTED (not merely stripped — see below)
//     → institution identity check      ← whole string, before any split
//     → corporate organisation check    ← whole string, before any split
//     → safe multi-person split
//     → per-part classification
//
// Institution and organisation are decided on the WHOLE string, before
// splitting, and that is not an optimisation. An institution's name routinely
// contains the delimiters a list uses: "Ministry of Education, Youth and
// Sport" is one body, and splitting first turns one true fact into three
// fabrications ("Ministry of Education", "Youth", "Sport"). The cost is that a
// mixed "<person> and <organisation>" byline is typed by its organisational
// word; no such byline exists in this collection, while institution names
// containing commas certainly do.
//
// ── Role is EXTRACTED, not destroyed ────────────────────────────────────────
//
// "A, B, C (Editors)" means all three are EDITORS. `resource_contributors.role`
// (migration 0105) has a real column for that, with `editor`, `translator` and
// `compiler` already in its CHECK, so the information is preserved rather than
// thrown away — it simply had nowhere to go while the byline was a single
// string in `books.author`.

import { parseAuthorNames } from "@/lib/resources/author-names";
import type { ContributorRole } from "@/lib/resources/types";
import type { OrgIdentity } from "@/lib/system-settings/org-identity";

/**
 * What a byline names.
 *
 * `institution` is the organisation the site itself publishes as its identity
 * (System Settings). It is separated from `organization` because the two have
 * different representations downstream: the institution is REFERENCED by the
 * `@id` the site graph already declares, never re-minted as a new node.
 */
export type ContributorKind = "person" | "organization" | "institution";

export type NormalizedContributor = {
  kind: ContributorKind;
  /** The contributor's name with any cataloguer role marker removed. */
  displayName: string;
};

export type NormalizedByline = {
  /** The original text, always recoverable — nothing here is lossy. */
  sourceText: string;
  /** The role the byline states for its contributors. Defaults to `author`. */
  role: ContributorRole;
  /**
   * The contributors this byline resolves to.
   *
   * EMPTY is a real answer, not a failure: it means the string names more than
   * one entity and cannot be separated safely. Callers must omit the claim
   * rather than fall back to the raw string — inventing a person is worse than
   * publishing nothing (SEO 3.1 §6.2).
   */
  contributors: NormalizedContributor[];
  /** False when the byline names several entities that could not be split. */
  resolved: boolean;
};

// ── Vocabulary ───────────────────────────────────────────────────────────────

/**
 * Words that make a name a corporate body rather than a human.
 *
 * Latin entries match as whole words. Khmer has no word boundaries and there
 * is no segmenter here, so Khmer entries match as substrings — safe because
 * these are long, unambiguous compounds that do not occur inside personal
 * names. Khmer vocabulary is not optional: this collection is largely Khmer,
 * and an English-only list types every Khmer ministry and university as a
 * human.
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
// this module exists to remove, pointed the other way. Precision over recall:
// do not add a word merely to catch one more organisation.
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
  // Added 2026-09-13 after auditing all 156 production contributor
  // expressions: each of these was typing a real institution as a PERSON.
  // Every one is an unambiguous institutional head-word in Khmer — none can
  // occur inside a personal name — and each was verified against the full
  // production list before being added (scripts/audit-contributors.ts).
  "ក្រុមប្រឹក្សា",     // council        — ក្រុមប្រឹក្សាជាតិភាសាខ្មែរ
  "វិទ្យាល័យ",        // high school    — វិទ្យាល័យ ព្រែកលៀប …
  "រដ្ឋាភិបាល",       // government     — រាជរដ្ឋាភិបាលកម្ពុជា
  "បណ្ឌិត្យ",         // institute      — ពុទ្ធសាសនបណ្ឌិត្យ
  "ដេប៉ាតឺម៉ង់",       // department     — ដេប៉ាតឺម៉ង់ស្រាវជ្រាវ…
  "សាលាភូមិន្ទ",      // royal school   — សាលាភូមិន្ទរដ្ឋបាល
  "លេខាធិការដ្ឋាន",   // secretariat
];

/**
 * Cataloguer role markers, mapped to the role they state.
 *
 * Order matters only in that longer spellings must be tried before their
 * prefixes, which the alternation below handles by sorting on length.
 */
const ROLE_MARKERS: ReadonlyArray<readonly [pattern: string, role: ContributorRole]> = [
  ["edited by", "editor"],
  ["editors", "editor"],
  ["editor", "editor"],
  ["eds", "editor"],
  ["ed", "editor"],
  ["translators", "translator"],
  ["translator", "translator"],
  ["trans", "translator"],
  ["tr", "translator"],
  ["compilers", "compiler"],
  ["compiler", "compiler"],
  ["comp", "compiler"],
  ["authors", "author"],
  ["author", "author"],
];

const ROLE_ALTERNATION = [...ROLE_MARKERS]
  .map(([p]) => p)
  .sort((a, b) => b.length - a.length)
  .join("|");

const ROLE_SUFFIX = new RegExp(
  String.raw`[\s,]*[（(\[]?\s*(${ROLE_ALTERNATION})\.?\s*[）)\]]?\s*$`,
  "i",
);

// ── Primitives ───────────────────────────────────────────────────────────────

function collapse(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

/** Fold for comparison: casefolded, punctuation- and space-insensitive. */
function fold(value: string): string {
  return collapse(value)
    .toLowerCase()
    .replace(/[.,'"“”‘’\-–—_()[\]]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Pull a trailing cataloguer role marker off a byline.
 *
 * Returns the name without it and the role it stated. Applied repeatedly so
 * "… (eds.), trans." reduces fully; the FIRST role found wins, because it is
 * the one closest to the names.
 */
export function extractRole(raw: string | null | undefined): {
  name: string;
  role: ContributorRole;
} {
  let name = collapse(raw);
  let role: ContributorRole | null = null;

  for (let i = 0; i < 3; i++) {
    const match = name.match(ROLE_SUFFIX);
    if (!match) break;
    const next = name.slice(0, match.index).trim();
    // Never let a role marker eat the entire byline: "Editors" alone is not a
    // name, but neither is "" — keep the original rather than emit nothing.
    if (!next) break;
    const found = ROLE_MARKERS.find(([p]) => p.toLowerCase() === match[1].toLowerCase());
    if (found && role === null) role = found[1];
    name = next;
  }

  return { name, role: role ?? "author" };
}

/** The byline with any trailing role marker removed. */
export function stripRoleSuffix(name: string | null | undefined): string {
  return extractRole(name).name;
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
 * Is this byline the institution the site publishes as its own identity?
 *
 * Compared against the PUBLISHED identity (System Settings), never a literal
 * in source: the institution's name is editable there, and a hardcoded copy
 * would be a second source of truth that goes stale.
 * `lib/settings-consistency.test.ts` enforces that.
 *
 * Only names the identity actually asserts are matched — English name, Khmer
 * name, abbreviation. No guessed aliases: a near-miss must stay unmatched
 * rather than silently claim to be the institution.
 */
export function isOwnInstitution(name: string, org: OrgIdentity): boolean {
  const target = fold(name);
  if (!target) return false;
  return [org.institutionName, org.institutionNameKm, org.abbreviation]
    .filter(Boolean)
    .some((known) => fold(known) === target);
}

/**
 * Split a byline into individual names, but ONLY when doing so is safe.
 *
 * `parseAuthorNames()` is the library's one splitter (it mirrors migration
 * 0105's SQL) and it splits on commas — which is ambiguous, because a comma is
 * also how a single name is inverted. "Smith, John" is ONE person, and
 * splitting it invents two.
 *
 * The rule: a list of people has full names on both sides of every delimiter,
 * so a comma-delimited byline splits only when EVERY segment has at least two
 * whitespace-separated tokens. A non-comma delimiter (";", "&", "/", " and ")
 * is unambiguous and needs no such guard.
 *
 * Being wrong by refusing costs a less granular but still TRUE record. Being
 * wrong by splitting invents a person who does not exist. That asymmetry
 * decides every judgement call in this file.
 *
 * Returns [] when the byline cannot be split safely.
 */
export function splitByline(raw: string | null | undefined): string[] {
  const cleaned = stripRoleSuffix(raw);
  if (!cleaned) return [];

  const parts = parseAuthorNames(cleaned).map(stripRoleSuffix).filter(Boolean);
  if (parts.length < 2) return [];

  const commaOnly = !/[;&/]|\s+and\s+/.test(cleaned);
  if (commaOnly && !parts.every((part) => /\s/.test(part))) return [];

  return parts;
}

/** What kind of entity is one already-separated name? */
export function classifyName(
  name: string | null | undefined,
  org?: OrgIdentity,
): ContributorKind | null {
  const cleaned = stripRoleSuffix(name);
  if (!cleaned) return null;
  if (org && isOwnInstitution(cleaned, org)) return "institution";
  if (looksLikeOrganization(cleaned)) return "organization";
  return "person";
}

/**
 * THE ENTRY POINT. Turn one raw byline into the contributors it honestly
 * names, the role it states, and the source text it came from.
 *
 * Every consumer — ingestion, JSON-LD, citations, the admin UI — must call
 * this rather than re-deriving any part of it.
 */
export function normalizeByline(
  raw: string | null | undefined,
  org?: OrgIdentity,
): NormalizedByline {
  const sourceText = collapse(raw);
  const { name: cleaned, role } = extractRole(raw);

  const empty: NormalizedByline = { sourceText, role, contributors: [], resolved: false };
  if (!cleaned) return empty;

  // Whole-string identity first — see the header note on ordering.
  const whole = classifyName(cleaned, org);
  if (whole === "institution" || whole === "organization") {
    return { sourceText, role, contributors: [{ kind: whole, displayName: cleaned }], resolved: true };
  }

  const parts = splitByline(cleaned);
  if (parts.length > 1) {
    const contributors = parts
      .map((part) => {
        const kind = classifyName(part, org);
        return kind ? { kind, displayName: stripRoleSuffix(part) } : null;
      })
      .filter((c): c is NormalizedContributor => c !== null);
    return { sourceText, role, contributors, resolved: contributors.length > 0 };
  }

  // More than one name, but not separable safely: resolve to nothing rather
  // than assert that several people are one.
  if (parseAuthorNames(cleaned).length > 1) return empty;

  return { sourceText, role, contributors: [{ kind: "person", displayName: cleaned }], resolved: true };
}

/** normalizeByline over a list of bylines, flattened in order. */
export function normalizeBylines(
  raws: readonly (string | null | undefined)[] | null | undefined,
  org?: OrgIdentity,
): NormalizedByline[] {
  return (raws ?? []).map((r) => normalizeByline(r, org));
}

/**
 * The names a BIBLIOGRAPHIC citation should list for a free-text byline.
 *
 * Citations need a different answer from schema.org, and pretending otherwise
 * is what produced five private `.split(",")` splitters across this repository
 * (docs/SEO-3.2-AUDIT.md C-3). The difference is what an unresolvable byline
 * means:
 *
 *   JSON-LD  — a claim about an entity. Cannot be separated safely → publish
 *              NOTHING, because a fabricated Person is worse than no author.
 *   citation — a reference a human will follow. Cannot be separated safely →
 *              print the SOURCE TEXT, because "Unknown author" is worse than a
 *              byline that is merely less granular than ideal.
 *
 * So this returns the split when `splitByline()` says it is safe, and the
 * whole byline as a single entry when it is not. It never invents a person and
 * never drops one: `"Smith, John"` cites as `["Smith, John"]` — one inverted
 * name — where a naive comma split cited two people who do not exist.
 *
 * The role marker is kept OFF the names ("(Editors)" is a role, not part of
 * anyone's name); callers that render roles read `extractRole()` for it.
 */
export function citationNames(raw: string | null | undefined): string[] {
  const cleaned = stripRoleSuffix(raw);
  if (!cleaned) return [];
  const parts = splitByline(cleaned);
  return parts.length > 1 ? parts : [cleaned];
}

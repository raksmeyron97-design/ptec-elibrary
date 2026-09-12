// lib/resources/contributor-view.ts
//
// THE SHARED CONTRIBUTOR READ MODEL — the thing SEO 3.2 exists to add.
//
// SEO 3.0 fixed what a page CLAIMS about an entity. SEO 3.1 made ingestion
// WRITE the canonical model (`contributors` + `resource_contributors`, 0105).
// This module is the third piece: how every public consumer READS it, once,
// in one shape, so that JSON-LD, the visible byline, the citation, the author
// link and search cannot disagree about who a work is by.
//
// ── The defect this closes ──────────────────────────────────────────────────
//
// After 3.1, `/books/[slug]` and `/theses/[slug]` did read canonical
// contributors — and then threw away everything that made them canonical.
// `getPublicResourceAuthors()` returns `string[]`: no id, no kind, no role, no
// sequence. The page handed those strings to `contributorNodesFor()`, which
// ran `normalizeByline()` over them again — so a contributor the DATABASE
// already knew to be a corporate body was re-typed at render time by a keyword
// heuristic over its name. Two sources of truth for one fact, and the page
// published whichever answered last.
//
// Re-splitting was the worse half. A canonical row is ALREADY one entity;
// running a byline splitter over it can only be wrong. "Smith, John" stored as
// one contributor came back out of the renderer as two people.
//
// ── What this module decides, and what it refuses to ────────────────────────
//
// It decides ONE thing per canonical row: person, organization, or the site's
// own institution. It never splits a canonical name, never merges two
// contributors, and never invents a role or an order — those are facts the
// row carries.
//
// It is PURE. The server read lives in lib/resources/public-contributors.ts;
// keeping the rules here is what lets the fixtures in
// lib/resources/contributor-view.test.ts exercise the real decisions offline.

import {
  classifyName,
  isOwnInstitution,
  normalizeByline,
  stripRoleSuffix,
  type ContributorKind,
} from "@/lib/resources/contributor-identity";
import type { ContributorRole } from "@/lib/resources/types";
import type { OrgIdentity } from "@/lib/system-settings/org-identity";

/** One contributor credit, as every public consumer should see it. */
export type ResourceContributorView = {
  /** `contributors.id` when this came from the canonical graph; null for a
   *  legacy byline, which has no identity to link to. */
  contributorId: string | null;
  kind: ContributorKind;
  name: string;
  nameKm: string | null;
  role: ContributorRole;
  /** The order the cataloguer recorded. NEVER re-sorted alphabetically. */
  sequence: number;
  /** Provenance. A consumer may show it; it may never be guessed. */
  source: "canonical" | "legacy";
  /** True when the stored `contributor_type` disagrees with what the name
   *  reads as. Observable rather than silent — see §28 of the audit doc. */
  typeConflict: boolean;
  /**
   * True when this credit was separated out of a canonical row that still held
   * several entities in one `display_name` — a migration 0105 backfill
   * artefact, 46 rows of it in production.
   *
   * Such a credit carries no `contributorId`: no stored row denotes this person
   * alone, so it is a true CLAIM with no identity to link to. The flag lets the
   * audit count how much of the graph still needs splitting at the source.
   */
  composite: boolean;
};

/**
 * Where a resource's credits came from.
 *
 * `unavailable` is the one that matters: a database failure is NOT zero
 * contributors. A page that renders an empty byline because a query timed out
 * has silently deleted an SEO relationship, and nothing downstream can tell
 * that from a work whose author is genuinely unknown.
 */
export type ContributorSource = "canonical" | "legacy" | "none" | "unavailable";

export type ContributorReadResult = {
  contributors: ResourceContributorView[];
  source: ContributorSource;
};

/** One `resource_contributors` row joined to its `contributors` record. */
export type CanonicalContributorRow = {
  contributorId: string | null;
  displayName: string;
  nameKm: string | null;
  /** `contributors.contributor_type` — the DB's two-value vocabulary. */
  contributorType: "person" | "organization" | null;
  /** `contributors.source` — 'manual' means the 3.1 classifier decided this
   *  row; anything else is a 0105 backfill DEFAULT, not a judgement. */
  recordSource: string | null;
  role: ContributorRole;
  sequence: number;
};

// ── Kind ─────────────────────────────────────────────────────────────────────

/**
 * What kind of entity one CANONICAL row names.
 *
 * The order is the whole function:
 *
 *  1. The site's own institution wins outright. It is an exact identity match
 *     against published System Settings, which is stronger evidence than any
 *     stored column — and the 0105 backfill typed every `authors` row
 *     `person`, PTEC's own row included. The institution is not a separate
 *     `contributor_type`; it is distinguished here, at read time, precisely so
 *     it can resolve to the site graph's existing @id instead of a new node.
 *
 *  2. `contributor_type = 'organization'` is believed unconditionally. A
 *     cataloguer (or the 3.1 classifier) said corporate body; nothing in a
 *     name can be better evidence than that, and downgrading an organisation
 *     to a Person is the exact untrue claim this whole line of work removes.
 *
 *  3. A row stored as `person` is believed when the 3.1 classifier wrote it
 *     (`source = 'manual'`). When it came from the 0105 backfill, `person` was
 *     a column DEFAULT rather than a decision, so the name is classified —
 *     with `classifyName()`, which types ONE already-separated name and cannot
 *     split anything. Disagreement is reported as `typeConflict`, never
 *     silently resolved.
 */
export function kindOfCanonicalRow(
  row: CanonicalContributorRow,
  org?: OrgIdentity,
): { kind: ContributorKind; typeConflict: boolean } {
  const name = row.displayName.trim();
  if (org && name && isOwnInstitution(name, org)) {
    return { kind: "institution", typeConflict: row.contributorType === "person" };
  }
  if (row.contributorType === "organization") return { kind: "organization", typeConflict: false };

  const read = name ? classifyName(name, org) : null;
  // A classifier-written row is trusted as stored.
  if (row.recordSource === "manual") {
    return { kind: "person", typeConflict: read !== null && read !== "person" };
  }
  // A backfilled row's `person` is a default, not a judgement.
  if (read && read !== "person") return { kind: read, typeConflict: true };
  return { kind: "person", typeConflict: false };
}

// ── Projection ───────────────────────────────────────────────────────────────

/**
 * Canonical rows → views, in the sequence the cataloguer recorded.
 *
 * ── A canonical row is supposed to be ONE entity. Verify it, don't assume it ──
 *
 * The whole read model rests on "a canonical row has already been separated,
 * so never re-split it". That is true of every row `recordResourceContributors()`
 * writes. It is NOT true of the rows migration 0105's backfill produced, and
 * production proved it the day the backfill ran: `contributors` came out of it
 * holding 46 rows whose own `display_name` still names several people, copied
 * verbatim from the composite `authors` rows they came from —
 *
 *   "Oon-Seng Tan, Woon-Chia Liu, Ee-Ling Low (Editors)"     ← ONE row
 *
 * Publishing that row as one entity emits a single `Person` carrying three
 * people's names and a role marker: a fabricated human, and strictly WORSE
 * than the legacy string it replaced, which this same contract splits into
 * three correct `Person` nodes. Preferring the canonical source must never
 * lower the quality of the answer.
 *
 * So every row goes through the one normalization contract before it is
 * believed:
 *
 *   names one entity        → the row stands; the STORED TYPE decides its kind
 *   names several entities  → expanded here, with `contributorId: null`,
 *                             because no single stored id denotes any one of
 *                             them and claiming otherwise would invent identity
 *   cannot be separated     → **nothing**, the same answer a legacy byline of
 *                             that shape gets
 *
 * This is not "re-parsing what the graph decided". The backfill made no
 * decision about these rows — it copied a string. A row the WRITE PATH
 * produced (`source = 'manual'`) is taken exactly as stored, name included:
 * `recordResourceContributors()` refuses to store an unresolvable byline, and
 * that row is also what a librarian curates by hand — including into an
 * inverted "Smith, John", which is one real person and must survive.
 */
export function viewsFromCanonical(
  rows: readonly CanonicalContributorRow[],
  org?: OrgIdentity,
): ResourceContributorView[] {
  const ordered = rows
    .filter((r) => r.displayName.trim().length > 0)
    .slice()
    // Stable on sequence, then on the order the DB returned — never on name.
    .sort((a, b) => a.sequence - b.sequence);

  const out: ResourceContributorView[] = [];

  for (const row of ordered) {
    // A row the WRITE PATH produced is one entity by construction:
    // `recordResourceContributors()` only ever stores names the normalizer
    // returned, and refuses to store an unresolvable byline at all. It is also
    // the row a librarian can curate by hand — including into an inverted form
    // like "Smith, John", which is a real single person and must survive.
    // So `manual` rows are taken as stored; only the backfill's copied strings
    // are put back through the contract.
    if (row.recordSource === "manual") {
      const { kind, typeConflict } = kindOfCanonicalRow(row, org);
      out.push({
        contributorId: row.contributorId,
        kind,
        name: row.displayName.trim(),
        nameKm: row.nameKm?.trim() || null,
        role: row.role,
        sequence: out.length,
        source: "canonical",
        typeConflict,
        composite: false,
      });
      continue;
    }

    const normalized = normalizeByline(row.displayName, org);

    // A role stated INSIDE the name ("… (Editors)") is better evidence than a
    // backfill default of `author`. A row whose name states nothing keeps the
    // role its column holds — which is how the thesis advisor stays an advisor.
    const nameStatesRole = stripRoleMarker(row.displayName) !== collapseName(row.displayName);
    const role = nameStatesRole ? normalized.role : row.role;

    if (normalized.contributors.length > 1) {
      for (const contributor of normalized.contributors) {
        out.push({
          contributorId: null,
          kind: contributor.kind,
          name: contributor.displayName,
          nameKm: null,
          role,
          sequence: out.length,
          source: "canonical",
          typeConflict: false,
          composite: true,
        });
      }
      continue;
    }

    // Names several entities but cannot be separated safely: publish nothing,
    // rather than one person wearing several names.
    if (normalized.contributors.length === 0) continue;

    const { kind, typeConflict } = kindOfCanonicalRow(row, org);
    out.push({
      contributorId: row.contributorId,
      kind,
      // The CLEANED name: a cataloguer's "(Editor)" is a role, not part of
      // anyone's name, and 16 production rows carry one inside the name.
      name: normalized.contributors[0].displayName,
      nameKm: row.nameKm?.trim() || null,
      role,
      sequence: out.length,
      source: "canonical",
      typeConflict,
      composite: false,
    });
  }

  return out;
}

/**
 * A legacy free-text byline → views.
 *
 * This is the ONLY place a raw string is still parsed for a public read, and
 * it runs only when the canonical graph has nothing for the resource. An
 * unresolvable byline yields [] — `normalizeByline()`'s answer for "this names
 * several entities and cannot be separated safely" — which callers must render
 * as *no claim*, not as the raw string typed as a person.
 */
export function viewsFromLegacy(
  byline: string | null | undefined,
  org?: OrgIdentity,
): ResourceContributorView[] {
  const normalized = normalizeByline(byline, org);
  return normalized.contributors.map((c, index) => ({
    contributorId: null,
    kind: c.kind,
    name: c.displayName,
    nameKm: null,
    role: normalized.role,
    sequence: index,
    source: "legacy" as const,
    typeConflict: false,
    composite: false,
  }));
}

/** Several legacy bylines (theses carry an array), flattened in order. */
export function viewsFromLegacyList(
  bylines: readonly (string | null | undefined)[] | null | undefined,
  org?: OrgIdentity,
): ResourceContributorView[] {
  const out: ResourceContributorView[] = [];
  for (const byline of bylines ?? []) {
    for (const view of viewsFromLegacy(byline, org)) {
      out.push({ ...view, sequence: out.length });
    }
  }
  return out;
}

// ── Identity + dedupe ────────────────────────────────────────────────────────

/**
 * The deterministic identity of one contributor view.
 *
 * A canonical id is identity. Without one, identity is the folded name within
 * a kind — exact equality after casefolding and punctuation removal, the same
 * fold the rest of the contributor stack uses. Nothing fuzzy: a shared surname
 * or a shared initial is not evidence that two credits are one person, and
 * merging on it would publish a claim no data supports (§29).
 */
export function contributorKey(view: ResourceContributorView): string {
  if (view.contributorId) return `id:${view.contributorId}`;
  return `name:${view.kind}:${foldName(view.name)}`;
}

function foldName(value: string): string {
  return value
    .normalize("NFC")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/[.,'"“”‘’\-–—_()[\]]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Collapse repeated credits, keeping the FIRST — which, after
 * `viewsFromCanonical()`, is the lowest sequence.
 *
 * The duplicate this prevents is not hypothetical: the same person can hold
 * two credits on one work (author and translator), and a consumer that renders
 * a byline would print them twice.
 */
export function dedupeContributors(
  views: readonly ResourceContributorView[],
): ResourceContributorView[] {
  const seen = new Set<string>();
  const out: ResourceContributorView[] = [];
  for (const view of views) {
    const key = contributorKey(view);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(view);
  }
  return out;
}

// ── The read policy ──────────────────────────────────────────────────────────

/**
 * THE CANONICAL READ POLICY, in one function.
 *
 *   canonical rows exist  → canonical, and the legacy byline is IGNORED
 *   canonical read failed → `unavailable`, and the legacy byline carries the
 *                           page rather than an empty byline standing in for a
 *                           database error
 *   no canonical rows     → legacy fallback
 *   neither               → none
 *
 * The two datasets are never blended. Blending is how "John Smith" appears
 * twice — once from the graph, once from the string it was derived from — and
 * no dedupe rule can be trusted to catch every spelling of that. Canonical
 * wins wholesale or it does not participate.
 */
export function resolveContributors(input: {
  canonical: readonly CanonicalContributorRow[] | null;
  /** Null/undefined means the canonical read FAILED, which is not "empty". */
  canonicalAvailable: boolean;
  legacyByline?: string | null | undefined;
  legacyBylines?: readonly (string | null | undefined)[] | null;
  org?: OrgIdentity;
}): ContributorReadResult {
  const legacy = () => {
    const views = input.legacyBylines
      ? viewsFromLegacyList(input.legacyBylines, input.org)
      : viewsFromLegacy(input.legacyByline, input.org);
    return dedupeContributors(views);
  };

  if (!input.canonicalAvailable) {
    const fallback = legacy();
    // The source stays `unavailable` even when the byline answers: a consumer
    // must be able to tell "the graph said so" from "the graph was unreachable
    // and this is the string we had".
    return { contributors: fallback, source: "unavailable" };
  }

  const canonical = dedupeContributors(viewsFromCanonical(input.canonical ?? [], input.org));
  if (canonical.length > 0) return { contributors: canonical, source: "canonical" };

  const fallback = legacy();
  return { contributors: fallback, source: fallback.length > 0 ? "legacy" : "none" };
}

// ── Derived views for consumers ──────────────────────────────────────────────

/** Display names in recorded order, for a visible byline or a meta tag. */
export function contributorNames(views: readonly ResourceContributorView[]): string[] {
  return views.map((v) => v.name).filter((n) => n.length > 0);
}

/**
 * Just the credits a bibliographic AUTHOR field may carry.
 *
 * `editor`, `translator` and `advisor` are real, different roles and a
 * citation renders them differently — so they are not silently promoted to
 * author here. When a work has NO author-role credit (an edited volume, where
 * every credit is `editor`), the whole list is returned rather than nothing:
 * an edited volume with no names is a worse citation than one whose editors
 * stand in the author position, which is also what every style guide does.
 */
export function authorRoleContributors(
  views: readonly ResourceContributorView[],
): ResourceContributorView[] {
  const authors = views.filter((v) => v.role === "author");
  return authors.length > 0 ? authors : views.slice();
}

/** Whitespace-collapsed name, for comparing against its role-stripped form. */
function collapseName(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/** The name with a trailing cataloguer role marker removed. */
function stripRoleMarker(value: string): string {
  return stripRoleSuffix(value);
}

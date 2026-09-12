// lib/authors/canonical-works.ts
//
// §25 — an author's works, read through the RELATION instead of matched by
// name.
//
// ── What was wrong ──────────────────────────────────────────────────────────
//
// `/authors/[slug]` found a person's work three different ways, and two of
// them could not be right:
//
//   publications → publication_authorships.author_id   ✓ a real edge
//   e-books      → books.author_id                     ✓ an edge, but SINGULAR
//   theses       → author_names ILIKE '%name%'         ✗ a string search
//   catalog      → author ILIKE '%name%'               ✗ a string search
//
// `books.author_id` is a single foreign key, so a book with three authors
// credits exactly ONE of them; the other two have a profile page that does not
// list the book they wrote. And an ILIKE over free text answers a different
// question from "is this person a contributor" — `lib/authors/profile.ts`
// re-checks each candidate against `parseAuthorNames()`, which stops the worst
// of it ("Sok" collecting "Sok Dara"'s thesis), but it can only narrow what
// the LIKE happened to return. A thesis whose byline spells the name
// differently is invisible to both.
//
// `resource_contributors` (0105) is the edge those two lack. This module reads
// it.
//
// ── Additive on purpose ─────────────────────────────────────────────────────
//
// The canonical edges are UNIONED with the existing legacy results, not
// substituted for them. The graph is still filling: SEO 3.1 wired ingestion,
// so books saved since then have canonical credits and older rows have
// whatever the 0105 backfill reached. Switching wholesale would drop works
// from pages that list them today — a visible regression traded for an
// architectural preference. The union costs a dedupe by resource id and
// removes the false negatives; when coverage is complete the legacy legs can
// be retired against measured evidence, which is what
// `scripts/audit-contributor-graph.ts` is for.
//
// ── Identity is deterministic ───────────────────────────────────────────────
//
// A contributor is linked to this author by one of three facts, all exact:
// 0105's `legacy_author_id`, its `legacy_publication_author_id`, or an exact
// case-folded name match. Nothing fuzzy — a shared surname is not evidence
// that two records are one person (§29), and a wrong merge here publishes
// someone else's work under this person's name.

import "server-only";

import type { createServiceClient } from "@/lib/supabase/server";
import type { ResourceType } from "@/lib/resources/types";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Db = ReturnType<typeof createServiceClient>;

/** One `contributors` row that deterministically denotes an author profile. */
export type AuthorContributorRecord = {
  id: string;
  displayName: string;
  nameKm: string | null;
  contributorType: "person" | "organization" | null;
  recordSource: string | null;
};

export type CanonicalWorkRef = {
  resourceType: ResourceType;
  resourceId: string;
  role: string;
  sequence: number;
};

/**
 * Every `contributors.id` that deterministically denotes this author.
 *
 * More than one is normal and not a defect to fix here: the 0105 backfill
 * minted a contributor per legacy row, so a person who is both an e-book
 * author and a publication author legitimately has two. The duplicate audit
 * reports them; this function simply collects them.
 */
export async function contributorRecordsForAuthor(
  db: Db,
  identity: {
    legacyAuthorId?: string | null;
    legacyPublicationAuthorId?: string | null;
    names: readonly string[];
  },
): Promise<AuthorContributorRecord[]> {
  const found = new Map<string, AuthorContributorRecord>();
  const ors: string[] = [];
  if (identity.legacyAuthorId) ors.push(`legacy_author_id.eq.${identity.legacyAuthorId}`);
  if (identity.legacyPublicationAuthorId) {
    ors.push(`legacy_publication_author_id.eq.${identity.legacyPublicationAuthorId}`);
  }

  if (ors.length > 0) {
    const { data } = await db.from("contributors").select(RECORD_SELECT).or(ors.join(","));
    for (const row of (data ?? []) as any[]) collect(found, row);
  }

  // Exact name equality, case-insensitively. `ilike` with no wildcards IS
  // exact equality in Postgres — the pattern has no `%` — so this cannot widen
  // into a substring match. Names carrying a PostgREST filter metacharacter are
  // skipped rather than escaped: a name containing a comma is a composite
  // expression, and matching one would attach a multi-person row to one person.
  const usable = identity.names
    .map((n) => n.trim())
    .filter((n) => n.length >= 2 && !/[,()."\\]/.test(n));
  if (usable.length > 0) {
    const { data } = await db
      .from("contributors")
      .select(RECORD_SELECT)
      .or(usable.map((n) => `display_name.ilike.${n}`).join(","));
    for (const row of (data ?? []) as any[]) collect(found, row);
  }

  return [...found.values()];
}

const RECORD_SELECT = "id, display_name, name_km, contributor_type, source";

function collect(into: Map<string, AuthorContributorRecord>, row: any): void {
  if (!row?.id || into.has(row.id)) return;
  const type = row.contributor_type;
  into.set(row.id, {
    id: row.id,
    displayName: (row.display_name ?? "").trim(),
    nameKm: row.name_km ?? null,
    contributorType: type === "organization" || type === "person" ? type : null,
    recordSource: row.source ?? null,
  });
}

/** The resources these contributors are credited on, in one query. */
export async function canonicalWorkRefs(
  db: Db,
  contributorIds: readonly string[],
  limit = 240,
): Promise<CanonicalWorkRef[]> {
  if (contributorIds.length === 0) return [];
  const { data, error } = await db
    .from("resource_contributors")
    .select("resource_type, resource_id, role, sequence")
    .in("contributor_id", contributorIds)
    .order("sequence", { ascending: true })
    .limit(limit);
  // A failed read must not look like "this author has no canonical works" to
  // the caller — but the caller's legacy legs still answer, so returning []
  // here degrades to the pre-3.2 page rather than to an empty one.
  if (error || !data) return [];

  const seen = new Set<string>();
  const out: CanonicalWorkRef[] = [];
  for (const row of data as any[]) {
    const key = `${row.resource_type}:${row.resource_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      resourceType: row.resource_type,
      resourceId: row.resource_id,
      role: row.role ?? "author",
      sequence: typeof row.sequence === "number" ? row.sequence : 0,
    });
  }
  return out;
}

/** Group refs by resource type, so each type is fetched in ONE batched query. */
export function refsByType(
  refs: readonly CanonicalWorkRef[],
): Record<ResourceType, string[]> {
  const out: Record<ResourceType, string[]> = {
    book: [],
    thesis: [],
    publication: [],
    learning_path: [],
  };
  for (const ref of refs) out[ref.resourceType]?.push(ref.resourceId);
  return out;
}

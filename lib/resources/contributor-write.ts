// lib/resources/contributor-write.ts
//
// THE MISSING HALF. `lib/resources/contributors.ts` has said since migration
// 0105 that "writes still go through the existing per-type admin actions" —
// and that is exactly the defect: the canonical contributor model is READ by
// helpers, has typed roles and ordering, and was written by nothing but a
// one-time backfill. Every book created since then is absent from it, so the
// model is stale by construction and no consumer can trust it.
//
// Meanwhile `books.author_id` is a SINGULAR foreign key, so the legacy model
// physically cannot record that a book has three authors. The byline string
// was therefore the only place the truth existed, in a shape nothing could
// read — which is why every renderer re-parsed it and 30% got it wrong
// (docs/SEO-3.0-AUDIT.md F-3).
//
// This module records the normalized truth alongside the legacy write. It is
// deliberately ADDITIVE:
//
//   * `books.author_id` and the `authors` row are untouched, so no author URL
//     changes and no existing read path moves. Retiring them is a separate,
//     evidence-led migration (docs/SEO-3.1-CONTRIBUTOR-MIGRATION.md).
//   * It is NON-FATAL by contract. A book save must never fail because a
//     credit could not be recorded; the caller gets `null` and the book is
//     still saved. The audit script reports what is missing.
//   * An UNRESOLVED byline writes NOTHING. If the string names several people
//     and cannot be separated safely, this records no contributor rather than
//     guessing one — the canonical model must not become a second place where
//     a fabricated identity lives.

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { normalizeByline } from "@/lib/resources/contributor-identity";
import type { ResourceType } from "@/lib/resources/types";
import type { OrgIdentity } from "@/lib/system-settings/org-identity";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Db = SupabaseClient<any, any, any>;

export type ContributorWriteResult = {
  /** How many canonical contributor credits the resource now has. */
  written: number;
  /** False when the byline named several entities that could not be separated. */
  resolved: boolean;
  /** The byline exactly as the cataloguer entered it. */
  sourceText: string;
};

/**
 * Find the canonical contributor for a name, or create it.
 *
 * `contributors` has no unique index on `display_name` (0105 indexes ORCID and
 * the two legacy ids instead), so this is a read-then-write. Two concurrent
 * saves of the same new name can therefore both insert; the duplicate is
 * harmless — same name, same type, and the audit script surfaces it — whereas
 * a unique index added now would start rejecting legitimate saves of
 * genuinely distinct people who share a name.
 */
async function resolveContributorId(
  db: Db,
  displayName: string,
  contributorType: "person" | "organization",
): Promise<string | null> {
  const { data: existing } = await db
    .from("contributors")
    .select("id")
    .eq("contributor_type", contributorType)
    .ilike("display_name", displayName)
    .limit(1)
    .maybeSingle();
  if (existing?.id) return existing.id;

  const { data: created, error } = await db
    .from("contributors")
    .insert({ display_name: displayName, contributor_type: contributorType, source: "manual" })
    .select("id")
    .single();
  if (error || !created) return null;
  return created.id;
}

/**
 * Record the canonical contributor credits a byline states, replacing whatever
 * this resource had before.
 *
 * Returns null when nothing could be recorded — never throws. The caller
 * should treat that as "no canonical credits yet", not as a failed save.
 */
export async function recordResourceContributors(
  db: Db,
  input: {
    resourceType: ResourceType;
    resourceId: string;
    /** The raw byline as entered. */
    byline: string | null | undefined;
    /** Published identity, so a byline naming the institution is typed as one. */
    org?: OrgIdentity;
  },
): Promise<ContributorWriteResult | null> {
  try {
    const normalized = normalizeByline(input.byline, input.org);

    // An unresolved byline records nothing — see the header. The previous
    // credits are still cleared, because they described a byline that no
    // longer applies and a stale credit is worse than an absent one.
    const rows: { contributor_id: string; sequence: number }[] = [];
    for (const [index, contributor] of normalized.contributors.entries()) {
      // `institution` is an organisation in the data model; it is only
      // distinguished at RENDER time, where it resolves to the site graph's
      // existing @id instead of a second node. Storing it as its own kind
      // would need a migration to widen the contributor_type CHECK, and would
      // buy nothing the identity match does not already give.
      const type = contributor.kind === "person" ? "person" : "organization";
      const id = await resolveContributorId(db, contributor.displayName, type);
      if (id) rows.push({ contributor_id: id, sequence: index });
    }

    await db
      .from("resource_contributors")
      .delete()
      .eq("resource_type", input.resourceType)
      .eq("resource_id", input.resourceId);

    if (rows.length > 0) {
      const { error } = await db.from("resource_contributors").insert(
        rows.map((r) => ({
          resource_type: input.resourceType,
          resource_id: input.resourceId,
          contributor_id: r.contributor_id,
          // The role the byline itself stated — "(Editors)" means editor, and
          // 0105's CHECK already has a value for it. This is the information
          // the old single-string model had nowhere to keep.
          role: normalized.role,
          sequence: r.sequence,
        })),
      );
      if (error) return null;
    }

    return {
      written: rows.length,
      resolved: normalized.resolved,
      sourceText: normalized.sourceText,
    };
  } catch {
    // Non-fatal by contract: the resource is saved either way.
    return null;
  }
}

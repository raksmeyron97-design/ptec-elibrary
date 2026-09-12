// lib/publications/contributors.ts
//
// Publications reach the shared contributor read model from a different
// direction than books and theses, and it is worth saying why rather than
// forcing them through the same door.
//
// A publication's authorship has been RELATIONAL since migration 0052:
// `publication_authorships` carries an author id, an explicit `author_order`
// and a corresponding-author flag. That is already a canonical contributor
// edge — just a per-type one, predating 0105's polymorphic table. So the work
// here is not to normalise a string; it is to express an existing relation in
// the one shape every public consumer reads, so a publication's JSON-LD stops
// being built by re-parsing `author_names` (the comma-joined byline the view
// derives FROM those same rows — a round trip through a lossy string).
//
// The one thing the legacy table cannot say is WHAT an author is:
// `publication_authors` has no type column, only a name. So the kind is
// decided by `classifyName()` on the stored name — classifying one
// already-separated name, never splitting one. That is the same decision the
// canonical reader makes for a 0105-backfilled row whose `person` was a column
// default rather than a judgement.

import type { Publication, PublicationAuthorship } from "@/lib/publications";
import {
  viewsFromCanonical,
  type CanonicalContributorRow,
  type ResourceContributorView,
} from "@/lib/resources/contributor-view";
import type { OrgIdentity } from "@/lib/system-settings/org-identity";

function rowOf(a: PublicationAuthorship, index: number): CanonicalContributorRow {
  return {
    contributorId: a.author?.id ?? null,
    displayName: (a.author?.full_name ?? "").trim(),
    nameKm: a.author?.full_name_km ?? null,
    // No stored type on `publication_authors` — the name decides, and there is
    // therefore nothing for it to conflict WITH.
    contributorType: null,
    recordSource: null,
    role: "author",
    // `author_order` is 1-based in the legacy table and `sequence` is 0-based
    // in the canonical one. Falling back to the array index keeps a row with a
    // null order in the position the query returned it, rather than at 0 where
    // it would silently claim first authorship.
    sequence: typeof a.author_order === "number" ? a.author_order - 1 : index,
  };
}

/**
 * A publication's credits as contributor views, or [] when the query did not
 * embed authorships.
 *
 * [] is "this caller did not load them", not "this publication has no
 * authors" — which is exactly why the caller must treat it as a reason to fall
 * back to the byline rather than as an answer.
 */
export function publicationContributorViews(
  pub: Pick<Publication, "authorships">,
  org?: OrgIdentity,
): ResourceContributorView[] {
  const authorships = pub.authorships ?? [];
  if (authorships.length === 0) return [];
  return viewsFromCanonical(authorships.map(rowOf), org);
}

"use server";

// Author management for /admin/publications/authors.
//
// The WRITE path lives in app/actions/publications.ts (upsertPublicationAuthor,
// deletePublicationAuthor) and is not duplicated here — one author record has
// one place it is written. What this file adds is the management surface that
// a list of shared, reused records needs and did not have: publication counts,
// profile completeness, duplicate detection, and a merge that folds one
// author's authorships into another without losing a publication's byline.

import { requirePermission } from "@/lib/auth/requireAdmin";
import { logAdminAction } from "@/app/actions/audit";
import { revalidatePublication, revalidateAuthorProfile } from "@/lib/cache/revalidate";
import { revalidatePath } from "next/cache";
import { AUTHOR_SELECT_FULL, AUTHOR_SELECT_LEGACY, isMissingColumnError } from "@/lib/publications";
import { completeness, duplicateGroups, type AdminAuthorRow } from "@/lib/authors/admin";

/* eslint-disable @typescript-eslint/no-explicit-any */

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Forbidden";
}

/**
 * Every author record, with the counts and flags the management table needs.
 *
 * Two queries total, not one per author: the authorship links come back in a
 * single fetch and are tallied in memory. The table is a few hundred rows at
 * most, so the alternative (a counting view, or a per-row RPC) buys nothing.
 */
export async function listPublicationAuthors(): Promise<{
  data: AdminAuthorRow[];
  error: string | null;
}> {
  let admin: Awaited<ReturnType<typeof requirePermission>>;
  try {
    admin = await requirePermission("publications", "read");
  } catch (error) {
    return { data: [], error: errorMessage(error) };
  }
  const { supabase } = admin;

  const load = (select: string) =>
    supabase
      .from("publication_authors")
      .select(select)
      .order("full_name", { ascending: true });

  const [authorsResult, { data: links }] = await Promise.all([
    load(AUTHOR_SELECT_FULL),
    supabase.from("publication_authorships").select("author_id"),
  ]);

  // Pre-0125 fallback: the table renders with the columns the database has,
  // and the profile fields simply read as empty rather than the page erroring.
  let { data: authors, error } = authorsResult;
  if (isMissingColumnError(error)) ({ data: authors, error } = await load(AUTHOR_SELECT_LEGACY));
  if (error) return { data: [], error: error.message };

  const counts = new Map<string, number>();
  for (const link of (links ?? []) as { author_id: string }[]) {
    counts.set(link.author_id, (counts.get(link.author_id) ?? 0) + 1);
  }

  const rows = (authors ?? []) as any[];
  const duplicates = duplicateGroups(rows.map((r) => ({ id: r.id, full_name: r.full_name ?? "" })));

  return {
    data: rows.map((row) => ({
      id: row.id,
      full_name: row.full_name ?? "",
      full_name_km: row.full_name_km ?? null,
      slug: row.slug ?? null,
      photo_url: row.photo_url ?? null,
      position_title: row.position_title ?? null,
      affiliation_name: row.affiliation_name ?? null,
      orcid: row.orcid ?? null,
      email: row.email ?? null,
      bio: row.bio ?? null,
      bio_km: row.bio_km ?? null,
      website_url: row.website_url ?? null,
      google_scholar_url: row.google_scholar_url ?? null,
      research_gate_url: row.research_gate_url ?? null,
      research_interests: row.research_interests ?? [],
      is_published: row.is_published ?? true,
      publicationCount: counts.get(row.id) ?? 0,
      completeness: completeness(row),
      duplicateOf: duplicates.get(row.id) ?? [],
    })),
    error: null,
  };
}

/**
 * Fold `sourceId`'s authorships into `targetId`, then delete the source.
 *
 * WHY THIS IS NOT "DELETE THE DUPLICATE". Deleting a publication_authors row
 * cascades to publication_authorships, which silently removes that person from
 * the byline of every article they were credited on. A librarian tidying up
 * three copies of the same name would destroy three sets of credits. Merge is
 * the only safe way to remove a duplicate, which is why the delete action in
 * the UI refuses when the author has publications and points here instead.
 *
 * The rules:
 *   * an authorship is moved only where the target is not ALREADY on that
 *     publication — the primary key is (publication_id, author_id), so a naive
 *     update would fail the whole merge on the first overlap;
 *   * where both are credited on the same article, the source's link is simply
 *     dropped and the target keeps its own author_order, is_corresponding and
 *     affiliations. That is the conservative choice: the target is the record
 *     being kept, so its data wins;
 *   * the source row is deleted last, after every link has moved, so an
 *     interrupted merge leaves credits intact rather than orphaned.
 */
export async function mergePublicationAuthors(
  sourceId: string,
  targetId: string,
): Promise<{ success: boolean; error?: string; moved?: number }> {
  let admin: Awaited<ReturnType<typeof requirePermission>>;
  try {
    admin = await requirePermission("publications", "write");
  } catch (error) {
    return { success: false, error: errorMessage(error) };
  }
  const { supabase, userId } = admin;

  if (!sourceId || !targetId) return { success: false, error: "Two authors are required." };
  if (sourceId === targetId) {
    return { success: false, error: "Choose a different author to merge into." };
  }

  const { data: people } = await supabase
    .from("publication_authors")
    .select("id, full_name, slug")
    .in("id", [sourceId, targetId]);
  const source = (people ?? []).find((p: any) => p.id === sourceId);
  const target = (people ?? []).find((p: any) => p.id === targetId);
  if (!source || !target) return { success: false, error: "One of these authors no longer exists." };

  const [{ data: sourceLinks }, { data: targetLinks }] = await Promise.all([
    supabase
      .from("publication_authorships")
      .select("publication_id, author_order, is_corresponding, affiliation_ids")
      .eq("author_id", sourceId),
    supabase.from("publication_authorships").select("publication_id").eq("author_id", targetId),
  ]);

  const targetHas = new Set(
    ((targetLinks ?? []) as { publication_id: string }[]).map((l) => l.publication_id),
  );
  const movable = ((sourceLinks ?? []) as any[]).filter(
    (link) => !targetHas.has(link.publication_id),
  );

  if (movable.length > 0) {
    const { error } = await supabase.from("publication_authorships").insert(
      movable.map((link) => ({
        publication_id: link.publication_id,
        author_id: targetId,
        author_order: link.author_order,
        is_corresponding: link.is_corresponding,
        affiliation_ids: link.affiliation_ids,
      })),
    );
    if (error) return { success: false, error: `Could not move credits: ${error.message}` };
  }

  // Only now is it safe to remove the source — every credit it held is either
  // moved or already present on the target.
  const { error: delErr } = await supabase
    .from("publication_authors")
    .delete()
    .eq("id", sourceId);
  if (delErr) return { success: false, error: delErr.message };

  await logAdminAction(userId, "publication_author.merge", "publication_authors", targetId, {
    merged_from: (source as any).full_name,
    merged_into: (target as any).full_name,
    credits_moved: movable.length,
  });

  // Every article either of them appeared on now carries a different byline.
  // One tag bust covers the whole collection — there is no per-article tag to
  // aim at, and the pages are ISR'd, so this is the correct blunt instrument.
  revalidatePublication(null);
  // The source's profile page has to stop being served; the target's has to
  // pick up the credits that just moved onto it.
  revalidateAuthorProfile((source as any).slug ?? null, (target as any).slug ?? null);
  revalidatePath("/admin/publications/authors");
  return { success: true, moved: movable.length };
}

/**
 * How many publications an author is credited on.
 *
 * Used by the delete confirmation, which must be able to say "this would
 * remove them from 7 bylines" rather than "are you sure?".
 */
export async function countAuthorPublications(
  authorId: string,
): Promise<{ count: number; error: string | null }> {
  try {
    const { supabase } = await requirePermission("publications", "read");
    const { count, error } = await supabase
      .from("publication_authorships")
      .select("author_id", { count: "exact", head: true })
      .eq("author_id", authorId);
    if (error) return { count: 0, error: error.message };
    return { count: count ?? 0, error: null };
  } catch (error) {
    return { count: 0, error: errorMessage(error) };
  }
}

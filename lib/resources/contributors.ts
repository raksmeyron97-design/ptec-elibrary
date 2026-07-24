// lib/resources/contributors.ts
//
// Typed read service for canonical contributor credits (migration 0105).
// One query returns ordered, role-tagged contributors for any resource type —
// replacing three per-type read shapes (books.author join, thesis free text,
// publication_authorships). Uses the anon+RLS client: resource_contributors is
// public only for published resources, so this is safe to call from public
// server components; admins calling it see all.
//
// This is a READ helper only. Writes still go through the existing per-type
// admin actions until those are migrated onto the canonical model.

import { createClient } from "@/lib/supabase/server";
import type { ResourceType, ContributorRole } from "./types";

export type ResourceContributor = {
  contributorId: string | null;
  displayName: string;
  nameKm: string | null;
  role: ContributorRole;
  sequence: number;
  isCorresponding: boolean;
  orcid: string | null;
  affiliation: string | null;
};

// Shape of one resource_contributors row with its embedded contributor.
type Row = {
  role: ContributorRole;
  sequence: number;
  is_corresponding: boolean;
  display_name_override: string | null;
  affiliation_override: string | null;
  contributors: {
    id: string;
    display_name: string;
    name_km: string | null;
    orcid: string | null;
    affiliation: string | null;
  } | null;
};

export async function getResourceContributors(
  resourceType: ResourceType,
  resourceId: string,
): Promise<ResourceContributor[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("resource_contributors")
    .select(
      `role, sequence, is_corresponding, display_name_override, affiliation_override,
       contributors:contributor_id ( id, display_name, name_km, orcid, affiliation )`,
    )
    .eq("resource_type", resourceType)
    .eq("resource_id", resourceId)
    .order("sequence", { ascending: true });

  if (error || !data) return [];

  return (data as unknown as Row[]).map((row) => ({
    contributorId: row.contributors?.id ?? null,
    displayName: row.display_name_override ?? row.contributors?.display_name ?? "",
    nameKm: row.contributors?.name_km ?? null,
    role: row.role,
    sequence: row.sequence,
    isCorresponding: row.is_corresponding,
    orcid: row.contributors?.orcid ?? null,
    affiliation: row.affiliation_override ?? row.contributors?.affiliation ?? null,
  }));
}

/** Convenience: just the authors, in order, as display strings. */
export function authorsOf(contributors: ResourceContributor[]): string[] {
  const authors = contributors
    .filter((c) => c.role === "author")
    .sort((a, b) => a.sequence - b.sequence);
  const out: string[] = [];
  for (const c of authors) {
    if (c.displayName) out.push(c.displayName);
  }
  return out;
}

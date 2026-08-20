import "server-only";

// lib/team/data.ts — server-side fetchers for the public Library Team pages.
//
// Extracted from app/[locale]/(public)/about/team/page.tsx when the redesign
// added per-member profile routes (/about/team/<slug>): the directory page and
// the profile page must read team data the same way or the two drift apart.
//
// Everything here reads the privacy-enforcing `team_members_public` view — the
// view is what nulls `phone`/`email` unless the admin approved public display,
// so neither page can leak a personal contact detail even by accident.
//
// Deploy-window fallbacks (same pattern as the 0070 rollout):
//   1. full select incl. `slug` (post-0114 view),
//   2. the same view without `slug` (0070 applied, 0114 not yet),
//   3. the legacy `team_members_with_email` view (pre-0070).

import { cache } from "react";
import { createServiceClient } from "@/lib/supabase/server";
import {
  PUBLIC_MEMBER_SELECT,
  PRE_0114_MEMBER_SELECT,
  LEGACY_MEMBER_SELECT,
  fromLegacyRow,
  type LegacyTeamMemberRow,
  type PublicTeamMember,
  type PublicTeamSection,
} from "@/lib/team/public";

async function fetchMembers(): Promise<PublicTeamMember[]> {
  const supabase = createServiceClient();

  const full = await supabase
    .from("team_members_public")
    .select(PUBLIC_MEMBER_SELECT)
    .order("display_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (!full.error) return (full.data ?? []) as unknown as PublicTeamMember[];

  // 0114 not applied yet: retry the same view without `slug`.
  const pre0114 = await supabase
    .from("team_members_public")
    .select(PRE_0114_MEMBER_SELECT)
    .order("display_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (!pre0114.error) {
    return ((pre0114.data ?? []) as unknown as Omit<PublicTeamMember, "slug">[]).map(
      (m) => ({ ...m, slug: null }),
    );
  }

  // Pre-0070: the public view does not exist at all.
  const { data: legacy } = await supabase
    .from("team_members_with_email")
    .select(LEGACY_MEMBER_SELECT)
    .eq("is_published", true)
    .order("display_order", { ascending: true })
    .order("created_at", { ascending: true });
  return ((legacy ?? []) as unknown as LegacyTeamMemberRow[]).map(fromLegacyRow);
}

async function fetchSections(): Promise<PublicTeamSection[]> {
  const supabase = createServiceClient();

  const result = await supabase
    .from("team_sections")
    .select("id,name_km,name_en,description_km,description_en,display_order,is_active")
    .order("display_order", { ascending: true });

  if (result.error) {
    // Pre-0070: no is_active column yet.
    const { data: legacySections } = await supabase
      .from("team_sections")
      .select("id,name_km,name_en,description_km,description_en,display_order")
      .order("display_order", { ascending: true });
    return (legacySections ?? []) as PublicTeamSection[];
  }

  return (result.data ?? [])
    .filter((s) => s.is_active !== false)
    .map((s) => ({
      id: s.id,
      name_km: s.name_km,
      name_en: s.name_en,
      description_km: s.description_km,
      description_en: s.description_en,
      display_order: s.display_order,
    }));
}

/** Everything the directory page needs, and the profile page's context
 *  (colleagues, prev/next) — one shape for both. Wrapped in React cache() so
 *  generateMetadata and the page body share one fetch per request. */
export const getPublicTeamData = cache(async (): Promise<{
  members: PublicTeamMember[];
  sections: PublicTeamSection[];
}> => {
  const [members, sections] = await Promise.all([fetchMembers(), fetchSections()]);
  return { members, sections };
});

/** One published member by slug, with the full roster for the pager and the
 *  "also in this area" list. Returns member: null for an unknown slug — the
 *  edge slug gate normally answers first, but the route still 404s honestly
 *  when the gate failed open. */
export async function getTeamMemberBySlug(slug: string): Promise<{
  member: PublicTeamMember | null;
  members: PublicTeamMember[];
  sections: PublicTeamSection[];
}> {
  const { members, sections } = await getPublicTeamData();
  const member = slug ? (members.find((m) => m.slug === slug) ?? null) : null;
  return { member, members, sections };
}

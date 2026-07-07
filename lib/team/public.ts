/**
 * Pure helpers for the public Library Team directory (/about/team).
 *
 * The public page reads the `team_members_public` view (migration 0070),
 * which already enforces publish state, section activity, and per-member
 * contact-privacy toggles. Until that migration is applied, the page falls
 * back to the legacy `team_members_with_email` view and maps rows through
 * `fromLegacyRow()` so the redesign works before and after the migration.
 */

export type PublicTeamMember = {
  id: string;
  name_km: string;
  name_en: string;
  position_km: string | null;
  position_en: string | null;
  education: string | null;
  years_experience: string | null;
  photo_url: string | null;
  photo_alt: string | null;
  short_bio_km: string | null;
  short_bio_en: string | null;
  bio_km: string | null;
  bio_en: string | null;
  responsibilities_km: string[];
  responsibilities_en: string[];
  languages: string[];
  working_hours: string | null;
  is_featured: boolean;
  display_order: number;
  section_id: string | null;
  section_name_km: string | null;
  section_name_en: string | null;
  /** Already privacy-gated: null unless the admin approved public display. */
  phone: string | null;
  email: string | null;
};

export type PublicTeamSection = {
  id: string;
  name_km: string;
  name_en: string;
  description_km: string | null;
  description_en: string | null;
  display_order: number;
};

/** Column list requested from the post-0070 `team_members_public` view. */
export const PUBLIC_MEMBER_SELECT =
  "id,name_km,name_en,position_km,position_en,education,years_experience," +
  "photo_url,photo_alt,short_bio_km,short_bio_en,bio_km,bio_en," +
  "responsibilities_km,responsibilities_en,languages,working_hours," +
  "is_featured,display_order,section_id,section_name_km,section_name_en,phone,email";

/** Column list for the pre-0070 legacy fallback (`team_members_with_email`). */
export const LEGACY_MEMBER_SELECT =
  "id,name_km,name_en,position_km,position_en,education,years_experience," +
  "phone,bio_km,bio_en,photo_url,user_email,section_id,section_name_km,section_name_en";

export type LegacyTeamMemberRow = {
  id: string;
  name_km: string;
  name_en: string;
  position_km: string | null;
  position_en: string | null;
  education: string | null;
  years_experience: string | null;
  phone: string | null;
  bio_km: string | null;
  bio_en: string | null;
  photo_url: string | null;
  user_email: string | null;
  section_id: string | null;
  section_name_km: string | null;
  section_name_en: string | null;
};

/**
 * Maps a legacy `team_members_with_email` row to the new shape. Phone and
 * email stay visible here because that was the pre-migration behaviour the
 * site owner had published; the privacy toggles only exist after 0070.
 */
export function fromLegacyRow(row: LegacyTeamMemberRow): PublicTeamMember {
  return {
    ...row,
    photo_alt: null,
    short_bio_km: null,
    short_bio_en: null,
    responsibilities_km: [],
    responsibilities_en: [],
    languages: [],
    working_hours: null,
    is_featured: false,
    display_order: 0,
    email: row.user_email,
  };
}

export type SectionGroup = {
  section: PublicTeamSection | null;
  members: PublicTeamMember[];
};

/**
 * Groups members under their section (ordered by section display_order,
 * unsectioned last). Sections without members are dropped.
 */
export function groupBySection(
  members: PublicTeamMember[],
  sections: PublicTeamSection[]
): SectionGroup[] {
  const grouped: SectionGroup[] = sections
    .map((section) => ({
      section,
      members: members.filter((m) => m.section_id === section.id),
    }))
    .filter((g) => g.members.length > 0);

  const unsectioned = members.filter(
    (m) => !m.section_id || !sections.some((s) => s.id === m.section_id)
  );
  if (unsectioned.length > 0) grouped.push({ section: null, members: unsectioned });

  return grouped;
}

/** Member count per section id ("" = unsectioned). */
export function sectionCounts(members: PublicTeamMember[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const m of members) {
    const key = m.section_id ?? "";
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

/** Featured members, in display order — shown as "Key Contacts" first. */
export function featuredMembers(members: PublicTeamMember[]): PublicTeamMember[] {
  return members.filter((m) => m.is_featured);
}

/**
 * One short scannable line for the staff card: prefer the dedicated short
 * bio, then the first responsibility, then a truncated full bio.
 */
export function cardSummary(
  member: PublicTeamMember,
  maxLength = 120
): { text: string; lang: "km" | "en" } | null {
  if (member.short_bio_km) return { text: truncate(member.short_bio_km, maxLength), lang: "km" };
  if (member.short_bio_en) return { text: truncate(member.short_bio_en, maxLength), lang: "en" };
  if (member.responsibilities_km.length > 0)
    return { text: truncate(member.responsibilities_km[0], maxLength), lang: "km" };
  if (member.responsibilities_en.length > 0)
    return { text: truncate(member.responsibilities_en[0], maxLength), lang: "en" };
  if (member.bio_km) return { text: truncate(member.bio_km, maxLength), lang: "km" };
  if (member.bio_en) return { text: truncate(member.bio_en, maxLength), lang: "en" };
  return null;
}

export function truncate(text: string, maxLength: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, maxLength - 1).trimEnd()}…`;
}

/** Alt text for a member photo: stored alt first, then a generated fallback. */
export function photoAltText(member: Pick<PublicTeamMember, "photo_alt" | "name_en" | "position_en">): string {
  if (member.photo_alt) return member.photo_alt;
  return `Photo of ${member.name_en}${member.position_en ? `, ${member.position_en}` : ""}`;
}

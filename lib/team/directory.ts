// lib/team/directory.ts
//
// The PURE decision layer behind /about/team's directory: which script leads a
// name, what a card's department badge says, what a search query matches, and
// which members the leadership section may lead with.
//
// It is separate from lib/team/public.ts on purpose. That file owns the SHAPE
// of a public row (the four deploy-window selects, the legacy mapper, the
// privacy-gated fields). This one owns what the *directory* does with a row —
// rules that are presentation decisions, are easy to get wrong in two
// languages, and were previously inlined inside a 736-line client component
// where nothing could test them.
//
// Nothing here touches a database, `next/headers` or a locale provider, so the
// unit tests exercise the real functions rather than a copy of them.
//
// ── Privacy ──
// This module never decides what may be published. `phone`/`email` arrive
// already nulled by the `team_members_public` view (migration 0070) when the
// admin has not approved public display, and nothing below reads them.

import { truncate, type PublicTeamMember, type PublicTeamSection } from "@/lib/team/public";
import type { AboutLocale } from "@/lib/about/format";

/** Roster size at which the search field starts being offered. Below it the
 *  whole grid fits on a screen or two and a search box is one more control to
 *  skip past on the way to the people. */
export const SEARCH_THRESHOLD = 8;

/** How many people the featured section leads with. Three is the desktop row,
 *  and past one row the section stops being an introduction and becomes a
 *  second directory — so the overflow stays in the grid below, where it is
 *  searchable and filterable, behind the section's own "View all team" link. */
export const FEATURED_MAX = 3;

/** The sentinel filter values. A section id is any other string. */
export const FILTER_ALL = "all";
export const FILTER_UNSECTIONED = "unsectioned";

export type BilingualName = {
  primary: string;
  primaryLang: AboutLocale;
  secondary: string | null;
  secondaryLang: AboutLocale;
};

/**
 * The member's name in the active locale, with the other script beneath.
 *
 * `primaryLang` is resolved from which VALUE was actually used, not from the
 * requested locale: a member with no Khmer name renders their Latin name on
 * /km, and tagging that run `lang="km"` would hand it to the Khmer font.
 */
export function memberNames(member: PublicTeamMember, locale: AboutLocale): BilingualName {
  const wanted = locale === "km" ? member.name_km : member.name_en;
  const other = locale === "km" ? member.name_en : member.name_km;
  const primary = wanted?.trim() || member.name_en?.trim() || member.name_km?.trim() || "";
  const primaryLang: AboutLocale = primary === member.name_km?.trim() ? "km" : "en";
  const secondaryRaw = other?.trim();
  const secondary = secondaryRaw && secondaryRaw !== primary ? secondaryRaw : null;
  return {
    primary,
    primaryLang,
    secondary,
    secondaryLang: primaryLang === "km" ? "en" : "km",
  };
}

/** A localized string plus the language it actually resolved to, or null. */
export type LangText = { text: string; lang: AboutLocale };

function pick(km: string | null | undefined, en: string | null | undefined, locale: AboutLocale): LangText | null {
  const wanted = locale === "km" ? km : en;
  const text = wanted?.trim() || en?.trim() || km?.trim();
  if (!text) return null;
  return { text, lang: text === km?.trim() ? "km" : "en" };
}

/** The member's position, in the active locale where one exists. */
export function memberPosition(member: PublicTeamMember, locale: AboutLocale): LangText | null {
  return pick(member.position_km, member.position_en, locale);
}

/** The member's service area — the card's department badge. */
export function memberArea(member: PublicTeamMember, locale: AboutLocale): LangText | null {
  return pick(member.section_name_km, member.section_name_en, locale);
}

/** A section's own name, for a filter chip and a section heading. */
export function sectionName(section: PublicTeamSection, locale: AboutLocale): LangText | null {
  return pick(section.name_km, section.name_en, locale);
}

/** A section's blurb, where the librarian wrote one. */
export function sectionBlurb(section: PublicTeamSection, locale: AboutLocale): LangText | null {
  return pick(section.description_km, section.description_en, locale);
}

/** The responsibilities list in the active locale, falling back to whichever
 *  language has entries — an empty list in the reader's language is worse than
 *  a populated one in the other. */
export function memberResponsibilities(
  member: PublicTeamMember,
  locale: AboutLocale,
): { items: string[]; lang: AboutLocale } {
  if (locale === "km" && member.responsibilities_km.length > 0)
    return { items: member.responsibilities_km, lang: "km" };
  if (member.responsibilities_en.length > 0)
    return { items: member.responsibilities_en, lang: "en" };
  return { items: member.responsibilities_km, lang: "km" };
}

/** The member's long biography, in the active locale where one exists. */
export function memberBio(member: PublicTeamMember, locale: AboutLocale): LangText | null {
  return pick(member.bio_km, member.bio_en, locale);
}

/**
 * One short, scannable line for a card or a sheet, in the ACTIVE locale.
 *
 * This is a locale-aware `cardSummary()` (lib/team/public.ts), and it exists
 * because that one is not: it prefers `short_bio_km` unconditionally, so the
 * ENGLISH page renders a Khmer paragraph for every member who has one — which
 * is all twelve on production. `cardSummary()` keeps its behaviour for its
 * other caller rather than being changed underneath it.
 *
 * The ladder is the same and the reason is the same: a dedicated short bio
 * says what the librarian wanted said, the first responsibility says what the
 * person does, and the full biography is the last resort because its opening
 * sentence is written to be read in full. Within each rung the active locale
 * leads and the other language is the fallback — an English sentence on /km is
 * better than no sentence, and it is tagged `en` so the right font draws it.
 */
export function memberSummary(
  member: PublicTeamMember,
  locale: AboutLocale,
  maxLength = 120,
): LangText | null {
  const rungs: [string | null | undefined, string | null | undefined][] = [
    [member.short_bio_km, member.short_bio_en],
    [member.responsibilities_km[0], member.responsibilities_en[0]],
    [member.bio_km, member.bio_en],
  ];
  for (const [km, en] of rungs) {
    const hit = pick(km, en, locale);
    if (hit) return { text: truncate(hit.text, maxLength), lang: hit.lang };
  }
  return null;
}

/**
 * Every field a search query is matched against, in BOTH scripts at once.
 *
 * Searching both languages regardless of the page's locale is deliberate: a
 * reader who knows a colleague's Khmer name must find them while the interface
 * is in English, and vice versa. Contact fields are absent by construction —
 * a member's approved phone number is not a search key.
 */
export function searchHaystack(member: PublicTeamMember): string[] {
  return [
    member.name_en,
    member.name_km,
    member.position_en,
    member.position_km,
    member.section_name_en,
    member.section_name_km,
    member.short_bio_en,
    member.short_bio_km,
    ...member.responsibilities_en,
    ...member.responsibilities_km,
    ...member.languages,
  ].filter((v): v is string => Boolean(v && v.trim()));
}

/**
 * Case-insensitive substring match across both scripts.
 *
 * Substring rather than prefix, and that is the opposite of the rule
 * lib/search/normalize.ts applies to the catalogue — for a good reason. There
 * the corpus is ~1,900 books and an unanchored Latin term scored "mining"
 * against "Exa|mining|". Here the corpus is a dozen colleagues with no ranking
 * at all: the only outcome of a loose match is one extra face in a grid of
 * twelve, while an anchored match would stop "soklang" finding "LAM SOKLANG"
 * and stop any Khmer query working, because Khmer has no word boundaries.
 */
export function matchesQuery(member: PublicTeamMember, needle: string): boolean {
  const q = needle.trim().toLowerCase();
  if (!q) return true;
  return searchHaystack(member).some((field) => field.toLowerCase().includes(q));
}

/**
 * The directory's one filtering pass: service area, then query.
 *
 * Order matters for the counts the toolbar shows — the chip counts describe
 * the whole roster (so a chip never reads "0" while its area holds people),
 * and the result count describes what survived both.
 */
export function filterMembers(
  members: PublicTeamMember[],
  { area, query }: { area: string; query: string },
): PublicTeamMember[] {
  const byArea =
    area === FILTER_ALL
      ? members
      : area === FILTER_UNSECTIONED
        ? members.filter((m) => !m.section_id)
        : members.filter((m) => m.section_id === area);
  const q = query.trim();
  return q ? byArea.filter((m) => matchesQuery(m, q)) : byArea;
}

export type AreaChip = {
  /** Filter value: FILTER_ALL, FILTER_UNSECTIONED, or a section id. */
  value: string;
  /** Null for the "All" and "Other" chips, which the caller labels from the
   *  message catalogue rather than from a row. */
  name: LangText | null;
  count: number;
};

/**
 * The chip row: "All", one chip per service area that actually has members,
 * and "Other" only when somebody is unsectioned.
 *
 * A chip for an empty area is a control that can only ever produce an empty
 * state, so it is not offered. The "All" chip is always present even for a
 * one-area roster, because it is what clears a search-narrowed view.
 */
export function areaChips(
  members: PublicTeamMember[],
  sections: PublicTeamSection[],
  locale: AboutLocale,
): AreaChip[] {
  const chips: AreaChip[] = [{ value: FILTER_ALL, name: null, count: members.length }];
  for (const section of sections) {
    const count = members.filter((m) => m.section_id === section.id).length;
    if (count === 0) continue;
    chips.push({ value: section.id, name: sectionName(section, locale), count });
  }
  const unsectioned = members.filter(
    (m) => !m.section_id || !sections.some((s) => s.id === m.section_id),
  ).length;
  if (unsectioned > 0) {
    chips.push({ value: FILTER_UNSECTIONED, name: null, count: unsectioned });
  }
  return chips;
}

/**
 * Splits the roster into the people the featured section introduces and the
 * directory behind it.
 *
 * Two rules, and each exists to stop the section claiming something the data
 * does not say:
 *
 *   1. `is_featured` is the ONLY input. Nothing is inferred from a position
 *      string — "Head of Department" is a job title the library wrote, not a
 *      flag it set, and reading rank out of prose is how a redesign starts
 *      inventing a hierarchy. Nothing is padded either: two featured members
 *      render two cards, never two plus a placeholder to fill the row.
 *   2. Featured members stay in `directory` as well. The directory is the
 *      complete, searchable, filterable roster — removing them from it would
 *      mean a search for the head of department found nothing.
 *
 * The section's heading is "Meet the Library Team", which introduces people
 * without ranking them, so a single featured member is a legitimate section
 * where under the old "Leadership" heading it would have asserted a rank.
 */
export function splitFeatured(members: PublicTeamMember[]): {
  featured: PublicTeamMember[];
  directory: PublicTeamMember[];
} {
  return {
    featured: members.filter((m) => m.is_featured).slice(0, FEATURED_MAX),
    directory: members,
  };
}

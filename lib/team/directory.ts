// lib/team/directory.ts
//
// The pure decision layer behind the public team directory (/about/team).
//
// Everything the redesigned directory decides — which departments exist, how
// many people are in each, which accent a department wears, which name leads
// in which locale, what a search query matches, and which member a
// `?member=<slug>` deep link names — lives here rather than inside the client
// component, so all of it is exercised offline by lib/team/directory.test.ts
// with no React, no DOM and no database.
//
// Pure and browser-safe: no `server-only`, no `next/*`, no Supabase. The
// module is imported by a "use client" component, so a server-only import
// here would take the whole page down at build time.

import {
  boundedEditDistance,
  hasKhmer,
  normalizeSearchText,
  termMatches,
  typoTolerance,
} from "@/lib/search/normalize";
import type { AboutLocale } from "@/lib/about/format";
import { truncate, type PublicTeamMember, type PublicTeamSection } from "@/lib/team/public";

/* ────────────────────────────────────────────────────────────────────────────
   Departments
   ──────────────────────────────────────────────────────────────────────────── */

/** The "no filter" chip. Not a department — it is the absence of one. */
export const ALL_DEPARTMENTS = "all";

/** The bucket for published members whose section was deleted or deactivated.
 *  It is a real chip (those people are still on the roster) but it is NOT a
 *  `team_sections` row, so it can never collide with a section UUID. */
export const UNSECTIONED = "unsectioned";

/**
 * How many accent hues the department chips cycle through.
 *
 * Four, because that is the size of the validated categorical palette this
 * page borrows (`--ptec-series-*`, app/admin.css — chosen together for an
 * OKLCH lightness band, a chroma floor and protan/deutan ΔE under all pairs).
 * A fifth hue pasted in beside them would be outside that validation by
 * construction, so a fifth department repeats the first hue instead.
 *
 * That repetition is safe HERE and would not be safe in a chart, because
 * colour is never the only channel on this page: the chip always carries the
 * department's name as text, and the filter bar always states which
 * department is active. The hue is decoration on a label, not the label.
 */
export const DEPARTMENT_ACCENTS = 4;

export type TeamDepartment = {
  /** A `team_sections` id, or UNSECTIONED. */
  id: string;
  /** The label in the active locale, with the other language as fallback. */
  label: string;
  count: number;
  /** 1…DEPARTMENT_ACCENTS — the CSS accent class suffix. */
  accent: number;
};

/** Which department bucket a member belongs to. */
export function departmentIdOf(member: PublicTeamMember): string {
  return member.section_id || UNSECTIONED;
}

function sectionLabel(section: PublicTeamSection, locale: AboutLocale): string {
  const primary = locale === "km" ? section.name_km : section.name_en;
  return primary?.trim() || section.name_en?.trim() || section.name_km?.trim() || "";
}

/**
 * The department chips, DERIVED from the roster — never a hardcoded list.
 *
 * A section with no published member is dropped (a chip that always shows
 * "0" and an empty grid is a dead control), and the unsectioned bucket is
 * appended last and only when somebody is actually in it.
 */
export function teamDepartments(
  members: PublicTeamMember[],
  sections: PublicTeamSection[],
  locale: AboutLocale,
  otherLabel: string,
): TeamDepartment[] {
  const counts = new Map<string, number>();
  for (const member of members) {
    const id = departmentIdOf(member);
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }

  const ordered: Omit<TeamDepartment, "accent">[] = [];
  for (const section of sections) {
    const count = counts.get(section.id) ?? 0;
    if (count === 0) continue;
    ordered.push({ id: section.id, label: sectionLabel(section, locale) || otherLabel, count });
  }
  const loose = counts.get(UNSECTIONED) ?? 0;
  if (loose > 0) ordered.push({ id: UNSECTIONED, label: otherLabel, count: loose });

  return ordered.map((department, index) => ({
    ...department,
    accent: (index % DEPARTMENT_ACCENTS) + 1,
  }));
}

/** department id → accent number, for the cards and the list rows. */
export function departmentAccents(departments: TeamDepartment[]): Record<string, number> {
  const accents: Record<string, number> = {};
  for (const department of departments) accents[department.id] = department.accent;
  return accents;
}

/** The member's department label, or null when they are in no live section. */
export function memberDepartment(
  member: PublicTeamMember,
  locale: AboutLocale,
): string | null {
  const primary = locale === "km" ? member.section_name_km : member.section_name_en;
  const value =
    primary?.trim() || member.section_name_en?.trim() || member.section_name_km?.trim();
  return value || null;
}

/* ────────────────────────────────────────────────────────────────────────────
   Names and positions
   ──────────────────────────────────────────────────────────────────────────── */

export type MemberNames = {
  primary: string;
  primaryLang: AboutLocale;
  /** The same person in the other script, or null when there is only one. */
  secondary: string | null;
  secondaryLang: AboutLocale;
};

/**
 * Which script leads.
 *
 * On /km the Khmer name is primary and the Latin one secondary; on / the
 * order is reversed. BOTH are always rendered when both exist — a person's
 * name is exactly the kind of short official label that carries both
 * languages — and each carries its own `lang`, because a Khmer string
 * announced by an English voice is unintelligible.
 *
 * When only one script is stored, that one leads whatever the locale is and
 * there is no secondary line: repeating the same string twice is noise.
 */
export function memberNames(member: PublicTeamMember, locale: AboutLocale): MemberNames {
  const km = member.name_km?.trim() || "";
  const en = member.name_en?.trim() || "";
  const wantKhmerFirst = locale === "km";

  const first = wantKhmerFirst ? km : en;
  const second = wantKhmerFirst ? en : km;
  const firstLang: AboutLocale = wantKhmerFirst ? "km" : "en";

  if (first) {
    return {
      primary: first,
      primaryLang: firstLang,
      secondary: second && second !== first ? second : null,
      secondaryLang: firstLang === "km" ? "en" : "km",
    };
  }
  // Only the other script exists — it leads, and nothing follows it.
  return {
    primary: second,
    primaryLang: firstLang === "km" ? "en" : "km",
    secondary: null,
    secondaryLang: firstLang,
  };
}

/** The position in the active locale, falling back to the other language. */
export function memberPosition(
  member: PublicTeamMember,
  locale: AboutLocale,
): string | null {
  const primary = locale === "km" ? member.position_km : member.position_en;
  const value = primary?.trim() || member.position_en?.trim() || member.position_km?.trim();
  return value || null;
}

/**
 * The one line of what a person does, in the reader's OWN language.
 *
 * `cardSummary()` in lib/team/public.ts picks the same three tiers — short
 * bio, first responsibility, full bio — but takes Khmer first at every tier
 * whatever the page is in, so the English directory printed a Khmer sentence
 * under an English name. The tier ORDER is unchanged (a dedicated short bio
 * still beats a truncated long one, in either language); what changes is that
 * the active locale is consulted before the other one INSIDE each tier. A
 * member who published only one language still gets that one, with the right
 * `lang` on it, rather than nothing.
 */
export function memberSummary(
  member: PublicTeamMember,
  locale: AboutLocale,
  maxLength = 120,
): { text: string; lang: AboutLocale } | null {
  const other: AboutLocale = locale === "km" ? "en" : "km";
  const tiers: [AboutLocale, string | undefined][][] = [
    [
      [locale, locale === "km" ? member.short_bio_km ?? undefined : member.short_bio_en ?? undefined],
      [other, other === "km" ? member.short_bio_km ?? undefined : member.short_bio_en ?? undefined],
    ],
    [
      [locale, (locale === "km" ? member.responsibilities_km : member.responsibilities_en)[0]],
      [other, (other === "km" ? member.responsibilities_km : member.responsibilities_en)[0]],
    ],
    [
      [locale, locale === "km" ? member.bio_km ?? undefined : member.bio_en ?? undefined],
      [other, other === "km" ? member.bio_km ?? undefined : member.bio_en ?? undefined],
    ],
  ];

  for (const tier of tiers) {
    for (const [lang, value] of tier) {
      if (value && value.trim()) return { text: truncate(value, maxLength), lang };
    }
  }
  return null;
}

/* ────────────────────────────────────────────────────────────────────────────
   Search
   ──────────────────────────────────────────────────────────────────────────── */

/** Every field a reader may search a colleague by, in both scripts. */
function haystacks(member: PublicTeamMember): string[] {
  return [
    member.name_en,
    member.name_km,
    member.position_en,
    member.position_km,
    member.section_name_en,
    member.section_name_km,
  ]
    .map((field) => normalizeSearchText(field))
    .filter(Boolean);
}

/**
 * Does one normalized field satisfy one normalized query token?
 *
 * The script asymmetry is the site's existing one (`termMatches`,
 * lib/search/normalize.ts): a Latin term must BEGIN a word, because an infix
 * match in Latin text is an accident ("one" inside "Smartphone"); a Khmer
 * term matches anywhere, because Khmer writes no word boundaries and there is
 * no segmenter here. On top of that, a Latin token long enough to be worth
 * guessing about is allowed one or two edits against a single word, which is
 * what makes a mistyped name still find the person. `typoTolerance()` returns
 * 0 for Khmer and for anything under four characters, so neither gets the
 * fuzzy leg — a one-edit neighbourhood of a short Khmer run is most of the
 * alphabet.
 */
function fieldMatches(field: string, token: string): boolean {
  if (termMatches(field, token)) return true;
  const tolerance = typoTolerance(token);
  if (tolerance === 0) return false;
  return field
    .split(" ")
    .some((word) => word.length >= 4 && boundedEditDistance(word, token, tolerance) <= tolerance);
}

/**
 * The query's tokens, normalized. A Khmer query is ONE token whatever spaces
 * it happens to contain, for the same reason the search route treats it that
 * way: the spaces in Khmer text are phrase separators, not word separators,
 * so splitting on them invents boundaries the script does not have.
 */
export function teamQueryTokens(raw: string): string[] {
  const normalized = normalizeSearchText(raw);
  if (!normalized) return [];
  if (hasKhmer(normalized)) return [normalized];
  return normalized.split(" ").filter(Boolean);
}

/** Every token must be satisfied by some field — an AND, so adding a word
 *  always narrows. */
export function matchesTeamQuery(member: PublicTeamMember, raw: string): boolean {
  const tokens = teamQueryTokens(raw);
  if (tokens.length === 0) return true;
  const fields = haystacks(member);
  return tokens.every((token) => fields.some((field) => fieldMatches(field, token)));
}

export type TeamFilter = {
  /** ALL_DEPARTMENTS, a section id, or UNSECTIONED. */
  department: string;
  query: string;
};

/**
 * The visible roster: department first, then the query. Order is preserved —
 * it is the librarians' own `display_order`, and re-ranking people by how
 * well their name matched a typo would be a strange thing to do to a staff
 * list.
 */
export function filterTeamMembers(
  members: PublicTeamMember[],
  { department, query }: TeamFilter,
): PublicTeamMember[] {
  return members.filter((member) => {
    if (department !== ALL_DEPARTMENTS && departmentIdOf(member) !== department) return false;
    return matchesTeamQuery(member, query);
  });
}

/* ────────────────────────────────────────────────────────────────────────────
   Deep links and view state
   ──────────────────────────────────────────────────────────────────────────── */

/** The query parameter that names an open member panel. Never canonical:
 *  it is written with history.replaceState and appears in no metadata,
 *  sitemap, breadcrumb or hreflang. */
export const MEMBER_PARAM = "member";

/**
 * The member a `?member=<slug>` deep link names, or null.
 *
 * Null covers every wrong input the address bar can produce — an empty
 * parameter, a slug that was retired, a slug belonging to an unpublished
 * member, junk — and the caller's contract is to IGNORE the parameter
 * silently rather than to show an error. A stale link to a colleague who has
 * left should open the directory, not an apology.
 */
export function memberBySlug(
  members: PublicTeamMember[],
  slug: string | null | undefined,
): PublicTeamMember | null {
  const wanted = slug?.trim();
  if (!wanted) return null;
  return members.find((member) => member.slug === wanted) ?? null;
}

export type TeamView = "grid" | "list";

/** Own key, own namespace — never shared with another surface's preference. */
export const TEAM_VIEW_KEY = "ptec.team.view";

/** Grid on a first visit, and on anything unrecognised in localStorage —
 *  storage is per-origin and a reader can have written anything into it. */
export function isTeamView(value: unknown): value is TeamView {
  return value === "grid" || value === "list";
}

/* ────────────────────────────────────────────────────────────────────────────
   Hero portrait
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * The face in the hero: the first FEATURED member with a portrait, else the
 * first member with a portrait at all, else nobody — in which case the hero
 * renders its text-only layout with the section watermark, exactly as the
 * other About pages do. Never a placeholder monogram blown up to 26rem.
 */
export function heroPortrait(members: PublicTeamMember[]): PublicTeamMember | null {
  const withPhoto = members.filter((member) => Boolean(member.photo_url));
  return withPhoto.find((member) => member.is_featured) ?? withPhoto[0] ?? null;
}

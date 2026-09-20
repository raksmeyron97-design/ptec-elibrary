/**
 * Pure helpers for the public Library Committee page (/about/committee).
 *
 * The committee is a RELATIONSHIP over the existing people, so nothing here
 * describes a person: every identity field on `PublicCommitteeMember` arrives
 * from the canonical `team_members` row through the `committee_members_public`
 * view (migration 0150), and only the role, responsibility, section and order
 * belong to the committee itself.
 *
 * Two shapes deliberately DO NOT exist here:
 *
 *   • No contact fields. The view carries no phone, email or linked account,
 *     so this module cannot render one by accident. A reader who wants more is
 *     sent to the staff profile page, which enforces the privacy toggles.
 *   • No section table. Sections arrive denormalised on each row, so the page
 *     needs one query and a section with no published seat simply has no rows
 *     to group — an empty heading can never be rendered.
 *
 * Client-safe and server-safe: no imports beyond the About locale helpers, so
 * the unit tests exercise the real decision functions offline.
 */

import type { AboutLocale } from "@/lib/about/format";
import { localized } from "@/lib/about/format";

/** One published committee seat, joined to its canonical person. */
export type PublicCommitteeMember = {
  id: string;
  team_member_id: string;
  /** Committee facts. */
  role_km: string | null;
  role_en: string | null;
  responsibility_km: string | null;
  responsibility_en: string | null;
  display_order: number;
  updated_at: string | null;
  /** Canonical person — read from team_members, never stored twice.
   *  Null unless the person is ALSO published on /about/team, so a profile
   *  link is offered only where one resolves. */
  slug: string | null;
  name_km: string;
  name_en: string;
  position_km: string | null;
  position_en: string | null;
  education: string | null;
  photo_url: string | null;
  photo_alt: string | null;
  short_bio_km: string | null;
  short_bio_en: string | null;
  /** Section, denormalised onto the row by the view. */
  section_id: string | null;
  section_name_km: string | null;
  section_name_en: string | null;
  section_description_km: string | null;
  section_description_en: string | null;
  section_order: number | null;
  section_layout_variant: CommitteeLayoutVariant | null;
};

/** The two compositions the public page knows how to draw. */
export type CommitteeLayoutVariant = "leadership" | "grid";

export const COMMITTEE_LAYOUT_VARIANTS: readonly CommitteeLayoutVariant[] = [
  "leadership",
  "grid",
] as const;

/** An unknown or missing variant renders as the standard roster rather than
 *  as nothing — a section is never dropped because of a bad enum value. */
export function toLayoutVariant(value: string | null | undefined): CommitteeLayoutVariant {
  return value === "leadership" ? "leadership" : "grid";
}

export type CommitteeGroup = {
  /** Null for seats with no section — always rendered last, unheaded. */
  sectionId: string | null;
  nameKm: string | null;
  nameEn: string | null;
  descriptionKm: string | null;
  descriptionEn: string | null;
  order: number;
  layout: CommitteeLayoutVariant;
  members: PublicCommitteeMember[];
};

/** Column list requested from `committee_members_public`. */
export const PUBLIC_COMMITTEE_SELECT =
  "id,team_member_id,role_km,role_en,responsibility_km,responsibility_en," +
  "display_order,updated_at,slug,name_km,name_en,position_km,position_en," +
  "education,photo_url,photo_alt,short_bio_km,short_bio_en," +
  "section_id,section_name_km,section_name_en,section_description_km," +
  "section_description_en,section_order,section_layout_variant";

/** Seats with no section sort after every real section, whatever their own
 *  order value says. Large enough to stay last, finite so it never poisons a
 *  numeric comparison. */
const UNSECTIONED_ORDER = Number.MAX_SAFE_INTEGER;

/**
 * Groups published seats under their section, sections in display order and
 * members in theirs.
 *
 * Both comparisons fall through to a stable tiebreak (the Latin name, then the
 * row id) because `display_order` is an editor-maintained integer that is very
 * often 0 on several rows at once — without the tiebreak the public order
 * would depend on whatever order PostgREST happened to return.
 */
export function groupCommittee(members: PublicCommitteeMember[]): CommitteeGroup[] {
  const groups = new Map<string, CommitteeGroup>();

  for (const member of members) {
    const key = member.section_id ?? "";
    let group = groups.get(key);
    if (!group) {
      group = {
        sectionId: member.section_id,
        nameKm: member.section_id ? member.section_name_km : null,
        nameEn: member.section_id ? member.section_name_en : null,
        descriptionKm: member.section_id ? member.section_description_km : null,
        descriptionEn: member.section_id ? member.section_description_en : null,
        order: member.section_id ? (member.section_order ?? 0) : UNSECTIONED_ORDER,
        layout: member.section_id ? toLayoutVariant(member.section_layout_variant) : "grid",
        members: [],
      };
      groups.set(key, group);
    }
    group.members.push(member);
  }

  const ordered = [...groups.values()].sort(
    (a, b) => a.order - b.order || (a.nameEn ?? "").localeCompare(b.nameEn ?? ""),
  );
  for (const group of ordered) {
    group.members.sort(
      (a, b) =>
        a.display_order - b.display_order ||
        a.name_en.localeCompare(b.name_en) ||
        a.id.localeCompare(b.id),
    );
  }
  return ordered;
}

/** The section heading in the reader's language, with the correct `lang`. */
export function groupHeading(
  group: CommitteeGroup,
  locale: AboutLocale,
): { text: string; lang: AboutLocale } | null {
  return localized({ km: group.nameKm ?? "", en: group.nameEn ?? "" }, locale);
}

export function groupDescription(
  group: CommitteeGroup,
  locale: AboutLocale,
): { text: string; lang: AboutLocale } | null {
  return localized({ km: group.descriptionKm ?? "", en: group.descriptionEn ?? "" }, locale);
}

/**
 * The committee role — the one line that says why this person is on the page.
 *
 * Falls back to the person's library POSITION only when no committee role was
 * entered, and says which it used, because the two are different claims: "Chair
 * of the Library Committee" is a committee fact, "Cataloguing Officer" is a job.
 * A caller that needs to label them differently can tell them apart.
 */
export function committeeRole(
  member: PublicCommitteeMember,
  locale: AboutLocale,
): { text: string; lang: AboutLocale; source: "committee" | "position" } | null {
  const role = localized({ km: member.role_km ?? "", en: member.role_en ?? "" }, locale);
  if (role) return { ...role, source: "committee" };
  const position = localized(
    { km: member.position_km ?? "", en: member.position_en ?? "" },
    locale,
  );
  return position ? { ...position, source: "position" } : null;
}

export function committeeResponsibility(
  member: PublicCommitteeMember,
  locale: AboutLocale,
): { text: string; lang: AboutLocale } | null {
  return localized(
    { km: member.responsibility_km ?? "", en: member.responsibility_en ?? "" },
    locale,
  );
}

/** The person's name in both scripts: the reader's language leads, the other
 *  follows as a secondary line (never joined on one line — see BilingualTitle). */
export function committeeName(
  member: PublicCommitteeMember,
  locale: AboutLocale,
): { primary: { text: string; lang: AboutLocale }; secondary: { text: string; lang: AboutLocale } | null } | null {
  const primary = localized({ km: member.name_km, en: member.name_en }, locale);
  if (!primary) return null;
  const otherLocale: AboutLocale = primary.lang === "km" ? "en" : "km";
  const raw = (otherLocale === "km" ? member.name_km : member.name_en)?.trim() ?? "";
  const secondary = raw && raw !== primary.text ? { text: raw, lang: otherLocale } : null;
  return { primary, secondary };
}

/**
 * The staff profile URL, or null.
 *
 * The view already withholds the slug for a person who is not published on
 * /about/team, so this cannot produce a link the slug gate answers with a 404.
 * The path is locale-agnostic: pass it to `Link` from @/i18n/navigation.
 */
export function profilePath(member: PublicCommitteeMember): string | null {
  return member.slug ? `/about/team/${member.slug}` : null;
}

/** How many people the committee actually publishes. Derived, never stored —
 *  a public figure on this page is a count of real rows or it is not shown. */
export function publishedCount(groups: CommitteeGroup[]): number {
  return groups.reduce((total, group) => total + group.members.length, 0);
}

/* ────────────────────────────────────────────────────────────────────────────
   Monogram
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * Honorifics, longest first within each script.
 *
 * Every name this committee publishes carries one — "Mrs. THOLTHOEUN
 * CHANRAEKSMEY", "Dr. NHOR SANHUI", "លោកស្រី សេក សំសុខនាង" — so the first
 * character of the stored name is the honorific's, not the person's: it
 * renders "M" for every Mr/Mrs/Ms and "D" for every Dr. A monogram that is the
 * same letter for most of the board identifies nobody.
 *
 * Khmer entries MUST precede their own prefixes (លោកស្រី before លោក), because
 * the first match wins and Khmer writes the honorific with no separator in
 * much of the collection.
 */
const KHMER_HONORIFICS = [
  "ឯកឧត្តម",
  "លោកជំទាវ",
  "លោកស្រី",
  "លោកគ្រូ",
  "អ្នកគ្រូ",
  "អ្នកនាង",
  "បណ្ឌិត",
  "លោក",
] as const;

/** Latin honorifics, compared case-insensitively with punctuation removed. */
const LATIN_HONORIFICS = new Set([
  "mr",
  "mrs",
  "ms",
  "miss",
  "mdm",
  "madam",
  "dr",
  "prof",
  "professor",
  "assoc",
  "he",
]);

/**
 * The first LETTER of a word — never a combining mark.
 *
 * Khmer stacks dependent vowels and signs after the base consonant, and both
 * are ordinary characters in the string, so `charAt(0)` on a word that begins
 * mid-cluster yields a mark that renders as a dotted circle on its own.
 * `\p{L}` selects the base letter in either script.
 */
function firstLetter(word: string): string {
  const match = word.match(/\p{L}/u);
  return match ? match[0] : "";
}

/** Strips leading honorifics from a display name, in either script. */
function withoutHonorifics(raw: string): string {
  let name = raw.trim();

  // Khmer first: it may be written with no separator, so a token split cannot
  // see it.
  let stripped = true;
  while (stripped) {
    stripped = false;
    for (const honorific of KHMER_HONORIFICS) {
      if (name.startsWith(honorific)) {
        name = name.slice(honorific.length).replace(/^[\s​·.,]+/u, "");
        stripped = true;
        break;
      }
    }
  }

  // Latin: whole tokens only, so a surname is never eaten by a prefix match.
  const tokens = name.split(/\s+/u).filter(Boolean);
  while (tokens.length > 1) {
    const bare = tokens[0].replace(/[.,]/gu, "").toLowerCase();
    if (!LATIN_HONORIFICS.has(bare)) break;
    tokens.shift();
  }

  return tokens.join(" ");
}

/**
 * The initials drawn when the library has no portrait — up to two letters of
 * the person's actual name.
 *
 * The Latin name leads because it is the one that reliably separates into
 * words: Khmer is written without spaces in much of the collection, so a
 * second initial there would be the second consonant of a single given name
 * rather than a family name. Khmer answers only when there is no Latin name.
 *
 * Returns "" when neither name yields a letter — the caller draws the neutral
 * placeholder rather than a "?" that reads as missing data.
 */
export function committeeInitials(
  member: Pick<PublicCommitteeMember, "name_en" | "name_km">,
): string {
  for (const raw of [member.name_en, member.name_km]) {
    const name = (raw ?? "").trim();
    if (!name) continue;

    const words = withoutHonorifics(name).split(/\s+/u).filter(Boolean);
    // An entry that was ONLY an honorific keeps its own first letter rather
    // than falling through to the other script.
    const source = words.length > 0 ? words : [name];

    const initials = (source[0] ? firstLetter(source[0]) : "") +
      (source[1] ? firstLetter(source[1]) : "");
    if (initials) return initials.toUpperCase();
  }
  return "";
}

/**
 * Alt text for a committee portrait.
 *
 * Separate from `photoAltText()` in lib/team/public.ts on purpose, and only
 * in its FALLBACK: a stored alt still wins, so a librarian who has described a
 * photograph is never overridden. What differs is what the generated string
 * names. The team directory describes a person by their library POSITION,
 * which is right on that page; here the badge beside the portrait shows the
 * COMMITTEE role, and announcing "Head Librarian" where the page displays
 * "Chair" describes a different fact than the one on screen.
 *
 * English is used for the generated string regardless of the reader's locale,
 * matching the team directory — the alternative is a Khmer sentence wrapped
 * around whatever script the name happens to be stored in.
 */
export function committeePhotoAlt(
  member: Pick<
    PublicCommitteeMember,
    "photo_alt" | "name_en" | "name_km" | "role_en" | "position_en"
  >,
): string {
  if (member.photo_alt) return member.photo_alt;
  const name = member.name_en || member.name_km;
  const role = member.role_en || member.position_en;
  return `Portrait of ${name}${role ? `, ${role}` : ""}`;
}

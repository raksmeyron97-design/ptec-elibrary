// Structure and stable identifiers for the public Privacy Policy page.
//
// Anchor IDs, ordering, and version/date metadata live here (locale-independent
// and stable across EN/KM). All human-readable text lives in the `privacy`
// namespace of messages/{en,km}.json, keyed by these IDs. Keeping the two apart
// means a translation change never shifts an anchor URL, and both locales share
// exactly one table-of-contents/table shape.
//
// Backed by docs/PRIVACY-DATA-INVENTORY.md — do not add a section or table row
// that the inventory (and the code it cites) does not support.

/** Policy version shown in the hero and version history. Bump on any
 *  substantive change and add a matching entry to POLICY_VERSIONS. */
export const POLICY_VERSION = "2.0";

/** Machine-readable effective date of the current version (ISO, UTC). Rendered
 *  with the viewer's locale so we never hardcode a localized date string. */
export const POLICY_EFFECTIVE_DATE = "2026-07-25";

/**
 * Ordered list of policy sections. `id` is the anchor (`#overview`) and the
 * translation key under `privacy.sections.<id>`. `special` marks sections that
 * render an extra element after their prose (the data table, the rights card,
 * the version history) so the page can slot those in without hardcoding order.
 */
export type PrivacySpecial = "table" | "processors" | "rights" | "versions";

export type PrivacySection = {
  /** Anchor id + translation key under `privacy.sections.<id>`. */
  id: string;
  /** Extra element rendered after the section's prose, if any. */
  special?: PrivacySpecial;
};

export const PRIVACY_SECTIONS: readonly PrivacySection[] = [
  { id: "overview" },
  { id: "operator" },
  { id: "collect", special: "table" },
  { id: "use" },
  { id: "cookies" },
  { id: "sharing" },
  { id: "processors", special: "processors" },
  { id: "visibility" },
  { id: "security" },
  { id: "retention" },
  { id: "children" },
  { id: "rights", special: "rights" },
  { id: "deletion" },
  { id: "changes", special: "versions" },
  { id: "contact" },
];

export type PrivacySectionId = PrivacySection["id"];

/**
 * Rows of the data-practice table, in display order. Each id maps to
 * `privacy.table.rows.<id>` with keys: category, examples, purpose, source,
 * retention, access, sharing.
 */
export const PRIVACY_TABLE_ROWS = [
  "account",
  "downloadProfile",
  "activity",
  "reviews",
  "contact",
  "logs",
  "search",
  "push",
  "security",
  "device",
] as const;

export type PrivacyTableRowId = (typeof PRIVACY_TABLE_ROWS)[number];

/** Column keys for the data-practice table, in display order. */
export const PRIVACY_TABLE_COLUMNS = [
  "category",
  "examples",
  "purpose",
  "source",
  "retention",
  "access",
  "sharing",
] as const;

export type PrivacyTableColumn = (typeof PRIVACY_TABLE_COLUMNS)[number];

/**
 * Version history. Newest first. `version` + ISO `date` are locale-independent;
 * the change summary is `privacy.versions.<version>` in the message catalogue.
 */
export const POLICY_VERSIONS = [
  { version: "2.0", date: "2026-07-25" },
  { version: "1.0", date: "2026-07-01" },
] as const;

// ── Chapters ────────────────────────────────────────────────────────────────
//
// Fifteen sections is more than a reader can hold in their head, and a flat
// table of contents gives them no way to tell "what you hand us" from "what we
// do with it". The chapters group the SAME sections in the SAME order — they
// add a heading and a number, they never reorder or hide a section, and every
// existing `#anchor` keeps working untouched.
//
// Three rules, all checked by lib/privacy/chapters.test.ts:
//
//   1. Every section belongs to exactly one chapter. A section no chapter
//      claims keeps its entry, keeps its translations, and simply stops being
//      rendered — a shorter policy, with nothing at runtime to notice.
//   2. Chapters must be CONTIGUOUS in the declared order. Grouping a document
//      is a presentation change; reordering one is an editorial change, and a
//      reader who saved a link to a clause expects the clauses around it to be
//      the ones that were around it before.
//   3. A chapter's anchor may not collide with a section's. Both are element
//      ids on the same page, and `chapters.rights` beside `sections.rights`
//      makes `#rights` ambiguous — the table of contents then scrolls to the
//      chapter heading instead of the clause it names.

export type PrivacyChapter = {
  /** Translation key under `privacy.chapters.<id>`. NOT the element id. */
  id: string;
  /** Section ids in this chapter — a contiguous run of PRIVACY_SECTIONS. */
  sections: readonly PrivacySectionId[];
};

/** The element id and anchor for a chapter. Prefixed so it can never collide
 *  with a section anchor (rule 3 above). */
export function chapterAnchor(id: string): string {
  return `chapter-${id}`;
}

export const PRIVACY_CHAPTERS: readonly PrivacyChapter[] = [
  // `overview` and `operator` lead this chapter because the document leads
  // with them; the chapter is named for what it ends up being about rather
  // than the sections being moved to fit the name.
  { id: "collected", sections: ["overview", "operator", "collect"] },
  {
    id: "used",
    sections: ["use", "cookies", "sharing", "processors", "visibility", "security", "retention"],
  },
  { id: "rights", sections: ["children", "rights", "deletion"] },
  { id: "changes", sections: ["changes", "contact"] },
];

// ── Table row classification ────────────────────────────────────────────────
//
// The chips and the tint scale are DATA, never a parse of the rendered cell.
// `access` reads "You only" in English and "អ្នកតែម្នាក់ឯង" in Khmer, so a
// component that derived a colour from that string would colour the English
// table and leave the Khmer one grey — the failure would be invisible to
// anyone testing in one language.
//
// The cell text stays the authority: a chip summarises it, and the exact
// wording is still printed beside the chip. A reader is never shown a colour
// in place of a sentence.

/** Who, beyond the reader, can reach a category. */
export type PrivacyVisibility =
  /** Nobody but the reader (or their own browser). */
  | "private"
  /** The reader plus library staff — individually or in aggregate. */
  | "shared"
  /** Anyone on the internet. */
  | "public"
  /** Infrastructure access only: the technical steward keeping the service up. */
  | "steward";

/** How the category arrives. Drives the "Automatic" filter — the categories a
 *  reader never chose to hand over are the ones they most want to find. */
export type PrivacySourceKind = "you" | "automatic";

/**
 * How long a category is kept, as four buckets on one cool→warm scale.
 * Bucketed rather than exact because the scale exists to let a reader rank ten
 * rows at a glance; the precise answer ("1 year, then anonymous counts") is in
 * the cell next to it and is never replaced by the tint.
 */
export type PrivacyRetentionTier =
  /** Hours or days — request-scoped security state. */
  | "short"
  /** For as long as the reader leaves it there. */
  | "untilYouAct"
  /** Bounded, up to about a year. */
  | "upToAYear"
  /** The long end: multiple years, or the life of the account. */
  | "long";

export type PrivacyRowMeta = {
  visibility: PrivacyVisibility;
  source: PrivacySourceKind;
  retention: PrivacyRetentionTier;
};

/** One entry per PRIVACY_TABLE_ROWS id. Classified from the row's own EN cell
 *  text — see docs/PRIVACY-DATA-INVENTORY.md for the underlying inventory. */
export const PRIVACY_ROW_META: Record<PrivacyTableRowId, PrivacyRowMeta> = {
  // "You; technical steward" — the reader is not the only one who can reach it.
  account: { visibility: "steward", source: "you", retention: "long" },
  downloadProfile: { visibility: "shared", source: "you", retention: "long" },
  activity: { visibility: "private", source: "you", retention: "long" },
  reviews: { visibility: "public", source: "you", retention: "untilYouAct" },
  contact: { visibility: "shared", source: "you", retention: "long" },
  logs: { visibility: "steward", source: "automatic", retention: "upToAYear" },
  search: { visibility: "steward", source: "automatic", retention: "upToAYear" },
  push: { visibility: "steward", source: "you", retention: "untilYouAct" },
  security: { visibility: "steward", source: "automatic", retention: "short" },
  // Stored in the reader's own browser; we cannot read it and never receive it.
  device: { visibility: "private", source: "you", retention: "untilYouAct" },
};

/**
 * The filter chips above the table, in display order. `all` is not a filter —
 * it is the absence of one, which is why it carries no predicate.
 *
 * The value travels in `?filter=` and is therefore part of a shareable URL:
 * these ids are public API and must not be renamed without a redirect.
 */
export const PRIVACY_FILTERS = ["all", "private", "shared", "public", "automatic"] as const;

export type PrivacyFilter = (typeof PRIVACY_FILTERS)[number];

/** Whether a row survives a filter. Pure, and the one definition of the rule —
 *  the server renders every row and the client island hides the rest, so both
 *  sides must agree exactly or a filtered print would disagree with a filtered
 *  screen. */
export function rowMatchesFilter(meta: PrivacyRowMeta, filter: PrivacyFilter): boolean {
  switch (filter) {
    case "all":
      return true;
    case "automatic":
      return meta.source === "automatic";
    default:
      return meta.visibility === filter;
  }
}

/** Narrow an untrusted `?filter=` value. Anything unrecognised reads as `all`:
 *  a hand-edited URL must show the whole table, never an empty one. */
export function parsePrivacyFilter(value: string | null | undefined): PrivacyFilter {
  return (PRIVACY_FILTERS as readonly string[]).includes(value ?? "")
    ? (value as PrivacyFilter)
    : "all";
}

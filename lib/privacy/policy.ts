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

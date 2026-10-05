/**
 * Where a record's values came from (docs/CATALOG-REVIEW.md, Slice 4). Pure.
 *
 * A librarian deciding whether to trust a publisher name needs to know if it
 * was typed from the title page, suggested by Open Library, or is whatever PMB
 * carried. Badges that merely decorate do not help; three facts do: the SOURCE,
 * who ACCEPTED it and when, and whether the value has CHANGED since.
 *
 * Stored in catalog_review_state.field_sources as
 *   { [field]: { source, by, at, hash, host? } }
 * where `hash` is the sha256 of the field's canonical value at the moment it was
 * recorded — so a later edit (here, or in Koha) is visible as "changed since",
 * derived on read, never by a trigger.
 *
 * Nothing here is taken on the browser's word. The editor sends HINTS after a
 * save succeeded; the server keeps a provider credit only when the saved value
 * equals what that provider actually answered (the ISBN cache, or the
 * publisher fetch this server performed), and otherwise credits the librarian.
 */

export const PROVENANCE_FIELDS = [
  "title",
  "author",
  "isbn",
  "publisher",
  "year",
  "language",
  "category",
  "description",
  "keywords",
  "cover",
] as const;
export type ProvenanceField = (typeof PROVENANCE_FIELDS)[number];
export const isProvenanceField = (v: unknown): v is ProvenanceField =>
  typeof v === "string" && (PROVENANCE_FIELDS as readonly string[]).includes(v);

export const PROVENANCE_SOURCES = ["open_library", "google_books", "publisher", "crossref", "librarian"] as const;
export type ProvenanceSource = (typeof PROVENANCE_SOURCES)[number];
export const isProvenanceSource = (v: unknown): v is ProvenanceSource =>
  typeof v === "string" && (PROVENANCE_SOURCES as readonly string[]).includes(v);

export type FieldSourceEntry = {
  source: ProvenanceSource;
  by: string;
  at: string;
  hash: string;
  /** The publisher page's host, when the source is a page. */
  host?: string;
};
export type FieldSources = Partial<Record<ProvenanceField, FieldSourceEntry>>;

/** What the editor sends after a successful save: "this field, this source". */
export type ProvenanceHint = { field: ProvenanceField; source: ProvenanceSource; isbn13?: string | null; host?: string | null };

/** The record's columns the provenance fields read. `cover` is `cover_url`. */
export type ProvenanceRecord = {
  title: string | null;
  author: string | null;
  isbn: string | null;
  publisher: string | null;
  year: number | string | null;
  language: string | null;
  category: string | null;
  description: string | null;
  keywords: readonly string[] | null;
  cover_url: string | null;
};

const tidy = (v: unknown) => (v == null ? "" : String(v)).normalize("NFC").replace(/\s+/g, " ").trim();

/** The canonical text of a field's value — what the hash is taken of. Empty means "no value". */
export function canonicalValue(field: ProvenanceField, record: ProvenanceRecord): string {
  switch (field) {
    case "keywords":
      return (record.keywords ?? []).map(tidy).filter(Boolean).join("\u001f");
    case "cover":
      return tidy(record.cover_url);
    default:
      return tidy(record[field]);
  }
}

export function readFieldSources(raw: unknown): FieldSources {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: FieldSources = {};
  for (const [field, entry] of Object.entries(raw as Record<string, unknown>)) {
    if (!isProvenanceField(field) || !entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    if (!isProvenanceSource(e.source) || typeof e.by !== "string" || typeof e.at !== "string" || typeof e.hash !== "string") continue;
    out[field] = { source: e.source, by: e.by, at: e.at, hash: e.hash, ...(typeof e.host === "string" ? { host: e.host } : {}) };
  }
  return out;
}

/** Validate a hint list from the browser: known fields and sources, one per field, the last one winning. */
export function parseHints(raw: unknown): ProvenanceHint[] {
  if (!Array.isArray(raw)) return [];
  const byField = new Map<ProvenanceField, ProvenanceHint>();
  for (const h of raw.slice(0, PROVENANCE_FIELDS.length * 2)) {
    if (!h || typeof h !== "object") continue;
    const { field, source, isbn13, host } = h as Record<string, unknown>;
    if (!isProvenanceField(field) || !isProvenanceSource(source)) continue;
    byField.set(field, {
      field,
      source,
      isbn13: typeof isbn13 === "string" && /^97[89]\d{10}$/.test(isbn13) ? isbn13 : null,
      host: typeof host === "string" ? host.slice(0, 253) : null,
    });
  }
  return [...byField.values()];
}

// ── Reading it back ───────────────────────────────────────────────────────────

export type ProvenanceState = "imported" | "accepted" | "changed" | "verified";

export type ProvenanceView = {
  field: ProvenanceField;
  /** Where the CURRENT value came from, as far as the record can say. */
  source: ProvenanceSource | "koha" | "elibrary";
  state: ProvenanceState;
  by: string | null;
  at: string | null;
  host: string | null;
  /** For `changed`: where the value that was recorded had come from. */
  previousSource: ProvenanceSource | null;
};

/**
 * One line per field that has a value. `currentHash` is the live value's hash.
 *
 *   • a recorded entry whose hash still matches → that source, "accepted"
 *     (or "verified" if the record is verified and unchanged since);
 *   • a recorded entry whose hash no longer matches → "changed since";
 *   • no entry → the record's origin: Koha for a linked record, the e-Library
 *     otherwise — "imported", because nobody has said anything about it.
 */
export function provenanceView(input: {
  field: ProvenanceField;
  hasValue: boolean;
  currentHash: string;
  entry: FieldSourceEntry | undefined;
  kohaLinked: boolean;
  verifiedAndUnchanged: boolean;
}): ProvenanceView | null {
  if (!input.hasValue) return null;
  const { entry } = input;
  if (entry && entry.hash === input.currentHash) {
    return {
      field: input.field,
      source: entry.source,
      state: input.verifiedAndUnchanged ? "verified" : "accepted",
      by: entry.by,
      at: entry.at,
      host: entry.host ?? null,
      previousSource: null,
    };
  }
  if (entry) {
    return {
      field: input.field,
      source: input.kohaLinked ? "koha" : "elibrary",
      state: "changed",
      by: null,
      at: null,
      host: null,
      previousSource: entry.source,
    };
  }
  return {
    field: input.field,
    source: input.kohaLinked ? "koha" : "elibrary",
    state: input.verifiedAndUnchanged ? "verified" : "imported",
    by: null,
    at: null,
    host: null,
    previousSource: null,
  };
}

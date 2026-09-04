// What a searcher can DO with a result, as one facet value per row.
//
// Six values, three digital and three physical, replacing the per-type
// free text the route used to emit ("Digital" / "Metadata only" /
// "Available" / "On shelf record" / "Guided path"), which meant a "Digital"
// chip could never match a catalog row and the raw strings reached the
// screen untranslated. Every value is derived from a fact the row already
// carries — a file's presence, the download decision the gated route
// itself makes, the catalog's copy counters — never inferred or invented.
//
// Pure and shared by the route (assignment) and the sidebar (labels).

export const AVAILABILITY_VALUES = [
  "downloadable",
  "read_online",
  "metadata_only",
  "physical_available",
  "physical_unavailable",
  "physical_record",
] as const;

export type Availability = (typeof AVAILABILITY_VALUES)[number];

export const DIGITAL_AVAILABILITY: readonly Availability[] = ["downloadable", "read_online", "metadata_only"];
export const PHYSICAL_AVAILABILITY: readonly Availability[] = ["physical_available", "physical_unavailable", "physical_record"];

export function isAvailability(value: string | null | undefined): value is Availability {
  return (AVAILABILITY_VALUES as readonly string[]).includes(value ?? "");
}

/**
 * Digital resources: a file that may be downloaded, a file that may only be
 * read in the viewer, or a record with no file at all.
 */
export function digitalAvailability(input: { hasFile: boolean; canDownload: boolean }): Availability {
  if (!input.hasFile) return "metadata_only";
  return input.canDownload ? "downloadable" : "read_online";
}

/**
 * Physical catalog records, from the denormalised copy counters. A record
 * with no copy data at all is a shelf record, not "unavailable" — the
 * library has not said either way.
 */
export function physicalAvailability(input: { copiesTotal: number | null | undefined; copiesAvailable: number | null | undefined }): Availability {
  const total = input.copiesTotal ?? 0;
  if (total <= 0) return "physical_record";
  return (input.copiesAvailable ?? 0) > 0 ? "physical_available" : "physical_unavailable";
}

/**
 * Legacy facet values still arriving from old links and the advanced-search
 * modal, mapped onto the canonical vocabulary so those URLs keep working.
 */
const LEGACY_AVAILABILITY: Record<string, Availability[]> = {
  digital: ["downloadable", "read_online"],
  downloadable: ["downloadable"],
  "metadata only": ["metadata_only"],
  available: ["physical_available"],
  "available on shelf": ["physical_available"],
  "on shelf record": ["physical_unavailable", "physical_record"],
};

export function canonicalAvailabilitySelection(values: readonly string[]): string[] {
  const out: string[] = [];
  for (const raw of values) {
    const key = raw.trim().toLowerCase().replace(/[_-]+/g, " ");
    const mapped = isAvailability(raw) ? [raw] : (LEGACY_AVAILABILITY[key] ?? [raw]);
    for (const v of mapped) if (!out.includes(v)) out.push(v);
  }
  return out;
}

/**
 * Language values as stored are inconsistent ("English", "en", "Khmer",
 * "kh", "khmer"), so a language facet showed five values for two languages.
 * Folded to the two display names; anything else passes through unchanged.
 */
export function canonicalLanguage(value: string | null | undefined): string | null {
  const v = (value ?? "").trim();
  if (!v) return null;
  const key = v.toLowerCase();
  if (key === "en" || key === "eng" || key === "english") return "English";
  if (key === "km" || key === "kh" || key === "khm" || key === "khmer" || v === "ខ្មែរ") return "Khmer";
  return v;
}

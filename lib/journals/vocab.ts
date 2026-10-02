// Closed vocabularies for the journal profile (migration 0166). Pure and
// browser-safe: the admin form offers exactly these values, the server action
// accepts exactly these values, and the public page names them through the
// `journals` message namespace — so a value can never be stored that the page
// cannot label.
//
// An index describes journals it does not publish (decision 2026-10-02), so
// every list here is about what a READER uses to judge a source.

export const ACCESS_MODELS = ["open", "hybrid", "subscription"] as const;
export type AccessModel = (typeof ACCESS_MODELS)[number];

export const PEER_REVIEW_TYPES = ["double_blind", "single_blind", "open", "editorial"] as const;
export type PeerReviewType = (typeof PEER_REVIEW_TYPES)[number];

export const TITLE_KM_SOURCES = ["official", "library_translation"] as const;
export type TitleKmSource = (typeof TITLE_KM_SOURCES)[number];

export const METADATA_SOURCES = ["manual", "crossref", "issn_portal"] as const;
export type MetadataSource = (typeof METADATA_SOURCES)[number];

/**
 * Abstracting & indexing services a reader in Cambodian teacher education
 * would recognise. Display names are proper nouns and are not translated.
 */
export const INDEX_SERVICES = [
  { id: "scopus", name: "Scopus" },
  { id: "wos_ssci", name: "Web of Science (SSCI)" },
  { id: "wos_scie", name: "Web of Science (SCIE)" },
  { id: "wos_esci", name: "Web of Science (ESCI)" },
  { id: "eric", name: "ERIC" },
  { id: "doaj", name: "DOAJ" },
  { id: "pubmed", name: "PubMed / MEDLINE" },
  { id: "erih_plus", name: "ERIH PLUS" },
  { id: "tci", name: "TCI (Thai-Journal Citation Index)" },
  { id: "aci", name: "ASEAN Citation Index" },
  { id: "google_scholar", name: "Google Scholar" },
] as const;
export type IndexServiceId = (typeof INDEX_SERVICES)[number]["id"];
const INDEX_IDS = new Set<string>(INDEX_SERVICES.map((s) => s.id));

export function indexServiceName(id: string): string | null {
  return INDEX_SERVICES.find((s) => s.id === id)?.name ?? null;
}

/** Licences a journal states as its default. `null` license = not stated. */
export const LICENSES = [
  { id: "CC-BY-4.0", name: "CC BY 4.0" },
  { id: "CC-BY-SA-4.0", name: "CC BY-SA 4.0" },
  { id: "CC-BY-NC-4.0", name: "CC BY-NC 4.0" },
  { id: "CC-BY-NC-SA-4.0", name: "CC BY-NC-SA 4.0" },
  { id: "CC-BY-ND-4.0", name: "CC BY-ND 4.0" },
  { id: "CC-BY-NC-ND-4.0", name: "CC BY-NC-ND 4.0" },
  { id: "CC0-1.0", name: "CC0 1.0" },
  { id: "publisher", name: "" }, // "Publisher's own terms" — labelled through messages
] as const;
const LICENSE_IDS = new Set<string>(LICENSES.map((l) => l.id));

/** Display name of a licence id; the publisher-terms entry is translated by the caller. */
export function licenseName(id: string): string | null {
  const hit = LICENSES.find((l) => l.id === id);
  return hit && hit.name ? hit.name : null;
}

/** Publication frequency codes. Free text already stored is shown as typed. */
export const FREQUENCIES = [
  "annual",
  "semiannual",
  "triannual",
  "quarterly",
  "bimonthly",
  "monthly",
  "semimonthly",
  "weekly",
  "continuous",
  "irregular",
] as const;
export type Frequency = (typeof FREQUENCIES)[number];

/**
 * A stored frequency as a vocabulary code: the code itself, or legacy free
 * text that names one ("Monthly", "Bi-monthly", "Twice a year"). Null when the
 * text is something the vocabulary cannot name — the caller shows it as typed.
 */
export function frequencyCode(value: string | null | undefined): Frequency | null {
  if (!value) return null;
  const v = value.trim().toLowerCase().replace(/[\s_-]+/g, "");
  const aliases: Record<string, Frequency> = {
    annual: "annual",
    annually: "annual",
    yearly: "annual",
    semiannual: "semiannual",
    semiannually: "semiannual",
    biannual: "semiannual",
    biannually: "semiannual",
    twiceayear: "semiannual",
    triannual: "triannual",
    threetimesayear: "triannual",
    quarterly: "quarterly",
    bimonthly: "bimonthly",
    monthly: "monthly",
    semimonthly: "semimonthly",
    twiceamonth: "semimonthly",
    weekly: "weekly",
    continuous: "continuous",
    continuouspublication: "continuous",
    rolling: "continuous",
    irregular: "irregular",
  };
  return aliases[v] ?? null;
}

/**
 * Countries as ISO 3166-1 alpha-2 codes, the journals' likely origins first.
 * Names come from Intl.DisplayNames in the reader's language.
 */
export const COUNTRY_CODES = [
  "KH", "TH", "VN", "LA", "MY", "SG", "ID", "PH", "MM", "BN",
  "CN", "JP", "KR", "TW", "HK", "IN", "AU", "NZ",
  "US", "CA", "GB", "IE", "DE", "FR", "NL", "CH", "SE", "ES", "IT",
] as const;

/** Legacy free-text country names already stored, mapped to their code. */
const COUNTRY_ALIASES: Record<string, string> = {
  "united states": "US",
  "united states of america": "US",
  usa: "US",
  "united kingdom": "GB",
  uk: "GB",
  cambodia: "KH",
  thailand: "TH",
  vietnam: "VN",
  "viet nam": "VN",
  singapore: "SG",
  malaysia: "MY",
  japan: "JP",
  china: "CN",
  australia: "AU",
  netherlands: "NL",
  germany: "DE",
};

/** A stored country as an ISO code when it is one or names one; else null. */
export function countryCode(value: string | null | undefined): string | null {
  if (!value) return null;
  const v = value.trim();
  if (/^[A-Za-z]{2}$/.test(v)) return v.toUpperCase();
  return COUNTRY_ALIASES[v.toLowerCase()] ?? null;
}

/** A country for display: an ISO code is named in the reader's language; other text is shown as typed. */
export function countryName(value: string | null | undefined, locale: string): string | null {
  if (!value?.trim()) return null;
  const code = countryCode(value);
  if (!code) return value.trim();
  try {
    return new Intl.DisplayNames([locale === "km" ? "km" : "en"], { type: "region" }).of(code) ?? value;
  } catch {
    return value;
  }
}

/** Languages a journal is published in, as BCP-47 primary codes. */
export const LANGUAGE_CODES = ["en", "km", "th", "vi", "fr", "zh", "ja", "ko", "id", "ms", "de", "es"] as const;

export const isAccessModel = (v: unknown): v is AccessModel => typeof v === "string" && (ACCESS_MODELS as readonly string[]).includes(v);
export const isPeerReviewType = (v: unknown): v is PeerReviewType =>
  typeof v === "string" && (PEER_REVIEW_TYPES as readonly string[]).includes(v);
export const isTitleKmSource = (v: unknown): v is TitleKmSource =>
  typeof v === "string" && (TITLE_KM_SOURCES as readonly string[]).includes(v);
export const isMetadataSource = (v: unknown): v is MetadataSource =>
  typeof v === "string" && (METADATA_SOURCES as readonly string[]).includes(v);
export const isIndexServiceId = (v: unknown): v is IndexServiceId => typeof v === "string" && INDEX_IDS.has(v);
export const isLicenseId = (v: unknown): v is string => typeof v === "string" && LICENSE_IDS.has(v);

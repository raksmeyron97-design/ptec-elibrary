// lib/theses/license.ts
//
// A thesis licence is stored as a code (migration 0062's CHECK list) and was
// printed as one: "cc_by_nc" in the record's Publication details. The reader-
// facing words already exist, translated, under `trust.license.*` (the same
// strings <LicenseBadge> uses); this module supplies the one thing those
// strings lack — where the licence's own terms live — and decides which
// values are a claim at all.
//
// Pure and browser-safe.

export const LICENSE_CODES = [
  "public_domain",
  "cc_by",
  "cc_by_nc",
  "cc_by_nc_nd",
  "moeys_open",
  "all_rights_reserved",
] as const;

export type LicenseCode = (typeof LICENSE_CODES)[number];

/** The licence's own terms. MoEYS Open has no canonical public deed, so it
 *  links nowhere rather than somewhere approximate. */
const LICENSE_URLS: Record<LicenseCode, string | null> = {
  public_domain: "https://creativecommons.org/publicdomain/mark/1.0/",
  cc_by: "https://creativecommons.org/licenses/by/4.0/",
  cc_by_nc: "https://creativecommons.org/licenses/by-nc/4.0/",
  cc_by_nc_nd: "https://creativecommons.org/licenses/by-nc-nd/4.0/",
  moeys_open: null,
  all_rights_reserved: "https://rightsstatements.org/vocab/InC/1.0/",
};

/**
 * The licence a reader may be told about, or null.
 *
 * `unknown` (the column default) and anything outside the CHECK list are null:
 * a reader deciding whether they may reuse a work reads "License not
 * specified" as an answer, when it is the absence of one. The row is omitted
 * instead.
 */
export function thesisLicense(raw: unknown): { code: LicenseCode; url: string | null } | null {
  const code = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (!(LICENSE_CODES as readonly string[]).includes(code)) return null;
  return { code: code as LicenseCode, url: LICENSE_URLS[code as LicenseCode] };
}

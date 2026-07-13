// Pure, browser-safe validators + normalizers for academic identifiers
// (DOI, ORCID, ISBN, ISSN) and open-content licenses. No server-only imports,
// so every function is unit-testable without a database
// (lib/seo/identifiers.test.ts).
//
// Why this exists: placeholder / malformed identifiers must NEVER reach
// structured data (JSON-LD) or Highwire `citation_*` meta. Emitting a fake DOI
// like `10.1234/eds`, a fake ORCID like `001`, or a license string like
// `CC BY 44` is worse than emitting nothing — it misattributes a canonical
// academic identity and can be penalised by scholarly indexes. These builders
// return `null` for anything not provably valid, and the SEO builders omit the
// field entirely in that case.

// ── DOI ──────────────────────────────────────────────────────────────────────

/** Registrant prefixes used by obvious placeholder/example DOIs. `10.1234` and
 *  `10.5555` are the canonical "example DOI" prefixes; we reject them outright
 *  so a copied template value can never masquerade as a real registration. */
const PLACEHOLDER_DOI_PREFIXES = ["10.1234/", "10.5555/", "10.0000/"];

/** Structural DOI syntax: `10.<registrant>/<suffix>` (Crossref/DataCite form).
 *  Registrant is 4+ digits (optionally dotted); suffix is any non-space run. */
const DOI_RE = /^10\.\d{4,9}(?:\.\d+)*\/\S+$/;

/**
 * Normalize a DOI to its bare `10.x/x` form, stripping any `https://doi.org/`,
 * `doi:` prefix and surrounding whitespace. Returns null when the value is
 * missing, structurally invalid, or a known placeholder — callers then omit
 * the identifier entirely rather than publishing a fake one.
 */
export function normalizeDoi(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let doi = raw.trim();
  if (!doi) return null;
  // Strip common resolver prefixes.
  doi = doi
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "")
    .replace(/^doi:\s*/i, "")
    .trim();
  const lower = doi.toLowerCase();
  if (PLACEHOLDER_DOI_PREFIXES.some((p) => lower.startsWith(p))) return null;
  if (!DOI_RE.test(doi)) return null;
  return doi;
}

export function isValidDoi(raw: string | null | undefined): boolean {
  return normalizeDoi(raw) !== null;
}

/** Canonical resolvable URL for a DOI, or null when the DOI is not valid. */
export function doiUrl(raw: string | null | undefined): string | null {
  const doi = normalizeDoi(raw);
  return doi ? `https://doi.org/${doi}` : null;
}

// ── ORCID ────────────────────────────────────────────────────────────────────

/** ORCID iDs are 16 digits grouped in 4s; the final "digit" may be `X`
 *  (representing checksum value 10). Full form: 0000-0002-1825-0097. */
const ORCID_DIGITS_RE = /^\d{15}[\dX]$/;

/**
 * Validate an ORCID including its ISO 7064 MOD 11-2 checksum, then return it in
 * canonical `0000-0002-1825-0097` grouping. Accepts input with or without the
 * `https://orcid.org/` prefix and with or without hyphens. Returns null for
 * anything that fails the format or checksum (e.g. `001`, `0000-0000-0000-0000`
 * is technically valid-checksum but is the "null" ORCID and rejected).
 */
export function normalizeOrcid(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const stripped = raw
    .trim()
    .replace(/^https?:\/\/orcid\.org\//i, "")
    .replace(/[\s-]/g, "")
    .toUpperCase();
  if (!ORCID_DIGITS_RE.test(stripped)) return null;
  // The all-zero ORCID never gets assigned — treat it as a placeholder.
  if (stripped === "0000000000000000") return null;

  // ISO 7064 MOD 11-2 checksum over the first 15 digits.
  let total = 0;
  for (let i = 0; i < 15; i++) {
    total = (total + Number(stripped[i])) * 2;
  }
  const remainder = total % 11;
  const computed = (12 - remainder) % 11;
  const checkChar = computed === 10 ? "X" : String(computed);
  if (checkChar !== stripped[15]) return null;

  return `${stripped.slice(0, 4)}-${stripped.slice(4, 8)}-${stripped.slice(8, 12)}-${stripped.slice(12, 16)}`;
}

export function isValidOrcid(raw: string | null | undefined): boolean {
  return normalizeOrcid(raw) !== null;
}

/** Canonical orcid.org URL, or null when invalid. */
export function orcidUrl(raw: string | null | undefined): string | null {
  const orcid = normalizeOrcid(raw);
  return orcid ? `https://orcid.org/${orcid}` : null;
}

// ── ISBN ─────────────────────────────────────────────────────────────────────

/** Validate + normalize an ISBN-10 or ISBN-13 (checksum-verified), returning
 *  the hyphen-stripped canonical digits. Returns null on bad checksum/format.
 *  "N/A" and other sentinels fail naturally. */
export function normalizeIsbn(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.replace(/[\s-]/g, "").toUpperCase();
  if (/^\d{9}[\dX]$/.test(s)) {
    // ISBN-10: weighted 10..1, mod 11, X = 10.
    let sum = 0;
    for (let i = 0; i < 9; i++) sum += (10 - i) * Number(s[i]);
    const last = s[9] === "X" ? 10 : Number(s[9]);
    sum += last;
    return sum % 11 === 0 ? s : null;
  }
  if (/^\d{13}$/.test(s)) {
    // ISBN-13: alternating 1/3 weights, mod 10.
    let sum = 0;
    for (let i = 0; i < 12; i++) sum += (i % 2 === 0 ? 1 : 3) * Number(s[i]);
    const check = (10 - (sum % 10)) % 10;
    return check === Number(s[12]) ? s : null;
  }
  return null;
}

export function isValidIsbn(raw: string | null | undefined): boolean {
  return normalizeIsbn(raw) !== null;
}

// ── ISSN ─────────────────────────────────────────────────────────────────────

/** Validate + normalize an ISSN (8 chars, last may be X) with its mod-11
 *  checksum, returning canonical `NNNN-NNNC` form. Null on bad checksum. */
export function normalizeIssn(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.replace(/[\s-]/g, "").toUpperCase();
  if (!/^\d{7}[\dX]$/.test(s)) return null;
  let sum = 0;
  for (let i = 0; i < 7; i++) sum += (8 - i) * Number(s[i]);
  const remainder = sum % 11;
  const computed = (11 - remainder) % 11;
  const checkChar = computed === 10 ? "X" : String(computed);
  if (checkChar !== s[7]) return null;
  return `${s.slice(0, 4)}-${s.slice(4, 8)}`;
}

export function isValidIssn(raw: string | null | undefined): boolean {
  return normalizeIssn(raw) !== null;
}

// ── Licenses ─────────────────────────────────────────────────────────────────

export type LicenseInfo = {
  /** Human label, e.g. "CC BY 4.0". */
  name: string;
  /** Canonical deed URL. */
  url: string;
  /** True when the license permits free redistribution of the full text. */
  redistributable: boolean;
};

/** Known Creative Commons versions we can resolve to a canonical deed URL. */
const CC_VERSIONS = new Set(["1.0", "2.0", "2.5", "3.0", "4.0"]);
const CC_VARIANTS: Record<string, { label: string; redistributable: boolean }> = {
  by: { label: "CC BY", redistributable: true },
  "by-sa": { label: "CC BY-SA", redistributable: true },
  "by-nd": { label: "CC BY-ND", redistributable: true },
  "by-nc": { label: "CC BY-NC", redistributable: true },
  "by-nc-sa": { label: "CC BY-NC-SA", redistributable: true },
  "by-nc-nd": { label: "CC BY-NC-ND", redistributable: true },
};

/**
 * Resolve a license string to a canonical {name, url, redistributable}, or null
 * when the value is missing, malformed (e.g. `CC BY 44`), or an unrecognised
 * bespoke string. A null result means "no VERIFIED open license" — callers must
 * NOT then claim open access or emit a `license` field. Full public-domain
 * markers (CC0 / public domain) are recognised too.
 */
export function normalizeLicense(raw: string | null | undefined): LicenseInfo | null {
  if (!raw) return null;
  const value = raw.trim();
  if (!value) return null;

  // An already-canonical creativecommons.org URL passes straight through.
  const urlMatch = value.match(
    /creativecommons\.org\/(licenses|publicdomain)\/([a-z-]+)(?:\/(\d\.\d))?/i,
  );
  if (urlMatch) {
    const kind = urlMatch[2].toLowerCase();
    if (kind === "zero") {
      return { name: "CC0 1.0", url: "https://creativecommons.org/publicdomain/zero/1.0/", redistributable: true };
    }
    const variant = CC_VARIANTS[kind];
    const version = urlMatch[3] && CC_VERSIONS.has(urlMatch[3]) ? urlMatch[3] : "4.0";
    if (variant) {
      return {
        name: `${variant.label} ${version}`,
        url: `https://creativecommons.org/licenses/${kind}/${version}/`,
        redistributable: variant.redistributable,
      };
    }
  }

  const normalized = value.toLowerCase().replace(/[\s_]+/g, "-");

  if (/^(cc0|cc-0|public-domain|pdm)/.test(normalized)) {
    return { name: "CC0 1.0", url: "https://creativecommons.org/publicdomain/zero/1.0/", redistributable: true };
  }

  // "cc-by-4.0", "cc-by-nc-sa-3.0", "cc-by" (defaults to 4.0). The version must
  // be a REAL CC version — `cc-by-44` yields no version match and is rejected.
  const ccMatch = normalized.match(/^cc-((?:by)(?:-(?:sa|nd|nc|nc-sa|nc-nd))?)(?:-(\d\.\d))?$/);
  if (ccMatch) {
    const variant = CC_VARIANTS[ccMatch[1]];
    // If a version token was present it must be valid; a trailing garbage token
    // (e.g. "44" → "-44" which is not \d\.\d) fails the regex above already.
    const version = ccMatch[2];
    if (variant && (!version || CC_VERSIONS.has(version))) {
      const v = version ?? "4.0";
      return {
        name: `${variant.label} ${v}`,
        url: `https://creativecommons.org/licenses/${ccMatch[1]}/${v}/`,
        redistributable: variant.redistributable,
      };
    }
    return null;
  }

  return null;
}

export function isRedistributableLicense(raw: string | null | undefined): boolean {
  return normalizeLicense(raw)?.redistributable ?? false;
}

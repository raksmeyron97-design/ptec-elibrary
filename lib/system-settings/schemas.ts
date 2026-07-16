// lib/system-settings/schemas.ts
//
// Hand-rolled, dependency-free validators for every settings section — the
// project's convention (server actions validate with explicit field checks,
// no schema library). Pure and client-safe: the admin forms reuse them for
// inline feedback, but the SERVER ACTION run is the one that counts.
//
// Every validator:
//   • accepts `unknown` and returns a fully-typed, NORMALIZED document
//     (trimmed strings, canonical phone formatting) — never a raw echo,
//   • collects ALL field errors with dot-paths so the UI can point at inputs,
//   • rejects unsafe values (non-https URLs, javascript: schemes, malformed
//     hours) regardless of what the client claimed.

import {
  SETTING_SECTIONS,
  type AnySectionDoc,
  type ContactSettings,
  type FieldError,
  type HoursClosure,
  type HoursInterval,
  type HoursSettings,
  type LinksSettings,
  type OrganizationSettings,
  type SectionDocMap,
  type SeoSettings,
  type SettingSection,
  type ValidationResult,
} from "./types";

// ── Primitive helpers ────────────────────────────────────────────────────────

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

class Collector {
  errors: FieldError[] = [];

  fail(path: string, message: string): void {
    this.errors.push({ path, message });
  }

  /** Required trimmed string with a max length. Returns "" on failure. */
  str(
    obj: Record<string, unknown>,
    key: string,
    path: string,
    { required = true, max = 500 }: { required?: boolean; max?: number } = {},
  ): string {
    const raw = obj[key];
    if (raw == null || raw === "") {
      if (required) this.fail(path, "This field is required.");
      return "";
    }
    if (typeof raw !== "string") {
      this.fail(path, "Must be text.");
      return "";
    }
    const value = raw.trim();
    if (required && !value) this.fail(path, "This field is required.");
    if (value.length > max) this.fail(path, `Must be ${max} characters or fewer.`);
    return value;
  }
}

export function isSettingSection(v: unknown): v is SettingSection {
  return typeof v === "string" && (SETTING_SECTIONS as readonly string[]).includes(v);
}

// ── Phone (Cambodia) ─────────────────────────────────────────────────────────

/** Digits only, e.g. "092 788 990" → "092788990". */
export function phoneDigits(display: string): string {
  return display.replace(/\D/g, "");
}

/**
 * Validate a Cambodian phone number in local display form ("092 788 990" or
 * "+855 92 788 990"). Returns the canonical local display ("0XX XXX XXX(X)")
 * or null when invalid.
 */
export function normalizeKhPhone(input: string): string | null {
  let digits = phoneDigits(input);
  if (digits.startsWith("855")) digits = `0${digits.slice(3)}`;
  // Cambodian numbers: leading 0 + 8 or 9 further digits.
  if (!/^0\d{8,9}$/.test(digits)) return null;
  const rest = digits.slice(1);
  // Group as 0XX XXX XXX / 0XX XXX XXXX (matches the site's existing style).
  return `0${rest.slice(0, 2)} ${rest.slice(2, 5)} ${rest.slice(5)}`;
}

/** "092 788 990" → "tel:+85592788990". Input must already be normalized. */
export function phoneToTel(display: string): string {
  return `tel:+855${phoneDigits(display).replace(/^0/, "")}`;
}

/** "092 788 990" → "(+855) 92 788 990" (international display format). */
export function phoneToIntlDisplay(display: string): string {
  const rest = phoneDigits(display).replace(/^0/, "");
  return `(+855) ${rest.slice(0, 2)} ${rest.slice(2, 5)} ${rest.slice(5)}`;
}

// ── Email / URL ──────────────────────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function isValidEmail(v: string): boolean {
  return EMAIL_RE.test(v) && v.length <= 254;
}

/**
 * A safe external URL: parseable, https-only (no javascript:, data:, http:),
 * with a real hostname. Used for every admin-supplied link.
 */
export function isSafeHttpsUrl(v: string): boolean {
  if (v.length > 2000) return false;
  let url: URL;
  try {
    url = new URL(v);
  } catch {
    return false;
  }
  return url.protocol === "https:" && url.hostname.includes(".");
}

/** Google Maps embed src must stay on google.com/maps/embed — the only host
 *  the footer/contact iframes are allowed to load. */
export function isGoogleMapsEmbedUrl(v: string): boolean {
  if (!isSafeHttpsUrl(v)) return false;
  const url = new URL(v);
  return (
    (url.hostname === "www.google.com" || url.hostname === "google.com") &&
    url.pathname.startsWith("/maps/embed")
  );
}

// ── Hours primitives ─────────────────────────────────────────────────────────

const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const ISO_DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

export function hhmmToMinutes(v: string): number {
  const [h, m] = v.split(":").map(Number);
  return h * 60 + m;
}

// ── Section validators ───────────────────────────────────────────────────────

function localized(
  c: Collector,
  obj: Record<string, unknown>,
  key: string,
  path: string,
  { max = 500, requiredKm = true }: { max?: number; requiredKm?: boolean } = {},
): { en: string; km: string } {
  const nested = isRecord(obj[key]) ? (obj[key] as Record<string, unknown>) : {};
  if (!isRecord(obj[key])) c.fail(path, "Missing translated value.");
  return {
    en: c.str(nested, "en", `${path}.en`, { max }),
    km: c.str(nested, "km", `${path}.km`, { max, required: requiredKm }),
  };
}

export function validateOrganization(input: unknown): ValidationResult<OrganizationSettings> {
  const c = new Collector();
  const obj = isRecord(input) ? input : {};
  if (!isRecord(input)) c.fail("", "Invalid document.");

  const nameObj = isRecord(obj.name) ? (obj.name as Record<string, unknown>) : {};
  if (!isRecord(obj.name)) c.fail("name", "Missing institution name.");

  const value: OrganizationSettings = {
    name: {
      en: c.str(nameObj, "en", "name.en", { max: 160 }),
      km: c.str(nameObj, "km", "name.km", { max: 160 }),
      short: c.str(nameObj, "short", "name.short", { max: 24 }),
    },
    libraryName: localized(c, obj, "libraryName", "libraryName", { max: 160 }),
  };

  return c.errors.length ? { ok: false, errors: c.errors } : { ok: true, value };
}

export function validateContact(input: unknown): ValidationResult<ContactSettings> {
  const c = new Collector();
  const obj = isRecord(input) ? input : {};
  if (!isRecord(input)) c.fail("", "Invalid document.");

  const phoneRaw = c.str(obj, "phone", "phone", { max: 32 });
  const phone = phoneRaw ? normalizeKhPhone(phoneRaw) : null;
  if (phoneRaw && !phone) {
    c.fail("phone", "Enter a valid Cambodian phone number (e.g. 092 788 990).");
  }

  const phoneLibraryRaw = c.str(obj, "phoneLibrary", "phoneLibrary", { max: 32 });
  const phoneLibrary = phoneLibraryRaw ? normalizeKhPhone(phoneLibraryRaw) : null;
  if (phoneLibraryRaw && !phoneLibrary) {
    c.fail("phoneLibrary", "Enter a valid Cambodian phone number.");
  }

  const email = c.str(obj, "email", "email", { max: 254 });
  if (email && !isValidEmail(email)) c.fail("email", "Enter a valid email address.");

  const emailInternational = c.str(obj, "emailInternational", "emailInternational", {
    max: 254,
    required: false,
  });
  if (emailInternational && !isValidEmail(emailInternational)) {
    c.fail("emailInternational", "Enter a valid email address.");
  }

  const addrObj = isRecord(obj.address) ? (obj.address as Record<string, unknown>) : {};
  if (!isRecord(obj.address)) c.fail("address", "Missing address.");
  const country = c.str(addrObj, "country", "address.country", { max: 2 }).toUpperCase();
  if (country && !/^[A-Z]{2}$/.test(country)) {
    c.fail("address.country", "Use a 2-letter country code (e.g. KH).");
  }
  const postalCode = c.str(addrObj, "postalCode", "address.postalCode", {
    max: 12,
    required: false,
  });
  if (postalCode && !/^[0-9A-Za-z -]{3,12}$/.test(postalCode)) {
    c.fail("address.postalCode", "Enter a valid postal code.");
  }

  const value: ContactSettings = {
    phone: phone ?? "",
    phoneLibrary: phoneLibrary ?? "",
    email,
    emailInternational,
    address: {
      en: c.str(addrObj, "en", "address.en", { max: 300 }),
      km: c.str(addrObj, "km", "address.km", { max: 300 }),
      streetAddress: c.str(addrObj, "streetAddress", "address.streetAddress", { max: 160 }),
      city: c.str(addrObj, "city", "address.city", { max: 80 }),
      country,
      postalCode,
    },
  };

  return c.errors.length ? { ok: false, errors: c.errors } : { ok: true, value };
}

export function validateHours(input: unknown): ValidationResult<HoursSettings> {
  const c = new Collector();
  const obj = isRecord(input) ? input : {};
  if (!isRecord(input)) c.fail("", "Invalid document.");

  const weeklyRaw = isRecord(obj.weekly) ? (obj.weekly as Record<string, unknown>) : {};
  if (!isRecord(obj.weekly)) c.fail("weekly", "Missing weekly schedule.");

  const weekly: Record<string, HoursInterval[]> = {};
  let anyOpenDay = false;
  for (let day = 0; day <= 6; day++) {
    const key = String(day);
    const raw = weeklyRaw[key];
    const list: HoursInterval[] = [];
    if (raw != null) {
      if (!Array.isArray(raw)) {
        c.fail(`weekly.${key}`, "Invalid day schedule.");
      } else {
        raw.forEach((item, i) => {
          const path = `weekly.${key}.${i}`;
          if (!isRecord(item)) {
            c.fail(path, "Invalid interval.");
            return;
          }
          const open = typeof item.open === "string" ? item.open.trim() : "";
          const close = typeof item.close === "string" ? item.close.trim() : "";
          if (!HHMM_RE.test(open)) {
            c.fail(`${path}.open`, "Use 24-hour HH:MM time (e.g. 07:00).");
            return;
          }
          if (!HHMM_RE.test(close)) {
            c.fail(`${path}.close`, "Use 24-hour HH:MM time (e.g. 17:00).");
            return;
          }
          if (hhmmToMinutes(close) <= hhmmToMinutes(open)) {
            c.fail(`${path}.close`, "Closing time must be after opening time.");
            return;
          }
          list.push({ open, close });
        });
      }
    }
    // Sort + overlap check so "07:00-12:00, 11:00-17:00" is rejected.
    list.sort((a, b) => hhmmToMinutes(a.open) - hhmmToMinutes(b.open));
    for (let i = 1; i < list.length; i++) {
      if (hhmmToMinutes(list[i].open) < hhmmToMinutes(list[i - 1].close)) {
        c.fail(`weekly.${key}`, "Opening intervals must not overlap.");
        break;
      }
    }
    if (list.length > 0) anyOpenDay = true;
    weekly[key] = list;
  }
  if (!anyOpenDay && !c.errors.length) {
    c.fail("weekly", "At least one day must have opening hours.");
  }

  const closuresRaw = obj.closures;
  const closures: HoursClosure[] = [];
  if (closuresRaw != null) {
    if (!Array.isArray(closuresRaw)) {
      c.fail("closures", "Invalid closures list.");
    } else {
      if (closuresRaw.length > 50) c.fail("closures", "Too many closure entries (max 50).");
      closuresRaw.slice(0, 50).forEach((item, i) => {
        const path = `closures.${i}`;
        if (!isRecord(item)) {
          c.fail(path, "Invalid closure entry.");
          return;
        }
        const from = typeof item.from === "string" ? item.from.trim() : "";
        const to = typeof item.to === "string" ? item.to.trim() : "";
        if (!ISO_DATE_RE.test(from)) {
          c.fail(`${path}.from`, "Use a valid date (YYYY-MM-DD).");
          return;
        }
        if (!ISO_DATE_RE.test(to)) {
          c.fail(`${path}.to`, "Use a valid date (YYYY-MM-DD).");
          return;
        }
        if (to < from) {
          c.fail(`${path}.to`, "End date must not be before the start date.");
          return;
        }
        const reason = localized(c, item, "reason", `${path}.reason`, { max: 200 });
        closures.push({ from, to, reason });
      });
    }
  }
  closures.sort((a, b) => (a.from < b.from ? -1 : 1));

  const value: HoursSettings = { weekly, closures };
  return c.errors.length ? { ok: false, errors: c.errors } : { ok: true, value };
}

export function validateLinks(input: unknown): ValidationResult<LinksSettings> {
  const c = new Collector();
  const obj = isRecord(input) ? input : {};
  if (!isRecord(input)) c.fail("", "Invalid document.");

  const url = (key: keyof LinksSettings, required: boolean): string => {
    const v = c.str(obj, key, key, { max: 2000, required });
    if (v && !isSafeHttpsUrl(v)) {
      c.fail(key, "Enter a valid https:// URL.");
      return "";
    }
    return v;
  };

  const mapEmbed = c.str(obj, "mapEmbed", "mapEmbed", { max: 2000, required: false });
  if (mapEmbed && !isGoogleMapsEmbedUrl(mapEmbed)) {
    c.fail("mapEmbed", "Must be a https://www.google.com/maps/embed?… URL.");
  }

  const value: LinksSettings = {
    website: url("website", true),
    facebook: url("facebook", true),
    messenger: url("messenger", false),
    youtube: url("youtube", false),
    telegram: url("telegram", false),
    mapPlace: url("mapPlace", true),
    mapEmbed: mapEmbed && isGoogleMapsEmbedUrl(mapEmbed) ? mapEmbed : "",
  };

  return c.errors.length ? { ok: false, errors: c.errors } : { ok: true, value };
}

export function validateSeo(input: unknown): ValidationResult<SeoSettings> {
  const c = new Collector();
  const obj = isRecord(input) ? input : {};
  if (!isRecord(input)) c.fail("", "Invalid document.");

  const siteTitle = c.str(obj, "siteTitle", "siteTitle", { max: 70 });
  const titleTemplate = c.str(obj, "titleTemplate", "titleTemplate", { max: 70 });
  if (titleTemplate && !titleTemplate.includes("%s")) {
    c.fail("titleTemplate", 'The template must contain "%s" (the page title placeholder).');
  }
  const siteName = c.str(obj, "siteName", "siteName", { max: 70 });

  const descObj = isRecord(obj.siteDescription)
    ? (obj.siteDescription as Record<string, unknown>)
    : {};
  if (!isRecord(obj.siteDescription)) c.fail("siteDescription", "Missing description.");
  const descEn = c.str(descObj, "en", "siteDescription.en", { max: 300 });
  const descKm = c.str(descObj, "km", "siteDescription.km", { max: 300, required: false });

  const value: SeoSettings = {
    siteTitle,
    titleTemplate,
    siteName,
    siteDescription: { en: descEn, km: descKm },
  };

  return c.errors.length ? { ok: false, errors: c.errors } : { ok: true, value };
}

/** Dispatch: validate + normalize a section document of unknown provenance. */
export function validateSectionDoc<S extends SettingSection>(
  section: S,
  input: unknown,
): ValidationResult<SectionDocMap[S]> {
  switch (section) {
    case "organization":
      return validateOrganization(input) as ValidationResult<SectionDocMap[S]>;
    case "contact":
      return validateContact(input) as ValidationResult<SectionDocMap[S]>;
    case "hours":
      return validateHours(input) as ValidationResult<SectionDocMap[S]>;
    case "links":
      return validateLinks(input) as ValidationResult<SectionDocMap[S]>;
    case "seo":
      return validateSeo(input) as ValidationResult<SectionDocMap[S]>;
    default:
      return { ok: false, errors: [{ path: "", message: "Unknown section." }] };
  }
}

// ── Change summaries ─────────────────────────────────────────────────────────

/**
 * Dot-paths whose leaf values differ between two documents (either direction).
 * Powers the version history "what changed" summary and the publish diff.
 */
export function diffPaths(a: unknown, b: unknown, prefix = ""): string[] {
  if (Object.is(a, b)) return [];
  const aObj = isRecord(a) || Array.isArray(a);
  const bObj = isRecord(b) || Array.isArray(b);
  if (!aObj || !bObj) {
    // Leaf mismatch (includes type changes and array-vs-object).
    if (JSON.stringify(a) === JSON.stringify(b)) return [];
    return [prefix || "(root)"];
  }
  const keys = new Set([
    ...Object.keys(a as object),
    ...Object.keys(b as object),
  ]);
  const out: string[] = [];
  for (const key of keys) {
    const path = prefix ? `${prefix}.${key}` : key;
    out.push(
      ...diffPaths(
        (a as Record<string, unknown>)[key],
        (b as Record<string, unknown>)[key],
        path,
      ),
    );
  }
  return out;
}

/** True when the document differs from the published one (draft is dirty). */
export function docsEqual(a: AnySectionDoc, b: AnySectionDoc): boolean {
  return diffPaths(a, b).length === 0;
}

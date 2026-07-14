/**
 * Download Access Profile — shared constants, option lists and the pure
 * completeness calculator. No "server-only" guard: the Settings form (client)
 * imports the option lists and field labels from here, while the server uses
 * `computeDownloadProfileStatus` from `lib/profile/download-profile.ts`.
 *
 * Stable internal enum VALUES live here; their bilingual display labels are
 * resolved through next-intl in the UI (never hard-code the label).
 */

/** Reader profile columns that must be filled before a gated download. */
export const REQUIRED_DOWNLOAD_PROFILE_FIELDS = [
  "full_name",
  "gender",
  "phone",
  "institution_name",
  "institution_type",
  "faculty_department",
  "professional_role",
  "country",
  "download_purpose",
] as const;

export type DownloadProfileField =
  | (typeof REQUIRED_DOWNLOAD_PROFILE_FIELDS)[number]
  | "download_purpose_other"
  | "responsible_use_accepted_at"
  | "download_privacy_consent_at";

/** Shape read from `profiles` for completeness + prefill. */
export type DownloadProfileRow = {
  full_name: string | null;
  gender: string | null;
  phone: string | null;
  institution_name: string | null;
  institution_type: string | null;
  faculty_department: string | null;
  professional_role: string | null;
  country: string | null;
  province_city: string | null;
  student_staff_id: string | null;
  download_purpose: string | null;
  download_purpose_other: string | null;
  responsible_use_accepted_at: string | null;
  download_privacy_consent_at: string | null;
  download_profile_updated_at: string | null;
};

export type DownloadProfileStatus = {
  complete: boolean;
  /** Stable field keys (not labels) so callers can translate + deep-link. */
  missingFields: DownloadProfileField[];
  updatedAt: string | null;
  /** 0–100, rounded — for the completion indicator (never misleading). */
  percent: number;
};

const isBlank = (v: unknown): boolean =>
  v == null || (typeof v === "string" && v.trim() === "");

/**
 * Pure, deterministic completeness check. The single source of truth used by
 * the permission engine, the download route, the status endpoint and the
 * Settings UI — completeness is ALWAYS computed on the server from the
 * canonical row, never trusted from a client `profileComplete: true` flag.
 */
export function computeDownloadProfileStatus(
  row: Partial<DownloadProfileRow> | null | undefined,
): DownloadProfileStatus {
  const missing: DownloadProfileField[] = [];

  for (const field of REQUIRED_DOWNLOAD_PROFILE_FIELDS) {
    if (isBlank(row?.[field])) missing.push(field);
  }
  // "Other" purpose requires the free-text detail.
  if (row?.download_purpose === "other" && isBlank(row?.download_purpose_other)) {
    missing.push("download_purpose_other");
  }
  // Consent gates — timestamps must be present.
  if (isBlank(row?.responsible_use_accepted_at)) missing.push("responsible_use_accepted_at");
  if (isBlank(row?.download_privacy_consent_at)) missing.push("download_privacy_consent_at");

  // Denominator is the fixed required set (+2 consents) so the percentage is
  // stable and honest regardless of the conditional "other" field.
  const total = REQUIRED_DOWNLOAD_PROFILE_FIELDS.length + 2;
  const filled = Math.max(
    0,
    total - missing.filter((f) => f !== "download_purpose_other").length,
  );
  const percent = Math.round((filled / total) * 100);

  return {
    complete: missing.length === 0,
    missingFields: missing,
    updatedAt: row?.download_profile_updated_at ?? null,
    percent,
  };
}

// ── Option lists (stable values ⇄ i18n label keys) ──────────────────────────

export const GENDER_OPTIONS = ["male", "female", "other", "prefer_not_to_say"] as const;

export const INSTITUTION_TYPE_OPTIONS = [
  "ptec",
  "university",
  "institute",
  "school",
  "government",
  "ngo",
  "private",
  "independent",
  "other",
] as const;

export const PROFESSIONAL_ROLE_OPTIONS = [
  "student",
  "teacher",
  "lecturer",
  "researcher",
  "librarian",
  "education_admin",
  "government_official",
  "general_public",
  "other",
] as const;

export const DOWNLOAD_PURPOSE_OPTIONS = [
  "personal_study",
  "teaching_prep",
  "academic_research",
  "literature_review",
  "citation_reference",
  "institutional_research",
  "policy_research",
  "other",
] as const;

export type GenderValue = (typeof GENDER_OPTIONS)[number];
export type InstitutionTypeValue = (typeof INSTITUTION_TYPE_OPTIONS)[number];
export type ProfessionalRoleValue = (typeof PROFESSIONAL_ROLE_OPTIONS)[number];
export type DownloadPurposeValue = (typeof DOWNLOAD_PURPOSE_OPTIONS)[number];

/** Validate a submitted enum value; returns null when out of range. */
export function coerceEnum<T extends readonly string[]>(
  allowed: T,
  value: unknown,
): T[number] | null {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T[number])
    : null;
}

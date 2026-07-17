// lib/system-settings/types.ts
//
// Shared types for the System Settings platform. Client-safe (no server
// imports) — the admin forms, validators and server code all speak these
// shapes. One document type per settings SECTION; the documents are what is
// stored in site_settings.draft / site_settings.published and validated by
// lib/system-settings/schemas.ts.

/** The five managed sections. Order = admin navigation order. */
export const SETTING_SECTIONS = [
  "organization",
  "contact",
  "hours",
  "links",
  "seo",
] as const;

export type SettingSection = (typeof SETTING_SECTIONS)[number];

export type LocalizedText = { en: string; km: string };

// ── Section documents (stored shapes) ────────────────────────────────────────

export type OrganizationSettings = {
  /** Official institution name; `short` is the abbreviation (e.g. "PTEC"). */
  name: { en: string; km: string; short: string };
  /** Library display name (footer brand block, JSON-LD Library node). */
  libraryName: LocalizedText;
};

export type ContactSettings = {
  /** Main institution phone, local display format e.g. "012 345 678". */
  phone: string;
  /** Library front-desk phone (may equal `phone`). */
  phoneLibrary: string;
  email: string;
  emailInternational: string;
  address: {
    en: string;
    km: string;
    streetAddress: string;
    city: string;
    /** ISO 3166-1 alpha-2, e.g. "KH". */
    country: string;
    postalCode: string;
  };
};

/** One opening interval, "HH:MM" 24-hour local (Asia/Phnom_Penh). */
export type HoursInterval = { open: string; close: string };

export type HoursClosure = {
  /** Inclusive ISO dates (YYYY-MM-DD), Cambodia-local. */
  from: string;
  to: string;
  reason: LocalizedText;
};

export type HoursSettings = {
  /** JS weekday keys "0" (Sunday) … "6" (Saturday) → opening intervals.
   *  An empty array means closed that day. */
  weekly: Record<string, HoursInterval[]>;
  /** Special full-day closures (public holidays, temporary closures). */
  closures: HoursClosure[];
};

export type LinksSettings = {
  website: string;
  facebook: string;
  messenger: string;
  youtube: string;
  telegram: string;
  /** Google Maps place URL (open-directions target). Validated https URL —
   *  never admin-supplied iframe HTML. */
  mapPlace: string;
  /** Google Maps embed `src` URL (google.com/maps/embed only). */
  mapEmbed: string;
};

export type SeoSettings = {
  siteTitle: string;
  /** Next.js title template, must contain "%s". */
  titleTemplate: string;
  /** Product/site name for JSON-LD WebSite/Library nodes and email branding. */
  siteName: string;
  siteDescription: LocalizedText;
  /** Admin kill switch. False = site-wide noindex + empty sitemap, even in
   *  production. ANDed with the environment gate (lib/seo/indexing.ts) —
   *  it can never make a preview/staging deployment indexable. */
  indexingEnabled: boolean;
  /** Webmaster-tools verification tokens (meta-tag content values, not full
   *  tags). Empty string = tag omitted. */
  verification: {
    /** google-site-verification */
    google: string;
    /** msvalidate.01 (Bing) */
    bing: string;
  };
};

export type SectionDocMap = {
  organization: OrganizationSettings;
  contact: ContactSettings;
  hours: HoursSettings;
  links: LinksSettings;
  seo: SeoSettings;
};

export type AnySectionDoc = SectionDocMap[SettingSection];

// ── Derived public configuration ─────────────────────────────────────────────

/**
 * The allowlisted, derived configuration served to the site. Deliberately
 * shaped like the legacy `PTEC` constant so migrating consumers is mechanical.
 * Built by lib/system-settings/config.ts from the PUBLISHED documents only —
 * drafts, editor identities and version metadata are never included.
 */
export type SiteConfig = {
  name: { en: string; km: string; short: string };
  libraryName: LocalizedText;

  phone: string;
  phoneIntl: string;
  phoneTel: string;
  phoneLibrary: string;
  phoneLibraryTel: string;
  email: string;
  emailInternational: string;

  address: ContactSettings["address"];

  hours: {
    /** Human sentences derived from the weekly schedule (never hand-written). */
    en: string;
    km: string;
    /** schema.org spec strings, e.g. "Mo-Fr 07:00-17:00". */
    openingHoursSpec: string[];
    closures: HoursClosure[];
  };

  links: LinksSettings;

  /** Official profile URLs for schema.org sameAs. */
  sameAs: string[];

  seo: SeoSettings;
};

// ── Admin workspace shapes ───────────────────────────────────────────────────

export type SectionState<S extends SettingSection = SettingSection> = {
  section: S;
  /** Pending draft, or null when there is none. */
  draft: SectionDocMap[S] | null;
  draftSavedAt: string | null;
  draftSavedBy: string | null;
  published: SectionDocMap[S];
  publishedVersion: number;
  publishedAt: string | null;
  publishedBy: string | null;
};

export type SettingsWorkspaceData = {
  sections: { [S in SettingSection]: SectionState<S> };
  /** False until migration 0098 is applied — the UI goes read-only. */
  storageReady: boolean;
  /** Viewer capability, resolved server-side (UI hint only — every mutation
   *  re-checks on the server). */
  canWrite: boolean;
  versions: SettingVersionRow[];
  /** Editor display names for the ids referenced above. */
  actorNames: Record<string, string>;
};

export type SettingVersionRow = {
  id: string;
  section: SettingSection;
  version: number;
  action: "seed" | "publish" | "rollback";
  restoredFrom: number | null;
  changedFields: string[];
  comment: string | null;
  publishedAt: string;
  publishedBy: string | null;
};

/** Field-level validation problem, pointing at a dot-path in the document. */
export type FieldError = { path: string; message: string };

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; errors: FieldError[] };

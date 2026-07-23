// lib/system-settings/defaults.ts
//
// Code-level defaults for every settings section — the SAFE FALLBACK layer.
//
// These mirror lib/ptec.ts (the pre-database single source of truth) and the
// seed block of supabase/migrations/0098_system_settings.sql. They exist so
// that public pages keep rendering correct institution data when:
//   • migration 0098 has not been applied yet, or
//   • the settings table is temporarily unreachable.
// getSiteConfig() merges PUBLISHED database documents over these defaults
// section-by-section. Once settings are live, edits happen in
// /admin/system-settings — never here.

import { PTEC } from "@/lib/ptec";
import type {
  ContactSettings,
  HoursSettings,
  LinksSettings,
  OrganizationSettings,
  SectionDocMap,
  SeoSettings,
} from "./types";

export const DEFAULT_ORGANIZATION: OrganizationSettings = {
  name: { ...PTEC.name },
  libraryName: {
    en: "PTEC Library",
    km: "បណ្ណាល័យវិទ្យាស្ថានគរុកោសល្យរាជធានីភ្នំពេញ",
  },
};

export const DEFAULT_CONTACT: ContactSettings = {
  phone: PTEC.phone,
  phoneLibrary: PTEC.phoneLibrary,
  email: PTEC.email,
  emailInternational: PTEC.emailInternational,
  address: { ...PTEC.address },
};

// Structured form of PTEC.hours.openingHoursSpec ("Mo-Fr 07:00-17:00",
// "Sa 08:00-16:00"), JS weekday keys (0 = Sunday).
export const DEFAULT_HOURS: HoursSettings = {
  weekly: {
    "0": [],
    "1": [{ open: "07:00", close: "17:00" }],
    "2": [{ open: "07:00", close: "17:00" }],
    "3": [{ open: "07:00", close: "17:00" }],
    "4": [{ open: "07:00", close: "17:00" }],
    "5": [{ open: "07:00", close: "17:00" }],
    "6": [{ open: "08:00", close: "16:00" }],
  },
  closures: [],
};

export const DEFAULT_LINKS: LinksSettings = {
  website: PTEC.links.website,
  facebook: PTEC.links.facebook,
  messenger: PTEC.links.messenger,
  youtube: PTEC.links.youtube,
  telegram: PTEC.links.telegram,
  mapPlace: PTEC.links.mapPlace,
  mapEmbed: PTEC.links.mapEmbed,
};

// Mirrors app/root-metadata.ts. Khmer description is deliberately empty (no
// approved Khmer copy existed at migration time); the mapper falls back to en.
export const DEFAULT_SEO: SeoSettings = {
  siteTitle: "PTEC Digital Teaching Library",
  titleTemplate: "%s · PTEC Library",
  // Product/site name used by JSON-LD, Open Graph and email branding.
  siteName: "PTEC Digital Library",
  siteDescription: {
    en: "Access free teaching resources, books, and educational materials from the Phnom Penh Teacher Education College (PTEC).",
    km: "",
  },
  indexingEnabled: true,
  verification: { google: "", bing: "" },
};

export const DEFAULT_SECTION_DOCS: SectionDocMap = {
  organization: DEFAULT_ORGANIZATION,
  contact: DEFAULT_CONTACT,
  hours: DEFAULT_HOURS,
  links: DEFAULT_LINKS,
  seo: DEFAULT_SEO,
};

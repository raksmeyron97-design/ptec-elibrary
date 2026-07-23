// lib/system-settings/org-identity.ts
//
// The organization's PUBLIC IDENTITY, in the shape the synchronous SEO /
// metadata / export / email builders need.
//
// Why this module exists
// ──────────────────────
// getSiteConfig() is async and server-only. The metadata + JSON-LD builders in
// lib/seo/* are pure synchronous functions called from dozens of places, so
// they used to reach for two module-level name constants in lib/seo/site.ts.
// Those constants were a SECOND source of
// truth: publishing a new institution name in /admin/system-settings updated
// the navbar and footer but left every JSON-LD publisher, Open Graph siteName,
// citation_dissertation_institution, OAI-PMH repositoryName, CSV/BibTeX export
// and transactional email still rendering the compiled-in value — and the two
// constants had already drifted apart from each other ("PTEC Library" vs
// "PTEC Digital Library").
//
// The fix: the builders take an explicit `org: OrgIdentity` argument, resolved
// once per render from the published settings (`getOrgIdentity()` in
// ./config.ts) and threaded down. This module holds the client-safe type, the
// pure projection from SiteConfig, and the ONE centralized emergency fallback.
//
// EMERGENCY_ORG_IDENTITY is not a "default" in the normal sense: it is only
// reached when a builder is called without an org argument (i.e. a call site
// that has not been wired). It is derived from DEFAULT_SECTION_DOCS rather
// than re-typing literals, so it can never introduce a third set of values,
// and lib/seo/org-identity.test.ts fails CI if a production call site forgets
// to pass one.

import { SITE_URL } from "@/lib/seo/site";
import { DEFAULT_SECTION_DOCS } from "./defaults";
import type { SiteConfig } from "./types";

export type OrgIdentity = {
  /** Official institution name in English — schema.org publisher / degree
   *  grantor / citation institution. */
  institutionName: string;
  /** Official institution name in Khmer. */
  institutionNameKm: string;
  /** Institution abbreviation, e.g. "PTEC". */
  abbreviation: string;
  /** Library brand name — application name, listing Open Graph titles. */
  libraryName: string;
  /** Library brand name in Khmer. */
  libraryNameKm: string;
  /** Product/site name: JSON-LD WebSite + Library nodes, Open Graph siteName,
   *  OAI-PMH repositoryName, export/email branding. */
  siteName: string;
  /** Public contact address (OAI adminEmail, email footers, report links). */
  contactEmail: string;
  /** Canonical site origin, no trailing slash. */
  url: string;
};

/** Pure projection: published site configuration → public identity. */
export function orgIdentityFrom(cfg: SiteConfig): OrgIdentity {
  return {
    institutionName: cfg.name.en,
    institutionNameKm: cfg.name.km,
    abbreviation: cfg.name.short,
    libraryName: cfg.libraryName.en,
    libraryNameKm: cfg.libraryName.km,
    siteName: cfg.seo.siteName,
    contactEmail: cfg.email,
    url: SITE_URL,
  };
}

/**
 * Centralized last-resort identity. Derived from the code defaults so it
 * cannot drift from lib/system-settings/defaults.ts — never hand-edit values
 * here, and never import this from a component: pass a resolved OrgIdentity.
 */
export const EMERGENCY_ORG_IDENTITY: OrgIdentity = {
  institutionName: DEFAULT_SECTION_DOCS.organization.name.en,
  institutionNameKm: DEFAULT_SECTION_DOCS.organization.name.km,
  abbreviation: DEFAULT_SECTION_DOCS.organization.name.short,
  libraryName: DEFAULT_SECTION_DOCS.organization.libraryName.en,
  libraryNameKm: DEFAULT_SECTION_DOCS.organization.libraryName.km,
  siteName: DEFAULT_SECTION_DOCS.seo.siteName,
  contactEmail: DEFAULT_SECTION_DOCS.contact.email,
  url: SITE_URL,
};

let warned = false;

/**
 * Resolve an optional org argument, falling back to the emergency identity.
 * Used by the sync builders in lib/seo/*. The fallback is logged once per
 * process so an unwired call site shows up in server logs instead of silently
 * serving stale branding.
 */
export function resolveOrgIdentity(org?: OrgIdentity): OrgIdentity {
  if (org) return org;
  if (!warned) {
    warned = true;
    console.warn(
      "[org-identity] a metadata/JSON-LD builder was called without a resolved " +
        "OrgIdentity — falling back to code defaults. Pass `await getOrgIdentity()` " +
        "from the calling server component so published settings apply.",
    );
  }
  return EMERGENCY_ORG_IDENTITY;
}

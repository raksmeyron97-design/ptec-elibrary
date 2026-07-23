// lib/system-settings/config.ts
//
// getSiteConfig() — THE way public code reads global organization/site
// information (names, contacts, address, opening hours, links, SEO defaults).
// Replaces direct imports of the legacy `PTEC` constant.
//
// Reads the PUBLISHED documents from site_settings (service client — the
// table is service-role-only by RLS), validates them, merges them over the
// code defaults (lib/system-settings/defaults.ts) and maps to the allowlisted
// SiteConfig shape. Failure model:
//
//   • migration 0098 not applied / table unreachable → code defaults
//     (identical to the pre-settings hard-coded site — never a blank page)
//   • one section's stored doc fails validation (schema drift) → that
//     section falls back to its default; the others still apply
//
// Cached under the "site-config" tag (see lib/cache/revalidate.ts). It uses
// no cookies/headers, so calling it from prerendered pages keeps them static;
// publish/rollback invalidate the tag plus the public layouts.

import "server-only";

import { unstable_cache } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { TAGS } from "@/lib/cache/revalidate";
import { DEFAULT_SECTION_DOCS } from "./defaults";
import { buildSiteConfig } from "./map";
import { validateSectionDoc } from "./schemas";
import { orgIdentityFrom, type OrgIdentity } from "./org-identity";
import { SETTING_SECTIONS, type SectionDocMap, type SiteConfig } from "./types";

/** Uncached read + merge — exported for the health probe and tests. */
export async function computeSiteConfig(): Promise<SiteConfig> {
  const docs: SectionDocMap = { ...DEFAULT_SECTION_DOCS };

  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("site_settings")
      .select("section, published");

    if (!error && data) {
      for (const row of data as { section: string; published: unknown }[]) {
        const section = row.section as keyof SectionDocMap;
        if (!(SETTING_SECTIONS as readonly string[]).includes(section)) continue;
        const parsed = validateSectionDoc(section, row.published);
        if (parsed.ok) {
          docs[section] = parsed.value as never;
        } else {
          console.error(
            `[site-config] stored "${section}" document is invalid — using defaults`,
            parsed.errors.slice(0, 3),
          );
        }
      }
    }
  } catch (e) {
    // Table missing (migration pending) or DB unreachable — defaults carry us.
    console.error("[site-config] falling back to code defaults:", e);
  }

  return buildSiteConfig(docs);
}

const getCachedSiteConfig = unstable_cache(
  computeSiteConfig,
  ["site-config"],
  { tags: [TAGS.siteConfig], revalidate: 86_400 },
);

/** Cached public site configuration. Safe in prerendered pages. */
export async function getSiteConfig(): Promise<SiteConfig> {
  return getCachedSiteConfig();
}

/**
 * The published organization identity, for the synchronous SEO / JSON-LD /
 * export / email builders (see ./org-identity.ts for why they take it as an
 * argument rather than importing a constant).
 *
 * Call this once in a server component / route handler and thread the result
 * down — it shares getSiteConfig()'s cache, so extra calls in one render are
 * cheap, but one resolved value per render keeps every surface consistent.
 */
export async function getOrgIdentity(): Promise<OrgIdentity> {
  return orgIdentityFrom(await getSiteConfig());
}

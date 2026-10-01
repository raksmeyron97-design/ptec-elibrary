// lib/seo/brand.ts
//
// Which brand a page wears, per locale. Pure (types only from settings).
//
// The library has one brand in two scripts — "PTEC Library" / "បណ្ណាល័យ វ.គ.ភ"
// (lib/system-settings/defaults.ts, DEFAULT_ORGANIZATION). The <title>
// template, og:site_name and the social titles used the English name on every
// /km page: 22 of 22 Khmer URLs measured on 2026-09-30 ended in the Latin
// "PTEC Library" (docs/seo/AUDIT-VERIFICATION.md F9). Nothing here is a
// constant: both names and the template come from published System Settings,
// so an admin who renames the library renames it in both scripts.

import type { OrgIdentity } from "@/lib/system-settings/org-identity";

type BrandNames = { en: string; km?: string | null };

/** The library's name in the page's locale (Khmer falls back to English). */
export function libraryNameFor(org: Pick<OrgIdentity, "libraryName" | "libraryNameKm">, locale: string): string {
  const km = org.libraryNameKm?.trim();
  return locale === "km" && km ? km : org.libraryName;
}

/**
 * og:site_name in the page's locale. The site name IS the library brand by
 * default; only when an admin set a site name that differs from the English
 * library name is it kept as written, because there is then no Khmer
 * counterpart to swap in.
 */
export function siteNameFor(
  org: Pick<OrgIdentity, "siteName" | "libraryName" | "libraryNameKm">,
  locale: string,
): string {
  if (locale !== "km") return org.siteName;
  const km = org.libraryNameKm?.trim();
  return km && org.siteName === org.libraryName ? km : org.siteName;
}

/**
 * The <title> template for a locale. On /km the English library name inside
 * the published template is replaced by the Khmer one ("%s · PTEC Library" →
 * "%s · បណ្ណាល័យ វ.គ.ភ"). A template that does not contain the English name
 * is an admin's deliberate wording and is kept as is.
 */
export function localizedTitleTemplate(template: string, names: BrandNames, locale: string): string {
  const km = names.km?.trim();
  if (locale !== "km" || !km || !names.en || !template.includes(names.en)) return template;
  return template.split(names.en).join(km);
}

/** The text the layout's template adds around a page title, e.g. " · បណ្ណាល័យ វ.គ.ភ". */
export function brandSuffixFor(
  org: Pick<OrgIdentity, "libraryName" | "libraryNameKm"> & { titleTemplate?: string },
  locale: string,
): string {
  const template = org.titleTemplate?.includes("%s") ? org.titleTemplate : `%s · ${org.libraryName}`;
  return localizedTitleTemplate(template, { en: org.libraryName, km: org.libraryNameKm }, locale).replace("%s", "");
}

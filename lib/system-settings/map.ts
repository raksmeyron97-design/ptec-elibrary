// lib/system-settings/map.ts
//
// Pure mapping from validated section documents to the public SiteConfig.
// Client-safe and unit-tested. This is the ALLOWLIST: only what is written
// here can ever reach the public site — raw settings rows (drafts, editor
// ids, versions) never leave the server.

import { phoneToIntlDisplay, phoneToTel } from "./schemas";
import { hoursSentence, weeklyToOpeningHoursSpec } from "./hours";
import type { SectionDocMap, SiteConfig } from "./types";

export function buildSiteConfig(docs: SectionDocMap): SiteConfig {
  const { organization, contact, hours, links, seo } = docs;

  const sameAs = [links.website, links.facebook, links.youtube, links.telegram]
    .filter((url): url is string => Boolean(url));

  return {
    name: { ...organization.name },
    libraryName: { ...organization.libraryName },

    phone: contact.phone,
    phoneIntl: phoneToIntlDisplay(contact.phone),
    phoneTel: phoneToTel(contact.phone),
    phoneLibrary: contact.phoneLibrary,
    phoneLibraryTel: phoneToTel(contact.phoneLibrary || contact.phone),
    email: contact.email,
    emailInternational: contact.emailInternational,

    address: { ...contact.address },

    hours: {
      en: hoursSentence("en", hours.weekly),
      km: hoursSentence("km", hours.weekly),
      openingHoursSpec: weeklyToOpeningHoursSpec(hours.weekly),
      closures: hours.closures.map((c) => ({ ...c, reason: { ...c.reason } })),
    },

    links: { ...links },
    sameAs,

    seo: {
      siteTitle: seo.siteTitle,
      titleTemplate: seo.titleTemplate,
      siteName: seo.siteName,
      siteDescription: {
        en: seo.siteDescription.en,
        // Khmer falls back to English rather than rendering empty meta text.
        km: seo.siteDescription.km || seo.siteDescription.en,
      },
    },
  };
}

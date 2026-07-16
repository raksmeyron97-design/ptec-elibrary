import { getSiteConfig } from "@/lib/system-settings/config";
import { compactHoursLabel } from "@/lib/library-hours";
import ContactClient from "./ContactClient";

/** The allowlisted subset of the published site settings the contact page
 *  needs — resolved server-side so the client bundle carries no institution
 *  data and no settings-service code. */
export type PublicContactSite = {
  phoneLibrary: string;
  email: string;
  addressEn: string;
  hoursLabelKm: string;
  links: {
    website: string;
    facebook: string;
    telegram: string;
    messenger: string;
    youtube: string;
    mapPlace: string;
    mapEmbed: string;
  };
};

export default async function ContactPage() {
  const cfg = await getSiteConfig();

  const site: PublicContactSite = {
    phoneLibrary: cfg.phoneLibrary,
    email: cfg.email,
    addressEn: cfg.address.en,
    hoursLabelKm: compactHoursLabel("km", cfg.hours.openingHoursSpec),
    links: {
      website: cfg.links.website,
      facebook: cfg.links.facebook,
      telegram: cfg.links.telegram,
      messenger: cfg.links.messenger,
      youtube: cfg.links.youtube,
      mapPlace: cfg.links.mapPlace,
      mapEmbed: cfg.links.mapEmbed,
    },
  };

  return <ContactClient site={site} />;
}

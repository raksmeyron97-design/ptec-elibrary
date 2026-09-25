import type { Metadata } from "next";
import { localeAlternates } from "@/lib/seo/alternates";
import { buildOpenGraph, buildTwitter } from "@/lib/seo/open-graph";
import { getOrgIdentity, getSiteConfig } from "@/lib/system-settings/config";
import { compactHoursLabel } from "@/lib/library-hours";
import { getTranslations } from "next-intl/server";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  // Everything factual here — names, hours, address — comes from the published
  // settings. It used to be a string literal that still claimed "7 AM-5 PM"
  // and an address the admin panel could no longer change.
  const [{ locale: raw }, cfg, org] = await Promise.all([params, getSiteConfig(), getOrgIdentity()]);
  // In the page's own language: /km/contact used to publish an English
  // <title>, description and social card.
  const locale = raw === "km" ? "km" : "en";
  const t = await getTranslations({ locale, namespace: "contact" });
  const alternates = localeAlternates("/contact", locale);
  const library = cfg.libraryName[locale] || cfg.libraryName.en;
  const institution = cfg.name[locale] || cfg.name.en;
  const address = cfg.address[locale] || cfg.address.en;
  const hours = compactHoursLabel(locale, cfg.hours.openingHoursSpec);
  const description = t("metaDescription", { library, institution, hours });
  const socialTitle = t("socialTitle", { library });
  const socialDescription = t("socialDescription", { library, hours, address });
  const openGraph = buildOpenGraph({
    locale,
    org,
    title: socialTitle,
    description: socialDescription,
    type: "website" as const,
    url: alternates.canonical,
  });
  return {
    title: t("metaTitle"),
    description,
    alternates,
    openGraph,
    twitter: buildTwitter({
      card: "summary_large_image",
      title: socialTitle,
      description: socialDescription,
      images: openGraph.images,
    }),
  };
}

export default function ContactLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

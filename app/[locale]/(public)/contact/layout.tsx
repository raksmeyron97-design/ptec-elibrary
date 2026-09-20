import type { Metadata } from "next";
import { localeAlternates } from "@/lib/seo/alternates";
import { buildOpenGraph, buildTwitter } from "@/lib/seo/open-graph";
import { getOrgIdentity, getSiteConfig } from "@/lib/system-settings/config";
import { compactHoursLabel } from "@/lib/library-hours";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  // Everything factual here — names, hours, address — comes from the published
  // settings. It used to be a string literal that still claimed "7 AM-5 PM"
  // and an address the admin panel could no longer change.
  const [{ locale }, cfg, org] = await Promise.all([params, getSiteConfig(), getOrgIdentity()]);
  const alternates = localeAlternates("/contact", locale);
  const library = cfg.libraryName.en;
  const hours = compactHoursLabel("en", cfg.hours.openingHoursSpec);
  const description =
    `Get in touch with ${library}. Phone, email, and address for ${cfg.name.en} — open ${hours}.`;
  const socialTitle = `Contact ${library}`;
  const socialDescription = `Phone, email, and address for ${library}. ${hours}. ${cfg.address.en}.`;
  const openGraph = buildOpenGraph({
    locale,
    org,
    title: socialTitle,
    description: socialDescription,
    type: "website" as const,
    url: alternates.canonical,
  });
  return {
    title: "Contact Us",
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

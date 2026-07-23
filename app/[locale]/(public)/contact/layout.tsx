import type { Metadata } from "next";
import { localeAlternates } from "@/lib/seo/alternates";
import { getSiteConfig } from "@/lib/system-settings/config";
import { compactHoursLabel } from "@/lib/library-hours";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  // Everything factual here — names, hours, address — comes from the published
  // settings. It used to be a string literal that still claimed "7 AM-5 PM"
  // and an address the admin panel could no longer change.
  const [{ locale }, cfg] = await Promise.all([params, getSiteConfig()]);
  const alternates = localeAlternates("/contact", locale);
  const library = cfg.libraryName.en;
  const hours = compactHoursLabel("en", cfg.hours.openingHoursSpec);
  const description =
    `Get in touch with ${library}. Phone, email, and address for ${cfg.name.en} — open ${hours}.`;
  return {
    title: "Contact Us",
    description,
    alternates,
    openGraph: {
      title: `Contact ${library}`,
      description: `Phone, email, and address for ${library}. ${hours}. ${cfg.address.en}.`,
      url: alternates.canonical,
      type: "website",
    },
  };
}

export default function ContactLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { localeAlternates } from "@/lib/seo/alternates";
import { breadcrumbSchema } from "@/lib/seo/schema";
import JsonLd from "@/components/seo/JsonLd";
import { PRIVACY_SECTIONS } from "@/lib/privacy/policy";
import PrivacyHero from "./PrivacyHero";
import PrivacySummaryCards from "./PrivacySummaryCards";
import PrivacyTableOfContents from "./PrivacyTableOfContents";
import PrivacySection from "./PrivacySection";
import PrivacyDataTable from "./PrivacyDataTable";
import PrivacyProcessorList from "./PrivacyProcessorList";
import PrivacyRightsCard from "./PrivacyRightsCard";
import PolicyVersionHistory from "./PolicyVersionHistory";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "privacy.meta" });
  const alternates = localeAlternates("/privacy", locale);
  return {
    title: t("title"),
    description: t("description"),
    alternates,
    openGraph: {
      title: t("ogTitle"),
      description: t("ogDescription"),
      url: alternates.canonical,
      type: "website",
    },
    twitter: {
      card: "summary",
      title: t("ogTitle"),
      description: t("ogDescription"),
    },
  };
}

export default async function PrivacyPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const km = locale === "km";
  const t = await getTranslations("privacy");

  // TOC items — labels from the section headings, ids stable across locales.
  const tocItems = PRIVACY_SECTIONS.map((s) => ({
    id: s.id,
    label: t(`sections.${s.id}.title`),
  }));

  const breadcrumb = breadcrumbSchema([
    { name: t("breadcrumb.home"), path: "/" },
    { name: t("breadcrumb.current") },
  ]);

  return (
    <div className="bg-paper">
      <JsonLd data={breadcrumb} />
      <PrivacyHero km={km} />

      <div className="mx-auto max-w-[1200px] px-4 pb-16 sm:px-6 md:px-8">
        <div className="lg:grid lg:grid-cols-[248px_minmax(0,1fr)] lg:gap-10">
          {/* Table of contents (sticky on desktop, disclosure on mobile) */}
          <div className="pt-8 lg:pt-10">
            <PrivacyTableOfContents
              items={tocItems}
              title={t("toc.title")}
              mobileLabel={t("toc.mobileLabel")}
              km={km}
            />
          </div>

          {/* Main policy content */}
          <div className="min-w-0 pt-2 lg:pt-10">
            <PrivacySummaryCards km={km} />

            <div className="mt-12 max-w-[820px] space-y-12">
              {PRIVACY_SECTIONS.map((section) => (
                <PrivacySection key={section.id} id={section.id} km={km}>
                  {section.special === "table" && <PrivacyDataTable km={km} />}
                  {section.special === "processors" && <PrivacyProcessorList km={km} />}
                  {section.special === "rights" && <PrivacyRightsCard km={km} />}
                  {section.special === "versions" && <PolicyVersionHistory km={km} />}
                </PrivacySection>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

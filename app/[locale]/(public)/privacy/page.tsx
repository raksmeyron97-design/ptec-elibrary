import type { Metadata } from "next";
import { getMessages, getTranslations } from "next-intl/server";
import { localeAlternates } from "@/lib/seo/alternates";
import { buildOpenGraph, buildTwitter } from "@/lib/seo/open-graph";
import { getOrgIdentity } from "@/lib/system-settings/config";
import { breadcrumbSchema } from "@/lib/seo/schema";
import JsonLd from "@/components/seo/JsonLd";
import {
  chapterAnchor,
  POLICY_VERSIONS,
  PRIVACY_CHAPTERS,
  PRIVACY_SECTIONS,
} from "@/lib/privacy/policy";
import { readingTime } from "@/lib/policy/reading-time";
import PolicyLayout from "@/components/policy/PolicyLayout";
import VersionTimeline from "@/components/policy/VersionTimeline";
import type { TocChapter } from "@/components/policy/PolicyTOC";
import PrivacyHero from "./PrivacyHero";
import PrivacySummaryCards from "./PrivacySummaryCards";
import PrivacyChapter from "./PrivacyChapter";
import PrivacySection from "./PrivacySection";
import PrivacyDataTable from "./PrivacyDataTable";
import PrivacyProcessorList from "./PrivacyProcessorList";
import PrivacyRightsCard from "./PrivacyRightsCard";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const [tMeta, org] = await Promise.all([
    getTranslations({ locale, namespace: "privacy.meta" }),
    getOrgIdentity(),
  ]);
  const alternates = localeAlternates("/privacy", locale);
  const openGraph = buildOpenGraph({
    locale,
    org,
    title: tMeta("ogTitle"),
    description: tMeta("ogDescription"),
    type: "website" as const,
    url: alternates.canonical,
  });
  return {
    title: tMeta("title"),
    description: tMeta("description"),
    alternates,
    openGraph,
    // `summary_large_image`, matching the card this page actually ships: the
    // shared fallback is 1200 x 630, and `summary` crops a landscape card to a
    // small square thumbnail.
    twitter: buildTwitter({
      card: "summary_large_image",
      title: tMeta("ogTitle"),
      description: tMeta("ogDescription"),
      images: openGraph.images,
    }),
  };
}

// next-intl forbids "." in message keys, so a version summary is stored under a
// dot-free key: "2.0" -> "v2_0".
const summaryKey = (version: string) => `v${version.replace(/\./g, "_")}`;

export default async function PrivacyPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const km = locale === "km";
  // Bound with a plain `const`, not destructured from Promise.all: both
  // resolve from the same request-scoped cache so there is nothing to
  // parallelise, and lib/i18n-keys.test.ts can only attribute a key to a
  // namespace it can see bound.
  const t = await getTranslations("privacy");
  const messages = await getMessages();

  // The chapters group the SAME sections in the SAME order — a section is
  // rendered by the chapter that claims it, and PRIVACY_SECTIONS remains the
  // ordering authority. `special` still decides which extra element a section
  // carries, so adding one never means touching this file.
  const specialOf = new Map(PRIVACY_SECTIONS.map((s) => [s.id, s.special]));

  const tocChapters: TocChapter[] = PRIVACY_CHAPTERS.map((chapter, i) => ({
    id: chapterAnchor(chapter.id),
    number: i + 1,
    label: t(`chapters.${chapter.id}.title`),
    items: chapter.sections.map((id) => ({ id, label: t(`sections.${id}.title`) })),
  }));

  // Measured from the catalogue the page actually renders, in the locale it is
  // rendering — so the Khmer page reports the Khmer document's length, not the
  // English one's. See lib/policy/reading-time.ts for why this is not a word
  // count.
  const { minutes } = readingTime(
    (messages as { privacy?: { sections?: unknown; table?: unknown } }).privacy,
  );

  const breadcrumb = breadcrumbSchema(
    [{ name: t("breadcrumb.home"), path: "/" }, { name: t("breadcrumb.current") }],
    { locale },
  );

  return (
    <>
      <JsonLd data={breadcrumb} />
      <PrivacyHero km={km} readingTime={t("hero.readingTime", { minutes })} />

      <PolicyLayout
        chapters={tocChapters}
        km={km}
        labels={{
          tocTitle: t("toc.title"),
          tocMobile: t("toc.mobileLabel"),
          backToTop: t("toc.backToTop"),
        }}
      >
        <PrivacySummaryCards km={km} />

        <div className="mt-12 space-y-16">
          {PRIVACY_CHAPTERS.map((chapter, i) => (
            <PrivacyChapter
              key={chapter.id}
              id={chapterAnchor(chapter.id)}
              number={i + 1}
              title={t(`chapters.${chapter.id}.title`)}
              summary={t(`chapters.${chapter.id}.summary`)}
              km={km}
            >
              {chapter.sections.map((id) => {
                const special = specialOf.get(id);
                return (
                  <PrivacySection key={id} id={id} km={km}>
                    {special === "table" && <PrivacyDataTable km={km} />}
                    {special === "processors" && <PrivacyProcessorList km={km} />}
                    {special === "rights" && <PrivacyRightsCard km={km} />}
                    {special === "versions" && (
                      <VersionTimeline
                        km={km}
                        entries={POLICY_VERSIONS.map((v) => ({
                          version: v.version,
                          date: v.date,
                          summary: t(`versions.${summaryKey(v.version)}`),
                        }))}
                        labels={{
                          version: t("versions.versionLabel"),
                          effective: t("versions.effectiveLabel"),
                          current: t("versions.current"),
                        }}
                      />
                    )}
                  </PrivacySection>
                );
              })}
            </PrivacyChapter>
          ))}
        </div>
      </PolicyLayout>
    </>
  );
}

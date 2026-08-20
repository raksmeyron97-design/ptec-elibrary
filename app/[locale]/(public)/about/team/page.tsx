import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Clock, Languages, LayoutGrid, MessageCircle, Phone, Users } from "lucide-react";
import { SITE_URL } from "@/lib/seo/site";
import { localeAlternates } from "@/lib/seo/alternates";
import JsonLd from "@/components/seo/JsonLd";
import { getOrgIdentity, getSiteConfig } from "@/lib/system-settings/config";
import { getPublicTeamData } from "@/lib/team/data";
import { groupWeeklySpec } from "@/lib/about/schedule";
import { toAboutLocale, formatDate, formatNumber } from "@/lib/about/format";
import { ABOUT_CONTENT_REVIEWED_AT } from "@/lib/about/content";
import AboutPageShell from "@/components/about/AboutPageShell";
import TeamDirectory from "@/components/about/TeamDirectory";
import { OfficialContactCard, AboutExternalAction, AboutLinkAction } from "@/components/about/actions";
import {
  AboutSection,
  ContentLastUpdated,
  EmptyContentState,
  InformationCard,
  StatCard,
} from "@/components/about/primitives";

// Published team data is public and changes rarely; the admin actions call
// revalidatePath("/about/team") on every change, so a long window is safe.
export const revalidate = 600;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "about.team" });
  const org = await getOrgIdentity();
  const alternates = localeAlternates("/about/team", locale);
  // The document <title> gets the brand from the site's titleTemplate
  // ("%s · PTEC Library"), so `title` must NOT repeat it. An Open Graph title
  // travels alone into a social card, so that one is branded explicitly.
  const title = t("metaTitle");
  const description = t("metaDescription");
  const socialTitle = `${title} · ${org.siteName}`;

  return {
    title,
    description,
    alternates,
    openGraph: {
      title: socialTitle,
      description,
      url: alternates.canonical,
      type: "website",
      siteName: org.siteName,
      locale: locale === "km" ? "km_KH" : "en_US",
      images: [{ url: `${SITE_URL}/og-default.png` }],
    },
    twitter: { card: "summary_large_image", title: socialTitle, description },
  };
}

export default async function TeamPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  setRequestLocale(rawLocale);
  const locale = toAboutLocale(rawLocale);

  const t = await getTranslations("about");
  const tt = await getTranslations("about.team");
  const [{ members, sections }, cfg, org] = await Promise.all([
    getPublicTeamData(),
    getSiteConfig(),
    getOrgIdentity(),
  ]);

  const sectionsWithMembers = sections.filter((s) => members.some((m) => m.section_id === s.id));

  // ── Metrics ───────────────────────────────────────────────────────────
  // Every one is DERIVED from real data. There is no hardcoded "1 team
  // member / 1 service area" here: when the directory is empty the metrics
  // block is not rendered at all, because a row of zeroes says nothing.
  //
  // "Service languages" counts the distinct languages members actually
  // declared, falling back to the two the site itself is published in —
  // which is a fact about this site, not a claim about the staff.
  const declaredLanguages = new Set(
    members.flatMap((m) => m.languages).map((l) => l.trim().toLowerCase()).filter(Boolean),
  );
  const languageCount = declaredLanguages.size > 0 ? declaredLanguages.size : 2;
  const daysOpen = groupWeeklySpec(cfg.hours.openingHoursSpec).open.reduce(
    (sum, group) => sum + group.days.length,
    0,
  );
  const reviewedDate = formatDate(ABOUT_CONTENT_REVIEWED_AT, locale);

  // Structured data — public, non-contact fields only. Admin-authored names
  // flow in here, so it must go through <JsonLd> (which escapes "<" and
  // neutralises a "</script>" breakout), never a raw JSON.stringify.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "AboutPage",
    name: tt("metaTitle"),
    description: tt("metaDescription"),
    url: `${SITE_URL}${locale === "km" ? "/km" : ""}/about/team`,
    inLanguage: ["en", "km"],
    about: {
      "@type": "Organization",
      name: org.siteName,
      url: SITE_URL,
      parentOrganization: {
        "@type": "CollegeOrUniversity",
        name: cfg.name.en,
        sameAs: [...cfg.sameAs],
      },
      employee: members.map((m) => ({
        "@type": "Person",
        name: m.name_en || m.name_km,
        ...(m.position_en ? { jobTitle: m.position_en } : {}),
        worksFor: { "@type": "Organization", name: org.siteName },
      })),
    },
  };

  return (
    <AboutPageShell
      page="team"
      locale={locale}
      hero={{
        category: tt("category"),
        title: tt("title"),
        secondaryTitle: locale === "km" ? "Library Team" : "ក្រុមការងារបណ្ណាល័យ",
        secondaryLang: locale === "km" ? "en" : "km",
        intro: tt("intro"),
        action: (
          <AboutExternalAction href={cfg.phoneLibraryTel} icon={Phone} variant="onDark">
            {t("actions.contactLibrary")}
          </AboutExternalAction>
        ),
      }}
      footer={
        <div className="mt-14">
          <OfficialContactCard
            heading={tt("contact.heading")}
            body={tt("contact.body")}
            // The single most important line on this page: it tells readers
            // why they are not seeing anyone's mobile number.
            privacyNote={tt("contact.officialOnly")}
            deskLabel={tt("contact.deskLabel")}
            desk={cfg.phoneLibrary}
            deskHref={cfg.phoneLibraryTel}
            emailLabel={tt("contact.emailLabel")}
            email={cfg.email}
            hoursLabel={tt("contact.hoursLabel")}
            hours={locale === "km" ? cfg.hours.km : cfg.hours.en}
            actions={
              <>
                <AboutLinkAction href="/contact" icon={Phone} variant="primary">
                  {t("actions.contactLibrary")}
                </AboutLinkAction>
                <AboutLinkAction href="/about/timings" icon={Clock}>
                  {t("actions.viewTimings")}
                </AboutLinkAction>
                <AboutExternalAction
                  href={cfg.links.telegram}
                  icon={MessageCircle}
                  newTab
                  newTabLabel={t("meta.printHint")}
                >
                  {t("actions.askLibrarian")}
                </AboutExternalAction>
              </>
            }
          />
        </div>
      }
    >
      <JsonLd data={jsonLd} />

      {/* ── Mission ──────────────────────────────────────────────────── */}
      <AboutSection id="mission" title={tt("mission.heading")}>
        <InformationCard>
          <p className="about-copy about-measure text-[15px] text-text-body">
            {tt("mission.body")}
          </p>
        </InformationCard>
      </AboutSection>

      {/* ── Metrics — only when there is real data to compute them from ── */}
      {members.length > 0 && (
        <AboutSection id="metrics" title={tt("metrics.heading")}>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              icon={Users}
              emphasis
              value={formatNumber(members.length, locale)}
              label={tt("metrics.members")}
            />
            <StatCard
              icon={LayoutGrid}
              value={formatNumber(sectionsWithMembers.length, locale)}
              label={tt("metrics.serviceAreas")}
            />
            <StatCard
              icon={Languages}
              value={formatNumber(languageCount, locale)}
              label={tt("metrics.languages")}
            />
            <StatCard
              icon={Clock}
              value={formatNumber(daysOpen, locale)}
              label={tt("metrics.daysOpen")}
            />
          </div>
        </AboutSection>
      )}

      {/* ── Directory ────────────────────────────────────────────────────
          The source form supplied four BLANK staff blocks. No placeholder
          people are invented to fill the grid: when nothing is published the
          page says so and routes the reader to the official desk. */}
      <AboutSection id="directory" title={tt("directory.heading")}>
        {members.length === 0 ? (
          <EmptyContentState
            title={tt("empty.heading")}
            body={tt("empty.body")}
            action={
              <AboutExternalAction href={cfg.phoneLibraryTel} icon={Phone} variant="primary">
                {t("actions.callLibrary")}
              </AboutExternalAction>
            }
          />
        ) : (
          <TeamDirectory
            members={members}
            sections={sectionsWithMembers}
            locale={locale}
            desk={{
              phone: cfg.phoneLibrary,
              tel: cfg.phoneLibraryTel,
              hours: locale === "km" ? cfg.hours.km : cfg.hours.en,
            }}
          />
        )}
      </AboutSection>

      <ContentLastUpdated
        reviewedLabel={reviewedDate ? t("meta.reviewed", { date: reviewedDate }) : null}
        className="border-t border-divider pt-6"
      />
    </AboutPageShell>
  );
}

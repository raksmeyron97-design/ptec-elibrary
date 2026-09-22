import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowDown, Clock, MessageCircle, Phone } from "lucide-react";
import { SITE_URL } from "@/lib/seo/site";
import { localeAlternates } from "@/lib/seo/alternates";
import { buildOpenGraph, buildTwitter } from "@/lib/seo/open-graph";
import JsonLd from "@/components/seo/JsonLd";
import { getOrgIdentity, getSiteConfig } from "@/lib/system-settings/config";
import { getPublicTeamData } from "@/lib/team/data";
import type { PublicTeamMember } from "@/lib/team/public";
import { splitFeatured } from "@/lib/team/directory";
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
} from "@/components/about/primitives";

// Published team data is public and changes rarely; the admin actions call
// revalidatePath("/about/team") on every change, so a long window is safe.
export const revalidate = 600;

/** Below this roster size the metadata strip is suppressed — see the comment
 *  at its call site. Four is the point at which "Team members" and "Service
 *  areas" start describing a team rather than a person. */
const METRICS_MIN_MEMBERS = 4;

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

  // One builder, so this block cannot drift from its four identical siblings
  // again: all five hand-wrote siteName + locale and none of them carried
  // og:locale:alternate or an og:image:alt, verified absent on production
  // 2026-09-20.
  const openGraph = buildOpenGraph({
    locale,
    org,
    title: socialTitle,
    description,
    type: "website" as const,
    url: alternates.canonical,
  });

  return {
    title,
    description,
    alternates,
    openGraph,
    twitter: buildTwitter({
      card: "summary_large_image",
      title: socialTitle,
      description,
      images: openGraph.images,
    }),
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

  // ── The featured section ──────────────────────────────────────────────
  // `is_featured` is the only input — the flag the library itself sets, never
  // a position string; lib/team/directory.ts states the rules in full. Nobody
  // is removed from the directory to appear here, and nothing is padded: two
  // featured members render two cards, never two plus a placeholder.
  const { featured } = splitFeatured(members);

  // The strip that replaced four large statistic cards. Same four derived
  // values, one muted line: on a page about people, a row of big numbers is
  // the loudest thing on screen and it is not the content.
  const metaItems: { key: string; value: string; label: string }[] = [
    { key: "members", value: formatNumber(members.length, locale) ?? "", label: tt("metrics.members") },
    {
      key: "serviceAreas",
      value: formatNumber(sectionsWithMembers.length, locale) ?? "",
      label: tt("metrics.serviceAreas"),
    },
    { key: "languages", value: formatNumber(languageCount, locale) ?? "", label: tt("metrics.languages") },
    { key: "daysOpen", value: formatNumber(daysOpen, locale) ?? "", label: tt("metrics.daysOpen") },
  ].filter((item) => item.value !== "");

  // Structured data — public, non-contact fields only. Admin-authored names
  // flow in here, so it must go through <JsonLd> (which escapes "<" and
  // neutralises a "</script>" breakout), never a raw JSON.stringify.
  const pageUrl = `${SITE_URL}${locale === "km" ? "/km" : ""}/about/team`;
  const profileUrl = (slug: string) =>
    `${SITE_URL}${locale === "km" ? "/km" : ""}/about/team/${slug}`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "AboutPage",
    name: tt("metaTitle"),
    description: tt("metaDescription"),
    url: pageUrl,
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
        // The employee nodes used to carry no URL at all, so nothing in the
        // markup connected this page to the profile pages it links to. Giving
        // each an @id/url lets a crawler resolve the two as one entity.
        ...(m.slug ? { "@id": profileUrl(m.slug), url: profileUrl(m.slug) } : {}),
        worksFor: { "@type": "Organization", name: org.siteName },
      })),
    },
  };

  // A second, separate node: ItemList is the shape Google reads for "this page
  // is a list of those pages", and it is what surfaces the individual profiles
  // as crawlable list items. Only members with a real profile page are listed —
  // an ItemList entry pointing at nothing is worse than a shorter list.
  const listedMembers = members.filter(
    (m): m is PublicTeamMember & { slug: string } => Boolean(m.slug),
  );
  const itemListJsonLd =
    listedMembers.length > 0
      ? {
          "@context": "https://schema.org",
          "@type": "ItemList",
          name: tt("directory.heading"),
          description: tt("metaDescription"),
          url: pageUrl,
          numberOfItems: listedMembers.length,
          itemListOrder: "https://schema.org/ItemListOrderAscending",
          itemListElement: listedMembers.map((m, i) => ({
            "@type": "ListItem",
            position: i + 1,
            url: profileUrl(m.slug),
            item: {
              "@type": "Person",
              "@id": profileUrl(m.slug),
              name: m.name_en || m.name_km,
              ...(m.position_en ? { jobTitle: m.position_en } : {}),
              ...(m.photo_url ? { image: m.photo_url } : {}),
              url: profileUrl(m.slug),
            },
          })),
        }
      : null;

  return (
    <AboutPageShell
      page="team"
      locale={locale}
      hero={{
        category: tt("title"),
        // `heroHeading` — "Meet the people behind PTEC Library" — has existed
        // in both message catalogues since the section was built and was
        // rendered by nothing. It is the sentence this page is FOR, so it is
        // the h1; the short "Library Team" label is the eyebrow above it and
        // stays on the breadcrumb, the sub-navigation and the <title>.
        title: tt("heroHeading"),
        secondaryTitle: locale === "km" ? "Library Team" : "ក្រុមការងារបណ្ណាល័យ",
        secondaryLang: locale === "km" ? "en" : "km",
        intro: tt("intro"),
        // No hero portrait, deliberately. This page's job is to get a reader
        // to the people quickly, and a 4:5 photograph in the hero pushes the
        // first face most of a screen further down — on a phone it cost about
        // 400px before a single name. The first viewport should show staff,
        // not an establishing shot.
        //
        // A plain anchor rather than a locale-aware Link: an in-page fragment
        // has no locale to resolve.
        action: (
          <>
            <a
              href="#featured"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-blue-900 transition-colors hover:bg-gold-100 [--focus-color:#fff]"
            >
              <ArrowDown className="h-4 w-4 shrink-0" aria-hidden="true" />
              {tt("directory.meetTheTeam")}
            </a>
            <AboutExternalAction href={cfg.phoneLibraryTel} icon={Phone} variant="onDark">
              {t("actions.contactLibrary")}
            </AboutExternalAction>
          </>
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
      {itemListJsonLd && <JsonLd data={itemListJsonLd} />}

      {/* ── The people ───────────────────────────────────────────────────
          One client island owns both the "Meet the Library Team" section and
          the searchable roster, because they draw the same card and that card
          opens one shared quick-look panel — see TeamDirectory.

          `lead` is the page's introduction: the library's own sentence about
          what the team does, plus the derived figures as one muted line — no
          boxed panel and no statistic cards. It rides in the first section's
          header rather than in a block above it, because measured at 390x844
          a separate lead block put the first face at y=937, below the fold on
          a phone. The figures disappear entirely below METRICS_MIN_MEMBERS:
          "1 team member · 1 service area" draws the eye straight to how small
          the team is, which is the opposite of what a summary is for.

          No placeholder people are ever invented to fill the grid: when
          nothing is published the page says so and routes the reader to the
          official desk. */}
      {members.length === 0 ? (
        <AboutSection id="directory" title={tt("directory.heading")}>
          <EmptyContentState
            title={tt("empty.heading")}
            body={tt("empty.body")}
            action={
              <AboutExternalAction href={cfg.phoneLibraryTel} icon={Phone} variant="primary">
                {t("actions.callLibrary")}
              </AboutExternalAction>
            }
          />
        </AboutSection>
      ) : (
        <TeamDirectory
          members={members}
          featured={featured}
          sections={sectionsWithMembers}
          locale={locale}
          desk={{
            phone: cfg.phoneLibrary,
            tel: cfg.phoneLibraryTel,
            hours: locale === "km" ? cfg.hours.km : cfg.hours.en,
          }}
          lead={
            <>
              <p className="about-copy about-measure mt-2 text-sm text-text-body">
                {tt("mission.body")}
              </p>
              {members.length >= METRICS_MIN_MEMBERS && metaItems.length > 0 && (
                <ul className="team-meta about-wrap mt-2.5">
                  {metaItems.map((item) => (
                    <li key={item.key}>
                      <span className="team-meta__value">{item.value}</span>
                      <span>{item.label}</span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          }
        />
      )}

      <ContentLastUpdated
        reviewedLabel={reviewedDate ? t("meta.reviewed", { date: reviewedDate }) : null}
        className="border-t border-divider pt-6"
      />
    </AboutPageShell>
  );
}

import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowDown, Clock, MessageCircle, Phone } from "lucide-react";
import { SITE_URL } from "@/lib/seo/site";
import { LIBRARY_ID, ORGANIZATION_ID, ref } from "@/lib/seo/entity-ids";
import { localeAlternates } from "@/lib/seo/alternates";
import { buildOpenGraph, buildTwitter } from "@/lib/seo/open-graph";
import JsonLd from "@/components/seo/JsonLd";
import { getOrgIdentity, getSiteConfig } from "@/lib/system-settings/config";
import { getPublicTeamData } from "@/lib/team/data";
import { photoAltText, type PublicTeamMember } from "@/lib/team/public";
import { heroPortrait, memberNames, memberSummary } from "@/lib/team/directory";
import { groupWeeklySpec } from "@/lib/about/schedule";
import { toAboutLocale, formatDate, formatNumber } from "@/lib/about/format";
import { ABOUT_CONTENT_REVIEWED_AT } from "@/lib/about/content";
import AboutPageShell from "@/components/about/AboutPageShell";
import TeamDirectory from "@/components/about/TeamDirectory";
import {
  OfficialContactCard,
  AboutAnchorAction,
  AboutExternalAction,
  AboutLinkAction,
} from "@/components/about/actions";
import {
  AboutSection,
  ContentLastUpdated,
  EmptyContentState,
  InformationCard,
} from "@/components/about/primitives";

// Published team data is public and changes rarely; the admin actions call
// revalidatePath("/about/team") on every change, so a long window is safe.
export const revalidate = 600;

/** Below this roster size the "at a glance" band is suppressed — see the
 *  comment at its call site. Four is the point at which "Team members" and
 *  "Service areas" start describing a team rather than a person. */
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
  const portrait = heroPortrait(members);

  // Structured data — public, non-contact fields only. Admin-authored names
  // flow in here, so it must go through <JsonLd> (which escapes "<" and
  // neutralises a "</script>" breakout), never a raw JSON.stringify.
  const pageUrl = `${SITE_URL}${locale === "km" ? "/km" : ""}/about/team`;
  const profileUrl = (slug: string) =>
    `${SITE_URL}${locale === "km" ? "/km" : ""}/about/team/${slug}`;

  // One Person node per published member, emitted on THIS page — which is
  // what lets the bio live behind the panel without disappearing from the
  // markup. Both name scripts travel: whichever leads in the active locale is
  // `name`, the other is `alternateName`, so the two spellings resolve to one
  // person rather than to two.
  //
  // `worksFor` is a bare @id reference to the Library node RootShell already
  // declares. It used to be an anonymous `{ "@type": "Organization", name }`
  // repeated once per member — one unlinked copy of the institution per
  // person, on a page that also declares it properly, which is exactly the
  // shape SEO V3 removed from the resource pages (docs/SEO-V3-AUDIT.md D-2).
  const personNode = (m: PublicTeamMember) => {
    const name = memberNames(m, locale);
    const summary = memberSummary(m, locale, 220);
    return {
      "@type": "Person",
      name: name.primary,
      ...(name.secondary ? { alternateName: name.secondary } : {}),
      ...(m.position_en || m.position_km
        ? { jobTitle: (locale === "km" ? m.position_km : m.position_en) || m.position_en || m.position_km }
        : {}),
      ...(m.photo_url ? { image: m.photo_url } : {}),
      ...(summary ? { description: summary.text } : {}),
      // The employee nodes used to carry no URL at all, so nothing in the
      // markup connected this page to the profile pages it links to. Giving
      // each an @id/url lets a crawler resolve the two as one entity.
      ...(m.slug ? { "@id": profileUrl(m.slug), url: profileUrl(m.slug) } : {}),
      worksFor: ref(LIBRARY_ID),
    };
  };

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "AboutPage",
    name: tt("metaTitle"),
    description: tt("metaDescription"),
    url: pageUrl,
    inLanguage: ["en", "km"],
    about: {
      // The @id RootShell's Library node already carries, so a consumer that
      // merges blocks sees ONE library rather than a second anonymous one —
      // and `parentOrganization` is now the bare reference `libraryNode()`
      // itself emits, instead of a third description of the college with its
      // own type and its own sameAs list.
      "@type": "Organization",
      "@id": LIBRARY_ID,
      name: org.siteName,
      url: SITE_URL,
      parentOrganization: ref(ORGANIZATION_ID),
      employee: members.map(personNode),
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
            item: personNode(m),
          })),
        }
      : null;

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
          <>
            {/* Scrolls to the directory rather than navigating: the people
                are on this page, and a reader who has just read one sentence
                about the team should not have to find them by eye. */}
            <AboutAnchorAction targetId="directory" icon={ArrowDown} variant="onDark">
              {tt("hero.meetTheTeam")}
            </AboutAnchorAction>
            <AboutExternalAction href={cfg.phoneLibraryTel} icon={Phone} variant="onDark">
              {t("actions.contactLibrary")}
            </AboutExternalAction>
          </>
        ),
        // A real colleague, not a stock photograph — and only when somebody
        // published a portrait. With none, the hero falls back to the About
        // section's text-only layout with its watermark, exactly as the other
        // four pages render.
        ...(portrait?.photo_url
          ? {
              image: {
                src: portrait.photo_url,
                alt: photoAltText(portrait),
                priority: true,
                shape: "portrait" as const,
                kenBurns: true,
              },
            }
          : {}),
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

      {/* ── Mission ──────────────────────────────────────────────────── */}
      <AboutSection id="mission" title={tt("mission.heading")}>
        <InformationCard>
          <p className="about-copy about-measure text-[15px] text-text-body">
            {tt("mission.body")}
          </p>
        </InformationCard>
      </AboutSection>

      {/* ── Metrics — only when the numbers actually say something ──────
          The existing rule was "render unless the roster is empty, because a
          row of zeroes says nothing". A row of ONES says something worse: at a
          one-person roster this band reads "1 Team members · 1 Service areas",
          which draws the eye straight to how small the team is — the opposite
          of what a band of statistics is for. The section header already
          states the roster size honestly, where a reader expects it. */}
      {members.length >= METRICS_MIN_MEMBERS && (
        <AboutSection id="metrics" title={tt("metrics.heading")}>
          {/* One quiet band, not four cards. The figures are context for the
              directory below, and four cards gave each of them the weight of
              a claim. Same four numbers, same sources — no page-local count
              query is introduced here (lib/resource-stats-consistency). */}
          <ul className="team-glance scroll-row">
            {[
              { value: formatNumber(members.length, locale), label: tt("metrics.members") },
              {
                value: formatNumber(sectionsWithMembers.length, locale),
                label: tt("metrics.serviceAreas"),
              },
              { value: formatNumber(languageCount, locale), label: tt("metrics.languages") },
              { value: formatNumber(daysOpen, locale), label: tt("metrics.daysOpen") },
            ].map((stat) => (
              <li key={stat.label} className="team-glance__item">
                <span className="team-glance__value">{stat.value ?? "—"}</span>
                <span className="team-glance__label about-wrap">{stat.label}</span>
              </li>
            ))}
          </ul>
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

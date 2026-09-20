import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Clock, Landmark, MessageCircle, Phone } from "lucide-react";

import { SITE_URL } from "@/lib/seo/site";
import { localeAlternates } from "@/lib/seo/alternates";
import { buildOpenGraph, buildTwitter } from "@/lib/seo/open-graph";
import JsonLd from "@/components/seo/JsonLd";
import { getOrgIdentity, getSiteConfig } from "@/lib/system-settings/config";
import { getPublicCommitteeData } from "@/lib/committee/data";
import { publishedCount, type PublicCommitteeMember } from "@/lib/committee/public";
import { toAboutLocale, formatDate } from "@/lib/about/format";
import { ABOUT_CONTENT_REVIEWED_AT } from "@/lib/about/content";
import AboutPageShell from "@/components/about/AboutPageShell";
import CommitteeRoster from "@/components/about/CommitteeRoster";
import { OfficialContactCard, AboutExternalAction, AboutLinkAction } from "@/components/about/actions";
import {
  AboutSection,
  ContentLastUpdated,
  EmptyContentState,
  InformationCard,
  NoticePanel,
} from "@/components/about/primitives";

// The committee changes rarely and every admin mutation revalidates this path
// (app/(admin)/admin/(protected)/team/committee/actions.ts), as does every edit
// to a team member — the same people are rendered here.
export const revalidate = 600;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "about.committee" });
  const org = await getOrgIdentity();
  const alternates = localeAlternates("/about/committee", locale);
  // The document <title> gets the brand from the site's titleTemplate, so
  // `title` must not repeat it; an OG title travels alone into a social card.
  const title = t("metaTitle");
  const description = t("metaDescription");
  const socialTitle = `${title} · ${org.siteName}`;

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

export default async function LibraryCommitteePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  setRequestLocale(rawLocale);
  const locale = toAboutLocale(rawLocale);

  const t = await getTranslations("about");
  const tc = await getTranslations("about.committee");
  const [{ groups, unavailable }, cfg, org] = await Promise.all([
    getPublicCommitteeData(),
    getSiteConfig(),
    getOrgIdentity(),
  ]);

  const members = groups.flatMap((group) => group.members);
  const total = publishedCount(groups);
  const reviewedDate = formatDate(ABOUT_CONTENT_REVIEWED_AT, locale);

  const pageUrl = `${SITE_URL}${locale === "km" ? "/km" : ""}/about/committee`;
  const profileUrl = (slug: string) =>
    `${SITE_URL}${locale === "km" ? "/km" : ""}/about/team/${slug}`;

  /* Structured data describes what is actually published and nothing else.
     Committee members are `member` of the library Organization — not
     `employee`, which is what /about/team asserts about staff and would be a
     claim this page has no basis for: sitting on the committee is a role, and
     some holders of it are college staff rather than library staff.

     Names are admin-authored, so this goes through <JsonLd> (which escapes a
     "</script>" breakout), never a raw JSON.stringify. */
  const jsonLd =
    total > 0
      ? {
          "@context": "https://schema.org",
          "@type": "AboutPage",
          name: tc("metaTitle"),
          description: tc("metaDescription"),
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
            member: members.map((m) => ({
              "@type": "Person",
              name: m.name_en || m.name_km,
              // The committee role, when one was entered — never the staff
              // position dressed up as one.
              ...(m.role_en ? { jobTitle: m.role_en } : {}),
              ...(m.slug ? { "@id": profileUrl(m.slug), url: profileUrl(m.slug) } : {}),
            })),
          },
        }
      : null;

  /* An ItemList surfaces the individual profiles as crawlable list items —
     but only members who HAVE a profile page. A list item pointing at nothing
     is worse than a shorter list, and the view already withholds the slug of
     anyone who is not published on /about/team. */
  const listed = members.filter(
    (m): m is PublicCommitteeMember & { slug: string } => Boolean(m.slug),
  );
  const itemListJsonLd =
    listed.length > 0
      ? {
          "@context": "https://schema.org",
          "@type": "ItemList",
          name: tc("roster.heading"),
          url: pageUrl,
          numberOfItems: listed.length,
          itemListOrder: "https://schema.org/ItemListOrderAscending",
          itemListElement: listed.map((m, i) => ({
            "@type": "ListItem",
            position: i + 1,
            url: profileUrl(m.slug),
            item: {
              "@type": "Person",
              "@id": profileUrl(m.slug),
              name: m.name_en || m.name_km,
              ...(m.role_en ? { jobTitle: m.role_en } : {}),
              ...(m.photo_url ? { image: m.photo_url } : {}),
              url: profileUrl(m.slug),
            },
          })),
        }
      : null;

  return (
    <AboutPageShell
      page="committee"
      locale={locale}
      hero={{
        category: tc("category"),
        title: tc("title"),
        secondaryTitle: locale === "km" ? "Library Committee" : "គណៈកម្មការបណ្ណាល័យ",
        secondaryLang: locale === "km" ? "en" : "km",
        intro: tc("intro"),
        /* The committee is a body OF a named department, and the board on the
           library wall says so before it says anything else. Stating it here
           is what tells a reader which committee this is — the college has
           more than one. */
        badge: (
          <span className="inline-flex items-center gap-2 rounded-full border border-gold-400/40 bg-gold-500/10 px-3 py-1.5 text-sm font-semibold text-gold-200">
            <Landmark className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span lang={locale} className="about-wrap">
              {tc("department")}
            </span>
          </span>
        ),
        action: (
          <AboutExternalAction href={cfg.phoneLibraryTel} icon={Phone} variant="onDark">
            {t("actions.contactLibrary")}
          </AboutExternalAction>
        ),
      }}
      footer={
        <div className="mt-14">
          <OfficialContactCard
            heading={tc("contact.heading")}
            body={tc("contact.body")}
            privacyNote={tc("contact.officialOnly")}
            deskLabel={tc("contact.deskLabel")}
            desk={cfg.phoneLibrary}
            deskHref={cfg.phoneLibraryTel}
            emailLabel={tc("contact.emailLabel")}
            email={cfg.email}
            hoursLabel={tc("contact.hoursLabel")}
            hours={locale === "km" ? cfg.hours.km : cfg.hours.en}
            /* The board on the library wall carries the department's street
               address, and a reader who has just read a governance page is the
               one most likely to want to visit in person. The card already
               knows how to draw the row (MapPin); this page simply never
               passed it. */
            addressLabel={tc("contact.addressLabel")}
            address={locale === "km" ? cfg.address.km : cfg.address.en}
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
      {jsonLd && <JsonLd data={jsonLd} />}
      {itemListJsonLd && <JsonLd data={itemListJsonLd} />}

      {/* ── What the committee is ────────────────────────────────────── */}
      <AboutSection id="purpose" title={tc("purpose.heading")}>
        <InformationCard>
          <p className="about-copy about-measure text-[15px] text-text-body">
            {tc("purpose.body")}
          </p>
        </InformationCard>
      </AboutSection>

      {/* ── The roster ───────────────────────────────────────────────────
          There is deliberately no band of statistics here. The honest figure
          — how many members are published — is stated once, in the section
          header where a reader expects it; a card reading "1 Committee
          members" says nothing except how small the list is. */}
      <AboutSection
        id="members"
        title={tc("roster.heading")}
        /* The standfirst says what the list IS; the count says how big it is.
           They were one string before, which made the section's only
           description read "12 members". */
        description={total > 0 ? tc("roster.standfirst") : null}
        action={
          total > 0 ? (
            <span className="inline-flex items-center rounded-full border border-divider bg-paper px-3 py-1 text-sm font-semibold text-text-body">
              {tc("roster.count", { count: total })}
            </span>
          ) : null
        }
      >
        {unavailable ? (
          /* A failed read is NOT an empty committee. Saying "no members are
             published" when the database did not answer is a false statement
             about the institution, so the two are told apart. */
          <NoticePanel tone="caution" label={tc("unavailable.label")} role="status">
            {tc("unavailable.body")}
          </NoticePanel>
        ) : total === 0 ? (
          <EmptyContentState
            title={tc("empty.heading")}
            body={tc("empty.body")}
            action={
              <AboutExternalAction href={cfg.phoneLibraryTel} icon={Phone} variant="primary">
                {t("actions.callLibrary")}
              </AboutExternalAction>
            }
          />
        ) : (
          <CommitteeRoster groups={groups} locale={locale} />
        )}
      </AboutSection>

      <ContentLastUpdated
        reviewedLabel={reviewedDate ? t("meta.reviewed", { date: reviewedDate }) : null}
        className="border-t border-divider pt-6"
      />
    </AboutPageShell>
  );
}

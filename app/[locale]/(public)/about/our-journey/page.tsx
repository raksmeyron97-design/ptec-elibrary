import type { Metadata } from "next";
import Image from "next/image";
import { getTranslations, setRequestLocale } from "next-intl/server";
import {
  Archive,
  BookMarked,
  BookOpenCheck,
  Globe2,
  Newspaper,
  ScanLine,
  Sparkles,
  Target,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { localeAlternates } from "@/lib/seo/alternates";
import { SITE_URL } from "@/lib/seo/site";
import { getOrgIdentity } from "@/lib/system-settings/config";
import { toAboutLocale, formatDate, formatNumber, localized } from "@/lib/about/format";
import {
  ABOUT_CONTENT_REVIEWED_AT,
  DEPARTMENT_CONTEXT,
  FOUNDING_STORY,
  FOUNDING_YEAR,
  FUTURE_GOAL,
  JOURNEY_ACHIEVEMENTS,
  JOURNEY_MILESTONES,
  ROADMAP_ITEMS,
} from "@/lib/about/content";
import AboutPageShell from "@/components/about/AboutPageShell";
import JourneyTimeline from "@/components/about/JourneyTimeline";
import {
  AboutSection,
  ContentLastUpdated,
  EmptyContentState,
  InformationCard,
  NoticePanel,
} from "@/components/about/primitives";

// Institutional history changes rarely; the copy is compiled in. ISR keeps the
// page on the CDN while still picking up a settings change (org identity) on
// the next revalidation.
export const revalidate = 3600;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "about.journey" });
  const org = await getOrgIdentity();
  const alternates = localeAlternates("/about/our-journey", locale);
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

const ACHIEVEMENT_ICONS: Record<string, LucideIcon> = {
  book: BookOpenCheck,
  press: BookMarked,
  bulletin: Newspaper,
  globe: Globe2,
};

const ROADMAP_ICONS: Record<string, LucideIcon> = {
  globe: Globe2,
  scan: ScanLine,
  books: BookMarked,
  archive: Archive,
};

export default async function OurJourneyPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  setRequestLocale(rawLocale);
  const locale = toAboutLocale(rawLocale);

  const t = await getTranslations("about");
  const tj = await getTranslations("about.journey");

  const foundingStory = localized(FOUNDING_STORY, locale);
  const context = localized(DEPARTMENT_CONTEXT, locale);
  const goal = localized(FUTURE_GOAL, locale);
  const reviewedDate = formatDate(ABOUT_CONTENT_REVIEWED_AT, locale);

  return (
    <AboutPageShell
      page="ourJourney"
      locale={locale}
      hero={{
        category: tj("category"),
        title: tj("title"),
        secondaryTitle: locale === "km" ? "Our Journey" : "ដំណើររបស់យើង",
        secondaryLang: locale === "km" ? "en" : "km",
        intro: tj("intro"),
        badge: (
          <span className="inline-flex items-center gap-2 rounded-full border border-gold-400/40 bg-gold-500/10 px-3 py-1.5 text-sm font-semibold text-gold-200">
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            {tj("established", { year: FOUNDING_YEAR })}
          </span>
        ),
        image: {
          src: "/hero/ptec-library-960.jpg",
          alt: tj("founding.imageAlt"),
          priority: true,
        },
      }}
    >
      {/* ── Founding story ───────────────────────────────────────────────
          Two columns on desktop, image FIRST on mobile (source order is
          image → text, and the desktop grid reorders visually only). */}
      <AboutSection id="founding" title={tj("founding.heading")}>
        <div className="grid gap-8 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:items-start">
          <div className="relative aspect-[4/3] overflow-hidden rounded-2xl border border-divider bg-paper">
            <Image
              src="/hero/ptec-library-640.webp"
              alt={tj("founding.imageAlt")}
              fill
              loading="lazy"
              sizes="(min-width: 1024px) 22rem, 100vw"
              className="object-cover"
            />
          </div>

          <div className="min-w-0">
            <p className="inline-flex items-center rounded-full bg-brand/10 px-3 py-1 text-sm font-semibold text-brand">
              {tj("founding.yearBadge", { year: FOUNDING_YEAR })}
            </p>
            {foundingStory && (
              <p
                lang={foundingStory.lang}
                className="about-copy about-measure mt-4 text-[15px] text-text-body"
              >
                {foundingStory.text}
              </p>
            )}
            {context && (
              <div className="mt-6 border-l-2 border-divider pl-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                  {tj("founding.context")}
                </p>
                <p
                  lang={context.lang}
                  className="about-copy about-measure mt-2 text-sm text-text-body"
                >
                  {context.text}
                </p>
              </div>
            )}
          </div>
        </div>
      </AboutSection>

      {/* ── Achievements ─────────────────────────────────────────────────
          A card shows a number ONLY when content.ts marks the figure
          verified. The research-bulletin card deliberately has none: the
          source states four titles in §1.4 and six volumes in §2.4. */}
      <AboutSection
        id="achievements"
        title={tj("achievements.heading")}
        description={tj("achievements.intro")}
      >
        <ul className="grid gap-4 sm:grid-cols-2">
          {JOURNEY_ACHIEVEMENTS.map((achievement) => {
            const Icon = ACHIEVEMENT_ICONS[achievement.icon] ?? BookMarked;
            const title = localized(achievement.title, locale);
            const description = localized(achievement.description, locale);
            const showsFigure = achievement.count?.confidence === "verified";
            const figure = showsFigure ? formatNumber(achievement.count!.value, locale) : null;

            return (
              <li key={achievement.id}>
                <InformationCard className="flex h-full gap-4">
                  <span
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand/10"
                    aria-hidden="true"
                  >
                    <Icon className="h-5 w-5 text-brand" />
                  </span>
                  <div className="min-w-0">
                    {figure && (
                      <p className="text-2xl font-semibold tabular-nums tracking-tight text-text-heading">
                        {achievement.isMinimum && (
                          <span className="mr-1.5 align-middle text-sm font-medium text-text-muted">
                            {tj("achievements.minimumPrefix")}
                          </span>
                        )}
                        {figure}
                        <span className="ml-1.5 align-middle text-sm font-medium text-text-muted">
                          {tj("achievements.titlesUnit")}
                        </span>
                      </p>
                    )}
                    {title && (
                      <h3
                        lang={title.lang}
                        className={`about-wrap font-semibold text-text-heading ${figure ? "mt-1 text-sm" : "text-base"}`}
                      >
                        {title.text}
                      </h3>
                    )}
                    {description && (
                      <p
                        lang={description.lang}
                        className="about-copy mt-1.5 text-sm text-text-muted"
                      >
                        {description.text}
                      </p>
                    )}
                    {/* Honest, quiet marker where a figure exists in the
                        source but is self-contradictory. */}
                    {!figure && achievement.id === "research-bulletin" && (
                      <p className="mt-2 text-xs font-medium text-text-muted">
                        {tj("achievements.noFigure")}
                      </p>
                    )}
                  </div>
                </InformationCard>
              </li>
            );
          })}
        </ul>
      </AboutSection>

      {/* ── Timeline ─────────────────────────────────────────────────── */}
      <AboutSection id="timeline" title={tj("timeline.heading")} description={tj("timeline.intro")}>
        <JourneyTimeline
          milestones={JOURNEY_MILESTONES}
          locale={locale}
          yearLabel={tj("timeline.yearLabel")}
          moreComingTitle={tj("timeline.moreComing")}
          moreComingBody={tj("timeline.moreComingBody")}
        />
      </AboutSection>

      {/* ── Growth ───────────────────────────────────────────────────────
          Section §2.5 of the source form was submitted blank. It is kept
          visible with an honest empty state rather than dropped, so the
          gap is legible to the library when it reviews this page. */}
      <AboutSection id="growth" title={tj("growth.heading")}>
        <EmptyContentState title={tj("growth.pending")} body={tj("growth.pendingBody")} />
      </AboutSection>

      {/* ── Roadmap ──────────────────────────────────────────────────── */}
      <AboutSection id="roadmap" title={tj("roadmap.heading")}>
        <NoticePanel tone="info" label={tj("roadmap.label")} className="mb-6">
          <p className="font-medium text-text-heading">{tj("roadmap.goalLabel")}</p>
          {goal && (
            <p lang={goal.lang} className="about-wrap mt-1 text-base font-semibold text-text-heading">
              “{goal.text}”
            </p>
          )}
          <p className="mt-2 text-xs">{tj("roadmap.note")}</p>
        </NoticePanel>

        <ul className="grid gap-4 sm:grid-cols-2">
          {ROADMAP_ITEMS.map((item) => {
            const Icon = ROADMAP_ICONS[item.icon] ?? Target;
            const title = localized(item.title, locale);
            const description = localized(item.description, locale);
            return (
              <li key={item.id}>
                <InformationCard className="flex h-full gap-4">
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-paper"
                    aria-hidden="true"
                  >
                    <Icon className="h-4.5 w-4.5 text-text-muted" />
                  </span>
                  <div className="min-w-0">
                    {title && (
                      <h3 lang={title.lang} className="about-wrap text-sm font-semibold text-text-heading">
                        {title.text}
                      </h3>
                    )}
                    {description && (
                      <p lang={description.lang} className="about-copy mt-1 text-sm text-text-muted">
                        {description.text}
                      </p>
                    )}
                  </div>
                </InformationCard>
              </li>
            );
          })}
        </ul>
      </AboutSection>

      <ContentLastUpdated
        reviewedLabel={reviewedDate ? t("meta.reviewed", { date: reviewedDate }) : null}
        note={t("meta.sourceNote")}
        className="border-t border-divider pt-6"
      />
    </AboutPageShell>
  );
}

import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import {
  BookOpen,
  Building2,
  FlaskConical,
  GraduationCap,
  Languages,
  Layers,
  Library,
  MapPin,
  Newspaper,
  ScrollText,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { localeAlternates } from "@/lib/seo/alternates";
import { SITE_URL } from "@/lib/seo/site";
import { getOrgIdentity, getSiteConfig } from "@/lib/system-settings/config";
import { getCollectionStats } from "@/lib/collection-stats";
import { toAboutLocale, formatDate, formatNumber, formatSourcedNumber, localized } from "@/lib/about/format";
import {
  ABOUT_CONTENT_REVIEWED_AT,
  COLLECTION_LANGUAGES,
  DDC_CATEGORIES,
  PHYSICAL_COLLECTION,
  SPECIAL_COLLECTIONS,
} from "@/lib/about/content";
import AboutPageShell from "@/components/about/AboutPageShell";
import DdcExplorer from "@/components/about/DdcExplorer";
import DdcTable from "@/components/about/DdcTable";
import { AboutExternalAction, AboutLinkAction } from "@/components/about/actions";
import {
  AboutSection,
  ContentLastUpdated,
  InformationCard,
  NoticePanel,
  StatCard,
} from "@/components/about/primitives";

// The digital figures come from getCollectionStats(), itself cached for five
// minutes under the "collection-stats" tag — every content mutation
// invalidates that tag, so this page follows the catalogue without a shorter
// window here.
export const revalidate = 600;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "about.collection" });
  const org = await getOrgIdentity();
  const alternates = localeAlternates("/about/collection", locale);
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

const SPECIAL_ICONS: Record<string, LucideIcon> = {
  flask: FlaskConical,
  graduation: GraduationCap,
  scroll: ScrollText,
  journal: Newspaper,
};

export default async function LibraryCollectionPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  setRequestLocale(rawLocale);
  const locale = toAboutLocale(rawLocale);

  const t = await getTranslations("about");
  const tc = await getTranslations("about.collection");
  const [cfg, digital] = await Promise.all([getSiteConfig(), getCollectionStats()]);

  const asOfDate = formatDate(PHYSICAL_COLLECTION.asOf, locale);
  const reviewedDate = formatDate(ABOUT_CONTENT_REVIEWED_AT, locale);
  const mapUrl = cfg.links.mapPlace?.trim() || null;

  return (
    <AboutPageShell
      page="collection"
      locale={locale}
      hero={{
        category: tc("category"),
        title: tc("title"),
        secondaryTitle: locale === "km" ? "Library Collection" : "បណ្ដុំឯកសារបណ្ណាល័យ",
        secondaryLang: locale === "km" ? "en" : "km",
        intro: tc("intro"),
        action: (
          <AboutLinkAction href="/catalogs" icon={Library} variant="onDark">
            {t("actions.browseCatalogue")}
          </AboutLinkAction>
        ),
      }}
    >
      {/* ── Overview statistics ──────────────────────────────────────────
          Every figure here comes from ONE typed source (lib/about/content)
          and is formatted once. `formatSourcedNumber` returns null for any
          figure the source states inconsistently, so a contested number can
          never reach a card. */}
      <AboutSection id="statistics" title={tc("stats.heading")}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            icon={BookOpen}
            emphasis
            value={formatSourcedNumber(PHYSICAL_COLLECTION.titles, locale)}
            label={tc("stats.titles")}
            hint={tc("stats.titlesHint")}
          />
          <StatCard
            icon={Layers}
            value={formatSourcedNumber(PHYSICAL_COLLECTION.copies.total, locale)}
            label={tc("stats.copies")}
            hint={tc("stats.copiesHint")}
          />
          <StatCard
            icon={Languages}
            value={formatNumber(COLLECTION_LANGUAGES.length, locale)}
            label={tc("stats.languages")}
            hint={tc("stats.languagesHint")}
          />
          <StatCard
            icon={FlaskConical}
            value={formatNumber(SPECIAL_COLLECTIONS.length, locale)}
            label={tc("stats.specialCollections")}
            hint={tc("stats.specialCollectionsHint")}
          />
        </div>

        {/* The single most important caveat about these numbers, stated
            where the numbers are — not buried in a footnote. */}
        <NoticePanel tone="info" label={tc("stats.noteLabel")} className="mt-4">
          <p>{tc("stats.measurementNote")}</p>
          {asOfDate && (
            <p className="mt-1 text-xs text-text-muted">{tc("stats.asOf", { date: asOfDate })}</p>
          )}
        </NoticePanel>
      </AboutSection>

      {/* ── Physical vs digital ──────────────────────────────────────────
          Two distinct cards. The digital card shows LIVE counts from the
          e-Library catalogue rather than the source form's figure, because
          §6.4 of the form was submitted blank — and a live exact count is
          better than a stale supplied one. When the query fails the card
          says so instead of rendering zeros. */}
      <AboutSection id="holdings" title={tc("holdings.heading")}>
        <div className="grid gap-4 lg:grid-cols-2">
          <InformationCard className="flex h-full flex-col">
            <div className="flex items-center gap-3">
              <span
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand/10"
                aria-hidden="true"
              >
                <Building2 className="h-5 w-5 text-brand" />
              </span>
              <h3 className="about-wrap text-base font-semibold text-text-heading">
                {tc("physical.heading")}
              </h3>
            </div>
            <p className="about-copy mt-3 text-sm text-text-body">{tc("physical.body")}</p>

            <dl className="mt-4 space-y-2.5">
              {[
                { label: tc("physical.nonTextbook"), value: PHYSICAL_COLLECTION.copies.nonTextbook },
                { label: tc("physical.textbook"), value: PHYSICAL_COLLECTION.copies.textbook },
                { label: tc("physical.totalCopies"), value: PHYSICAL_COLLECTION.copies.total },
              ].map((row, index, all) => (
                <div
                  key={row.label}
                  className={`flex items-baseline justify-between gap-4 ${
                    index === all.length - 1 ? "border-t border-divider pt-2.5 font-semibold" : ""
                  }`}
                >
                  <dt className="about-wrap text-sm text-text-body">{row.label}</dt>
                  <dd className="shrink-0 text-base tabular-nums text-text-heading">
                    {formatSourcedNumber(row.value, locale) ?? "—"}
                  </dd>
                </div>
              ))}
            </dl>

            <div className="mt-auto flex flex-wrap gap-3 pt-5" data-about-print="hide">
              <AboutLinkAction href="/catalogs" icon={Library}>
                {t("actions.browseCatalogue")}
              </AboutLinkAction>
              <AboutExternalAction href={mapUrl} icon={MapPin} newTab>
                {t("actions.getDirections")}
              </AboutExternalAction>
            </div>
          </InformationCard>

          {/* Brand-tinted, matching the e-Library card on /about/timings.
              "Digital = brand tint, physical = plain surface" is now one
              consistent language across both pages; it used to be gold here
              and green there, so the same distinction was drawn with three
              different colours depending on which page you landed on.
              The distinction still does not rest on colour — the icon, the
              heading and the supporting copy all say which is which. */}
          <InformationCard className="flex h-full flex-col border-surface-brand-line bg-surface-brand-soft">
            <div className="flex items-center gap-3">
              <span
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand/10"
                aria-hidden="true"
              >
                <BookOpen className="h-5 w-5 text-brand" />
              </span>
              <h3 className="about-wrap text-base font-semibold text-text-heading">
                {tc("digital.heading")}
              </h3>
            </div>
            <p className="about-copy mt-3 text-sm text-text-body">{tc("digital.body")}</p>

            {digital ? (
              <>
                <dl className="mt-4 space-y-2.5">
                  {[
                    { label: tc("digital.books"), value: digital.books },
                    { label: tc("digital.theses"), value: digital.theses },
                    { label: tc("digital.publications"), value: digital.publications },
                    { label: tc("digital.total"), value: digital.totalDigitalResources },
                  ].map((row, index, all) => (
                    <div
                      key={row.label}
                      className={`flex items-baseline justify-between gap-4 ${
                        index === all.length - 1 ? "border-t border-divider pt-2.5 font-semibold" : ""
                      }`}
                    >
                      <dt className="about-wrap text-sm text-text-body">{row.label}</dt>
                      <dd className="shrink-0 text-base tabular-nums text-text-heading">
                        {formatNumber(row.value, locale)}
                      </dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-3 text-xs text-text-muted">{tc("digital.liveNote")}</p>
              </>
            ) : (
              // A failed count renders as an honest sentence, never as "0".
              <p role="status" className="mt-4 rounded-xl border border-divider bg-paper p-4 text-sm text-text-muted">
                {tc("digital.unavailable")}
              </p>
            )}

            <div className="mt-auto flex flex-wrap gap-3 pt-5" data-about-print="hide">
              <AboutLinkAction href="/books" icon={BookOpen} variant="primary">
                {t("actions.browseELibrary")}
              </AboutLinkAction>
            </div>
          </InformationCard>
        </div>
      </AboutSection>

      {/* ── DDC explorer ─────────────────────────────────────────────── */}
      <AboutSection id="subjects" title={tc("ddc.heading")} description={tc("ddc.intro")}>
        <DdcExplorer categories={DDC_CATEGORIES} locale={locale} />

        <h3 className="mt-10 text-base font-semibold text-text-heading">
          {tc("ddc.tableHeading")}
        </h3>
        <div className="mt-4">
          <DdcTable
            categories={DDC_CATEGORIES}
            locale={locale}
            labels={{
              caption: tc("ddc.tableCaption"),
              code: tc("ddc.colCode"),
              category: tc("ddc.colCategory"),
              titles: tc("ddc.colTitles"),
              share: tc("ddc.colShare"),
              total: tc("ddc.total"),
              localGrouping: tc("ddc.localGrouping"),
              codeConflict: tc("ddc.codeConflict"),
            }}
          />
        </div>

        <NoticePanel tone="caution" label={tc("ddc.codeConflict")} className="mt-4">
          <p>{tc("ddc.codeConflictHint")}</p>
        </NoticePanel>
      </AboutSection>

      {/* ── Languages ────────────────────────────────────────────────────
          Static chips, not buttons: the public catalogue has no language
          facet, and a chip that looks pressable but does nothing is worse
          than plain text. The note says so out loud. */}
      <AboutSection id="languages" title={tc("languages.heading")} description={tc("languages.intro")}>
        <ul className="flex flex-wrap gap-2.5">
          {COLLECTION_LANGUAGES.map((language) => {
            const name = localized(language.name, locale);
            if (!name) return null;
            const chip = (
              <span className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-divider bg-bg-surface px-4 py-2.5 text-sm shadow-sm">
                <Languages className="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
                <span lang={name.lang} className="about-wrap font-medium text-text-heading">
                  {name.text}
                </span>
              </span>
            );
            return (
              <li key={language.id}>
                {language.catalogFilter ? (
                  <AboutLinkAction href={language.catalogFilter} icon={Languages}>
                    {name.text}
                  </AboutLinkAction>
                ) : (
                  chip
                )}
              </li>
            );
          })}
        </ul>
        <p className="mt-3 text-xs text-text-muted">{tc("languages.noFilterNote")}</p>
      </AboutSection>

      {/* ── Special collections ──────────────────────────────────────── */}
      <AboutSection id="special" title={tc("special.heading")} description={tc("special.intro")}>
        <ul className="grid gap-4 sm:grid-cols-2">
          {SPECIAL_COLLECTIONS.map((collection) => {
            const Icon = SPECIAL_ICONS[collection.icon] ?? Library;
            const title = localized(collection.title, locale);
            const description = localized(collection.description, locale);
            return (
              <li key={collection.id}>
                <InformationCard className="flex h-full flex-col">
                  <div className="flex gap-4">
                    <span
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-paper"
                      aria-hidden="true"
                    >
                      <Icon className="h-5 w-5 text-text-muted" />
                    </span>
                    <div className="min-w-0">
                      {title && (
                        <h3 lang={title.lang} className="about-wrap text-sm font-semibold text-text-heading">
                          {title.text}
                        </h3>
                      )}
                      {description && (
                        <p lang={description.lang} className="about-copy mt-1.5 text-sm text-text-muted">
                          {description.text}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="mt-auto pt-4" data-about-print="hide">
                    {collection.href ? (
                      <AboutLinkAction href={collection.href}>
                        {tc("special.browse")}
                      </AboutLinkAction>
                    ) : (
                      // No route exists for this collection, so no button —
                      // just a statement of where to find it.
                      <p className="text-xs text-text-muted">{tc("special.notOnline")}</p>
                    )}
                  </div>
                </InformationCard>
              </li>
            );
          })}
        </ul>
      </AboutSection>

      {/* ── Classification note ──────────────────────────────────────── */}
      <AboutSection id="classification" title={tc("classification.heading")}>
        <InformationCard>
          <p className="about-copy about-measure text-sm text-text-body">
            {tc("classification.body")}
          </p>
        </InformationCard>
      </AboutSection>

      <ContentLastUpdated
        reviewedLabel={reviewedDate ? t("meta.reviewed", { date: reviewedDate }) : null}
        note={t("meta.sourceNote")}
        className="border-t border-divider pt-6"
      />
    </AboutPageShell>
  );
}

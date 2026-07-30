import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { BookOpen, Building2, CalendarOff, Globe2, MapPin, Phone, Scale } from "lucide-react";
import { localeAlternates } from "@/lib/seo/alternates";
import { SITE_URL } from "@/lib/seo/site";
import { getOrgIdentity, getSiteConfig } from "@/lib/system-settings/config";
import { upcomingClosures } from "@/lib/system-settings/hours";
import { formatTimeLabel } from "@/lib/library-hours";
import { toAboutLocale, formatClock, formatDate, localized } from "@/lib/about/format";
import { resolveLibraryStatus } from "@/lib/about/status";
import { cambodiaWeekday, minutesToHHMM, todayIntervals } from "@/lib/about/schedule";
import { ABOUT_CONTENT_REVIEWED_AT, SPECIAL_SCHEDULE_ROWS } from "@/lib/about/content";
import AboutPageShell from "@/components/about/AboutPageShell";
import LibraryOpenStatus from "@/components/about/LibraryOpenStatus";
import WeeklyHoursTable from "@/components/about/WeeklyHoursTable";
import { AboutExternalAction, AboutLinkAction } from "@/components/about/actions";
import {
  AboutSection,
  ContentLastUpdated,
  EmptyContentState,
  InformationCard,
  NoticePanel,
} from "@/components/about/primitives";

// Short window: the server-rendered status is only a first paint (the client
// refreshes it every minute), but a stale-by-an-hour cache would still show a
// visibly wrong badge to a visitor with JavaScript disabled.
export const revalidate = 300;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "about.timings" });
  const org = await getOrgIdentity();
  const alternates = localeAlternates("/about/timings", locale);
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

export default async function LibraryTimingsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  setRequestLocale(rawLocale);
  const locale = toAboutLocale(rawLocale);

  const t = await getTranslations("about");
  const tt = await getTranslations("about.timings");
  const cfg = await getSiteConfig();

  const now = new Date();
  const spec = cfg.hours.openingHoursSpec;
  const closures = cfg.hours.closures;
  const status = resolveLibraryStatus(now, spec, closures);
  const todayWeekday = cambodiaWeekday(now);
  const today = todayIntervals(spec, now);
  const upcoming = upcomingClosures(now, [...closures]);
  const reviewedDate = formatDate(ABOUT_CONTENT_REVIEWED_AT, locale);

  const todayLabel =
    today.length > 0
      ? today
          .map((r) => {
            const from = formatClock(minutesToHHMM(r.open), locale);
            const to = formatClock(minutesToHHMM(r.close), locale);
            return from && to ? `${from} – ${to}` : null;
          })
          .filter(Boolean)
          .join(" · ")
      : tt("weekly.closed");

  // Address is a plain string in settings; only offer directions when the
  // library has actually published a maps URL.
  const mapUrl = cfg.links.mapPlace?.trim() || null;
  const address = locale === "km" ? cfg.address.km : cfg.address.en;

  return (
    <AboutPageShell
      page="timings"
      locale={locale}
      hero={{
        category: tt("category"),
        title: tt("title"),
        secondaryTitle: locale === "km" ? "Library Timings" : "ម៉ោងបម្រើសេវាកម្ម",
        secondaryLang: locale === "km" ? "en" : "km",
        intro: tt("intro"),
        action: (
          <>
            <AboutExternalAction href={mapUrl} icon={MapPin} variant="onDark" newTab>
              {t("actions.getDirections")}
            </AboutExternalAction>
            <AboutExternalAction href={cfg.phoneLibraryTel} icon={Phone} variant="onDark">
              {t("actions.callLibrary")}
            </AboutExternalAction>
          </>
        ),
      }}
    >
      {/* ── Live status ──────────────────────────────────────────────── */}
      <AboutSection id="status" title={tt("status.heading")}>
        <LibraryOpenStatus
          initialStatus={status}
          spec={[...spec]}
          closures={[...closures]}
          locale={locale}
        />
      </AboutSection>

      {/* ── Physical vs digital ──────────────────────────────────────────
          Two visually distinct cards, because "the library is closed" and
          "you can't read anything" are different statements and conflating
          them is the single most common misreading of this page. */}
      <AboutSection id="availability" title={tt("availability.heading")}>
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
                {tt("physical.heading")}
              </h3>
            </div>
            <p className="about-copy mt-3 text-sm text-text-body">{tt("physical.body")}</p>

            <dl className="mt-4 rounded-xl border border-divider bg-paper p-4">
              <dt className="text-xs font-medium uppercase tracking-wide text-text-muted">
                {tt("physical.todayLabel")}
              </dt>
              <dd className="mt-1 text-lg font-semibold tabular-nums text-text-heading">
                {todayLabel}
              </dd>
            </dl>

            <div className="mt-auto flex flex-wrap gap-3 pt-5" data-about-print="hide">
              <AboutExternalAction href={mapUrl} icon={MapPin} newTab>
                {t("actions.getDirections")}
              </AboutExternalAction>
              <AboutLinkAction href="/about/rules" icon={Scale}>
                {t("actions.viewRules")}
              </AboutLinkAction>
            </div>
          </InformationCard>

          {/* The e-Library card is BRAND-tinted, not green. Green is spent
              on one thing on this page — the live "Open now" state of the
              physical building. "Available 24/7" is a permanent property of a
              service, not a live status, and giving it the same green made
              two unrelated things look like the same signal. The brand tint
              also says "this is ours" about the service the site itself is. */}
          <InformationCard className="flex h-full flex-col border-surface-brand-line bg-surface-brand-soft">
            <div className="flex items-center gap-3">
              <span
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand/10"
                aria-hidden="true"
              >
                <Globe2 className="h-5 w-5 text-brand" />
              </span>
              <h3 className="about-wrap text-base font-semibold text-text-heading">
                {tt("digital.heading")}
              </h3>
            </div>
            <p className="about-copy mt-3 text-sm text-text-body">{tt("digital.body")}</p>

            <p className="mt-4 inline-flex w-fit items-center gap-2 rounded-xl border border-brand/30 bg-brand/10 px-3 py-2 text-sm font-semibold text-brand">
              <span className="h-2 w-2 rounded-full bg-brand" aria-hidden="true" />
              {tt("digital.alwaysOpen")}
            </p>

            <div className="mt-auto flex flex-wrap gap-3 pt-5" data-about-print="hide">
              <AboutLinkAction href="/books" icon={BookOpen} variant="primary">
                {t("actions.browseELibrary")}
              </AboutLinkAction>
            </div>
          </InformationCard>
        </div>
      </AboutSection>

      {/* ── Weekly schedule ──────────────────────────────────────────── */}
      <AboutSection id="weekly" title={tt("weekly.heading")}>
        <WeeklyHoursTable
          spec={spec}
          specialRows={SPECIAL_SCHEDULE_ROWS}
          locale={locale}
          todayWeekday={todayWeekday}
          labels={{
            caption: tt("weekly.caption"),
            day: tt("weekly.day"),
            hours: tt("weekly.hours"),
            closed: tt("weekly.closed"),
            today: tt("weekly.today"),
            alwaysOpen: tt("weekly.alwaysOpen"),
            unavailable: tt("weekly.unavailable"),
          }}
        />
        {/* No timezone note repeated here — the status card above already
            states it, and saying it twice on one screen reads as noise. */}
      </AboutSection>

      {/* ── Holidays and closures ────────────────────────────────────────
          Dated exceptions are kept entirely separate from the weekly grid:
          they come from a different field, they expire, and merging them
          into the table would make a one-off closure look permanent. */}
      <AboutSection
        id="closures"
        title={tt("exceptions.heading")}
        description={tt("exceptions.intro")}
      >
        {upcoming.length === 0 ? (
          <EmptyContentState title={tt("exceptions.none")} body={tt("exceptions.noneBody")} />
        ) : (
          <ul className="space-y-3">
            {upcoming.map((closure) => {
              const reason = localized(closure.reason, locale);
              const from = formatDate(closure.from, locale);
              const to = formatDate(closure.to, locale);
              return (
                <li key={`${closure.from}-${closure.to}`}>
                  <NoticePanel tone="caution" label={tt("exceptions.heading")}>
                    <p className="font-semibold text-text-heading">
                      {from && to && from !== to
                        ? tt("exceptions.dateRange", { from, to })
                        : (from ?? closure.from)}
                    </p>
                    {reason && (
                      <p lang={reason.lang} className="about-wrap mt-1">
                        {reason.text}
                      </p>
                    )}
                  </NoticePanel>
                </li>
              );
            })}
          </ul>
        )}
      </AboutSection>

      {/* ── Plan your visit ──────────────────────────────────────────── */}
      <AboutSection id="visit" title={tt("visit.heading")}>
        <InformationCard>
          <dl className="grid gap-4 sm:grid-cols-2">
            <div className="flex gap-3">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
              <div className="min-w-0">
                <dt className="text-xs font-medium uppercase tracking-wide text-text-muted">
                  {tt("visit.addressLabel")}
                </dt>
                <dd className="about-wrap mt-0.5 text-sm text-text-heading">{address}</dd>
              </div>
            </div>
            <div className="flex gap-3">
              <Phone className="mt-0.5 h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
              <div className="min-w-0">
                <dt className="text-xs font-medium uppercase tracking-wide text-text-muted">
                  {t("actions.callLibrary")}
                </dt>
                <dd className="about-wrap mt-0.5 text-sm">
                  <a
                    href={cfg.phoneLibraryTel}
                    className="rounded font-medium text-brand hover:underline"
                  >
                    {cfg.phoneLibrary}
                  </a>
                </dd>
              </div>
            </div>
          </dl>

          <div className="mt-6 flex flex-wrap gap-3" data-about-print="hide">
            <AboutExternalAction href={mapUrl} icon={MapPin} variant="primary" newTab>
              {t("actions.getDirections")}
            </AboutExternalAction>
            <AboutLinkAction href="/contact" icon={Phone}>
              {t("actions.contactLibrary")}
            </AboutLinkAction>
            <AboutLinkAction href="/about/rules" icon={Scale}>
              {t("actions.viewRules")}
            </AboutLinkAction>
            <AboutLinkAction href="/books" icon={BookOpen}>
              {t("actions.browseELibrary")}
            </AboutLinkAction>
          </div>
        </InformationCard>

        {/* The next scheduled closure, surfaced where someone planning a
            visit will actually see it. */}
        {upcoming.length > 0 && (
          <p className="mt-4 flex items-center gap-2 text-sm text-text-muted">
            <CalendarOff className="h-4 w-4 shrink-0" aria-hidden="true" />
            {tt("exceptions.heading")}:{" "}
            <a
              href="#closures"
              className="rounded font-medium text-brand hover:underline"
            >
              {formatDate(upcoming[0].from, locale) ?? upcoming[0].from}
            </a>
          </p>
        )}
      </AboutSection>

      <ContentLastUpdated
        reviewedLabel={reviewedDate ? t("meta.reviewed", { date: reviewedDate }) : null}
        note={t("meta.sourceNote")}
        className="border-t border-divider pt-6"
      />
    </AboutPageShell>
  );
}

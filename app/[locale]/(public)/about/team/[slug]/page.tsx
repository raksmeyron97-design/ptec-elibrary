import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import {
  ArrowLeft,
  ArrowRight,
  Briefcase,
  ChevronRight,
  Clock,
  GraduationCap,
  Languages,
  Mail,
  MessageCircle,
  Phone,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import { SITE_URL } from "@/lib/seo/site";
import { localeAlternates } from "@/lib/seo/alternates";
import { breadcrumbSchema } from "@/lib/seo/schema";
import JsonLd from "@/components/seo/JsonLd";
import { getOrgIdentity, getSiteConfig } from "@/lib/system-settings/config";
import { getPublicTeamData, getTeamMemberBySlug } from "@/lib/team/data";
import { decodeSlugParam } from "@/lib/slug";
import { photoAltText, truncate, type PublicTeamMember } from "@/lib/team/public";
import { formatDate, toAboutLocale, type AboutLocale } from "@/lib/about/format";
import { AboutExternalAction, AboutLinkAction } from "@/components/about/actions";

// Published team data is public and changes rarely; the admin team actions
// revalidate /about/team/<slug> on every change, so a long window is safe.
export const revalidate = 600;

/** Prerender every published profile at build time, in both locales.
 *  The roster is small and bounded (one row per staff member), so this is a
 *  handful of pages, and it means a crawler hitting a profile cold gets static
 *  HTML rather than an on-demand render. `dynamicParams` stays at its default
 *  (true) so a member published after the build still resolves via ISR — the
 *  slug gate in middleware still 404s genuinely unknown slugs.
 *
 *  This is the only generateStaticParams in the public tree, and the reason
 *  the others don't exist is that it runs a service-role query AT BUILD TIME:
 *  createServiceClient() throws outright when SUPABASE_* is absent, which is
 *  the case in CI. Returning [] on any failure degrades to exactly the
 *  previous behaviour — every profile rendered on demand and then cached by
 *  ISR — instead of failing the build. Never let this throw. */
export async function generateStaticParams() {
  try {
    const { members } = await getPublicTeamData();
    return members
      .filter((m): m is PublicTeamMember & { slug: string } => Boolean(m.slug))
      .flatMap((m) => [
        { locale: "en", slug: m.slug },
        { locale: "km", slug: m.slug },
      ]);
  } catch {
    return [];
  }
}

/* ── Shared field pickers ──────────────────────────────────────────────── */

function names(member: PublicTeamMember, locale: AboutLocale) {
  const primary = locale === "km" ? member.name_km : member.name_en;
  const secondary = locale === "km" ? member.name_en : member.name_km;
  const primaryLang: AboutLocale = primary === member.name_km ? "km" : "en";
  return {
    primary: primary?.trim() || member.name_en || member.name_km,
    primaryLang,
    secondary: secondary?.trim() && secondary !== primary ? secondary : null,
    secondaryLang: (primaryLang === "km" ? "en" : "km") as AboutLocale,
  };
}

function position(member: PublicTeamMember, locale: AboutLocale) {
  const primary = locale === "km" ? member.position_km : member.position_en;
  return primary?.trim() || member.position_en?.trim() || member.position_km?.trim() || null;
}

function localizedPair(km: string | null, en: string | null, locale: AboutLocale) {
  const primary = locale === "km" ? km : en;
  const value = primary?.trim() || en?.trim() || km?.trim() || null;
  if (!value) return null;
  return { text: value, lang: (value === km?.trim() ? "km" : "en") as AboutLocale };
}

function responsibilityList(member: PublicTeamMember, locale: AboutLocale) {
  if (locale === "km" && member.responsibilities_km.length > 0)
    return { items: member.responsibilities_km, lang: "km" as const };
  if (member.responsibilities_en.length > 0)
    return { items: member.responsibilities_en, lang: "en" as const };
  return { items: member.responsibilities_km, lang: "km" as const };
}

function areaName(member: PublicTeamMember, locale: AboutLocale) {
  return (
    (locale === "km" ? member.section_name_km : member.section_name_en) ||
    member.section_name_en ||
    member.section_name_km ||
    null
  );
}

/* ── Metadata ──────────────────────────────────────────────────────────── */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug: rawSlug } = await params;
  const slug = decodeSlugParam(rawSlug);
  const { member } = await getTeamMemberBySlug(slug);
  // The route notFound()s below; tell a crawler that reached the metadata
  // first not to index this URL either way.
  if (!member) return { title: "Not Found", robots: { index: false, follow: false } };

  const t = await getTranslations({ locale, namespace: "about.team" });
  const org = await getOrgIdentity();
  const aboutLocale = toAboutLocale(locale);
  const name = names(member, aboutLocale);
  const alternates = localeAlternates(`/about/team/${slug}`, locale);

  const summary = localizedPair(
    member.short_bio_km || member.bio_km,
    member.short_bio_en || member.bio_en,
    aboutLocale,
  );
  const description = summary
    ? truncate(summary.text, 160)
    : t("profile.metaFallback", { name: name.primary });

  // The document <title> gets the brand from the titleTemplate
  // ("%s · PTEC Library"), so `title` must NOT repeat it; the Open Graph
  // title travels alone into a social card, so that one is branded.
  const title = name.primary;
  const socialTitle = `${title} · ${org.siteName}`;

  return {
    title,
    description,
    alternates,
    openGraph: {
      title: socialTitle,
      description,
      url: alternates.canonical,
      type: "profile",
      siteName: org.siteName,
      locale: locale === "km" ? "km_KH" : "en_US",
      images: [{ url: member.photo_url || `${SITE_URL}/og-default.png` }],
    },
    twitter: { card: "summary_large_image", title: socialTitle, description },
  };
}

/* ── Page ──────────────────────────────────────────────────────────────── */

export default async function TeamMemberPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale: rawLocale, slug: rawSlug } = await params;
  setRequestLocale(rawLocale);
  const locale = toAboutLocale(rawLocale);
  const slug = decodeSlugParam(rawSlug);

  const [{ member, members }, cfg, org, t, tAbout] = await Promise.all([
    getTeamMemberBySlug(slug),
    getSiteConfig(),
    getOrgIdentity(),
    getTranslations("about.team"),
    getTranslations("about"),
  ]);

  // The edge slug gate normally answers first (RESOURCE_GATES["about/team"]),
  // but the route still 404s honestly when the gate failed open.
  if (!member) notFound();

  const name = names(member, locale);
  const role = position(member, locale);
  const area = areaName(member, locale);
  const lead = localizedPair(member.short_bio_km, member.short_bio_en, locale);
  const bio = localizedPair(member.bio_km, member.bio_en, locale);
  const responsibilities = responsibilityList(member, locale);
  const hours = locale === "km" ? cfg.hours.km : cfg.hours.en;

  const facts: { icon: typeof GraduationCap; label: string; value: string }[] = [];
  if (member.education)
    facts.push({ icon: GraduationCap, label: t("profile.education"), value: member.education });
  if (member.years_experience)
    facts.push({ icon: Briefcase, label: t("profile.experience"), value: member.years_experience });
  if (member.languages.length > 0)
    facts.push({ icon: Languages, label: t("profile.languages"), value: member.languages.join(", ") });
  if (member.working_hours)
    facts.push({ icon: Clock, label: t("profile.workingHours"), value: member.working_hours });

  // Colleagues in the same service area (linked only when they have a slug,
  // i.e. an actual profile page to link to).
  const colleagues = member.section_id
    ? members.filter((m) => m.id !== member.id && m.section_id === member.section_id)
    : [];

  // Previous/next across the roster in directory order, restricted to members
  // that actually have profile pages.
  const slugged = members.filter((m) => m.slug);
  const index = slugged.findIndex((m) => m.id === member.id);
  const previous = index > 0 ? slugged[index - 1] : null;
  const next = index >= 0 && index < slugged.length - 1 ? slugged[index + 1] : null;

  // Structured data — public, non-contact fields only. Admin-authored names
  // flow in here, so it must go through <JsonLd> (which escapes "<"), never a
  // raw JSON.stringify.
  const pageUrl = `${SITE_URL}${locale === "km" ? "/km" : ""}/about/team/${slug}`;
  const personJsonLd = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: member.name_en || member.name_km,
    ...(member.name_km && member.name_en ? { alternateName: member.name_km } : {}),
    ...(member.position_en ? { jobTitle: member.position_en } : {}),
    ...(member.photo_url ? { image: member.photo_url } : {}),
    ...(member.languages.length > 0 ? { knowsLanguage: member.languages } : {}),
    // email/telephone arrive already nulled by the team_members_public view
    // unless an admin ticked the per-member public-display toggle, so emitting
    // them when non-null publishes exactly what the library approved and
    // nothing more. There is no privacy decision to get wrong here.
    ...(member.email ? { email: member.email } : {}),
    ...(member.phone ? { telephone: member.phone } : {}),
    ...(member.section_name_en ? { department: member.section_name_en } : {}),
    url: pageUrl,
    mainEntityOfPage: pageUrl,
    worksFor: {
      "@type": "Organization",
      name: org.siteName,
      url: SITE_URL,
      parentOrganization: {
        "@type": "CollegeOrUniversity",
        name: cfg.name.en,
        sameAs: [...cfg.sameAs],
      },
    },
  };

  // Pre-addressed mail link. The subject names the person and the library so
  // the message is recognisable in an inbox that also takes general enquiries.
  const contactMailto = member.email
    ? `mailto:${member.email}?subject=${encodeURIComponent(
        `${org.siteName} — ${name.primary}`,
      )}`
    : null;

  // "Last updated" comes from team_members.updated_at, maintained by the
  // team_members_updated_at trigger (exposed on the view by migration 0116).
  // It is null when read through a pre-0116 view, in which case the line is
  // simply not rendered rather than showing a guessed date.
  // formatDate() takes a bare YYYY-MM-DD (it appends T00:00:00Z); updated_at
  // is a full timestamptz, so slice the date part or it parses as Invalid Date
  // and the line silently disappears.
  const updatedLabel = member.updated_at
    ? formatDate(member.updated_at.slice(0, 10), locale)
    : null;

  return (
    <article
      className="about-page min-h-screen bg-paper"
      aria-labelledby="member-name"
    >
      <JsonLd data={personJsonLd} />
      {/* Breadcrumb structured data mirrors the visible trail exactly — the
          two must agree or Google treats the markup as misleading. */}
      <JsonLd
        data={breadcrumbSchema([
          { name: "Home", path: "/" },
          { name: "About", path: "/about" },
          { name: t("title"), path: "/about/team" },
          { name: name.primary },
        ], { locale })}
      />

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-blue-900">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-70"
          style={{
            background:
              "radial-gradient(120% 90% at 15% 0%, rgba(58,95,196,0.55) 0%, rgba(11,21,48,0) 60%)",
          }}
        />
        <div className="relative mx-auto max-w-[1240px] px-4 py-8 sm:px-6 sm:py-10 lg:py-14">
          {/* Four-level breadcrumb — the member sits under the directory, and
              the shared AboutBreadcrumbs only renders the three-crumb About
              trail, so this page carries its own in the same style. */}
          <nav aria-label={tAbout("breadcrumb.label")} data-about-print="hide">
            <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-white/70">
              <li>
                <Link
                  href="/"
                  className="inline-flex min-h-6 items-center rounded px-0.5 transition-colors hover:text-white [--focus-color:#fff]"
                >
                  {tAbout("breadcrumb.home")}
                </Link>
              </li>
              <li aria-hidden="true" className="text-white/40">
                <ChevronRight className="h-3 w-3" />
              </li>
              <li>
                <Link
                  href="/about"
                  className="inline-flex min-h-6 items-center rounded px-0.5 transition-colors hover:text-white [--focus-color:#fff]"
                >
                  {tAbout("breadcrumb.about")}
                </Link>
              </li>
              <li aria-hidden="true" className="text-white/40">
                <ChevronRight className="h-3 w-3" />
              </li>
              <li>
                <Link
                  href="/about/team"
                  className="inline-flex min-h-6 items-center rounded px-0.5 transition-colors hover:text-white [--focus-color:#fff]"
                >
                  {t("title")}
                </Link>
              </li>
              <li aria-hidden="true" className="text-white/40">
                <ChevronRight className="h-3 w-3" />
              </li>
              <li aria-current="page" className="about-wrap font-medium text-white">
                {name.primary}
              </li>
            </ol>
          </nav>

          <div className="mt-8 gap-10 sm:flex sm:items-start">
            {/* Portrait — fixed box so a slow image can never shift the hero. */}
            <div className="relative aspect-[4/5] w-44 shrink-0 border border-white/20 bg-blue-950/40 sm:w-56 lg:w-[16.5rem]">
              {member.photo_url ? (
                <Image
                  src={member.photo_url}
                  alt={photoAltText(member)}
                  fill
                  priority
                  sizes="(min-width: 1024px) 16.5rem, (min-width: 640px) 14rem, 11rem"
                  // In colour, matching the directory card. A reader who taps a
                  // colour portrait and lands on a desaturated one of the same
                  // person reads it as a different photo, or a fault.
                  className="object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center" aria-hidden="true">
                  <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white/10 text-2xl font-semibold text-gold-300">
                    {(name.primary || "?").trim().charAt(0)}
                  </span>
                </div>
              )}
            </div>

            <div className="mt-6 min-w-0 sm:mt-0">
              {area && (
                <p className="about-wrap text-xs font-bold uppercase tracking-[0.14em] text-gold-300">
                  {area}
                </p>
              )}
              <h1
                id="member-name"
                className="mt-2 text-3xl font-semibold tracking-tight text-white sm:text-4xl lg:text-[2.75rem] lg:leading-[1.15]"
              >
                <span className="about-wrap block" lang={name.primaryLang}>
                  {name.primary}
                </span>
                {name.secondary && (
                  <span
                    lang={name.secondaryLang}
                    className="about-wrap mt-2 block text-xl font-normal text-white/60 sm:text-2xl"
                  >
                    {name.secondary}
                  </span>
                )}
              </h1>
              {role && (
                <p className="about-wrap mt-4 text-sm font-bold uppercase tracking-[0.08em] text-white/85">
                  {role}
                </p>
              )}
              {lead && (
                <p lang={lead.lang} className="about-copy mt-4 max-w-2xl text-base text-white/75">
                  {lead.text}
                </p>
              )}
              <div className="mt-7 flex flex-wrap gap-3">
                {cfg.phoneLibraryTel && (
                  <a
                    href={cfg.phoneLibraryTel}
                    className="inline-flex min-h-12 items-center gap-2.5 bg-gold-500 px-5 py-3 text-xs font-bold uppercase tracking-[0.06em] text-blue-950 transition-colors hover:bg-gold-300 [--focus-color:#fff]"
                  >
                    <Phone className="h-4 w-4" aria-hidden="true" />
                    {t("profile.callDesk")}
                  </a>
                )}
                <Link
                  href="/about/team"
                  className="inline-flex min-h-12 items-center gap-2.5 border-2 border-white/35 px-5 py-3 text-xs font-bold uppercase tracking-[0.06em] text-white transition-colors hover:border-white [--focus-color:#fff]"
                >
                  <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                  {t("profile.backToDirectory")}
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-[1240px] px-4 pb-20 sm:px-6">
        {/* ── Facts band ─────────────────────────────────────────────── */}
        {facts.length > 0 && (
          <dl className="grid border border-divider bg-bg-surface sm:grid-cols-2 lg:grid-cols-4">
            {facts.map((fact) => (
              <div
                key={fact.label}
                className="border-t border-divider p-5 first:border-t-0 sm:[&:nth-child(-n+2)]:border-t-0 lg:border-l lg:border-t-0 lg:first:border-l-0"
              >
                <dt className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-text-muted">
                  <fact.icon className="h-3.5 w-3.5" aria-hidden="true" />
                  {fact.label}
                </dt>
                <dd className="about-wrap mt-2 text-sm font-medium text-text-heading">
                  {fact.value}
                </dd>
              </div>
            ))}
          </dl>
        )}

        <div className="mt-12 gap-12 lg:grid lg:grid-cols-[minmax(0,1fr)_20rem]">
          {/* ── Main column ──────────────────────────────────────────── */}
          <div className="min-w-0 space-y-14">
            {(lead || bio) && (
              <section id="about" aria-labelledby="member-about-heading" className="scroll-mt-28">
                <h2
                  id="member-about-heading"
                  className="border-b-2 border-text-heading pb-3 text-lg font-bold tracking-tight text-text-heading"
                >
                  {t("profile.biography")}
                </h2>
                {bio ? (
                  <p
                    lang={bio.lang}
                    className="about-copy about-measure mt-5 whitespace-pre-line text-[15px] text-text-body"
                  >
                    {bio.text}
                  </p>
                ) : (
                  lead && (
                    <p lang={lead.lang} className="about-copy about-measure mt-5 text-[15px] text-text-body">
                      {lead.text}
                    </p>
                  )
                )}
              </section>
            )}

            {responsibilities.items.length > 0 && (
              <section
                id="responsibilities"
                aria-labelledby="member-responsibilities-heading"
                className="scroll-mt-28"
              >
                <h2
                  id="member-responsibilities-heading"
                  className="border-b-2 border-text-heading pb-3 text-lg font-bold tracking-tight text-text-heading"
                >
                  {t("profile.responsibilities")}
                </h2>
                {/* A <ul>, and no 01/02/03 markers. Numbering an unordered
                    set tells the reader the first item matters most or comes
                    first in time, and neither is true of what someone helps
                    with — the sequence was decoration wearing the costume of
                    structure. The rules alone separate the items. */}
                <ul className="mt-5">
                  {responsibilities.items.map((item) => (
                    <li
                      key={item}
                      className="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-4 border-b border-divider py-4 first:border-t first:border-divider"
                    >
                      <span
                        aria-hidden="true"
                        className="h-px w-6 translate-y-[-0.3rem] bg-accent-line"
                      />
                      <span lang={responsibilities.lang} className="about-copy text-[15px] text-text-body">
                        {item}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>

          {/* ── Sidebar ──────────────────────────────────────────────── */}
          <aside className="mt-14 space-y-8 lg:mt-0">
            {/* No "On this page" nav here any more. It listed three anchors
                on a page barely two screens tall, so it cost the reader a
                decision and a block of sidebar before the contact card — the
                one thing in this column they actually came for. */}
            <section id="contact" aria-labelledby="member-contact-heading" className="scroll-mt-28 border-2 border-text-heading p-5">
              <h2
                id="member-contact-heading"
                className="text-[10px] font-bold uppercase tracking-[0.12em] text-text-muted"
              >
                {t("profile.contact")}
              </h2>
              <ul className="mt-3 space-y-2.5">
                {/* phone/email arrive already nulled unless an admin approved
                    public display (team_members_public view) — render what is
                    non-null and offer the official desk to everyone else. */}
                {member.email && (
                  <li>
                    <a
                      href={`mailto:${member.email}`}
                      className="flex min-h-11 items-center gap-3 text-sm font-medium text-text-body transition-colors hover:text-brand"
                    >
                      <Mail className="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
                      <span className="break-all">{member.email}</span>
                    </a>
                  </li>
                )}
                {member.phone && (
                  <li>
                    <a
                      href={`tel:${member.phone.replace(/\s/g, "")}`}
                      className="flex min-h-11 items-center gap-3 text-sm font-medium text-text-body transition-colors hover:text-brand"
                    >
                      <Phone className="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
                      <span>{member.phone}</span>
                    </a>
                  </li>
                )}
                {cfg.phoneLibrary && (
                  <li>
                    <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-text-muted">
                      {t("directory.serviceDesk")}
                    </p>
                    {cfg.phoneLibraryTel ? (
                      <a
                        href={cfg.phoneLibraryTel}
                        className="mt-1 inline-flex min-h-6 items-center text-lg font-bold tracking-tight text-text-heading hover:text-brand"
                      >
                        {cfg.phoneLibrary}
                      </a>
                    ) : (
                      <p className="mt-1 text-lg font-bold tracking-tight text-text-heading">
                        {cfg.phoneLibrary}
                      </p>
                    )}
                    {hours && <p className="about-copy mt-1 text-xs text-text-muted">{hours}</p>}
                  </li>
                )}
              </ul>
              <div className="mt-5 flex flex-col gap-2">
                {/* A direct, pre-addressed route to this person — offered ONLY
                    when the view handed us an email, i.e. the admin approved
                    public display. Everyone else gets the library desk below,
                    which is the point of the privacy note. */}
                {contactMailto && (
                  <AboutExternalAction href={contactMailto} icon={Mail} variant="primary">
                    {t("profile.contactMember", { name: name.primary })}
                  </AboutExternalAction>
                )}
                <AboutLinkAction
                  href="/contact"
                  icon={MessageCircle}
                  variant={contactMailto ? "secondary" : "primary"}
                >
                  {t("profile.requestHelp")}
                </AboutLinkAction>
              </div>
              {/* The single most important line on this page: it tells readers
                  why they are not seeing anyone's mobile number. */}
              <p className="about-copy mt-4 border-t border-divider pt-3 text-xs text-text-muted">
                {t("contact.officialOnly")}
              </p>
            </section>

            {colleagues.length > 0 && area && (
              <section aria-labelledby="member-colleagues-heading">
                <h2
                  id="member-colleagues-heading"
                  className="about-wrap text-[10px] font-bold uppercase tracking-[0.12em] text-text-muted"
                >
                  {t("profile.colleaguesIn", { area })}
                </h2>
                <ul className="mt-2 border-t border-divider">
                  {colleagues.map((colleague) => {
                    const colleagueName = names(colleague, locale);
                    const colleagueRole = position(colleague, locale);
                    const inner = (
                      <>
                        <span
                          aria-hidden="true"
                          className="flex h-10 w-10 shrink-0 items-center justify-center bg-surface-brand-soft text-sm font-semibold text-brand"
                        >
                          {(colleagueName.primary || "?").trim().charAt(0)}
                        </span>
                        <span className="min-w-0">
                          <span
                            lang={colleagueName.primaryLang}
                            className="about-wrap block text-sm font-semibold text-text-heading"
                          >
                            {colleagueName.primary}
                          </span>
                          {colleagueRole && (
                            <span className="about-wrap block text-xs text-text-muted">
                              {colleagueRole}
                            </span>
                          )}
                        </span>
                      </>
                    );
                    return (
                      <li key={colleague.id} className="border-b border-divider">
                        {colleague.slug ? (
                          <Link
                            href={`/about/team/${colleague.slug}`}
                            className="group flex min-h-11 items-center gap-3 py-2.5 transition-colors hover:text-brand"
                          >
                            {inner}
                          </Link>
                        ) : (
                          <div className="flex min-h-11 items-center gap-3 py-2.5">{inner}</div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}
          </aside>
        </div>

        {/* ── Previous / next member ─────────────────────────────────── */}
        {(previous || next) && (
          <nav
            aria-label={t("profile.pagerLabel")}
            data-about-print="hide"
            className="mt-16 grid gap-3 border-t-4 border-text-heading pt-8 sm:grid-cols-2"
          >
            {previous ? (
              <Link
                href={`/about/team/${previous.slug}`}
                rel="prev"
                className="group flex min-h-11 items-center gap-3 border border-divider bg-bg-surface p-4 text-left transition-colors hover:border-brand/40"
              >
                <ArrowLeft
                  className="h-4 w-4 shrink-0 text-text-muted transition-colors group-hover:text-brand"
                  aria-hidden="true"
                />
                <span className="min-w-0">
                  <span className="block text-xs uppercase tracking-wide text-text-muted">
                    {t("profile.previousMember")}
                  </span>
                  <span className="about-wrap block font-medium text-text-heading group-hover:text-brand">
                    {names(previous, locale).primary}
                  </span>
                </span>
              </Link>
            ) : (
              <span aria-hidden="true" className="hidden sm:block" />
            )}
            {next && (
              <Link
                href={`/about/team/${next.slug}`}
                rel="next"
                className="group flex min-h-11 items-center justify-end gap-3 border border-divider bg-bg-surface p-4 text-right transition-colors hover:border-brand/40 sm:col-start-2"
              >
                <span className="min-w-0">
                  <span className="block text-xs uppercase tracking-wide text-text-muted">
                    {t("profile.nextMember")}
                  </span>
                  <span className="about-wrap block font-medium text-text-heading group-hover:text-brand">
                    {names(next, locale).primary}
                  </span>
                </span>
                <ArrowRight
                  className="h-4 w-4 shrink-0 text-text-muted transition-colors group-hover:text-brand"
                  aria-hidden="true"
                />
              </Link>
            )}
          </nav>
        )}

        {/* A staff profile is the kind of page a reader wants to date-check —
            it carries a job title and contact route that may have moved on.
            The <time> element gives the same fact to machines. */}
        {updatedLabel && (
          <p className="mt-10 border-t border-divider pt-5 text-xs text-text-muted">
            {/* The message carries `<date></date>` as a TAG, not a `{date}`
                placeholder, and that distinction is load-bearing: t.rich calls
                a function only for a tag. Against a placeholder it substitutes
                the value as-is, so the handler below was handed to React as a
                child and prerendering died with "Functions are not valid as a
                child of Client Components" — a build-breaking failure that no
                unit test caught because it only surfaces when the page is
                actually rendered. Passing the element instead is not the fix
                either: a placeholder value is typed string | number | Date. */}
            {t.rich("profile.lastUpdated", {
              date: () => (
                <time dateTime={member.updated_at!.slice(0, 10)}>{updatedLabel}</time>
              ),
            })}
          </p>
        )}
      </div>
    </article>
  );
}

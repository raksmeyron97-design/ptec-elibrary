// components/about/AboutPageShell.tsx
//
// The frame every About page renders inside. It owns the structure the brief
// specifies — breadcrumbs → hero → sticky sub-navigation → content → related
// pages → previous/next — so a page file contains only its own content and
// the five pages cannot drift apart again.
//
// This is a SERVER component. The sub-navigation is the only client island it
// mounts, so a page with no interactive content (Our Journey) ships almost no
// JavaScript.
//
// Deliberately NOT an app/about/layout.tsx: a layout would also wrap
// /about and /about/committee, which are outside this redesign's scope. Making
// it an explicit component keeps the blast radius at exactly five files.

import type { ReactNode } from "react";
import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { ArrowLeft, ArrowRight, ChevronRight, type LucideIcon } from "lucide-react";
import { Clock, Library, Milestone, Scale, Users } from "lucide-react";
import { Link } from "@/i18n/navigation";
import JsonLd from "@/components/seo/JsonLd";
import { breadcrumbSchema } from "@/lib/seo/schema";
import { ABOUT_NAV, aboutPager, relatedAboutPages } from "@/lib/about/nav";
import type { AboutPageKey } from "@/lib/about/types";
import type { AboutLocale } from "@/lib/about/format";
import AboutSubNavigation from "./AboutSubNavigation";

const ICONS: Record<string, LucideIcon> = {
  milestone: Milestone,
  scale: Scale,
  clock: Clock,
  library: Library,
  users: Users,
};

/* ────────────────────────────────────────────────────────────────────────────
   Breadcrumbs
   ──────────────────────────────────────────────────────────────────────────── */

async function AboutBreadcrumbs({ currentLabel }: { currentLabel: string }) {
  const t = await getTranslations("about");
  return (
    <nav aria-label={t("breadcrumb.label")} data-about-print="hide">
      <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-white/70">
        <li>
          <Link
            href="/"
            // min-h-6 = the 24×24 CSS-px floor of WCAG 2.2 SC 2.5.8 (Target
            // Size, Minimum). Breadcrumb text alone renders ~18px tall, which
            // fails it; the padding grows the hit area without changing the
            // type size or the row's visual weight.
            className="inline-flex min-h-6 items-center rounded px-0.5 transition-colors hover:text-white [--focus-color:#fff]"
          >
            {t("breadcrumb.home")}
          </Link>
        </li>
        <li aria-hidden="true" className="text-white/40">
          <ChevronRight className="h-3 w-3" />
        </li>
        <li>
          <Link
            href="/about"
            // min-h-6 = the 24×24 CSS-px floor of WCAG 2.2 SC 2.5.8 (Target
            // Size, Minimum). Breadcrumb text alone renders ~18px tall, which
            // fails it; the padding grows the hit area without changing the
            // type size or the row's visual weight.
            className="inline-flex min-h-6 items-center rounded px-0.5 transition-colors hover:text-white [--focus-color:#fff]"
          >
            {t("breadcrumb.about")}
          </Link>
        </li>
        <li aria-hidden="true" className="text-white/40">
          <ChevronRight className="h-3 w-3" />
        </li>
        <li aria-current="page" className="about-wrap font-medium text-white">
          {currentLabel}
        </li>
      </ol>
    </nav>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Hero
   ──────────────────────────────────────────────────────────────────────────── */

export type AboutHeroProps = {
  /** Small category label above the title. */
  category: string;
  /** Title in the ACTIVE locale — rendered as the page's single <h1>. */
  title: string;
  /** The same title in the other language, on its own line beneath. */
  secondaryTitle?: string | null;
  secondaryLang: AboutLocale;
  /** One short introductory paragraph. Longer copy belongs in a section. */
  intro: string;
  /** Optional eyebrow chip, e.g. "Established in 2017". */
  badge?: ReactNode;
  /** Primary action, e.g. "Get directions". */
  action?: ReactNode;
  /** Supporting image. Only pass one on a page where it means something —
   *  the hero reads fine without it. */
  image?: { src: string; alt: string; priority?: boolean };
};

/**
 * A compact editorial hero. Bilingual titles are STACKED (see BilingualTitle
 * in ./primitives for the full rationale) — never joined on one line.
 */
function AboutHero({
  breadcrumb,
  category,
  title,
  secondaryTitle,
  secondaryLang,
  intro,
  badge,
  action,
  image,
  locale,
  watermark: Watermark,
}: AboutHeroProps & {
  breadcrumb: ReactNode;
  locale: AboutLocale;
  /** The page's own nav icon, drawn very large and very faint behind the
   *  text when there is no photograph — so a text-only hero still has a
   *  shape, and each page's is different. */
  watermark?: LucideIcon;
}) {
  return (
    <section className="relative overflow-hidden bg-blue-900">
      {/* One flat brand surface, one soft radial highlight, and the gold
          hairline that the header and footer already carry — the three
          brand surfaces on a page now share one edge. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          background:
            "radial-gradient(120% 90% at 15% 0%, rgba(58,95,196,0.55) 0%, rgba(11,21,48,0) 60%)",
        }}
      />
      {Watermark && !image && (
        <Watermark
          aria-hidden="true"
          strokeWidth={1}
          className="pointer-events-none absolute -bottom-10 right-4 hidden h-72 w-72 text-white/[0.06] sm:block lg:-bottom-14 lg:right-12 lg:h-96 lg:w-96"
        />
      )}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 bg-gradient-to-r from-gold-500 via-gold-300 to-gold-500/40"
      />
      <div className="relative mx-auto max-w-[1240px] px-4 py-8 sm:px-6 sm:py-10 lg:py-14">
        {breadcrumb}
        <div
          className={`mt-6 gap-8 ${image ? "lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:items-center" : ""}`}
        >
          <div className="min-w-0">
            {badge && <div className="mb-4">{badge}</div>}
            <p className="flex items-center gap-2.5 text-xs font-semibold uppercase tracking-[0.14em] text-gold-300">
              <span aria-hidden="true" className="h-px w-6 bg-gold-400" />
              {category}
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white sm:text-4xl lg:text-[2.75rem] lg:leading-[1.15]">
              <span className="about-wrap block" lang={locale}>
                {title}
              </span>
              {secondaryTitle && (
                <span
                  lang={secondaryLang}
                  className="about-wrap mt-2 block text-xl font-normal text-white/60 sm:text-2xl"
                >
                  {secondaryTitle}
                </span>
              )}
            </h1>
            <p className="about-copy mt-4 max-w-2xl text-base text-white/75">{intro}</p>
            {action && <div className="mt-7 flex flex-wrap gap-3">{action}</div>}
          </div>

          {image && (
            <div className="mt-8 lg:mt-0">
              {/* Fixed aspect ratio + `fill` means the box is reserved before
                  the bytes arrive — no CLS when the photo decodes. */}
              <div className="relative aspect-[4/3] overflow-hidden rounded-2xl border border-white/15 bg-blue-950/40 shadow-[0_24px_48px_-24px_rgba(0,0,0,0.6)] ring-1 ring-gold-400/30 ring-offset-2 ring-offset-blue-900">
                <Image
                  src={image.src}
                  alt={image.alt}
                  fill
                  priority={image.priority}
                  sizes="(min-width: 1024px) 26rem, 100vw"
                  className="object-cover"
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Related pages + pager
   ──────────────────────────────────────────────────────────────────────────── */

async function RelatedAboutPages({ current }: { current: AboutPageKey }) {
  const t = await getTranslations("about");
  const tNav = await getTranslations("nav");
  const items = relatedAboutPages(current);

  return (
    <section aria-labelledby="about-related-heading" data-about-print="hide" className="mt-16">
      <h2 id="about-related-heading" className="text-lg font-semibold text-text-heading">
        {t("related.heading")}
      </h2>
      <p className="mt-1 text-sm text-text-muted">{t("related.intro")}</p>
      <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((item) => {
          const Icon = ICONS[item.icon];
          return (
            <li key={item.key}>
              <Link
                href={item.href}
                className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-divider bg-bg-surface p-5 shadow-sm transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-md motion-reduce:transition-none motion-reduce:hover:translate-y-0"
              >
                {/* Gold edge appears on hover — the same "current" cue the
                    sub-navigation and the About menu use. */}
                <span
                  aria-hidden="true"
                  className="absolute inset-x-0 top-0 h-0.5 bg-gold-500 opacity-0 transition-opacity duration-200 group-hover:opacity-100 motion-reduce:transition-none"
                />
                <span
                  aria-hidden="true"
                  className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand/10 text-brand transition-colors duration-200 group-hover:bg-brand group-hover:text-brand-contrast motion-reduce:transition-none"
                >
                  <Icon className="h-5 w-5" />
                </span>
                <span className="about-wrap mt-4 font-semibold text-text-heading group-hover:text-brand">
                  {tNav(item.labelKey)}
                </span>
                <span className="about-copy mt-1.5 text-sm text-text-muted">
                  {t(item.descriptionKey)}
                </span>
                <span aria-hidden="true" className="mt-auto flex items-center pt-4 text-brand">
                  <ArrowRight
                    className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5 motion-reduce:transition-none"
                    aria-hidden="true"
                  />
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

async function AboutPagePagination({ current }: { current: AboutPageKey }) {
  const t = await getTranslations("about");
  const tNav = await getTranslations("nav");
  const { previous, next } = aboutPager(current);
  if (!previous && !next) return null;

  return (
    <nav
      aria-label={t("pager.label")}
      data-about-print="hide"
      className="mt-12 grid gap-3 border-t border-divider pt-8 sm:grid-cols-2"
    >
      {previous ? (
        <Link
          href={previous.href}
          rel="prev"
          className="group flex min-h-11 items-center gap-3 rounded-2xl border border-divider bg-bg-surface p-4 text-left shadow-sm transition-colors hover:border-brand/40 hover:bg-surface-brand-soft"
        >
          <ArrowLeft className="h-4 w-4 shrink-0 text-text-muted transition-[color,transform] group-hover:-translate-x-0.5 group-hover:text-brand motion-reduce:transition-none" aria-hidden="true" />
          <span className="min-w-0">
            <span className="block text-xs uppercase tracking-wide text-text-muted">
              {t("pager.previous")}
            </span>
            <span className="about-wrap block font-medium text-text-heading group-hover:text-brand">
              {tNav(previous.labelKey)}
            </span>
          </span>
        </Link>
      ) : (
        <span aria-hidden="true" className="hidden sm:block" />
      )}

      {next && (
        <Link
          href={next.href}
          rel="next"
          className="group flex min-h-11 items-center justify-end gap-3 rounded-2xl border border-divider bg-bg-surface p-4 text-right shadow-sm transition-colors hover:border-brand/40 hover:bg-surface-brand-soft sm:col-start-2"
        >
          <span className="min-w-0">
            <span className="block text-xs uppercase tracking-wide text-text-muted">
              {t("pager.next")}
            </span>
            <span className="about-wrap block font-medium text-text-heading group-hover:text-brand">
              {tNav(next.labelKey)}
            </span>
          </span>
          <ArrowRight className="h-4 w-4 shrink-0 text-text-muted transition-[color,transform] group-hover:translate-x-0.5 group-hover:text-brand motion-reduce:transition-none" aria-hidden="true" />
        </Link>
      )}
    </nav>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   The shell
   ──────────────────────────────────────────────────────────────────────────── */

export default async function AboutPageShell({
  page,
  locale,
  hero,
  children,
  footer,
}: {
  page: AboutPageKey;
  locale: AboutLocale;
  hero: AboutHeroProps;
  children: ReactNode;
  /** Page-specific block rendered after the content and before the related
   *  pages — e.g. the rules "About this policy" panel. */
  footer?: ReactNode;
}) {
  const tNav = await getTranslations("nav");
  const navItem = ABOUT_NAV.find((i) => i.key === page);
  const currentLabel = navItem ? tNav(navItem.labelKey) : hero.title;

  return (
    <div className="about-page min-h-screen bg-paper">
      {/* Breadcrumb structured data mirrors the visible trail exactly — the
          two must agree or Google treats the markup as misleading. */}
      <JsonLd
        data={breadcrumbSchema([
          { name: "Home", path: "/" },
          { name: "About", path: "/about" },
          { name: currentLabel },
        ], { locale })}
      />

      <AboutHero
        {...hero}
        locale={locale}
        watermark={navItem ? ICONS[navItem.icon] : undefined}
        breadcrumb={<AboutBreadcrumbs currentLabel={currentLabel} />}
      />

      <AboutSubNavigation />

      <div className="mx-auto max-w-[1240px] px-4 pb-20 pt-10 sm:px-6 sm:pt-12">
        <div className="space-y-14 sm:space-y-16">{children}</div>
        {footer}
        <RelatedAboutPages current={page} />
        <AboutPagePagination current={page} />
      </div>
    </div>
  );
}

export { AboutBreadcrumbs, AboutHero, RelatedAboutPages, AboutPagePagination };

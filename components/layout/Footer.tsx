// components/layout/Footer.tsx
//
// The site footer: one server component, one DOM instance. It used to render
// the link columns twice (desktop grid + a mobile accordion) under a canvas
// constellation with a rAF loop, a cursor spotlight and a Google Maps iframe.
// Now the map is an address card that links to the place, and the only client
// JS is the live open/closed line and the back-to-top button — the phone
// "More links" disclosure is a native <details> and needs none.
//
// TWO SHAPES FROM ONE DOM — the breakpoint is md (768 px):
//   ≥ md  the brand block and four link columns in a grid, exactly as before.
//   < md  ONE compact block for a 360 px phone: the brand, a one-line mission,
//         four essential links (About · Contact · Privacy · language), the
//         social icons, and a single "More links" disclosure
//         (FooterMoreLinks) that holds every other link — the four groups and
//         the legal pair. The copyright closes it. No multi-column grid, and
//         nothing is removed: every link is still in the DOM, only folded
//         away (crawlers follow it; e2e/seo.spec.ts pins the hub links).
//   The groups are plain headed lists, not per-column <details> accordions:
//   an accordion inside the disclosure would be two taps to a link, and
//   plain groups need no inline script to open them from md up.
//
// No auth lookup and no cookies()/headers() here, deliberately: the footer is
// on every public page and the public tree must stay prerenderable.
// <MobileBottomNav> reads the viewer from <SessionProvider> instead.

import { JOURNALS_PATH, PTEC_PUBLICATIONS_URL } from "@/lib/journals/urls";
import type { ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { ExternalLink, Globe, Mail, MapPin, Phone } from "lucide-react";
import { Seal } from "@/components/ui/core/Seal";
import InstallPWA from "@/components/ui/pwa/InstallPWA";
import LanguageSwitcher from "@/components/ui/core/LanguageSwitcher";
import { getSiteConfig } from "@/lib/system-settings/config";
import { resolveLibraryStatus } from "@/lib/about/status";
import { compactHoursLabel } from "@/lib/library-hours";
import MobileBottomNav from "./MobileBottomNav";
import FooterOpenStatus from "./FooterOpenStatus";
import FooterBackToTop from "./FooterBackToTop";
import FooterMoreLinks from "./FooterMoreLinks";

type FooterLink = {
  label: string;
  href: string;
  external?: boolean;
};

// Focus indicators come from the shared focus system (`--focus-*` tokens in
// app/globals.css): links take the base :focus-visible outline, buttons take
// `.focus-field`. The footer only retargets the colour tokens to gold, because
// the default brand blue is invisible on navy.
const FOCUS_TOKENS =
  "[--focus-color:var(--color-gold-300)] [--focus-border-color:var(--color-gold-300)] [--focus-ring-color:rgba(237,203,85,0.35)]";

// Hover and focus are an underline, never a colour change alone.
const LINK_CLASS =
  "inline-flex min-h-8 items-center gap-1.5 py-1 text-[14px] leading-6 text-blue-100 decoration-gold-300/80 decoration-[1.5px] underline-offset-4 transition-colors hover:text-white hover:underline";

// The phone footer's essential links: full 44px tap targets.
const QUICK_LINK_CLASS =
  "inline-flex min-h-11 items-center rounded-[10px] px-2.5 text-[14px] font-semibold text-blue-50 decoration-gold-300/80 decoration-[1.5px] underline-offset-4 transition-colors hover:text-white hover:underline";

const ICON_BUTTON_CLASS =
  "focus-field inline-flex h-10 w-10 items-center justify-center rounded-[10px] border border-white/15 bg-white/[0.04] text-blue-50 outline-none transition-colors hover:border-gold-300/70 hover:bg-white/[0.08] hover:text-white";

function FooterColumn({
  id,
  title,
  locale,
  className = "",
  children,
}: {
  id: string;
  title: string;
  locale: "en" | "km";
  className?: string;
  children: ReactNode;
}) {
  // Letter-spaced capitals are a Latin convention; Khmer has no case and its
  // stacked vowel signs collide when tracked.
  const heading =
    locale === "km"
      ? "font-khmer-serif text-[13px] leading-7 tracking-normal"
      : "text-[12px] uppercase tracking-[0.14em]";
  // `.footer-col` (app/globals.css) drops the rule and the heading row's
  // height from md up, where the groups are grid columns.
  return (
    <div className={`footer-col border-t border-white/10 ${className}`}>
      <div className="footer-col-head flex min-h-12 items-center">
        <h2 id={id} className={`font-semibold text-gold-200 ${heading}`}>
          {title}
        </h2>
      </div>
      <div className="pb-5 md:pb-0 md:pt-4">{children}</div>
    </div>
  );
}

function FooterLinkList({
  links,
  locale,
  newTabLabel,
}: {
  links: FooterLink[];
  locale: "en" | "km";
  /** Screen-reader note on external links — the icon alone is aria-hidden. */
  newTabLabel: string;
}) {
  const lineHeight = locale === "km" ? "leading-7" : "";
  return (
    <ul className="flex flex-col">
      {links.map((link) => (
        <li key={link.href}>
          {link.external ? (
            <a
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              className={`${LINK_CLASS} ${lineHeight}`}
            >
              {link.label}
              <ExternalLink className="h-3.5 w-3.5 opacity-70" aria-hidden="true" />
              <span className="sr-only"> {newTabLabel}</span>
            </a>
          ) : (
            <Link href={link.href} className={`${LINK_CLASS} ${lineHeight}`}>
              {link.label}
            </Link>
          )}
        </li>
      ))}
    </ul>
  );
}

function SocialLink({ href, label, children }: { href: string; label: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      className={ICON_BUTTON_CLASS}
    >
      {children}
    </a>
  );
}

function ContactRow({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span
        className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] bg-white/[0.06] text-gold-200"
        aria-hidden="true"
      >
        {icon}
      </span>
      <div className="min-w-0 text-[14px] leading-6 text-blue-50">{children}</div>
    </li>
  );
}

export default async function Footer() {
  // One round of awaits rather than four sequential ones: nothing here depends
  // on anything else here, and this runs on every public page.
  // getSiteConfig() is the published system settings (cached under
  // "site-config") — the single source for names, contact details and links.
  const [t, navT, rawLocale, cfg] = await Promise.all([
    getTranslations("footer"),
    getTranslations("nav"),
    getLocale(),
    getSiteConfig(),
  ]);
  const locale: "en" | "km" = rawLocale === "km" ? "km" : "en";

  // The status the server saw. It is the first paint on both sides;
  // <FooterOpenStatus> corrects it after mount (the page may be cached).
  const spec = cfg.hours.openingHoursSpec;
  const closures = cfg.hours.closures;
  const initialStatus = resolveLibraryStatus(new Date(), spec, closures);

  const libraryLinks: FooterLink[] = [
    { label: navT("eBooks"), href: "/books" },
    { label: navT("theses"), href: "/theses" },
    { label: navT("journals"), href: JOURNALS_PATH },
    { label: navT("learningPaths"), href: "/paths" },
    { label: navT("booksInLibrary"), href: "/catalogs" },
    // The two hub pages. Every /subjects/* and /authors/* URL was an orphan
    // before these existed (docs/SEO-V2-AUDIT.md F-4); the footer is what makes
    // both taxonomies reachable by a crawler, pinned by e2e/seo.spec.ts.
    { label: navT("subjects"), href: "/subjects" },
    { label: navT("authors"), href: "/authors" },
    // Not a library collection: the college's own publications page. Listed
    // with the collections because that is where a reader looks for it, and
    // marked external so it cannot be mistaken for one.
    { label: navT("ptecPublications"), href: PTEC_PUBLICATIONS_URL, external: true },
  ];

  const helpLinks: FooterLink[] = [
    { label: t("askLibrarian"), href: "/contact" },
    { label: navT("libraryRules"), href: "/about/rules" },
    { label: t("openingHours"), href: "/about/timings" },
    { label: t("faq"), href: "/#faq" },
    // Both open the matching dialog in the homepage's "Grow the collection"
    // band (components/ui/home/ContributeDialog.tsx reads `?action=`).
    { label: t("depositThesis"), href: "/?action=deposit#contribute" },
    { label: t("requestBook"), href: "/?action=request#contribute" },
  ];

  const aboutLinks: FooterLink[] = [
    { label: navT("ourJourney"), href: "/about/our-journey" },
    { label: t("teamAndCommittee"), href: "/about/team" },
    { label: navT("posts"), href: "/posts" },
    { label: t("ptecWebsite"), href: cfg.links.website, external: true },
  ];

  const legalLinks: FooterLink[] = [
    { label: t("links.privacy"), href: "/privacy" },
    { label: t("links.policy"), href: "/policy" },
  ];

  const address = locale === "km" ? cfg.address.km : cfg.address.en;
  const libraryName = locale === "km" ? cfg.libraryName.km : cfg.libraryName.en;
  const khmerCopy = locale === "km" ? "leading-8" : "leading-7";

  return (
    <footer
      className={`relative mt-auto w-full bg-[var(--ptec-plate)] text-blue-50 ${FOCUS_TOKENS}`}
    >
      {/* A hairline gold gradient separates the page from the navy footer. */}
      <div
        aria-hidden="true"
        className="h-px w-full bg-gradient-to-r from-transparent via-gold-300/70 to-transparent"
      />

      {/* Bottom padding clears the floating <MobileBottomNav> (its clearance
          token already carries the home-indicator inset); lg+ has none. */}
      <div
        data-footer-inner
        className="mx-auto max-w-[1360px] px-5 pb-[calc(var(--ptec-mobile-nav-clearance)+1.5rem)] pt-8 sm:px-8 md:pt-12 lg:px-10 lg:pb-10 lg:pt-14"
      >
        <div className="grid grid-cols-1 gap-x-8 gap-y-2 md:grid-cols-2 md:gap-y-10 lg:grid-cols-[1.5fr_1fr_1fr_1fr_1.35fr] lg:gap-x-10">
          {/* ── Brand block ── */}
          <section
            aria-labelledby="footer-brand-heading"
            className="mb-4 space-y-4 md:col-span-2 md:mb-0 md:space-y-5 lg:col-span-1"
          >
            <div className="flex items-center gap-4">
              <Seal size={56} variant="footer" />
              <div className="min-w-0">
                <p lang="km" className="font-khmer-serif text-[13px] font-bold leading-6 text-gold-200">
                  {cfg.libraryName.km}
                </p>
                <h2
                  id="footer-brand-heading"
                  className="text-[22px] font-bold leading-tight tracking-wide text-white"
                >
                  {cfg.libraryName.en}
                </h2>
                {/* The institution line is a desktop courtesy; on a phone the
                    copyright line below names the institution already. */}
                <p
                  lang={locale === "km" ? "km" : undefined}
                  className={`mt-1 text-[12.5px] text-blue-200/90 max-md:hidden ${
                    locale === "km" ? "font-khmer-serif leading-6" : "leading-snug"
                  }`}
                >
                  {locale === "km" ? cfg.name.km : cfg.name.en}
                </p>
              </div>
            </div>
            {/* Phones get the mission in one line; the full sentence wraps to
                two or three lines at 360 px. */}
            <p
              data-footer-mission
              className={`truncate text-[13.5px] text-blue-100 md:hidden ${locale === "km" ? "leading-7" : "leading-6"}`}
            >
              {t("taglineShort")}
            </p>
            <p className={`max-w-sm text-[14px] text-blue-100 max-md:hidden ${khmerCopy}`}>{t("tagline")}</p>

            {/* Phones: the four links worth a tap without opening anything.
                From md up the same destinations sit in the columns and the
                bottom bar, so this row is not drawn there. */}
            <nav aria-label={t("quickLinks")} className="md:hidden">
              <ul className="-mx-2.5 flex flex-wrap items-center gap-x-0.5 gap-y-1">
                <li>
                  <Link href="/about" className={QUICK_LINK_CLASS}>
                    {navT("about")}
                  </Link>
                </li>
                <li>
                  <Link href="/contact" className={QUICK_LINK_CLASS}>
                    {navT("contact")}
                  </Link>
                </li>
                <li>
                  <Link href="/privacy" className={QUICK_LINK_CLASS}>
                    {t("links.privacy")}
                  </Link>
                </li>
                <li className="px-2.5">
                  <LanguageSwitcher locale={locale} size="touch" className="text-blue-50" />
                </li>
              </ul>
            </nav>

            <ul className="flex flex-wrap items-center gap-2.5" aria-label={t("socialLinks")}>
              <li>
                <SocialLink href={cfg.links.facebook} label="Facebook">
                  <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
                  </svg>
                </SocialLink>
              </li>
              <li>
                <SocialLink href={cfg.links.youtube} label="YouTube">
                  <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M22.54 6.42a2.78 2.78 0 0 0-1.95-1.96C18.88 4 12 4 12 4s-6.88 0-8.59.46a2.78 2.78 0 0 0-1.95 1.96A29 29 0 0 0 1 12a29 29 0 0 0 .46 5.58A2.78 2.78 0 0 0 3.41 19.6C5.12 20 12 20 12 20s6.88 0 8.59-.46a2.78 2.78 0 0 0 1.95-1.95A29 29 0 0 0 23 12a29 29 0 0 0-.46-5.58zM9.75 15.02V8.98L15.5 12l-5.75 3.02z" />
                  </svg>
                </SocialLink>
              </li>
              <li>
                <SocialLink href={cfg.links.website} label={t("officialWebsite")}>
                  <Globe className="h-4 w-4" aria-hidden="true" />
                </SocialLink>
              </li>
              <li>
                <InstallPWA
                  label={t("installApp")}
                  className="focus-field inline-flex h-10 items-center gap-2 rounded-[10px] border border-white/15 bg-white/[0.04] px-3.5 text-[13px] font-semibold text-blue-50 outline-none transition-colors hover:border-gold-300/70 hover:bg-white/[0.08] hover:text-white"
                  hintClassName="absolute bottom-full left-0 z-[80] mb-2 w-64 rounded-xl border border-divider bg-bg-surface p-4 text-text-body shadow-lg"
                />
              </li>
            </ul>
          </section>

          {/* ── Everything else: folded behind "More links" on a phone, the
              grid's columns from md up (FooterMoreLinks is `display:
              contents` there). ── */}
          <FooterMoreLinks label={t("moreLinks")}>
            <nav aria-label={t("navLabel")} className="contents">
              <FooterColumn id="footer-library-heading" title={t("columns.library")} locale={locale}>
                <FooterLinkList links={libraryLinks} locale={locale} newTabLabel={navT("opensNewTab")} />
              </FooterColumn>
              <FooterColumn id="footer-help-heading" title={t("columns.help")} locale={locale}>
                <FooterLinkList links={helpLinks} locale={locale} newTabLabel={navT("opensNewTab")} />
              </FooterColumn>
              <FooterColumn id="footer-about-heading" title={t("columns.about")} locale={locale}>
                <FooterLinkList links={aboutLinks} locale={locale} newTabLabel={navT("opensNewTab")} />
              </FooterColumn>
            </nav>

            {/* ── Visit ── */}
            <FooterColumn id="footer-visit-heading" title={t("columns.visit")} locale={locale}>
              <div className="space-y-4">
                <FooterOpenStatus
                  initialStatus={initialStatus}
                  spec={spec}
                  closures={closures}
                  locale={locale}
                />
                {/* The address card replaces the maps iframe: one link to the
                    place, no third-party frame on every page. */}
                <a
                  href={cfg.links.mapPlace}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="focus-field group/map block rounded-[12px] border border-white/12 bg-white/[0.04] p-4 outline-none transition-colors hover:border-gold-300/70 hover:bg-white/[0.07]"
                >
                  <span className="flex items-start gap-3">
                    <span
                      className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] bg-gold-300/15 text-gold-200"
                      aria-hidden="true"
                    >
                      <MapPin className="h-4 w-4" />
                    </span>
                    <span className="min-w-0">
                      <span
                        lang={locale === "km" ? "km" : undefined}
                        className={`block text-[14px] text-blue-50 ${khmerCopy}`}
                      >
                        {address}
                      </span>
                      <span className="mt-2 inline-flex items-center gap-1.5 text-[13px] font-semibold text-gold-200 underline-offset-4 group-hover/map:underline">
                        {t("getDirections")}
                        <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                        <span className="sr-only">({t("opensInMaps")})</span>
                      </span>
                    </span>
                  </span>
                </a>
                <ul className="space-y-2.5">
                  <ContactRow icon={<Phone className="h-3.5 w-3.5" />}>
                    <span className="sr-only">{t("phoneLabel")}: </span>
                    <a href={cfg.phoneTel} className="underline-offset-4 hover:underline">
                      {cfg.phoneIntl}
                    </a>
                  </ContactRow>
                  <ContactRow icon={<Mail className="h-3.5 w-3.5" />}>
                    <span className="sr-only">{t("emailLabel")}: </span>
                    <a href={`mailto:${cfg.email}`} className="break-all underline-offset-4 hover:underline">
                      {cfg.email}
                    </a>
                  </ContactRow>
                </ul>
              </div>
            </FooterColumn>

            {/* Phones only: the legal pair, which the bottom bar carries from
                md up. Privacy is also one of the essential links above. */}
            <FooterColumn id="footer-legal-heading" title={t("legal")} locale={locale} className="md:hidden">
              <FooterLinkList links={legalLinks} locale={locale} newTabLabel={navT("opensNewTab")} />
            </FooterColumn>
          </FooterMoreLinks>
        </div>

        {/* ── Bottom bar ── */}
        <div className="mt-6 border-t border-white/10 pt-5 md:mt-10 md:pt-6">
          {/* Stacked on a phone, deliberately: the back-to-top button stays
              at the LEFT of its own row, because at the bottom of a page the
              assistant's floating button sits over the footer's right edge
              (e2e/footer-mobile.spec.ts checks nothing is covered). */}
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <nav
              aria-label={t("legal")}
              className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-blue-100"
            >
              <span lang={locale === "km" ? "km" : undefined}>
                {t("copyright", {
                  year: new Date().getFullYear(),
                  library: libraryName,
                  institution: locale === "km" ? cfg.name.km : cfg.name.en,
                })}
              </span>
              {legalLinks.map((link) => (
                <span key={link.href} className="inline-flex items-center gap-x-2 max-md:hidden">
                  <span aria-hidden="true" className="text-blue-200/50">
                    ·
                  </span>
                  <Link
                    href={link.href}
                    className="rounded-sm decoration-gold-300/80 decoration-[1.5px] underline-offset-4 hover:text-white hover:underline"
                  >
                    {link.label}
                  </Link>
                </span>
              ))}
            </nav>
            <div className="flex items-center gap-3">
              {/* On a phone the language control is one of the essential links. */}
              <LanguageSwitcher locale={locale} className="text-blue-50 max-md:hidden" />
              <FooterBackToTop label={t("backToTop")} className={ICON_BUTTON_CLASS} />
            </div>
          </div>
        </div>
      </div>

      {/* Same published hours as the Visit column, so the tab bar's Explore
          sheet can say whether the physical library is open right now; the
          contact details are what the More sheet lists (they used to be in
          the ☰ drawer, which is gone below lg). */}
      <MobileBottomNav
        hours={{ spec, closures }}
        contact={{
          phone: cfg.phone,
          phoneTel: cfg.phoneTel,
          email: cfg.email,
          mapPlace: cfg.links.mapPlace,
          hoursLabel: compactHoursLabel(locale, spec),
        }}
      />
    </footer>
  );
}

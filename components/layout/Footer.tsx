// components/layout/Footer.tsx
//
// The site footer: one server component, one DOM instance. It used to render
// the link columns twice (desktop grid + a mobile accordion) under a canvas
// constellation with a rAF loop, a cursor spotlight and a Google Maps iframe.
// Now the four columns are native <details> that behave as accordions on
// small screens and as plain columns from md up, the map is an address card
// that links to the place, and the only client JS is the live open/closed
// line and the back-to-top button.
//
// No auth lookup and no cookies()/headers() here, deliberately: the footer is
// on every public page and the public tree must stay prerenderable.
// <MobileBottomNav> reads the viewer from <SessionProvider> instead.

import type { ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { ExternalLink, Globe, Mail, MapPin, Phone, ChevronDown } from "lucide-react";
import { Seal } from "@/components/ui/core/Seal";
import InstallPWA from "@/components/ui/pwa/InstallPWA";
import LanguageSwitcher from "@/components/ui/core/LanguageSwitcher";
import { getSiteConfig } from "@/lib/system-settings/config";
import { resolveLibraryStatus } from "@/lib/about/status";
import MobileBottomNav from "./MobileBottomNav";
import FooterOpenStatus from "./FooterOpenStatus";
import FooterBackToTop from "./FooterBackToTop";

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

const ICON_BUTTON_CLASS =
  "focus-field inline-flex h-10 w-10 items-center justify-center rounded-[10px] border border-white/15 bg-white/[0.04] text-blue-50 outline-none transition-colors hover:border-gold-300/70 hover:bg-white/[0.08] hover:text-white";

// Columns are <details>: closed in the HTML, opened on md+ by the inline
// script below before the footer paints (a closed <details> cannot be opened
// by CSS). React does not patch attributes during hydration, so the element
// carries suppressHydrationWarning for the `open` the script adds.
const OPEN_COLUMNS_SCRIPT =
  '(function(){try{if(!window.matchMedia("(min-width: 48rem)").matches)return;var n=document.querySelectorAll("details.footer-col");for(var i=0;i<n.length;i++){n[i].open=true;var s=n[i].firstElementChild;if(s)s.tabIndex=-1}}catch(e){}})();';

function FooterColumn({
  id,
  title,
  locale,
  children,
}: {
  id: string;
  title: string;
  locale: "en" | "km";
  children: ReactNode;
}) {
  // Letter-spaced capitals are a Latin convention; Khmer has no case and its
  // stacked vowel signs collide when tracked.
  const heading =
    locale === "km"
      ? "font-khmer-serif text-[13px] leading-7 tracking-normal"
      : "text-[12px] uppercase tracking-[0.14em]";
  return (
    <details className="footer-col group border-t border-white/10" suppressHydrationWarning>
      <summary
        className="flex min-h-12 cursor-pointer items-center justify-between gap-3 rounded-sm md:cursor-default"
        suppressHydrationWarning
      >
        <h2 id={id} className={`font-semibold text-gold-200 ${heading}`}>
          {title}
        </h2>
        <ChevronDown
          className="footer-col-chevron h-4 w-4 shrink-0 text-blue-200/80 transition-transform group-open:rotate-180 motion-reduce:transition-none"
          aria-hidden="true"
        />
      </summary>
      <div className="pb-5 md:pb-0 md:pt-4">{children}</div>
    </details>
  );
}

function FooterLinkList({ links, locale }: { links: FooterLink[]; locale: "en" | "km" }) {
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
    { label: navT("publications"), href: "/publications" },
    { label: navT("learningPaths"), href: "/paths" },
    { label: navT("booksInLibrary"), href: "/catalogs" },
    // The two hub pages. Every /subjects/* and /authors/* URL was an orphan
    // before these existed (docs/SEO-V2-AUDIT.md F-4); the footer is what makes
    // both taxonomies reachable by a crawler, pinned by e2e/seo.spec.ts.
    { label: navT("subjects"), href: "/subjects" },
    { label: navT("authors"), href: "/authors" },
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

      {/* Bottom padding clears the fixed <MobileBottomNav> (64px) plus the
          device's home-indicator inset; lg+ has no bottom nav. */}
      <div className="mx-auto max-w-[1360px] px-5 pb-[calc(64px+1.5rem+env(safe-area-inset-bottom))] pt-12 sm:px-8 lg:px-10 lg:pb-10 lg:pt-14">
        <div className="grid grid-cols-1 gap-x-8 gap-y-2 md:grid-cols-2 md:gap-y-10 lg:grid-cols-[1.5fr_1fr_1fr_1fr_1.35fr] lg:gap-x-10">
          {/* ── Brand block ── */}
          <section
            aria-labelledby="footer-brand-heading"
            className="mb-8 space-y-5 md:col-span-2 md:mb-0 lg:col-span-1"
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
                <p
                  lang={locale === "km" ? "km" : undefined}
                  className={`mt-1 text-[12.5px] text-blue-200/90 ${
                    locale === "km" ? "font-khmer-serif leading-6" : "leading-snug"
                  }`}
                >
                  {locale === "km" ? cfg.name.km : cfg.name.en}
                </p>
              </div>
            </div>
            <p className={`max-w-sm text-[14px] text-blue-100 ${khmerCopy}`}>{t("tagline")}</p>
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

          {/* ── Link columns ── */}
          <nav aria-label={t("navLabel")} className="contents">
            <FooterColumn id="footer-library-heading" title={t("columns.library")} locale={locale}>
              <FooterLinkList links={libraryLinks} locale={locale} />
            </FooterColumn>
            <FooterColumn id="footer-help-heading" title={t("columns.help")} locale={locale}>
              <FooterLinkList links={helpLinks} locale={locale} />
            </FooterColumn>
            <FooterColumn id="footer-about-heading" title={t("columns.about")} locale={locale}>
              <FooterLinkList links={aboutLinks} locale={locale} />
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
        </div>

        <script
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: OPEN_COLUMNS_SCRIPT }}
        />

        {/* ── Bottom bar ── */}
        <div className="mt-10 border-t border-white/10 pt-6">
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
                <span key={link.href} className="inline-flex items-center gap-x-2">
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
              <LanguageSwitcher locale={locale} className="text-blue-50" />
              <FooterBackToTop label={t("backToTop")} className={ICON_BUTTON_CLASS} />
            </div>
          </div>
        </div>
      </div>

      <MobileBottomNav />
    </footer>
  );
}

import { Link } from "@/i18n/navigation";
import Icon from "@/components/ui/core/Icon";
import MobileBottomNav from "./MobileBottomNav";
import FooterEffects from "./FooterEffects";
import { Seal } from "@/components/ui/core/Seal";
import InstallPWA from "@/components/ui/pwa/InstallPWA";
import { getLocale, getTranslations } from "next-intl/server";
import { getSiteConfig } from "@/lib/system-settings/config";
import { DIGITAL_LIBRARY_ITEMS } from "./digital-library-nav";
import { ABOUT_NAV_ITEMS } from "./about-nav";

type FooterLink = {
  label: string;
  href: string;
  external?: boolean;
};

// Shared link classes: a gold dot that fills on hover, the row slides right,
// the label glows, and a gold underline sweeps in from the left.
const LINK_CLASS =
  "group relative inline-flex min-h-[30px] items-center gap-2.5 text-[14px] leading-snug text-blue-100/92 transition-[color,transform] duration-300 ease-[cubic-bezier(.2,.7,.2,1)] hover:translate-x-1.5 hover:text-gold-200 hover:[text-shadow:0_0_14px_rgba(237,203,85,.45)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300";

function LinkDot() {
  return (
    <span
      className="h-1.5 w-1.5 shrink-0 rounded-full border-[1.4px] border-current transition-[background-color,box-shadow] duration-300 group-hover:bg-current group-hover:shadow-[0_0_8px_rgba(237,203,85,.8)]"
      aria-hidden="true"
    />
  );
}

function LinkUnderline() {
  return (
    <span
      className="pointer-events-none absolute bottom-0.5 left-4 right-0 h-px origin-left scale-x-0 rounded bg-gradient-to-r from-gold-300 to-gold-200 opacity-90 transition-transform duration-300 ease-[cubic-bezier(.2,.8,.2,1)] group-hover:scale-x-100"
      aria-hidden="true"
    />
  );
}

function FooterLinkList({ links }: { links: FooterLink[] }) {
  return (
    <ul className="flex flex-col gap-0.5">
      {links.map((link) => (
        <li key={`${link.label}-${link.href}`}>
          {link.external ? (
            <a
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              className={LINK_CLASS}
            >
              <LinkDot />
              <span>{link.label}</span>
              <Icon name="external-link" className="text-[13px] opacity-70" />
              <LinkUnderline />
            </a>
          ) : (
            <Link href={link.href} className={LINK_CLASS}>
              <LinkDot />
              <span>{link.label}</span>
              <LinkUnderline />
            </Link>
          )}
        </li>
      ))}
    </ul>
  );
}

function FooterHeading({ id, children }: { id?: string; children: React.ReactNode }) {
  return (
    <h2
      id={id}
      className="mb-4 flex items-center gap-2.5 text-[18px] font-bold tracking-wide text-white"
    >
      <span
        className="h-[3px] w-5 rounded bg-gradient-to-r from-gold-300 to-gold-200 shadow-[0_0_12px_rgba(237,203,85,.55)]"
        aria-hidden="true"
      />
      {children}
    </h2>
  );
}

function SocialLink({
  href,
  label,
  children,
}: {
  href: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      className="inline-flex h-[38px] w-[38px] items-center justify-center rounded-[10px] border border-white/12 bg-white/[0.04] text-blue-100 transition-[transform,border-color,color,box-shadow] duration-300 ease-[cubic-bezier(.2,.7,.2,1)] hover:-translate-y-0.5 hover:border-gold-300/60 hover:text-gold-200 hover:shadow-[0_10px_22px_-8px_rgba(237,203,85,.5)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300"
    >
      {children}
    </a>
  );
}

function FooterDetails({
  title,
  links,
}: {
  title: string;
  links: FooterLink[];
}) {
  return (
    <details className="group border-t border-white/10 py-1">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 text-[15px] font-bold text-white [&::-webkit-details-marker]:hidden">
        <span>{title}</span>
        <span className="flex h-8 w-8 items-center justify-center rounded-lg text-blue-100/75 transition-transform group-open:rotate-90" aria-hidden="true">
          <Icon name="chevron-right" className="text-[18px]" />
        </span>
      </summary>
      <div className="pb-3 pl-1">
        <FooterLinkList links={links} />
      </div>
    </details>
  );
}

function ContactRow({
  icon,
  label,
  children,
}: {
  icon: "map-pin" | "phone" | "mail" | "clock";
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] bg-white/[0.05] text-gold-200" aria-hidden="true">
        <Icon name={icon} className="text-[15px]" />
      </span>
      <div className="min-w-0">
        <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-blue-200/70">
          {label}
        </p>
        <div className="mt-0.5 text-[14px] leading-relaxed text-blue-50/88">
          {children}
        </div>
      </div>
    </div>
  );
}

export default async function Footer() {
  const t = await getTranslations("footer");
  const navT = await getTranslations("nav");
  const locale = (await getLocale()) as "en" | "km";
  // Published system settings (cached under "site-config") — the single
  // source for contact details, hours and links shown here.
  const cfg = await getSiteConfig();
  // No auth lookup here, deliberately. This used to run a second Supabase Auth
  // round-trip plus a profiles query — on top of the navbar's — on every public
  // page render, and the cookies() read made the whole public tree uncacheable.
  // MobileBottomNav takes the viewer from <SessionProvider> instead.

  const exploreLinks: FooterLink[] = [
    ...DIGITAL_LIBRARY_ITEMS.filter((item) => !item.external).map((item) => ({
      label: navT(item.labelKey),
      href: item.href,
    })),
    { label: navT("booksInLibrary"), href: "/catalogs" },
    { label: navT("posts"), href: "/posts" },
  ];

  const helpLinks: FooterLink[] = [
    { label: navT("about"), href: "/about" },
    ...ABOUT_NAV_ITEMS.map((item) => ({
      label: navT(item.labelKey),
      href: item.href,
    })),
    { label: t("links.privacy"), href: "/privacy" },
    { label: t("links.policy"), href: "/policy" },
  ];

  const legalLinks: FooterLink[] = [
    { label: t("links.privacy"), href: "/privacy" },
    { label: t("links.policy"), href: "/policy" },
  ];

  const address = locale === "km" ? cfg.address.km : cfg.address.en;
  const hours = locale === "km" ? cfg.hours.km : cfg.hours.en;

  return (
    <footer className="footer-night relative mt-auto w-full overflow-hidden border-t border-blue-900/35 text-blue-50">
      {/* ambient glow orbs */}
      <div
        aria-hidden="true"
        className="animate-float-orb pointer-events-none absolute -left-20 -top-28 z-0 h-[420px] w-[420px] rounded-full blur-[30px]"
        style={{ background: "radial-gradient(circle, rgba(58,95,196,.45), transparent 68%)" }}
      />
      <div
        aria-hidden="true"
        className="animate-float-orb-slow pointer-events-none absolute -bottom-32 -right-16 z-0 h-[460px] w-[460px] rounded-full blur-[34px]"
        style={{ background: "radial-gradient(circle, rgba(237,203,85,.26), transparent 66%)" }}
      />

      {/* drifting constellation + cursor spotlight */}
      <FooterEffects />

      {/* animated aurora accent bar */}
      <div className="relative z-[2] h-1 overflow-hidden" aria-hidden="true">
        <div className="footer-aurora absolute inset-0" />
        <div className="footer-shimmer absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-white/85 to-transparent blur-[1px]" />
      </div>

      <div className="relative z-[2] mx-auto max-w-[1360px] px-5 pb-[calc(5.75rem+env(safe-area-inset-bottom))] pt-10 sm:px-8 md:pb-[calc(6rem+env(safe-area-inset-bottom))] lg:px-10 lg:pb-8 lg:pt-14">
        <div className="grid gap-10 md:grid-cols-[1.35fr_1fr_1.1fr_1.25fr] md:gap-8 lg:gap-12">
          <section aria-labelledby="footer-brand-heading" data-fx-reveal className="space-y-5">
            <div className="flex items-center gap-4">
              <div className="footer-seal shrink-0 [filter:drop-shadow(0_6px_16px_rgba(237,203,85,.28))]">
                <Seal size={64} variant="footer" />
              </div>
              <div className="min-w-0">
                <p lang="km" className="truncate font-khmer-serif text-[13px] font-bold leading-tight text-gold-200">
                  {cfg.libraryName.km}
                </p>
                <h2 id="footer-brand-heading" className="footer-shine mt-1 w-fit text-[27px] font-bold leading-tight tracking-wide">
                  {cfg.libraryName.en}
                </h2>
              </div>
            </div>
            <p className="max-w-sm text-[14px] leading-7 text-blue-100/82">
              {t("description")}
            </p>
            <div className="flex flex-wrap items-center gap-2.5" aria-label={t("socialLinks")}>
              <SocialLink href={cfg.links.facebook} label="Facebook">
                <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
                </svg>
              </SocialLink>
              <SocialLink href={cfg.links.youtube} label="YouTube">
                <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M22.54 6.42a2.78 2.78 0 0 0-1.95-1.96C18.88 4 12 4 12 4s-6.88 0-8.59.46a2.78 2.78 0 0 0-1.95 1.96A29 29 0 0 0 1 12a29 29 0 0 0 .46 5.58A2.78 2.78 0 0 0 3.41 19.6C5.12 20 12 20 12 20s6.88 0 8.59-.46a2.78 2.78 0 0 0 1.95-1.95A29 29 0 0 0 23 12a29 29 0 0 0-.46-5.58zM9.75 15.02V8.98L15.5 12l-5.75 3.02z" />
                </svg>
              </SocialLink>
              <SocialLink href={cfg.links.website} label={t("officialWebsite")}>
                <Icon name="globe" className="text-[16px]" />
              </SocialLink>
              <InstallPWA
                label={t("installApp")}
                className="inline-flex h-[38px] items-center gap-2 rounded-[10px] border border-white/12 bg-white/[0.04] px-3.5 text-[12.5px] font-semibold text-blue-100 transition-[transform,border-color,color,box-shadow] duration-300 ease-[cubic-bezier(.2,.7,.2,1)] hover:-translate-y-0.5 hover:border-gold-300/60 hover:text-gold-200 hover:shadow-[0_10px_22px_-8px_rgba(237,203,85,.5)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300"
                hintClassName="absolute bottom-full left-0 z-[80] mb-2 w-64 rounded-xl border border-divider bg-bg-surface p-4 text-text-body shadow-lg"
              />
            </div>
          </section>

          <section aria-labelledby="footer-explore-heading" data-fx-reveal className="hidden md:block">
            <FooterHeading id="footer-explore-heading">{t("explore")}</FooterHeading>
            <FooterLinkList links={exploreLinks} />
          </section>

          <section aria-labelledby="footer-help-heading" data-fx-reveal className="hidden md:block">
            <FooterHeading id="footer-help-heading">{t("helpInfo")}</FooterHeading>
            <FooterLinkList links={helpLinks} />
          </section>

          <section aria-labelledby="footer-visit-heading" data-fx-reveal className="space-y-4">
            <FooterHeading id="footer-visit-heading">{t("visitPtec")}</FooterHeading>
            <ContactRow icon="map-pin" label={t("locationLabel")}>
              <span>{address}</span>
            </ContactRow>
            <ContactRow icon="phone" label={t("phoneLabel")}>
              <a href={cfg.phoneTel} className="transition-colors hover:text-gold-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300">
                {cfg.phoneIntl}
              </a>
            </ContactRow>
            <ContactRow icon="mail" label={t("emailLabel")}>
              <a href={`mailto:${cfg.email}`} className="break-words transition-colors hover:text-gold-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300">
                {cfg.email}
              </a>
            </ContactRow>
            <ContactRow icon="clock" label={t("hoursLabel")}>
              <span>{hours}</span>
            </ContactRow>
            {cfg.links.mapEmbed && (
            <div className="hidden sm:block">
              <div className="overflow-hidden rounded-[11px] border border-white/10 bg-white/[0.04]">
                <iframe
                  src={cfg.links.mapEmbed}
                  title={t("mapTitle")}
                  width="100%"
                  height="128"
                  loading="lazy"
                  sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
                  referrerPolicy="no-referrer-when-downgrade"
                  style={{ border: 0, pointerEvents: "none", filter: "grayscale(.3) contrast(1.05)" }}
                  className="block h-32 w-full"
                />
              </div>
            </div>
            )}
            <a
              href={cfg.links.mapPlace}
              target="_blank"
              rel="noopener noreferrer"
              data-fx-magnetic
              className="inline-flex min-h-10 items-center gap-2 rounded-[11px] bg-gradient-to-br from-gold-200 to-gold-300 px-5 text-sm font-bold text-blue-950 shadow-[0_12px_26px_-10px_rgba(237,203,85,.6)] transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-100"
            >
              <Icon name="map-pin" className="text-[15px]" />
              {t("getDirections")}
            </a>
          </section>
        </div>

        <div className="mt-8 md:hidden">
          <FooterDetails title={t("explore")} links={exploreLinks} />
          <FooterDetails title={t("helpInfo")} links={helpLinks} />
        </div>

        <div className="mt-9 border-t border-white/10 pt-5">
          <div className="flex flex-col gap-3 text-[12px] text-blue-100/68 md:flex-row md:items-center md:justify-between">
            <p>
              {t("copyright", {
                year: new Date().getFullYear(),
                library: locale === "km" ? cfg.libraryName.km : cfg.libraryName.en,
                institution: locale === "km" ? cfg.name.km : cfg.name.en,
              })}
            </p>
            <nav aria-label={t("legal")} className="flex flex-wrap items-center gap-x-4 gap-y-2">
              {legalLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="transition-colors hover:text-gold-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300"
                >
                  {link.label}
                </Link>
              ))}
              <button
                type="button"
                data-fx-top
                aria-label={t("backToTop")}
                className="inline-flex h-[34px] w-[34px] items-center justify-center rounded-full border border-white/14 text-blue-50/80 transition-[transform,border-color,color] duration-300 ease-[cubic-bezier(.2,.7,.2,1)] hover:-translate-y-0.5 hover:border-gold-300 hover:text-gold-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 19V5M5 12l7-7 7 7" />
                </svg>
              </button>
            </nav>
          </div>
        </div>
      </div>

      <MobileBottomNav />
    </footer>
  );
}

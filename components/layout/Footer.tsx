import { Link } from "@/i18n/navigation";
import Icon from "@/components/ui/core/Icon";
import MobileBottomNav from "./MobileBottomNav";
import { createClient } from "@/lib/supabase/server";
import { Seal } from "@/components/ui/core/Seal";
import InstallPWA from "@/components/ui/pwa/InstallPWA";
import { getLocale, getTranslations } from "next-intl/server";
import { PTEC } from "@/lib/ptec";
import { DIGITAL_LIBRARY_ITEMS } from "./digital-library-nav";
import { ABOUT_NAV_ITEMS } from "./about-nav";

type FooterLink = {
  label: string;
  href: string;
  external?: boolean;
};

function FooterLinkList({ links }: { links: FooterLink[] }) {
  return (
    <ul className="space-y-2.5">
      {links.map((link) => (
        <li key={`${link.label}-${link.href}`}>
          {link.external ? (
            <a
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              className="group inline-flex min-h-7 items-center gap-2 text-[14px] leading-snug text-blue-100/82 transition-colors hover:text-gold-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300"
            >
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-gold-300/70 transition-transform group-hover:scale-125" aria-hidden="true" />
              <span>{link.label}</span>
              <Icon name="external-link" className="text-[13px] opacity-70" />
            </a>
          ) : (
            <Link
              href={link.href}
              className="group inline-flex min-h-7 items-center gap-2 text-[14px] leading-snug text-blue-100/82 transition-colors hover:text-gold-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300"
            >
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-gold-300/70 transition-transform group-hover:scale-125" aria-hidden="true" />
              <span>{link.label}</span>
            </Link>
          )}
        </li>
      ))}
    </ul>
  );
}

function FooterHeading({ id, children }: { id?: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="mb-4 text-[16px] font-bold tracking-wide text-white">
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
      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/12 bg-white/[0.04] text-blue-100 transition-colors hover:border-gold-300/60 hover:text-gold-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300"
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
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.05] text-gold-200" aria-hidden="true">
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
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  const user = authUser
    ? await supabase
        .from("profiles")
        .select("full_name, avatar_url, role")
        .eq("id", authUser.id)
        .single()
        .then(({ data }) => {
          const googleAvatar = authUser.user_metadata?.avatar_url || authUser.user_metadata?.picture;
          const googleName = authUser.user_metadata?.full_name || authUser.user_metadata?.name;
          return {
            email: authUser.email ?? "",
            full_name: data?.full_name ?? googleName ?? null,
            avatar_url: data?.avatar_url ?? googleAvatar ?? null,
            role: (data?.role ?? "reader") as "reader" | "admin",
          };
        })
    : null;

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

  const address = locale === "km" ? PTEC.address.km : PTEC.address.en;
  const hours = locale === "km" ? PTEC.hours.km : PTEC.hours.en;

  return (
    <footer className="relative mt-auto w-full overflow-hidden border-t border-blue-900/35 bg-[#081436] text-blue-50">
      <div className="h-1 bg-gradient-to-r from-blue-700 via-gold-400 to-blue-700" aria-hidden="true" />

      <div className="mx-auto max-w-[1360px] px-5 pb-[calc(5.75rem+env(safe-area-inset-bottom))] pt-10 sm:px-8 md:pb-[calc(6rem+env(safe-area-inset-bottom))] lg:px-10 lg:pb-8 lg:pt-14">
        <div className="grid gap-10 md:grid-cols-[1.35fr_1fr_1.1fr_1.25fr] md:gap-8 lg:gap-12">
          <section aria-labelledby="footer-brand-heading" className="space-y-5">
            <div className="flex items-center gap-4">
              <Seal size={64} variant="footer" />
              <div className="min-w-0">
                <p lang="km" className="truncate font-khmer-serif text-[13px] font-bold leading-tight text-gold-200">
                  បណ្ណាល័យវិទ្យាស្ថានគរុកោសល្យរាជធានីភ្នំពេញ
                </p>
                <h2 id="footer-brand-heading" className="mt-1 text-xl font-bold tracking-wide text-white">
                  PTEC Library
                </h2>
              </div>
            </div>
            <p className="max-w-sm text-[14px] leading-7 text-blue-100/82">
              {t("description")}
            </p>
            <div className="flex flex-wrap items-center gap-2.5" aria-label={t("socialLinks")}>
              <SocialLink href={PTEC.links.facebook} label="Facebook">
                <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
                </svg>
              </SocialLink>
              <SocialLink href={PTEC.links.youtube} label="YouTube">
                <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M22.54 6.42a2.78 2.78 0 0 0-1.95-1.96C18.88 4 12 4 12 4s-6.88 0-8.59.46a2.78 2.78 0 0 0-1.95 1.96A29 29 0 0 0 1 12a29 29 0 0 0 .46 5.58A2.78 2.78 0 0 0 3.41 19.6C5.12 20 12 20 12 20s6.88 0 8.59-.46a2.78 2.78 0 0 0 1.95-1.95A29 29 0 0 0 23 12a29 29 0 0 0-.46-5.58zM9.75 15.02V8.98L15.5 12l-5.75 3.02z" />
                </svg>
              </SocialLink>
              <SocialLink href={PTEC.links.website} label={t("officialWebsite")}>
                <Icon name="globe" className="text-[16px]" />
              </SocialLink>
              <InstallPWA
                label={t("installApp")}
                className="inline-flex h-9 items-center gap-2 rounded-lg border border-white/12 bg-white/[0.04] px-3 text-[12px] font-semibold text-blue-100 transition-colors hover:border-gold-300/60 hover:text-gold-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300"
                hintClassName="absolute bottom-full left-0 z-[80] mb-2 w-64 rounded-xl border border-divider bg-bg-surface p-4 text-text-body shadow-lg"
              />
            </div>
          </section>

          <section aria-labelledby="footer-explore-heading" className="hidden md:block">
            <FooterHeading id="footer-explore-heading">{t("explore")}</FooterHeading>
            <FooterLinkList links={exploreLinks} />
          </section>

          <section aria-labelledby="footer-help-heading" className="hidden md:block">
            <FooterHeading id="footer-help-heading">{t("helpInfo")}</FooterHeading>
            <FooterLinkList links={helpLinks} />
          </section>

          <section aria-labelledby="footer-visit-heading" className="space-y-4">
            <FooterHeading id="footer-visit-heading">{t("visitPtec")}</FooterHeading>
            <ContactRow icon="map-pin" label={t("locationLabel")}>
              <span>{address}</span>
            </ContactRow>
            <ContactRow icon="phone" label={t("phoneLabel")}>
              <a href={PTEC.phoneTel} className="transition-colors hover:text-gold-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300">
                {PTEC.phoneIntl}
              </a>
            </ContactRow>
            <ContactRow icon="mail" label={t("emailLabel")}>
              <a href={`mailto:${PTEC.email}`} className="break-words transition-colors hover:text-gold-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300">
                {PTEC.email}
              </a>
            </ContactRow>
            <ContactRow icon="clock" label={t("hoursLabel")}>
              <span>{hours}</span>
            </ContactRow>
            <div className="hidden sm:block">
              <div className="overflow-hidden rounded-lg border border-white/10 bg-white/[0.04]">
                <iframe
                  src={PTEC.links.mapEmbed}
                  title={t("mapTitle")}
                  width="100%"
                  height="128"
                  loading="lazy"
                  sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
                  referrerPolicy="no-referrer-when-downgrade"
                  style={{ border: 0, pointerEvents: "none" }}
                  className="block h-32 w-full"
                />
              </div>
            </div>
            <a
              href={PTEC.links.mapPlace}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-gold-300 px-4 text-sm font-bold text-blue-950 transition-colors hover:bg-gold-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-100"
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
            <p>{t("copyright", { year: new Date().getFullYear() })}</p>
            <nav aria-label={t("legal")} className="flex flex-wrap gap-x-4 gap-y-2">
              {legalLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="transition-colors hover:text-gold-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300"
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          </div>
        </div>
      </div>

      <MobileBottomNav user={user} />
    </footer>
  );
}

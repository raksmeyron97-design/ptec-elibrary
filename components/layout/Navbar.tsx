import { Link } from "@/i18n/navigation";
import NavbarSession from "./NavbarSession";
import MobileMenu from "./MobileMenu";
import NavSearch from "@/components/layout/NavSearch";
import ThemeToggle from "@/components/ui/core/ThemeToggle";
import { Seal } from "@/components/ui/core/Seal";
import Icon from "@/components/ui/core/Icon";
import NavbarStickyWrapper from "./NavbarStickyWrapper";
import LanguageSwitcher from "@/components/ui/core/LanguageSwitcher";
import { getTranslations, getLocale } from "next-intl/server";
import PriorityNav, { type PriorityNavEntry } from "./PriorityNav";
import NotificationBell from "@/components/ui/notifications/NotificationBell";
import { getSiteConfig } from "@/lib/system-settings/config";

// ── SVG Icons (outline style) ─────────────────────────────────────────────────
const HomeIcon = (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
    <polyline points="9 22 9 12 15 12 15 22"/>
  </svg>
);

const BooksIcon = (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    {/* Roof / pediment */}
    <polyline points="3 10 12 3 21 10" />
    {/* Columns */}
    <line x1="6"  y1="10" x2="6"  y2="19" />
    <line x1="10" y1="10" x2="10" y2="19" />
    <line x1="14" y1="10" x2="14" y2="19" />
    <line x1="18" y1="10" x2="18" y2="19" />
    {/* Base */}
    <line x1="2" y1="19" x2="22" y2="19" />
    <line x1="1" y1="22" x2="23" y2="22" />
  </svg>
);

const PostsIcon = (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <polyline points="14 2 14 8 20 8"/>
    <line x1="16" y1="13" x2="8" y2="13"/>
    <line x1="16" y1="17" x2="8" y2="17"/>
    <polyline points="10 9 9 9 8 9"/>
  </svg>
);

export default async function Navbar() {
  const t = await getTranslations("nav");
  const footerT = await getTranslations("footer");
  const locale = (await getLocale()) as "en" | "km";
  // Published system settings — contact strip + social links live here.
  const cfg = await getSiteConfig();

  // Priority order: items collapse into the "More" menu from the END of this
  // list when horizontal space runs out (PriorityNav), so put the most
  // important destinations first.
  const navEntries: PriorityNavEntry[] = [
    { kind: "link", href: "/home", label: t("home"), icon: HomeIcon },
    { kind: "digitalLibrary" },
    { kind: "link", href: "/catalogs", label: t("booksInLibrary"), icon: BooksIcon },
    { kind: "link", href: "/posts", label: t("posts"), icon: PostsIcon },
    { kind: "about" },
  ];

  const mobileNavLinks = [
    { label: t("home"), href: "/home" },
    { label: t("booksInLibrary"), href: "/catalogs" },
    { label: t("posts"), href: "/posts" },
  ];

  // No session lookup here, deliberately. Resolving the user server-side meant
  // a cookies() read plus a Supabase Auth round-trip plus a profiles query on
  // every public page render — it blocked first byte and made the whole public
  // tree uncacheable. The viewer's identity now arrives client-side via
  // <SessionProvider>; <NavbarSession> and <MobileMenu> read it from there.

  return (
    <header className="relative z-[100] w-full border-t-[3px] border-accent font-sans pt-[env(safe-area-inset-top)]">
      {/* Top utility strip */}
        <div className="relative z-[70] hidden border-b border-white/10 bg-blue-950 text-[13px] text-gold-100 dark:bg-bg-surface dark:text-text-body xl:block">
          <div className="mx-auto flex h-9 w-full max-w-[1536px] items-center justify-between gap-6 px-6 xl:px-8">
            <div className="flex min-w-0 flex-1 items-center gap-5">
              <a href={cfg.phoneTel} className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300">
                <Icon name="phone" className="text-[14px] text-accent" />
                <span>{cfg.phoneIntl}</span>
              </a>
              <a href={`mailto:${cfg.email}`} className="inline-flex min-w-0 items-center gap-2 whitespace-nowrap transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300">
                <Icon name="mail" className="text-[14px] text-accent" />
                <span className="truncate">{cfg.email}</span>
              </a>
              <a href={cfg.links.mapPlace} target="_blank" rel="noopener noreferrer" className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300">
                <Icon name="map-pin" className="text-[14px] text-accent" />
                <span>{footerT("getDirections")}</span>
              </a>
            </div>

            <div className="flex shrink-0 items-center gap-4">
              <div className="flex items-center gap-1.5" aria-label="PTEC social links">
                <a href={cfg.links.facebook} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300" aria-label="Facebook">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg>
                </a>
                <a href={cfg.links.youtube} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300" aria-label="YouTube">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M22.54 6.42a2.78 2.78 0 0 0-1.95-1.96C18.88 4 12 4 12 4s-6.88 0-8.59.46a2.78 2.78 0 0 0-1.95 1.96A29 29 0 0 0 1 12a29 29 0 0 0 .46 5.58A2.78 2.78 0 0 0 3.41 19.6C5.12 20 12 20 12 20s6.88 0 8.59-.46a2.78 2.78 0 0 0 1.95-1.95A29 29 0 0 0 23 12a29 29 0 0 0-.46-5.58zM9.75 15.02V8.98L15.5 12l-5.75 3.02z"/></svg>
                </a>
                <a href={cfg.links.website} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300" aria-label="PTEC official website">
                  <Icon name="globe" className="text-[15px]" />
                </a>
              </div>
              <LanguageSwitcher locale={locale} className="text-gold-100 dark:text-text-body" />
            </div>
          </div>
        </div>

      <NavbarStickyWrapper>
        {/* Three-zone grid: [brand | primary nav | actions].
            - Brand: minmax(0,auto) so the title can truncate on tiny screens.
            - Nav:   minmax(0,1fr) — the only zone allowed to shrink; its
                     items collapse into "More" (PriorityNav) as it narrows.
            - Actions: auto + shrink-0 children — search, theme, bell, and
                     the avatar can never be pushed off-viewport. */}
        <div className="mx-auto grid h-16 max-w-[1536px] grid-cols-[minmax(0,auto)_minmax(0,1fr)_auto] items-center gap-1.5 px-3 sm:px-5 lg:h-[72px] xl:gap-3 xl:px-8">
          {/* Zone 1: brand */}
          <Link
            href="/home"
            className="group flex min-w-0 items-center gap-2 sm:gap-3"
          >
            <div className="shrink-0 scale-90 sm:scale-100 origin-left">
              <Seal size={48} />
            </div>
            <div className="max-[360px]:hidden flex min-w-0 flex-col whitespace-nowrap text-[#1000C0] transition-opacity group-hover:opacity-90 dark:text-brand">
              <span lang="km" className="font-khmer-serif font-bold text-[13px] sm:text-[15px] leading-tight truncate">បណ្ណាល័យ វ.គ.ភ</span>
              <span className="font-khmer-serif font-bold text-[11px] sm:text-sm tracking-wide mt-0.5 truncate">PTEC Library</span>
            </div>
          </Link>

          {/* Zone 2: primary nav (lg+) with priority overflow */}
          <PriorityNav entries={navEntries} />

          {/* Zone 3: protected actions */}
          <div className="col-start-3 flex shrink-0 items-center gap-1 sm:gap-1.5 xl:gap-2">
            <div className="hidden lg:block">
              <ThemeToggle />
            </div>

            {/* Search */}
            <NavSearch />

            {/* Bell (logged in only) + login button OR avatar dropdown.
                Both depend on the viewer, so they hydrate from
                <SessionProvider> instead of being rendered server-side. */}
            <NavbarSession />

            {/* Hamburger + drawer — mobile/tablet only (below lg) */}
            <MobileMenu
              navLinks={mobileNavLinks}
              locale={locale}
              contact={{
                phone: cfg.phone,
                phoneTel: cfg.phoneTel,
                email: cfg.email,
                mapPlace: cfg.links.mapPlace,
              }}
            />
          </div>
        </div>
      </NavbarStickyWrapper>
    </header>
  );
}

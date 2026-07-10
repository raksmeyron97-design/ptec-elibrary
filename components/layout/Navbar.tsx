/* eslint-disable @typescript-eslint/no-unused-vars */
import Image from "next/image";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import NavbarClient from "./NavbarClient";
import MobileMenu from "./MobileMenu";
import NavLinkActive from "./NavLinkActive";
import NavSearch from "@/components/layout/NavSearch";
import ThemeToggle from "@/components/ui/core/ThemeToggle";
import { Seal } from "@/components/ui/core/Seal";
import Icon from "@/components/ui/core/Icon";
import NavbarStickyWrapper from "./NavbarStickyWrapper";
import LanguageSwitcher from '@/components/ui/core/LanguageSwitcher';
import { getTranslations, getLocale } from 'next-intl/server';
import DesktopNavLinks from "./DesktopNavLinks";
import NotificationBell from "@/components/ui/notifications/NotificationBell";
import { PTEC } from "@/lib/ptec";

// ── SVG Icons (outline style) ─────────────────────────────────────────────────
const HomeIcon = (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
    <polyline points="9 22 9 12 15 12 15 22"/>
  </svg>
);

const EResourcesIcon = (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
    <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
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

const AboutIcon = (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <line x1="12" y1="8" x2="12" y2="8"/>
    <line x1="12" y1="12" x2="12" y2="16"/>
  </svg>
);

const ResearchIcon = (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 10v6M2 10l10-5 10 5-10 5z"/>
    <path d="M6 12v5c3 3 9 3 12 0v-5"/>
  </svg>
);

const PublicationsIcon = (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M19 20H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h10l6 6v8a2 2 0 0 1-2 2z"/>
    <path d="M15 4v6h6"/>
    <line x1="8" y1="13" x2="16" y2="13"/>
    <line x1="8" y1="17" x2="13" y2="17"/>
  </svg>
);

const ExternalLinkIcon = (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    <polyline points="15 3 21 3 21 9" />
    <line x1="10" y1="14" x2="21" y2="3" />
  </svg>
);

// ── Nav config ────────────────────────────────────────────────────────────────
// Removed config arrays to place them inside the component

export default async function Navbar() {
  const t = await getTranslations('nav');
  const locale = (await getLocale()) as 'en' | 'km';

  const navLinks = [
    { label: t('home'),            href: "/home",     icon: HomeIcon },
    { label: t('booksInLibrary'),  href: "/catalogs", icon: BooksIcon },
    { label: t('posts'),           href: "/posts",    icon: PostsIcon },
  ];

  const mobileNavLinks = [
    { label: t('home'),            href: "/home" },
    { label: t('booksInLibrary'),  href: "/catalogs" },
    { label: t('posts'),           href: "/posts" },
  ];

  // ── Fetch user + profile server-side ─────────────────────────
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let userInfo = null;

  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, avatar_url, role")
      .eq("id", user.id)
      .single();

    const googleAvatar = user.user_metadata?.avatar_url || user.user_metadata?.picture;
    const googleName = user.user_metadata?.full_name || user.user_metadata?.name;

    userInfo = {
      email:      user.email ?? "",
      full_name:  profile?.full_name  ?? googleName ?? null,
      avatar_url: profile?.avatar_url ?? googleAvatar ?? null,
      role:       (profile?.role ?? "reader") as "reader" | "admin",
    };
  }

  return (
    <header className="w-full font-sans border-t-[3px] border-accent relative z-[100]">
      {/* Top utility strip */}
        <div className="hidden lg:block bg-blue-950 dark:bg-bg-surface text-gold-200 text-[12px] relative z-10 font-sans border-b border-white/5 dark:border-white/10">
          <div className="flex items-center justify-between px-6 md:px-12 py-2 max-w-[1400px] mx-auto w-full">
            {/* Left: Contact Info — single line: nowrap items, address truncates */}
            <div className="flex items-center gap-4 xl:gap-8 min-w-0 flex-1">
              <a href={PTEC.phoneTel} className="flex shrink-0 items-center gap-2 whitespace-nowrap hover:text-gold-400 transition-colors">
                <Icon name="phone" className="text-[14px] text-accent" />
                <span className="tracking-wide">{PTEC.phoneIntl}</span>
              </a>
              <span className="opacity-30">|</span>
              <div className="flex shrink-0 items-center gap-2 whitespace-nowrap">
                <Icon name="mail" className="text-[14px] text-accent" />
                <span>{PTEC.email}<span className="hidden 2xl:inline"> <span className="opacity-50 mx-1">|</span> {PTEC.emailInternational}</span></span>
              </div>
              <span className="opacity-30">|</span>
              <a href={PTEC.links.mapPlace} target="_blank" rel="noreferrer" className="flex min-w-0 items-center gap-2 hover:text-gold-400 transition-colors">
                <Icon name="map-pin" className="shrink-0 text-[14px] text-accent" />
                <span className="truncate">{PTEC.address.en}</span>
              </a>
            </div>

            {/* Right: Socials & Language */}
            <div className="flex shrink-0 items-center gap-6 xl:gap-8 pl-6">
              <div className="flex items-center gap-4">
                <a href={PTEC.links.facebook} target="_blank" rel="noreferrer" className="inline-flex h-6 w-6 items-center justify-center hover:text-white transition-colors" aria-label="Facebook">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg>
                </a>
                <a href={PTEC.links.youtube} target="_blank" rel="noreferrer" className="inline-flex h-6 w-6 items-center justify-center hover:text-[#FF0000] transition-colors" aria-label="YouTube">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M22.54 6.42a2.78 2.78 0 0 0-1.95-1.96C18.88 4 12 4 12 4s-6.88 0-8.59.46a2.78 2.78 0 0 0-1.95 1.96A29 29 0 0 0 1 12a29 29 0 0 0 .46 5.58A2.78 2.78 0 0 0 3.41 19.6C5.12 20 12 20 12 20s6.88 0 8.59-.46a2.78 2.78 0 0 0 1.95-1.95A29 29 0 0 0 23 12a29 29 0 0 0-.46-5.58zM9.75 15.02V8.98L15.5 12l-5.75 3.02z"/></svg>
                </a>
                <a href={PTEC.links.website} target="_blank" rel="noreferrer" className="inline-flex h-6 w-6 items-center justify-center hover:text-accent transition-colors" aria-label="Website">
                  <Icon name="globe" className="text-[15px]" />
                </a>
              </div>
              <span className="opacity-30">|</span>
              <LanguageSwitcher locale={locale} />
            </div>
          </div>
        </div>

      <NavbarStickyWrapper>
        <div className="flex justify-between items-center h-[72px] px-6 md:px-12 max-w-[1400px] mx-auto">
            {/* Logo + Nav links */}
            <div className="flex items-center gap-10">
              <Link
                href="/"
                className="flex items-center gap-2 sm:gap-3 group shrink-0"
              >
                <div className="shrink-0 scale-90 sm:scale-100 origin-left">
                  <Seal size={48} />
                </div>
                <div className="flex flex-col text-[#1000C0] transition-opacity group-hover:opacity-90 dark:text-brand whitespace-nowrap overflow-hidden">
                  <span lang="km" className="font-khmer-serif font-bold text-[13px] sm:text-[15px] leading-tight truncate">បណ្ណាល័យ វ.គ.ភ</span>
                  <span className="font-khmer-serif font-bold text-[11px] sm:text-sm tracking-wide mt-0.5 truncate">PTEC Library</span>
                </div>
              </Link>

              {/* Desktop nav links */}
              <DesktopNavLinks
                navLinks={navLinks}
              />
            </div>

            {/* Right side */}
            <div className="flex items-center gap-2 sm:gap-4 lg:gap-6">
              <div className="hidden sm:block">
                <ThemeToggle />
              </div>
              
              {/* Search */}
              <NavSearch />

              {/* Bell (show only when logged in) */}
              {user && userInfo && (
                <div className="hidden sm:flex items-center gap-4 border-l border-divider pl-6">
                  <NotificationBell userId={user.id} userRole={userInfo.role} />
                </div>
              )}

              {/* Login button OR Avatar dropdown — desktop only (lg+) */}
              <div className="hidden lg:block">
                <NavbarClient user={userInfo} />
              </div>

              {/* Hamburger + drawer — mobile/tablet only (below lg) */}
              <MobileMenu navLinks={mobileNavLinks} user={userInfo} locale={locale} />
            </div>

          </div>
      </NavbarStickyWrapper>
    </header>
  );
}
